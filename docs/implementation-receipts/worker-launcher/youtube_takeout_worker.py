#!/usr/bin/env python3
"""Run the owned YouTube worker without inheriting another profile's secrets."""
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import signal
import stat
import subprocess
import sys

TASK_ROOT = Path("/Users/chappyasel/hermes-work/youtube-worker-migration")
CREDENTIAL_ROOT = Path("/Users/chappyasel/.config/youtube-takeout-worker")
RUNTIME_CWD = TASK_ROOT / "runtime"
TIMEOUT_SECONDS = 1100
TERMINATE_GRACE_SECONDS = 10
REQUIRED_KEYS = frozenset({"DATABASE_URL", "YOUTUBE_API_KEY", "AI_GATEWAY_API_KEY"})
FAILURE_EVENTS = frozenset({
    "download_auth_failure", "download_failed", "sync_failed", "classify_failed",
    "score_failed", "refresh_incomplete", "orchestrator_crashed", "refresh_lock_busy",
    "requested_failed", "gave_up_on_stuck_request", "requesting_export",
    "request_needs_passkey", "requested_ok", "requested_auth_failure", "approval_in_progress",
})
SUCCESS_EVENTS = frozenset({"refresh_complete", "no_new_archive"})
# Relayed by name only. A status read that fails does not fail the tick, but it
# must not vanish either.
NOTICE_EVENTS = frozenset({"e2e_status_unavailable"})

# The end-to-end status record. Everything below is a strict allow list: the
# child's JSON may carry anything at all, and only values that match one of
# these shapes are forwarded. A `no_new_archive` tick says the Drive check is
# healthy, not that the corpus is current, so the freshness verdict is relayed
# separately and a stale verdict gets its own event.
STATUS_EVENT = "e2e_status"
STATUS_SCHEMA = 1
STATUS_ENUMS = {
    "drive_check": frozenset({"healthy", "failing", "unknown"}),
    "freshness": frozenset({"fresh", "stale", "missing", "unknown"}),
    "request_status": frozenset({
        "idle", "awaiting_auth", "submitted_unverified", "queued", "failed",
        "request_state_missing", "request_state_unreadable", "unknown",
    }),
    "last_observed_pending_export": frozenset({"yes", "no", "unknown"}),
    "request_blocker": frozenset({
        "credential_route_unavailable", "native_modal_present",
        "native_modal_driver_unavailable", "submission_uncertain",
        "passkey_tap_required", "request_state_unreadable",
        "password_rejected", "second_factor_required", "sign_in_rejected",
    }),
    "request_detail": frozenset({
        "ui_failure", "session_cookies_missing", "queue_unreadable",
        "password_route_failed",
    }),
}
STATUS_INSTANTS = frozenset({
    "generated_at", "last_ingested_at", "coverage_through", "request_observed_at",
})
STATUS_NUMBERS = frozenset({
    "ingest_age_hours", "coverage_age_hours", "freshness_max_age_hours",
})
STATUS_FAILURES = frozenset({
    "corpus_stale", "coverage_missing", "coverage_unknown", "drive_check_failing",
    "drive_check_unknown", "importer_state_missing", "enrichment_pending",
    "drive_auth_failed", "download_failed", "sync_failed", "classify_failed",
    "score_failed", "google_auth_expired", "passkey_step_up",
    "request_stuck_gave_up", "importer_error_other", "request_state_missing",
    "request_state_unreadable", "request_state_foreign_host", "request_blocked",
    "request_failed",
})
INSTANT_RE = re.compile(r"\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z\Z")
ARCHIVE_RE = re.compile(r"\Atakeout-\d{8}T\d{6}Z(?:-\d+)?-\d+\.zip\Z")
STATUS_NUMBER_LIMIT = 10 ** 6
# A stale corpus is reported, not treated as a broken run: the tick did its job,
# and a gate that fails every week until an export arrives is a gate nobody reads.
STALE_IS_FAILURE = False


def emit(event, **fields):
    print(json.dumps({"event": event, **fields}), flush=True)


def safe_status(record):
    """Project the child's status record onto the allow list above.

    Returns (safe, dropped). `dropped` names only our own field names, never a
    value the child supplied. Anything unrecognised — an unknown key, a value of
    the wrong type, a timestamp that is not a plain UTC instant, a failure code
    nobody enumerated — is left out rather than passed along.
    """
    if not isinstance(record, dict) or record.get("schema") != STATUS_SCHEMA:
        return None, ["schema"]
    safe = {"schema": STATUS_SCHEMA}
    dropped = []
    for key, allowed in STATUS_ENUMS.items():
        value = record.get(key)
        if value is None:
            safe[key] = None
        elif isinstance(value, str) and value in allowed:
            safe[key] = value
        else:
            dropped.append(key)
    for key in sorted(STATUS_INSTANTS):
        value = record.get(key)
        if value is None:
            safe[key] = None
        elif isinstance(value, str) and INSTANT_RE.match(value):
            safe[key] = value
        else:
            dropped.append(key)
    for key in sorted(STATUS_NUMBERS):
        value = record.get(key)
        if value is None:
            safe[key] = None
        elif (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and -STATUS_NUMBER_LIMIT < value < STATUS_NUMBER_LIMIT
        ):
            safe[key] = round(float(value), 2)
        else:
            dropped.append(key)
    source = record.get("coverage_source_file")
    if source is None:
        safe["coverage_source_file"] = None
    elif isinstance(source, str) and ARCHIVE_RE.match(source):
        safe["coverage_source_file"] = source
    else:
        dropped.append("coverage_source_file")

    failures = record.get("failures")
    if isinstance(failures, list):
        recognised = [f for f in failures if isinstance(f, str) and f in STATUS_FAILURES]
        safe["failures"] = sorted(set(recognised))
        safe["unrecognised_failures"] = len(failures) - len(recognised)
        # Derived, so no hostname from the child's file is ever relayed.
        safe["request_state_foreign"] = "request_state_foreign_host" in safe["failures"]
    else:
        # An unreadable failure list is not an empty one; say nothing instead.
        dropped.append("failures")
        safe["request_state_foreign"] = None
    return safe, dropped


def worker_owns_task():
    try:
        owner = json.loads((TASK_ROOT / "owner.json").read_text())
        return isinstance(owner, dict) and owner.get("owner") == "worker" and owner.get("enabled") is True
    except (OSError, ValueError):
        return False


def valid_runtime_env(file):
    """Accept a small dotenv file containing only the three scoped assignments.

    Values can be unquoted or single/double quoted on one line. Reject variable
    interpolation and duplicates so validation cannot disagree with dotenv.
    Never return or log the secret values.
    """
    try:
        metadata = file.lstat()
        if not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600 or metadata.st_uid != os.getuid():
            return False
        seen = set()
        for line in file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            match = re.fullmatch(r"(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=\s*(.*)", line)
            if not match:
                return False
            key, value = match.groups()
            if key not in REQUIRED_KEYS or key in seen or "${" in value:
                return False
            if value.startswith(("'", '"')):
                quote = value[0]
                end = value.find(quote, 1)
                if end < 0 or (value[end + 1:].strip() and not value[end + 1:].strip().startswith("#")):
                    return False
                value = value[1:end]
            else:
                value = value.split("#", 1)[0].strip()
            # Scoped keys/URLs need no escapes; reject ambiguous dotenv syntax.
            if not value.strip() or "\\" in value or "\x00" in value:
                return False
            seen.add(key)
        return seen == REQUIRED_KEYS
    except (OSError, UnicodeError):
        return False


def child_settings():
    # Use the OS account home; never inherit a retargeted HOME or any secret.
    home = pwd.getpwuid(os.getuid()).pw_dir
    env = {
        "HOME": home,
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
        "TZ": "America/Los_Angeles",
        "DOTENV_CONFIG_PATH": str(CREDENTIAL_ROOT / "runtime.env"),
        "SKIP_ENV_VALIDATION": "1",
        "YOUTUBE_TAKEOUT_DATA_DIR": str(TASK_ROOT / "data"),
        "YOUTUBE_TAKEOUT_STATE_DIR": str(TASK_ROOT / "state"),
        "YOUTUBE_TAKEOUT_CREDENTIALS_DIR": str(CREDENTIAL_ROOT),
    }
    command = [str(Path(home) / ".local/bin/with-worker-node24"), "corepack", "pnpm", "exec", "tsx", "scripts/takeout/refresh.ts", "--no-browser"]
    return command, env


def signal_group(process, sig):
    try:
        os.killpg(process.pid, sig)
    except ProcessLookupError:
        pass


def stop_group(process):
    signal_group(process, signal.SIGTERM)
    try:
        process.communicate(timeout=TERMINATE_GRACE_SECONDS)
    except subprocess.TimeoutExpired:
        pass
    finally:
        # Kill the group even if the leader exited; descendants can survive it.
        signal_group(process, signal.SIGKILL)
    process.communicate()


def run_child():
    command, env = child_settings()
    process = subprocess.Popen(command, cwd=str(RUNTIME_CWD), env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, start_new_session=True)
    try:
        output, _ = process.communicate(timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        stop_group(process)
        emit("worker_timeout", timeout_seconds=TIMEOUT_SECONDS)
        return 124
    except BaseException:
        stop_group(process)
        raise

    failed = False
    completed = False
    stale = False
    for line in output.splitlines():
        try:
            record = json.loads(line)
        except ValueError:
            continue
        event = record.get("event") if isinstance(record, dict) else None
        if not isinstance(event, str):
            continue
        # Relay only known event names, never arbitrary child output or fields.
        if event in FAILURE_EVENTS or event in SUCCESS_EVENTS or event in NOTICE_EVENTS:
            emit("worker_child_event", child_event=event)
        if event in NOTICE_EVENTS:
            # A status read that could not run is a warning in its own right,
            # not a line lost among generic child events.
            emit("worker_status_unavailable", child_event=event)
        if event == STATUS_EVENT:
            safe, dropped = safe_status(record.get("status"))
            if safe is None:
                emit("worker_status_rejected", dropped_fields=dropped)
            else:
                emit("worker_e2e_status", status=safe, dropped_fields=dropped)
                if safe.get("freshness") != "fresh":
                    emit("worker_corpus_stale", freshness=safe.get("freshness"))
                    stale = stale or STALE_IS_FAILURE
        failed = failed or event in FAILURE_EVENTS
        completed = completed or event in SUCCESS_EVENTS
    if process.returncode != 0 or failed or stale or not completed:
        emit("worker_failed", returncode=process.returncode, failure_event=failed, completion_event=completed)
        return 1
    emit("worker_complete")
    return 0


def main():
    if not worker_owns_task():
        emit("worker_owner_rejected")
        return 1
    try:
        state = TASK_ROOT / "state"
        state.mkdir(parents=True, exist_ok=True)
        with (state / "launcher.lock").open("a") as lock:
            try:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                emit("worker_busy")
                return 0
            # Recheck after locking so ownership changes cannot start a new run.
            if not worker_owns_task():
                emit("worker_owner_rejected")
                return 1
            if not valid_runtime_env(CREDENTIAL_ROOT / "runtime.env"):
                emit("worker_credentials_rejected")
                return 1
            emit("worker_started")
            return run_child()
    except Exception:
        # Exceptions may include subprocess output or dotenv values.
        emit("worker_launcher_failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())

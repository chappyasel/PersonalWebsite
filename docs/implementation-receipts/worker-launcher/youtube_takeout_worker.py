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


def emit(event, **fields):
    print(json.dumps({"event": event, **fields}), flush=True)


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
    for line in output.splitlines():
        try:
            record = json.loads(line)
        except ValueError:
            continue
        event = record.get("event") if isinstance(record, dict) else None
        if not isinstance(event, str):
            continue
        # Relay only known event names, never arbitrary child output or fields.
        if event in FAILURE_EVENTS or event in SUCCESS_EVENTS:
            emit("worker_child_event", child_event=event)
        failed = failed or event in FAILURE_EVENTS
        completed = completed or event in SUCCESS_EVENTS
    if process.returncode != 0 or failed or not completed:
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

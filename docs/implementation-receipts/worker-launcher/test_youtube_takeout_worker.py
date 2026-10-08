import contextlib
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("youtube_worker", Path(__file__).with_name("youtube_takeout_worker.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "task"
        self.credentials = Path(self.temp.name) / "protected"
        self.root.mkdir()
        self.credentials.mkdir()
        self.runtime = self.root / "runtime"
        self.runtime.mkdir()
        for name, value in [("TASK_ROOT", self.root), ("CREDENTIAL_ROOT", self.credentials), ("RUNTIME_CWD", self.runtime)]:
            self.enterContext(patch.object(worker, name, value))
        self.logs = io.StringIO()
        self.enterContext(contextlib.redirect_stdout(self.logs))
        self.popen = self.enterContext(patch.object(worker.subprocess, "Popen"))
        self.killpg = self.enterContext(patch.object(worker.os, "killpg"))
        self.process = Mock(pid=98765, returncode=0)
        self.process.communicate.return_value = ('{"event":"no_new_archive"}\n', None)
        self.popen.return_value = self.process
        self.owner({"owner": "worker", "enabled": True})
        self.envfile("DATABASE_URL=postgres://fixture/db\nYOUTUBE_API_KEY=fixture-youtube\nAI_GATEWAY_API_KEY=fixture-ai\n")

    def owner(self, value):
        (self.root / "owner.json").write_text(json.dumps(value))

    def envfile(self, text):
        file = self.credentials / "runtime.env"
        file.write_text(text)
        file.chmod(0o600)

    def test_owner_gate(self):
        for invalid in [None, [], {"owner": "daily", "enabled": True}, {"owner": "worker", "enabled": False}, {"owner": "worker", "enabled": 1}]:
            with self.subTest(invalid=invalid):
                self.owner(invalid)
                self.assertEqual(worker.main(), 1)
        (self.root / "owner.json").write_text("{")
        self.assertEqual(worker.main(), 1)
        (self.root / "owner.json").unlink()
        self.assertEqual(worker.main(), 1)
        self.popen.assert_not_called()
        self.assertFalse((self.root / "state").exists())

    def test_lock_contention_skips(self):
        state = self.root / "state"
        state.mkdir()
        with (state / "launcher.lock").open("a") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(worker.main(), 0)
        self.popen.assert_not_called()
        self.assertIn('"worker_busy"', self.logs.getvalue())

    def test_minimal_env_command_cwd_and_lock_lifetime(self):
        def communicate(timeout):
            self.assertEqual(timeout, 1100)
            with (self.root / "state/launcher.lock").open("a") as contender:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(contender.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            return ('{"event":"refresh_complete"}\n', None)
        self.process.communicate.side_effect = communicate
        account_home = "/Users/chappyasel"
        with patch.object(worker.pwd, "getpwuid", return_value=types.SimpleNamespace(pw_dir=account_home)):
            with patch.dict(os.environ, {"DATABASE_URL": "inherited-db", "AI_GATEWAY_API_KEY": "inherited-ai", "HERMES_TOKEN": "inherited-hermes"}):
                self.assertEqual(worker.main(), 0)
        args, options = self.popen.call_args
        self.assertEqual(args[0], [account_home + "/.local/bin/with-worker-node24", "corepack", "pnpm", "exec", "tsx", "scripts/takeout/refresh.ts", "--no-browser"])
        self.assertEqual(options["cwd"], str(self.runtime))
        self.assertTrue(options["start_new_session"])
        self.assertEqual(options["env"], {
            "HOME": account_home, "PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "TZ": "America/Los_Angeles",
            "DOTENV_CONFIG_PATH": str(self.credentials / "runtime.env"), "SKIP_ENV_VALIDATION": "1",
            "YOUTUBE_TAKEOUT_DATA_DIR": str(self.root / "data"), "YOUTUBE_TAKEOUT_STATE_DIR": str(self.root / "state"),
            "YOUTUBE_TAKEOUT_CREDENTIALS_DIR": str(self.credentials),
        })
        with (self.root / "state/launcher.lock").open("a") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.assertNotIn("fixture-ai", self.logs.getvalue())
        self.assertNotIn("inherited", self.logs.getvalue())

    def test_required_credentials_and_permissions(self):
        valid = "DATABASE_URL=postgres://fixture/db\nYOUTUBE_API_KEY=fixture\nAI_GATEWAY_API_KEY=fixture\n"
        for key in worker.REQUIRED_KEYS:
            with self.subTest(key=key):
                self.envfile("\n".join(line for line in valid.splitlines() if not line.startswith(key + "=")))
                self.assertEqual(worker.main(), 1)
                self.envfile("\n".join(key + "=''" if line.startswith(key + "=") else line for line in valid.splitlines()))
                self.assertEqual(worker.main(), 1)
        for suffix in ["HOME=/other\n", "AI_GATEWAY_API_KEY=duplicate\n"]:
            self.envfile(valid + suffix)
            self.assertEqual(worker.main(), 1)
        self.envfile(valid.replace("AI_GATEWAY_API_KEY=fixture", "AI_GATEWAY_API_KEY=${OTHER_TOKEN}"))
        self.assertEqual(worker.main(), 1)
        self.envfile(valid)
        (self.credentials / "runtime.env").chmod(0o644)
        self.assertEqual(worker.main(), 1)
        (self.credentials / "runtime.env").unlink()
        self.assertEqual(worker.main(), 1)
        self.popen.assert_not_called()

    def test_accepts_nonempty_quoted_scoped_dotenv(self):
        self.envfile("# scoped fixture\nexport DATABASE_URL='postgres://fixture/db'\nYOUTUBE_API_KEY=\"fixture\" # note\nAI_GATEWAY_API_KEY=fixture\n")
        self.assertEqual(worker.main(), 0)

    def test_failure_events_even_when_child_exits_zero(self):
        for event in worker.FAILURE_EVENTS:
            with self.subTest(event=event):
                self.process.communicate.return_value = (json.dumps({"event": event, "secret": "must-not-log"}) + '\n{"event":"refresh_complete"}\n', None)
                self.assertEqual(worker.main(), 1)
        self.assertNotIn("must-not-log", self.logs.getvalue())

    def test_nonzero_and_missing_completion_fail(self):
        self.process.returncode = 9
        self.assertEqual(worker.main(), 1)
        self.process.returncode = 0
        self.process.communicate.return_value = ("arbitrary sensitive output", None)
        self.assertEqual(worker.main(), 1)
        self.assertNotIn("arbitrary sensitive", self.logs.getvalue())

    def test_timeout_terminates_then_kills_group_and_releases_lock(self):
        self.process.communicate.side_effect = [
            subprocess.TimeoutExpired("fixture", 1100),
            subprocess.TimeoutExpired("fixture", 10),
            ("", None),
        ]
        self.assertEqual(worker.main(), 124)
        self.assertEqual(self.killpg.call_args_list, [unittest.mock.call(98765, signal.SIGTERM), unittest.mock.call(98765, signal.SIGKILL)])
        self.assertEqual(self.process.communicate.call_args_list, [unittest.mock.call(timeout=1100), unittest.mock.call(timeout=10), unittest.mock.call()])
        with (self.root / "state/launcher.lock").open("a") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_timeout_kills_descendants_even_if_leader_exits_after_term(self):
        self.process.communicate.side_effect = [subprocess.TimeoutExpired("fixture", 1100), ("", None), ("", None)]
        self.assertEqual(worker.main(), 124)
        self.killpg.assert_any_call(98765, signal.SIGKILL)

    # ---- end-to-end status relaying ----

    PRODUCTION_STATUS = {
        "schema": 1,
        "generated_at": "2026-10-04T18:00:00.000Z",
        "drive_check": "healthy",
        "last_ingested_at": "2026-10-04T00:07:16.748Z",
        "ingest_age_hours": 17.88,
        "coverage_through": "2026-09-28T06:04:58.013Z",
        "coverage_age_hours": 155.92,
        "coverage_source_file": "takeout-20260928T055945Z-1-001.zip",
        "freshness": "stale",
        "freshness_max_age_hours": 144,
        "request_status": "request_state_missing",
        "request_blocker": None,
        "request_detail": None,
        "last_observed_pending_export": "unknown",
        "request_observed_at": None,
        "request_state_host": None,
        "failures": ["corpus_stale", "request_state_missing"],
    }

    def run_with_status(self, status, event="e2e_status"):
        self.process.communicate.return_value = (
            json.dumps({"event": event, "status": status}) + '\n{"event":"no_new_archive"}\n',
            None,
        )
        code = worker.main()
        relayed = [
            json.loads(line)
            for line in self.logs.getvalue().splitlines()
            if json.loads(line).get("event") in {
                "worker_e2e_status", "worker_status_rejected", "worker_corpus_stale",
                "worker_status_unavailable",
            }
        ]
        return code, relayed

    def test_relays_the_production_stale_status_without_failing_the_run(self):
        code, relayed = self.run_with_status(self.PRODUCTION_STATUS)
        self.assertEqual(code, 0)
        status = relayed[0]["status"]
        self.assertEqual(relayed[0]["dropped_fields"], [])
        self.assertEqual(status["drive_check"], "healthy")
        self.assertEqual(status["freshness"], "stale")
        self.assertEqual(status["last_ingested_at"], "2026-10-04T00:07:16.748Z")
        self.assertEqual(status["coverage_through"], "2026-09-28T06:04:58.013Z")
        self.assertEqual(status["coverage_age_hours"], 155.92)
        self.assertEqual(status["request_status"], "request_state_missing")
        self.assertEqual(status["failures"], ["corpus_stale", "request_state_missing"])
        self.assertFalse(status["request_state_foreign"])
        self.assertEqual(status["unrecognised_failures"], 0)
        # A healthy Drive check over a stale corpus gets its own loud event.
        self.assertEqual(relayed[1]["event"], "worker_corpus_stale")
        self.assertEqual(relayed[1]["freshness"], "stale")

    def test_fresh_status_is_not_announced_as_stale(self):
        fresh = {**self.PRODUCTION_STATUS, "freshness": "fresh", "failures": []}
        code, relayed = self.run_with_status(fresh)
        self.assertEqual(code, 0)
        self.assertEqual([r["event"] for r in relayed], ["worker_e2e_status"])

    def test_missing_and_unknown_freshness_are_still_announced(self):
        for freshness in ["missing", "unknown"]:
            with self.subTest(freshness=freshness):
                self.logs.truncate(0)
                self.logs.seek(0)
                _, relayed = self.run_with_status(
                    {**self.PRODUCTION_STATUS, "freshness": freshness}
                )
                self.assertEqual(relayed[1]["event"], "worker_corpus_stale")

    def test_drops_every_field_outside_the_allow_list(self):
        noisy = {
            **self.PRODUCTION_STATUS,
            "DATABASE_URL": "postgres://secret/db",
            "cookies": {"SID": "must-not-log"},
            "stdout_tail": "arbitrary child output",
            "request_state_host": "some-other-mac.local",
            "nested": [{"deep": "value"}],
        }
        code, relayed = self.run_with_status(noisy)
        self.assertEqual(code, 0)
        status = relayed[0]["status"]
        self.assertEqual(
            sorted(status),
            sorted([
                "schema", "drive_check", "freshness", "request_status",
                "last_observed_pending_export", "request_blocker", "request_detail",
                "request_observed_at",
                "generated_at", "last_ingested_at", "coverage_through",
                "coverage_age_hours", "freshness_max_age_hours", "ingest_age_hours",
                "coverage_source_file", "failures", "unrecognised_failures",
                "request_state_foreign",
            ]),
        )
        logged = self.logs.getvalue()
        for secret in ["postgres://secret/db", "must-not-log", "arbitrary child output",
                       "some-other-mac.local", "deep"]:
            self.assertNotIn(secret, logged)

    def test_rejects_a_record_that_is_not_the_known_schema(self):
        for status in [None, [], "stale", {"schema": 2, "freshness": "fresh"}, {}]:
            with self.subTest(status=status):
                self.logs.truncate(0)
                self.logs.seek(0)
                code, relayed = self.run_with_status(status)
                self.assertEqual(code, 0)
                self.assertEqual(relayed[0]["event"], "worker_status_rejected")
                self.assertEqual(relayed[0]["dropped_fields"], ["schema"])

    def test_drops_values_of_the_wrong_shape_and_names_the_field(self):
        cases = [
            ("freshness", "very stale"),
            ("drive_check", True),
            ("request_status", "queued_probably"),
            ("request_blocker", "whatever_i_want"),
            ("request_detail", "stack trace here"),
            ("last_observed_pending_export", "maybe"),
            ("request_observed_at", "recently"),
            ("generated_at", "last Tuesday"),
            ("last_ingested_at", "2026-10-04 00:07:16"),
            ("coverage_through", 1759532400),
            ("coverage_age_hours", "155.92"),
            ("ingest_age_hours", float("inf")),
            ("freshness_max_age_hours", True),
            ("coverage_source_file", "/Users/chappyasel/.config/secret/takeout.zip"),
            ("failures", "not-even-a-list"),
        ]
        for field, value in cases:
            with self.subTest(field=field):
                self.logs.truncate(0)
                self.logs.seek(0)
                code, relayed = self.run_with_status({**self.PRODUCTION_STATUS, field: value})
                self.assertEqual(code, 0)
                self.assertIn(field, relayed[0]["dropped_fields"])
                self.assertNotIn(field, relayed[0]["status"])
                self.assertNotIn(str(value), self.logs.getvalue())

    def test_counts_unrecognised_failures_without_quoting_them(self):
        code, relayed = self.run_with_status({
            **self.PRODUCTION_STATUS,
            "failures": ["corpus_stale", "ECONNREFUSED postgres://secret/db", 7, None],
        })
        self.assertEqual(code, 0)
        self.assertEqual(relayed[0]["status"]["failures"], ["corpus_stale"])
        self.assertEqual(relayed[0]["status"]["unrecognised_failures"], 3)
        self.assertNotIn("ECONNREFUSED", self.logs.getvalue())

    def test_marks_another_host_as_foreign_without_naming_it(self):
        code, relayed = self.run_with_status({
            **self.PRODUCTION_STATUS,
            "request_status": "unknown",
            "request_state_host": "some-other-mac.local",
            "failures": ["request_state_foreign_host"],
        })
        self.assertEqual(code, 0)
        self.assertTrue(relayed[0]["status"]["request_state_foreign"])
        self.assertEqual(relayed[0]["status"]["request_status"], "unknown")
        self.assertNotIn("some-other-mac.local", self.logs.getvalue())

    def test_never_invents_a_queued_or_awaiting_auth_request(self):
        for claimed in ["request_state_missing", "request_state_unreadable", "unknown"]:
            with self.subTest(claimed=claimed):
                self.logs.truncate(0)
                self.logs.seek(0)
                _, relayed = self.run_with_status({
                    **self.PRODUCTION_STATUS, "request_status": claimed
                })
                status = relayed[0]["status"]
                self.assertEqual(status["request_status"], claimed)
                self.assertIsNone(status["request_blocker"])
                self.assertIsNone(status["request_detail"])

    def test_a_status_read_that_failed_is_surfaced_but_does_not_fail_the_run(self):
        self.process.communicate.return_value = (
            '{"event":"e2e_status_unavailable"}\n{"event":"no_new_archive"}\n', None
        )
        self.assertEqual(worker.main(), 0)
        logged = [json.loads(line) for line in self.logs.getvalue().splitlines()]
        events = [record["event"] for record in logged]
        self.assertIn("worker_status_unavailable", events)
        self.assertIn("worker_child_event", events)

    def test_an_unreadable_failure_list_is_not_relayed_as_no_failures(self):
        code, relayed = self.run_with_status(
            {**self.PRODUCTION_STATUS, "failures": "corpus_stale"}
        )
        self.assertEqual(code, 0)
        self.assertNotIn("failures", relayed[0]["status"])
        self.assertIsNone(relayed[0]["status"]["request_state_foreign"])
        self.assertIn("failures", relayed[0]["dropped_fields"])

    def test_a_failure_event_still_fails_a_run_that_reported_status(self):
        self.process.communicate.return_value = (
            json.dumps({"event": "e2e_status", "status": self.PRODUCTION_STATUS})
            + '\n{"event":"sync_failed"}\n{"event":"no_new_archive"}\n',
            None,
        )
        self.assertEqual(worker.main(), 1)

    def test_relays_the_sign_in_blockers_by_name(self):
        for blocker in ["password_rejected", "second_factor_required", "sign_in_rejected"]:
            with self.subTest(blocker=blocker):
                self.logs.truncate(0)
                self.logs.seek(0)
                code, relayed = self.run_with_status({
                    **self.PRODUCTION_STATUS,
                    "request_status": "awaiting_auth",
                    "request_blocker": blocker,
                    "failures": ["request_blocked"],
                })
                self.assertEqual(code, 0)
                self.assertEqual(relayed[0]["status"]["request_blocker"], blocker)
                self.assertNotIn("request_blocker", relayed[0]["dropped_fields"])

    def test_spawn_failure_is_nonzero_without_logging_exception(self):
        self.popen.side_effect = OSError("sensitive fixture")
        self.assertEqual(worker.main(), 1)
        self.assertNotIn("sensitive fixture", self.logs.getvalue())


if __name__ == "__main__":
    unittest.main()

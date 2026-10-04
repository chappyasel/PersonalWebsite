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

    def test_spawn_failure_is_nonzero_without_logging_exception(self):
        self.popen.side_effect = OSError("sensitive fixture")
        self.assertEqual(worker.main(), 1)
        self.assertNotIn("sensitive fixture", self.logs.getvalue())


if __name__ == "__main__":
    unittest.main()

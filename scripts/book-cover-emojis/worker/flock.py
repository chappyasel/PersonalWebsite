"""Hold an exclusive OS lock for as long as the parent process lives.

Node has no flock binding and this needs no native dependency, so the lock is
held by a small Python child instead. The advantage over a lockfile is that the
kernel owns it: if the worker is killed, even with SIGKILL, the descriptor
closes and the lock is released. A lockfile left behind by the same crash has
to be guessed about, and guessing wrong is how two workers end up running.

Prints ACQUIRED or HELD <owner> on the first line, then blocks reading stdin.
That read is also the parent-death detector: when the parent exits its pipe
closes, the read returns, and the lock goes away with this process.
"""

import fcntl
import os
import sys

path = sys.argv[1]
info = sys.argv[2] if len(sys.argv) > 2 else ""

fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o644)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError:
    held = ""
    try:
        os.lseek(fd, 0, os.SEEK_SET)
        held = os.read(fd, 4096).decode("utf-8", "replace").strip()
    except OSError:
        pass
    sys.stdout.write("HELD " + held.replace("\n", " ") + "\n")
    sys.stdout.flush()
    sys.exit(1)

os.ftruncate(fd, 0)
os.lseek(fd, 0, os.SEEK_SET)
os.write(fd, info.encode("utf-8"))
os.fsync(fd)
sys.stdout.write("ACQUIRED\n")
sys.stdout.flush()

try:
    sys.stdin.read()
except Exception:
    pass

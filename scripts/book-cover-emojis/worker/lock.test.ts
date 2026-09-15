import { Lock, LockHeldError } from "./lock";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * These exercise the real kernel lock rather than a simulation of one, because
 * the bug being prevented was in the simulation: a lockfile that existed
 * before its owner was written, which another process read as stale.
 */
const held: Lock[] = [];

function lockPath(): string {
  return join(mkdtempSync(join(tmpdir(), "book-emoji-lock-")), "worker.lock");
}

function lock(path: string, pid = process.pid): Lock {
  const created = new Lock(path, { pid, host: "test" });
  held.push(created);
  return created;
}

afterEach(() => {
  for (const item of held.splice(0)) item.release();
});

describe("exclusive locking", () => {
  it("lets one worker in and keeps the second out", async () => {
    const path = lockPath();
    await expect(lock(path, 111).acquire()).resolves.toMatchObject({ pid: 111 });
    await expect(lock(path, 222).acquire()).rejects.toBeInstanceOf(LockHeldError);
  });

  it("names the holder, so the operator knows what is running", async () => {
    const path = lockPath();
    await lock(path, 4321).acquire();
    await expect(lock(path, 99).acquire()).rejects.toThrow(/4321/);
  });

  it("records the owner in the file, never leaving it empty while held", async () => {
    const path = lockPath();
    await lock(path, 777).acquire();
    const owner = JSON.parse(readFileSync(path, "utf8")) as { pid: number };
    expect(owner.pid).toBe(777);
  });

  it("frees the lock on release", async () => {
    const path = lockPath();
    const first = lock(path);
    await first.acquire();
    first.release();
    await expect(lock(path).acquire()).resolves.toBeTruthy();
  });

  it("frees the lock even when the work throws", async () => {
    const path = lockPath();
    await expect(
      lock(path).withLock(async () => {
        throw new Error("batch blew up");
      }),
    ).rejects.toThrow("batch blew up");
    await expect(lock(path).acquire()).resolves.toBeTruthy();
  });

  it("lets a different path be locked independently", async () => {
    await expect(lock(lockPath()).acquire()).resolves.toBeTruthy();
    await expect(lock(lockPath()).acquire()).resolves.toBeTruthy();
  });

  it("reports a missing helper rather than silently running unlocked", async () => {
    const broken = new Lock(lockPath(), { helperPath: "/nonexistent/flock.py" });
    await expect(broken.acquire()).rejects.toThrow();
  });
});

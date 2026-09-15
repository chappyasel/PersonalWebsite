/**
 * One worker at a time, enforced by the kernel.
 *
 * The first version was a lockfile, and it had a race worth remembering: it
 * created the file and then wrote the owner into it, so another process could
 * read an empty owner, decide the lock was stale, delete it, and take a lock
 * the first process still believed it held. Two workers, both sure they were
 * alone.
 *
 * This holds a real `flock` through a small Python child instead. The kernel
 * releases it when that process dies, so a crash needs no staleness heuristic
 * at all, and there is nothing to reclaim by hand.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const HELPER = join(dirname(fileURLToPath(import.meta.url)), "flock.py");

export type LockInfo = { pid: number; startedAt: string; host: string };

export class LockHeldError extends Error {
  constructor(readonly owner: string) {
    super(`another worker holds the lock: ${owner || "owner unknown"}`);
    this.name = "LockHeldError";
  }
}

export type LockDeps = {
  pid?: number;
  host?: string;
  now?: () => string;
  /** Overridden in tests only. */
  python?: string;
  helperPath?: string;
};

export class Lock {
  private child: ChildProcess | null = null;

  constructor(
    private readonly path: string,
    private readonly deps: LockDeps = {},
  ) {}

  /** Resolves once the lock is held, rejects with LockHeldError if it is not. */
  acquire(): Promise<LockInfo> {
    const info: LockInfo = {
      pid: this.deps.pid ?? process.pid,
      startedAt: (this.deps.now ?? (() => new Date().toISOString()))(),
      host: this.deps.host ?? "local",
    };
    mkdirSync(dirname(this.path), { recursive: true });

    return new Promise<LockInfo>((resolve, reject) => {
      const child = spawn(
        this.deps.python ?? "python3",
        [this.deps.helperPath ?? HELPER, this.path, JSON.stringify(info)],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let firstLine = "";
      let settled = false;

      const finish = (error: Error | null) => {
        if (settled) return;
        settled = true;
        if (error) {
          child.kill();
          reject(error);
          return;
        }
        this.child = child;
        resolve(info);
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        firstLine += chunk.toString();
        if (!firstLine.includes("\n")) return;
        const line = firstLine.split("\n")[0]!.trim();
        if (line === "ACQUIRED") finish(null);
        else finish(new LockHeldError(line.replace(/^HELD\s*/, "")));
      });
      child.on("error", (error) => finish(error));
      child.on("exit", (code) => {
        if (!settled) {
          finish(new Error(`lock helper exited with code ${String(code)}`));
          return;
        }
        // The helper going away after we acquired means the lock is gone.
        this.child = null;
      });
    });
  }

  release(): void {
    if (!this.child) return;
    // Killing the helper closes its descriptor; the kernel drops the lock.
    this.child.kill();
    this.child = null;
  }

  async withLock<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

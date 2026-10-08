/**
 * Who owns the approval window.
 *
 * The old approval path owned the browser from inside the CLI process, so its
 * 20-minute timeout took the window with it — the one thing a human standing
 * in front of a passkey prompt cannot afford. Here the window belongs to a
 * detached holder process that records itself in `request-session.json`, and
 * every CLI invocation reads that record to decide whether to attach, start, or
 * keep its hands off. A timeout in any CLI leaves the window exactly as it was.
 *
 * Liveness is the holder's process, never the record's age. An old record whose
 * process is still running means someone may still be mid-tap.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { takeoutPaths } from "./config";

export type SessionRecord = {
  schema: 1;
  /** The holder process that owns the browser. */
  pid: number;
  started_at: string;
  mode: "headed" | "headless";
  attempt_id: string | null;
  host: string;
};

export type SessionView =
  | { kind: "none" }
  | { kind: "unreadable" }
  | { kind: "foreign"; record: SessionRecord }
  | { kind: "dead"; record: SessionRecord }
  | { kind: "alive"; record: SessionRecord };

export type SessionAction =
  | { action: "start" }
  | { action: "attach"; record: SessionRecord }
  | { action: "replace"; record: SessionRecord }
  | { action: "defer"; reason: "foreign_host" | "unreadable_session" };

export function sessionPath(): string {
  return path.join(takeoutPaths().stateDir, "request-session.json");
}

/** `process.kill(pid, 0)`: no signal, just "does this process exist". */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else. Treating
    // that as dead would open a second window next to a live one.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function readSession(
  isAlive: (pid: number) => boolean = processAlive,
): SessionView {
  const file = sessionPath();
  if (!fs.existsSync(file)) return { kind: "none" };
  let record: SessionRecord;
  try {
    record = JSON.parse(fs.readFileSync(file, "utf8")) as SessionRecord;
    if (record?.schema !== 1 || typeof record.pid !== "number") {
      return { kind: "unreadable" };
    }
  } catch {
    return { kind: "unreadable" };
  }
  if (record.host !== os.hostname()) return { kind: "foreign", record };
  let alive: boolean;
  try {
    alive = isAlive(record.pid);
  } catch (error) {
    alive = (error as NodeJS.ErrnoException).code === "EPERM";
  }
  return alive ? { kind: "alive", record } : { kind: "dead", record };
}

export function writeSession(record: SessionRecord): void {
  const { stateDir } = takeoutPaths();
  fs.mkdirSync(stateDir, { recursive: true });
  const file = sessionPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, file);
}

export function clearSession(): void {
  fs.rmSync(sessionPath(), { force: true });
}

/**
 * Decide how to treat the recorded session. Unreadable and foreign records both
 * fail closed: an unverifiable window is treated as a window that exists.
 */
export function decideSession(view: SessionView): SessionAction {
  switch (view.kind) {
    case "none":
      return { action: "start" };
    case "alive":
      return { action: "attach", record: view.record };
    case "dead":
      return { action: "replace", record: view.record };
    case "foreign":
      return { action: "defer", reason: "foreign_host" };
    case "unreadable":
      return { action: "defer", reason: "unreadable_session" };
  }
}

/** The file an operator creates to ask the holder to close its window. */
export function releaseSentinelPath(): string {
  return path.join(takeoutPaths().stateDir, "request-session.release");
}

export function releaseRequested(): boolean {
  return fs.existsSync(releaseSentinelPath());
}

export function requestRelease(): void {
  const { stateDir } = takeoutPaths();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(releaseSentinelPath(), new Date().toISOString());
}

export function clearReleaseSentinel(): void {
  fs.rmSync(releaseSentinelPath(), { force: true });
}

/**
 * The file an operator or `approve.ts` creates to tell a holding window to
 * carry on — after signing in by hand, say. The holder consumes it, so a
 * resume is a one-shot request and never a standing instruction.
 */
export function resumeSentinelPath(): string {
  return path.join(takeoutPaths().stateDir, "request-session.resume");
}

export function resumeRequested(): boolean {
  return fs.existsSync(resumeSentinelPath());
}

export function requestResume(): void {
  const { stateDir } = takeoutPaths();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(resumeSentinelPath(), new Date().toISOString());
}

export function clearResumeSentinel(): void {
  fs.rmSync(resumeSentinelPath(), { force: true });
}

export class SessionOwnershipError extends Error {
  constructor(readonly reason: "busy" | "foreign" | "unreadable") {
    super(`session_${reason}`);
    this.name = "SessionOwnershipError";
  }
}

export type SessionClaim = {
  record: SessionRecord;
  /** Held for the holder's whole life, released when it gives up the window. */
  release: () => void;
  /** True when a previous holder's directory had to be cleared. */
  tookOver: boolean;
};

/**
 * Claim the right to own the approval window, before any browser is launched.
 *
 * The session record alone could not prevent two windows: between reading it
 * and writing one, a second process can do the same. So ownership is a
 * directory — created atomically — and the record is written only by whoever
 * holds it. Everything uncertain fails closed: another host's claim, a record
 * from another machine, or an owner file that cannot be read all refuse.
 *
 * The one case that may take over is an owner directory whose process is gone.
 * A holder killed outright can in principle leave an orphaned browser behind,
 * so a takeover is reported rather than done quietly.
 */
export function claimSessionOwnership(input: {
  now: Date;
  mode: "headed" | "headless";
  attemptId: string | null;
  pid?: number;
  isAlive?: (pid: number) => boolean;
}): SessionClaim {
  const { stateDir } = takeoutPaths();
  const ownerDir = path.join(stateDir, "request-session.owner");
  const ownerFile = path.join(ownerDir, "owner.json");
  const isAlive = input.isAlive ?? processAlive;
  const pid = input.pid ?? process.pid;
  fs.mkdirSync(stateDir, { recursive: true });

  let tookOver = false;
  try {
    fs.mkdirSync(ownerDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const owner = readOwner(ownerFile);
    if (!owner) throw new SessionOwnershipError("unreadable");
    if (owner.host !== os.hostname()) throw new SessionOwnershipError("foreign");
    if (isAlive(owner.pid)) throw new SessionOwnershipError("busy");
    // The previous holder's process is gone, so its window is too.
    fs.rmSync(ownerDir, { recursive: true, force: true });
    try {
      fs.mkdirSync(ownerDir);
    } catch {
      // Someone else won the race for the freed directory.
      throw new SessionOwnershipError("busy");
    }
    tookOver = true;
  }

  const record = newSessionRecord({
    pid,
    now: input.now,
    mode: input.mode,
    attemptId: input.attemptId,
  });
  try {
    fs.writeFileSync(
      ownerFile,
      JSON.stringify({ pid, host: os.hostname(), claimedAt: input.now.toISOString() }),
    );
    writeSession(record);
  } catch (error) {
    fs.rmSync(ownerDir, { recursive: true, force: true });
    throw error;
  }

  return {
    record,
    tookOver,
    release: () => {
      clearSession();
      fs.rmSync(ownerDir, { recursive: true, force: true });
    },
  };
}

function readOwner(
  file: string,
): { pid: number; host: string } | null {
  try {
    const owner = JSON.parse(fs.readFileSync(file, "utf8")) as {
      pid?: unknown;
      host?: unknown;
    };
    if (typeof owner.pid !== "number" || typeof owner.host !== "string") {
      return null;
    }
    return { pid: owner.pid, host: owner.host };
  } catch {
    return null;
  }
}

export function newSessionRecord(input: {
  pid: number;
  now: Date;
  mode: "headed" | "headless";
  attemptId: string | null;
}): SessionRecord {
  return {
    schema: 1,
    pid: input.pid,
    started_at: input.now.toISOString(),
    mode: input.mode,
    attempt_id: input.attemptId,
    host: os.hostname(),
  };
}

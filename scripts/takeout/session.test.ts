import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { acquireNamedLock, acquireRefreshLock } from "./lock";
import {
  type SessionRecord,
  SessionOwnershipError,
  claimSessionOwnership,
  clearReleaseSentinel,
  clearResumeSentinel,
  clearSession,
  decideSession,
  readSession,
  releaseRequested,
  releaseSentinelPath,
  requestRelease,
  requestResume,
  resumeRequested,
  resumeSentinelPath,
  sessionPath,
  writeSession,
} from "./session";

let home: string;
let stateDir: string;

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    schema: 1,
    pid: 4242,
    started_at: "2026-10-04T17:00:00.000Z",
    mode: "headed",
    attempt_id: "attempt-1",
    host: os.hostname(),
    ...overrides,
  };
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-session-"));
  stateDir = path.join(home, ".hermes/workspace/state/youtube-takeout");
  vi.stubEnv("YOUTUBE_TAKEOUT_STATE_DIR", stateDir);
  vi.stubEnv("YOUTUBE_TAKEOUT_DATA_DIR", path.join(home, ".local/share/yt"));
  vi.stubEnv("YOUTUBE_TAKEOUT_CREDENTIALS_DIR", path.join(home, "credentials"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});

describe("session registry", () => {
  it("keeps the approval session beside request state, not in importer state", () => {
    expect(sessionPath()).toBe(path.join(stateDir, "request-session.json"));
    writeSession(record());
    expect(fs.existsSync(path.join(stateDir, "state.json"))).toBe(false);
  });

  it("reports no session when nothing was ever written", () => {
    expect(readSession()).toEqual({ kind: "none" });
  });

  it("reports a live session by its process, not by its age", () => {
    writeSession(record({ pid: process.pid, started_at: "2026-01-01T00:00:00.000Z" }));
    expect(readSession()).toMatchObject({ kind: "alive" });
  });

  it("reports a session whose process is gone as dead", () => {
    writeSession(record({ pid: 4242 }));
    expect(readSession(() => false)).toMatchObject({ kind: "dead" });
  });

  it("treats a process it may not signal as alive, never as free to replace", () => {
    writeSession(record({ pid: 1 }));
    expect(
      readSession((pid) => {
        expect(pid).toBe(1);
        const error: NodeJS.ErrnoException = new Error("operation not permitted");
        error.code = "EPERM";
        throw error;
      }),
    ).toMatchObject({ kind: "alive" });
  });

  it("reports another machine's session as foreign, with no liveness claim", () => {
    writeSession(record({ host: "some-other-mac.local" }));
    expect(readSession(() => true)).toMatchObject({ kind: "foreign" });
  });

  it("reports a corrupt session file as unreadable rather than as absent", () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(sessionPath(), "{ truncated");
    expect(readSession()).toEqual({ kind: "unreadable" });
  });

  it("clears only its own file", () => {
    writeSession(record());
    clearSession();
    expect(fs.existsSync(sessionPath())).toBe(false);
    expect(() => clearSession()).not.toThrow();
  });
});

describe("decideSession", () => {
  it("attaches to a live window instead of opening a second one", () => {
    const live = { kind: "alive", record: record() } as const;
    expect(decideSession(live)).toEqual({ action: "attach", record: live.record });
  });

  it("attaches to a live window even for a different attempt", () => {
    const live = {
      kind: "alive",
      record: record({ attempt_id: "attempt-9" }),
    } as const;
    expect(decideSession(live)).toMatchObject({ action: "attach" });
  });

  it("starts only when there is no session at all", () => {
    expect(decideSession({ kind: "none" })).toEqual({ action: "start" });
  });

  it("replaces a record whose process is gone", () => {
    const dead = { kind: "dead", record: record() } as const;
    expect(decideSession(dead)).toEqual({ action: "replace", record: dead.record });
  });

  it("defers to another machine rather than guessing about its window", () => {
    const foreign = {
      kind: "foreign",
      record: record({ host: "other.local" }),
    } as const;
    expect(decideSession(foreign)).toEqual({
      action: "defer",
      reason: "foreign_host",
    });
  });

  it("fails closed on an unreadable record instead of opening a window", () => {
    expect(decideSession({ kind: "unreadable" })).toEqual({
      action: "defer",
      reason: "unreadable_session",
    });
  });
});

describe("session ownership", () => {
  const claim = (overrides: Parameters<typeof claimSessionOwnership>[0] | object = {}) =>
    claimSessionOwnership({
      now: new Date("2026-10-04T18:00:00.000Z"),
      mode: "headed",
      attemptId: "attempt-1",
      ...overrides,
    });

  it("claims the window before any browser exists, and writes the record", () => {
    const owner = claim();
    expect(owner.tookOver).toBe(false);
    expect(readSession()).toMatchObject({ kind: "alive" });
    expect(fs.existsSync(path.join(stateDir, "request-session.owner"))).toBe(true);
    owner.release();
    expect(fs.existsSync(sessionPath())).toBe(false);
    expect(fs.existsSync(path.join(stateDir, "request-session.owner"))).toBe(false);
  });

  it("refuses a second claim while the first holder is alive", () => {
    const owner = claim();
    expect(() => claim({ pid: 4242 })).toThrow(SessionOwnershipError);
    try {
      claim({ pid: 4242 });
      expect.unreachable();
    } catch (error) {
      expect((error as SessionOwnershipError).reason).toBe("busy");
    }
    owner.release();
    // And once released, the next holder gets it.
    claim().release();
  });

  it("refuses to launch beside another machine's claim", () => {
    fs.mkdirSync(path.join(stateDir, "request-session.owner"), { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, "request-session.owner/owner.json"),
      JSON.stringify({ pid: 4242, host: "other-mac.local" }),
    );
    try {
      claim();
      expect.unreachable();
    } catch (error) {
      expect((error as SessionOwnershipError).reason).toBe("foreign");
    }
  });

  it("fails closed on an owner file it cannot read", () => {
    const dir = path.join(stateDir, "request-session.owner");
    fs.mkdirSync(dir, { recursive: true });
    for (const body of ["{ truncated", JSON.stringify({ host: "x" }), ""]) {
      fs.writeFileSync(path.join(dir, "owner.json"), body);
      try {
        claim();
        expect.unreachable();
      } catch (error) {
        expect((error as SessionOwnershipError).reason, body).toBe("unreadable");
      }
    }
  });

  it("takes over a dead holder's claim, and says it did", () => {
    const dir = path.join(stateDir, "request-session.owner");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "owner.json"),
      JSON.stringify({ pid: 4242, host: os.hostname() }),
    );
    const owner = claim({ isAlive: () => false });
    expect(owner.tookOver).toBe(true);
    owner.release();
  });

  it("never takes over a holder whose process it may not signal", () => {
    const dir = path.join(stateDir, "request-session.owner");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "owner.json"),
      JSON.stringify({ pid: 1, host: os.hostname() }),
    );
    try {
      claim();
      expect.unreachable();
    } catch (error) {
      expect((error as SessionOwnershipError).reason).toBe("busy");
    }
  });

  it("does not contend with the per-attempt request mutex", () => {
    const owner = claim();
    // A window waiting on a person must not block the scheduled path from
    // taking the attempt lock.
    const attempt = acquireNamedLock("request.lock");
    attempt();
    owner.release();
  });
});

describe("release sentinel", () => {
  it("is absent until an operator asks for the window to close", () => {
    expect(releaseRequested()).toBe(false);
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(releaseSentinelPath(), "");
    expect(releaseRequested()).toBe(true);
    clearReleaseSentinel();
    expect(releaseRequested()).toBe(false);
    expect(() => clearReleaseSentinel()).not.toThrow();
  });
});

describe("requestRelease", () => {
  it("asks the holder to close its window, as Ctrl-C does", () => {
    expect(releaseRequested()).toBe(false);
    requestRelease();
    expect(releaseRequested()).toBe(true);
    clearReleaseSentinel();
  });
});

describe("resume sentinel", () => {
  it("is a one-shot request a holder consumes", () => {
    expect(resumeRequested()).toBe(false);
    requestResume();
    expect(resumeRequested()).toBe(true);
    expect(fs.readFileSync(resumeSentinelPath(), "utf8")).not.toBe("");
    clearResumeSentinel();
    expect(resumeRequested()).toBe(false);
    expect(() => clearResumeSentinel()).not.toThrow();
  });

  it("is separate from a release, so neither can be mistaken for the other", () => {
    requestResume();
    expect(releaseRequested()).toBe(false);
    expect(resumeSentinelPath()).not.toBe(releaseSentinelPath());
    fs.writeFileSync(releaseSentinelPath(), "");
    expect(resumeRequested()).toBe(true);
    clearReleaseSentinel();
    expect(resumeRequested()).toBe(true);
  });
});

describe("request mutex", () => {
  it("lets one holder in and refuses the next until it releases", () => {
    const release = acquireNamedLock("request.lock");
    expect(() => acquireNamedLock("request.lock")).toThrow("request.lock_busy");
    release();
    const second = acquireNamedLock("request.lock");
    second();
  });

  it("does not contend with the importer's refresh lock", () => {
    const release = acquireNamedLock("request.lock");
    const importer = acquireRefreshLock();
    importer();
    release();
    expect(fs.readdirSync(stateDir).sort()).toEqual([]);
  });
});

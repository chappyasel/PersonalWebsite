import { spawn } from "child_process";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";

const TSX = path.join(process.cwd(), "node_modules/.bin/tsx");
const FIXTURE = path.join(process.cwd(), "scripts/takeout/entry-fixture.ts");

type Run = { code: number | null; stdout: string; exited: boolean };

const leftovers: number[] = [];

/** Run the fixture and report how it ended, or that it had not by `waitMs`. */
function runFixture(mode: "exit-code" | "helper", waitMs: number): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(TSX, [FIXTURE, mode], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, stdout, exited: false });
    }, waitMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, exited: true });
    });
  }).then((run) => {
    const done = /"helper_pid":(\d+)/.exec((run as Run).stdout);
    if (done) leftovers.push(Number(done[1]));
    return run as Run;
  });
}

afterEach(() => {
  for (const pid of leftovers.splice(0)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
});

describe("exitWhenDone", () => {
  it("documents the hang: a leftover helper keeps an exitCode-only script alive", async () => {
    const run = await runFixture("exit-code", 6000);
    expect(run.stdout).toContain('"event":"fixture_done"');
    expect(run.exited).toBe(false);
  }, 15_000);

  it("exits with main's code once main is done, with the helper still running", async () => {
    const run = await runFixture("helper", 10_000);
    expect(run.exited).toBe(true);
    expect(run.code).toBe(4);
    // The last line is flushed before the process goes.
    expect(run.stdout).toContain('"event":"fixture_done"');
  }, 15_000);
});

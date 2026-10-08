/**
 * A stand-in for a script whose browser left a helper behind. `entry.test.ts`
 * runs it as a real process.
 *
 * The shell exits at once, the way Chrome does when its window closes, and
 * leaves `sleep` holding the stderr pipe, the way `chrome_crashpad_handler`
 * does. Node waits for that pipe to close before it lets the process end.
 *
 *   entry-fixture.ts exit-code  sets process.exitCode only (the old entry)
 *   entry-fixture.ts helper     uses exitWhenDone
 */
import { spawn } from "child_process";

import { exitWhenDone } from "./entry";

const browser = spawn("sh", ["-c", "sleep 20 & echo $!"], {
  stdio: ["ignore", "pipe", "pipe"],
});
browser.stderr.on("data", () => undefined);

const helperPid = new Promise<number>((resolve) => {
  browser.stdout.once("data", (chunk: Buffer) => resolve(Number(String(chunk).trim())));
});

async function main(): Promise<number> {
  const pid = await helperPid;
  await new Promise((resolve) => browser.once("exit", resolve));
  console.log(JSON.stringify({ event: "fixture_done", helper_pid: pid }));
  return 4;
}

if (process.argv[2] === "helper") {
  void exitWhenDone(main);
} else {
  void main().then((code) => {
    process.exitCode = code;
  });
}

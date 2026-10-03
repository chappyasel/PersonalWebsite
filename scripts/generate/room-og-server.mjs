// The local production server the room OG captures run against, shared by
// `room-og-local.mjs` (which builds first) and `room-og-postbuild.mjs` (which
// runs after a build someone else started).
import { spawn } from "node:child_process";
import { createServer } from "node:net";

/** Run a command to completion, rejecting on a non-zero exit.
 * @param {string} command @param {string[]} args
 * @param {import("node:child_process").SpawnOptions & { cwd: string }} options */
export function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(code);
      } else {
        const error = new Error(
          `${command} ${args.join(" ")} exited with ${signal ?? code}`,
        );
        reject(Object.assign(error, { exitCode: code, signal }));
      }
    });
  });
}

/** `preferred` when it is free, otherwise any free port. Two worktrees
 * capturing at once would otherwise both reach for 3319.
 * @param {number} preferred */
export async function freeLocalPort(preferred) {
  /** @param {number} port */
  const listen = (port) =>
    new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        const address = server.address();
        server.close(() =>
          resolve(typeof address === "object" && address ? address.port : port),
        );
      });
    });
  try {
    return await listen(preferred);
  } catch {
    return listen(0);
  }
}

/** Serve the existing `.next` production build. Resolves once the homepage
 * answers; `stop()` ends the server.
 * @param {{ root: string, port: number, quiet?: boolean }} options */
export async function startProductionServer({ root, port, quiet = false }) {
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    "pnpm",
    [
      "exec",
      "next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd: root, stdio: quiet ? "ignore" : "inherit" },
  );

  async function stop() {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }

  const deadline = Date.now() + 120_000;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(
          "The local production server exited before it was ready.",
        );
      }
      try {
        const response = await fetch(url);
        if (response.ok) return { url, stop };
      } catch {
        // The server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for ${url}.`);
  } catch (error) {
    await stop();
    throw error;
  }
}

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { roomOgPostbuildSkipReason } from "./room-og-postbuild.mjs";

const script = fileURLToPath(
  new URL("./room-og-postbuild.mjs", import.meta.url),
);
const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };

describe("room OG postbuild pixel check", () => {
  it("runs only on a local build", () => {
    expect(roomOgPostbuildSkipReason({})).toBeNull();
    expect(roomOgPostbuildSkipReason({ VERCEL: "1", CI: "1" })).toBe(
      "Vercel build",
    );
    expect(roomOgPostbuildSkipReason({ CI: "true" })).toBe("CI");
    expect(roomOgPostbuildSkipReason({ ROOM_OG_POSTBUILD: "0" })).toBe(
      "ROOM_OG_POSTBUILD=0",
    );
  });

  it("runs last in postbuild, after the boundary checks", () => {
    expect(packageJson.scripts.postbuild).toBe(
      "pnpm check:search-boundary && pnpm check:weight-log-boundary && node scripts/generate/room-og-postbuild.mjs",
    );
  });

  // A Vercel build must never wait on, or fail over, a local capture.
  it("exits cleanly without a browser when the build is not local", () => {
    for (const env of [
      { VERCEL: "1" },
      { CI: "1" },
      { ROOM_OG_POSTBUILD: "0" },
    ]) {
      const result = spawnSync(process.execPath, [script], {
        env: { ...process.env, ...env },
        encoding: "utf8",
        timeout: 30_000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Room OG pixel check skipped");
    }
  });
});

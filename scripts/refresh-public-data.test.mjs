import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PUBLIC_DATA_GENERATORS,
  refreshPublicData,
} from "./refresh-public-data.mjs";

const env = { NOTION_API_KEY: "test-notion", GITHUB_TOKEN: "test-github" };
afterEach(() => vi.restoreAllMocks());

describe("public data refresh", () => {
  it("fails before changing any snapshots when a credential is missing", () => {
    for (const missing of Object.keys(env)) {
      const run = vi.fn();
      expect(() =>
        refreshPublicData({ env: { ...env, [missing]: "" }, run }),
      ).toThrow(missing);
      expect(run).not.toHaveBeenCalled();
    }
  });

  it("stops on an upstream failure instead of building a mixed search index", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const run = vi.fn().mockImplementation((_node, args) => {
      if (args.at(-1) === "scripts/generate/routine.ts")
        throw new Error("Notion unavailable");
    });
    expect(() => refreshPublicData({ env, run })).toThrow("Notion unavailable");
    expect(run.mock.calls.map((call) => call[1].at(-1))).toEqual(
      PUBLIC_DATA_GENERATORS.slice(0, 3),
    );
  });

  it("rebuilds search after every source and passes secrets only through the environment", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const run = vi.fn();
    refreshPublicData({ cwd: "/workspace", env, run });
    expect(run.mock.calls.at(-1)[1].at(-1)).toBe(
      "scripts/generate/universal-search-index.ts",
    );
    expect(run).toHaveBeenCalledTimes(PUBLIC_DATA_GENERATORS.length);
    for (const [node, args, options] of run.mock.calls) {
      expect(node).toBe(process.execPath);
      expect(args.slice(0, 2)).toEqual(["--import", "tsx"]);
      expect(JSON.stringify(args)).not.toContain("test-notion");
      expect(JSON.stringify(args)).not.toContain("test-github");
      expect(options).toMatchObject({
        cwd: "/workspace",
        env,
        timeout: 900000,
      });
    }
  });
});

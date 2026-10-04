import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { takeoutPaths } from "./config";

vi.mock("dotenv/config", () => ({}));
const names = [
  "YOUTUBE_TAKEOUT_DATA_DIR",
  "YOUTUBE_TAKEOUT_STATE_DIR",
  "YOUTUBE_TAKEOUT_CREDENTIALS_DIR",
];
beforeEach(() => {
  for (const name of names) vi.stubEnv(name, undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("retains all daily defaults without opening any credential files", () => {
  const data = path.join(os.homedir(), ".local/share/youtube-takeout");
  const state = path.join(
    os.homedir(),
    ".hermes/workspace/state/youtube-takeout",
  );
  expect(takeoutPaths()).toEqual({
    dataDir: data,
    stateDir: state,
    credentialsDir: data,
    incomingDir: path.join(data, "incoming"),
    historyPath: path.join(data, "watch-history.json"),
    stateFile: path.join(state, "state.json"),
    lockDir: path.join(state, "refresh.lock"),
    oauthClientPath: path.join(data, "oauth-client.json"),
    tokenPath: path.join(data, "drive-token.json"),
  });
});

it("keeps worker output, state and credentials separate", () => {
  vi.stubEnv(names[0]!, "/worker/data");
  vi.stubEnv(names[1]!, "/worker/state");
  vi.stubEnv(names[2]!, "/protected/credentials");
  expect(takeoutPaths()).toEqual({
    dataDir: "/worker/data",
    stateDir: "/worker/state",
    credentialsDir: "/protected/credentials",
    incomingDir: "/worker/data/incoming",
    historyPath: "/worker/data/watch-history.json",
    stateFile: "/worker/state/state.json",
    lockDir: "/worker/state/refresh.lock",
    oauthClientPath: "/protected/credentials/oauth-client.json",
    tokenPath: "/protected/credentials/drive-token.json",
  });
});

it.each(names)("rejects relative and empty %s overrides", (name) => {
  for (const value of ["relative", "~/data", ""]) {
    vi.stubEnv(name, value);
    expect(() => takeoutPaths()).toThrow(`${name} must be an absolute path`);
  }
});

it("defaults credentials to the selected data directory unless explicitly separated", () => {
  vi.stubEnv(names[0]!, "/worker/data");
  expect(takeoutPaths().credentialsDir).toBe("/worker/data");
});

it("loads scoped DOTENV_CONFIG_PATH in a fresh process without consuming the repo .env", async () => {
  const fs = await import("node:fs");
  const { spawnSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const { LOCAL_TSX_CLI } = await import("./config");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-dotenv-"));
  try {
    const file = path.join(root, "runtime.env");
    fs.writeFileSync(
      file,
      "DATABASE_URL=postgres://fixture/db\nYOUTUBE_API_KEY=fixture-youtube\nAI_GATEWAY_API_KEY=fixture-ai\n",
      { mode: 0o600 },
    );
    const source = `import assert from 'node:assert/strict';
      const { takeoutPaths } = await import(${JSON.stringify(pathToFileURL(path.join(import.meta.dirname, "config.ts")).href)});
      assert.equal(process.env.DATABASE_URL, 'postgres://fixture/db');
      assert.equal(process.env.YOUTUBE_API_KEY, 'fixture-youtube');
      assert.equal(process.env.AI_GATEWAY_API_KEY, 'fixture-ai');
      assert.equal(process.env.NOTION_SECRET, undefined);
      assert.equal(takeoutPaths().credentialsDir, ${JSON.stringify(path.join(root, "credentials"))});
      console.log('scoped-env-ok');`;
    const fixture = path.join(root, "check.mts");
    fs.writeFileSync(fixture, source);
    const result = spawnSync(process.execPath, [LOCAL_TSX_CLI, fixture], {
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        DOTENV_CONFIG_PATH: file,
        SKIP_ENV_VALIDATION: "1",
        YOUTUBE_TAKEOUT_DATA_DIR: path.join(root, "data"),
        YOUTUBE_TAKEOUT_STATE_DIR: path.join(root, "state"),
        YOUTUBE_TAKEOUT_CREDENTIALS_DIR: path.join(root, "credentials"),
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("scoped-env-ok");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ credentials: vi.fn(), oauth: vi.fn() }));
vi.mock("dotenv/config", () => ({}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        constructor(...args: unknown[]) {
          mocks.oauth(...args);
        }
        setCredentials = mocks.credentials;
      },
    },
  },
}));
let root: string;
beforeEach(() => {
  vi.resetModules();
  mocks.credentials.mockClear();
  mocks.oauth.mockClear();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-drive-"));
  vi.stubEnv("YOUTUBE_TAKEOUT_DATA_DIR", path.join(root, "outputs"));
  vi.stubEnv("YOUTUBE_TAKEOUT_STATE_DIR", path.join(root, "state"));
  vi.stubEnv("YOUTUBE_TAKEOUT_CREDENTIALS_DIR", path.join(root, "protected"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it("loads and saves Drive credentials only in the explicit root with private token permissions", async () => {
  const { OAUTH_CLIENT_PATH, TOKEN_PATH, loadAuthedClient, saveToken } =
    await import("./drive");
  expect(OAUTH_CLIENT_PATH).toBe(
    path.join(root, "protected/oauth-client.json"),
  );
  expect(TOKEN_PATH).toBe(path.join(root, "protected/drive-token.json"));
  fs.mkdirSync(path.dirname(OAUTH_CLIENT_PATH));
  fs.writeFileSync(
    OAUTH_CLIENT_PATH,
    JSON.stringify({
      installed: {
        client_id: "fixture-client",
        client_secret: "fixture-secret",
      },
    }),
    { mode: 0o600 },
  );
  saveToken({ refresh_token: "fixture-token" });
  loadAuthedClient();
  expect(mocks.oauth).toHaveBeenCalledWith(
    "fixture-client",
    "fixture-secret",
    "http://localhost",
  );
  expect(mocks.credentials).toHaveBeenCalledWith({
    refresh_token: "fixture-token",
  });
  fs.chmodSync(TOKEN_PATH, 0o644);
  saveToken({ refresh_token: "fixture-replacement" });
  expect(fs.statSync(TOKEN_PATH).mode & 0o777).toBe(0o600);
  expect(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"))).toEqual({
    refresh_token: "fixture-replacement",
  });
  expect(fs.existsSync(path.join(root, "outputs"))).toBe(false);
});

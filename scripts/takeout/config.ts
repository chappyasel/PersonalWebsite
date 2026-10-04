import "dotenv/config";
import { createRequire } from "node:module";
import * as os from "os";
import * as path from "path";

/** Resolve installed tooling locally, using the same Node as the parent. */
export const LOCAL_TSX_CLI = createRequire(import.meta.url).resolve("tsx/cli");

function directory(name: string, fallback: string): string {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return path.normalize(value);
}

/** Explicit overrides keep worker artifacts and credentials out of daily paths. */
export function takeoutPaths() {
  const dataDir = directory(
    "YOUTUBE_TAKEOUT_DATA_DIR",
    path.join(os.homedir(), ".local/share/youtube-takeout"),
  );
  const stateDir = directory(
    "YOUTUBE_TAKEOUT_STATE_DIR",
    path.join(os.homedir(), ".hermes/workspace/state/youtube-takeout"),
  );
  const credentialsDir = directory("YOUTUBE_TAKEOUT_CREDENTIALS_DIR", dataDir);
  return {
    dataDir,
    stateDir,
    credentialsDir,
    incomingDir: path.join(dataDir, "incoming"),
    historyPath: path.join(dataDir, "watch-history.json"),
    stateFile: path.join(stateDir, "state.json"),
    lockDir: path.join(stateDir, "refresh.lock"),
    oauthClientPath: path.join(credentialsDir, "oauth-client.json"),
    tokenPath: path.join(credentialsDir, "drive-token.json"),
  };
}

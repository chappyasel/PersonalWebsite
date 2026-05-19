import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export type RefreshState = {
  state: "idle" | "requested";
  requested_at: string | null;
  last_ingested_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
};

const STATE_DIR = path.join(
  os.homedir(),
  ".hermes/workspace/state/youtube-takeout",
);
const STATE_FILE = path.join(STATE_DIR, "state.json");

const DEFAULT_STATE: RefreshState = {
  state: "idle",
  requested_at: null,
  last_ingested_at: null,
  last_error: null,
  consecutive_failures: 0,
};

export function readState(): RefreshState {
  if (!fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE };
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as RefreshState;
}

export function writeState(state: RefreshState): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

export function stateFilePath(): string {
  return STATE_FILE;
}

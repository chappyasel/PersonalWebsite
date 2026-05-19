/**
 * Shared Drive API helpers. Loads the user's OAuth client config + refresh
 * token from ~/.local/share/youtube-takeout/, returns an authed Drive client.
 */

import { google, drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DATA_ROOT = path.join(os.homedir(), ".local/share/youtube-takeout");
export const OAUTH_CLIENT_PATH = path.join(DATA_ROOT, "oauth-client.json");
export const TOKEN_PATH = path.join(DATA_ROOT, "drive-token.json");

export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

type ClientFile = {
  installed?: { client_id: string; client_secret: string; redirect_uris?: string[] };
  web?: { client_id: string; client_secret: string; redirect_uris?: string[] };
};

export function loadOAuthClient(): OAuth2Client {
  if (!fs.existsSync(OAUTH_CLIENT_PATH)) {
    throw new Error(
      `OAuth client config missing at ${OAUTH_CLIENT_PATH}. See SKILL.md for one-time setup.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(OAUTH_CLIENT_PATH, "utf8")) as ClientFile;
  const cfg = raw.installed ?? raw.web;
  if (!cfg) throw new Error("oauth-client.json missing 'installed' or 'web' key");
  return new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    cfg.redirect_uris?.[0] ?? "http://localhost",
  );
}

export function loadAuthedClient(): OAuth2Client {
  const oauth = loadOAuthClient();
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      `Drive refresh token missing at ${TOKEN_PATH}. Run \`yarn takeout:drive-auth\`.`,
    );
  }
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  oauth.setCredentials(token);
  return oauth;
}

export function getDrive(): drive_v3.Drive {
  return google.drive({ version: "v3", auth: loadAuthedClient() });
}

export function saveToken(token: Record<string, unknown>): void {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

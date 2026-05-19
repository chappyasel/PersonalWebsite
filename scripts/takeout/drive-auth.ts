/**
 * One-time OAuth authorization for the Drive client.
 *
 * Prereq (in Google Cloud Console, one-time):
 *   1. Create or pick a project at https://console.cloud.google.com/
 *   2. Enable the Google Drive API
 *   3. OAuth consent screen → External → Testing mode → add your email as test user
 *   4. Credentials → Create OAuth client ID → Desktop app
 *   5. Download the JSON → save as ~/.local/share/youtube-takeout/oauth-client.json
 *
 * Then run: npx tsx scripts/takeout/drive-auth.ts
 * Opens your default browser, you click Allow, refresh token saved to disk.
 */

import { loadOAuthClient, DRIVE_SCOPES, saveToken, TOKEN_PATH } from "./drive";
import { createServer } from "http";
import { spawn } from "child_process";
import { AddressInfo } from "net";

async function main() {
  const oauth = loadOAuthClient();

  // Listen on a random port for the OAuth callback
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      server.close(() => resolve(addr.port));
    });
    server.on("error", reject);
  });

  const redirectUri = `http://127.0.0.1:${port}`;
  const authUrl = oauth.generateAuthUrl({
    access_type: "offline",
    scope: DRIVE_SCOPES,
    prompt: "consent", // force refresh_token issuance
    redirect_uri: redirectUri,
  });

  console.log(`Opening browser to authorize Drive access...`);
  console.log(`If it doesn't open, paste this URL:\n${authUrl}\n`);
  spawn("open", [authUrl], { stdio: "ignore", detached: true }).unref();

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error) {
        res.end(`Auth failed: ${error}. You can close this tab.`);
        reject(new Error(error));
        server.close();
        return;
      }
      if (code) {
        res.end("Success. You can close this tab and return to the terminal.");
        resolve(code);
        server.close();
        return;
      }
      res.statusCode = 400;
      res.end("No code in callback.");
    });
    server.listen(port, "127.0.0.1");
    setTimeout(() => {
      reject(new Error("Auth timeout (5 min)"));
      server.close();
    }, 5 * 60_000);
  });

  console.log("Got auth code. Exchanging for tokens...");
  const { tokens } = await oauth.getToken({ code, redirect_uri: redirectUri });
  if (!tokens.refresh_token) {
    console.error(
      "Google didn't return a refresh_token. Revoke this app at " +
        "https://myaccount.google.com/permissions and re-run.",
    );
    process.exit(1);
  }
  saveToken(tokens as Record<string, unknown>);
  console.log(`Saved tokens to ${TOKEN_PATH}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("drive-auth failed:", err);
  process.exit(1);
});

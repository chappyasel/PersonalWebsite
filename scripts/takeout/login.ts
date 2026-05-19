/**
 * Google login for the Takeout automation profile.
 *
 * Strategy: launch Playwright's Chromium *via macOS `open`* so it registers
 * with the window server (Playwright's direct-binary launch silently fails to
 * show a window on some macOS setups). Wait for the user to quit (Cmd-Q),
 * then verify the profile is logged in via a headless Playwright check.
 *
 * Run with: npx tsx scripts/takeout/login.ts
 */

import { spawnSync } from "child_process";
import { getProfileDir, hasGoogleSessionCookies } from "./browser";

const CHROMIUM_APP =
  "/Users/chappyasel/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app";

async function main() {
  const profile = getProfileDir();
  console.log(`[login] Profile dir: ${profile}`);
  console.log(`[login] Launching Chromium via macOS open. A window should appear.`);
  console.log(`[login] Sign in to your Google account, then quit Chromium (Cmd-Q).`);
  console.log();

  // -W blocks until the app quits. -n forces a new instance (so if you happen
  // to have Chrome for Testing running for something else, this is its own).
  const res = spawnSync(
    "open",
    [
      "-W",
      "-n",
      "-a",
      CHROMIUM_APP,
      "--args",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      // Chrome for Testing isn't signed/notarized, so macOS Keychain silently
      // refuses access and cookies won't persist. These flags use a basic
      // encryption store instead — same approach Playwright uses internally.
      "--password-store=basic",
      "--use-mock-keychain",
      "https://accounts.google.com/",
    ],
    { stdio: "inherit" },
  );

  if (res.status !== 0) {
    console.error(`[login] open exited with status ${res.status}`);
    process.exit(1);
  }

  console.log(`[login] Chromium quit. Checking profile for Google session cookies...`);

  if (hasGoogleSessionCookies()) {
    console.log(`[login] Session cookies present. Profile is ready.`);
    process.exit(0);
  } else {
    console.error(`[login] Google session cookies not found in profile.`);
    console.error(`[login] Re-run and make sure you complete the full signin (not incognito).`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[login] crashed:", err);
  process.exit(1);
});

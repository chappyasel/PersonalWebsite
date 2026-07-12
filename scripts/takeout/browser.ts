import { chromium, type BrowserContext, type Page } from "playwright";
import { spawnSync } from "child_process";
import * as path from "path";
import * as os from "os";

const PROFILE_DIR = path.join(os.homedir(), ".config/youtube-takeout-profile");

let _context: BrowserContext | null = null;

export function getProfileDir(): string {
  return PROFILE_DIR;
}

export async function getContext(options?: {
  headless?: boolean;
}): Promise<BrowserContext> {
  if (_context) return _context;
  const launch = () =>
    chromium.launchPersistentContext(PROFILE_DIR, {
      headless: options?.headless ?? true,
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
    });
  try {
    _context = await launch();
  } catch (err) {
    // Playwright throws "Executable doesn't exist …" when its Chromium build is
    // missing — e.g. after a version bump or a wiped ~/Library/Caches/ms-playwright.
    // Install the matching browser once and retry so a missing binary self-heals
    // instead of failing the cron. Any other launch error is re-thrown as-is.
    const msg = String((err as Error)?.message ?? err);
    if (!/Executable doesn't exist|Please run the following|playwright install/i.test(msg)) {
      throw err;
    }
    console.error(
      "[takeout] Playwright browser missing — running `playwright install chromium`…",
    );
    const r = spawnSync("npx", ["playwright", "install", "chromium"], {
      stdio: "inherit",
    });
    if (r.status !== 0) {
      throw new Error(`playwright install chromium failed (exit ${r.status ?? "?"})`);
    }
    _context = await launch();
  }
  return _context;
}

export async function getPage(options?: {
  headless?: boolean;
}): Promise<Page> {
  const ctx = await getContext(options);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return page;
}

export async function close(): Promise<void> {
  if (_context) {
    await _context.close();
    _context = null;
  }
}

const REQUIRED_GOOGLE_COOKIES = ["SID", "SAPISID", "__Secure-1PSID"];

/**
 * Check the on-disk Chromium cookies SQLite for the Google session cookies.
 * Bypasses any browser-rendered bot-detection issues — pure file inspection.
 */
export function hasGoogleSessionCookies(): boolean {
  const cookiesPath = path.join(PROFILE_DIR, "Default/Cookies");
  const res = spawnSync(
    "sqlite3",
    [
      cookiesPath,
      `SELECT name FROM cookies WHERE host_key LIKE '%google.com' AND name IN (${REQUIRED_GOOGLE_COOKIES.map((n) => `'${n}'`).join(",")});`,
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0) return false;
  const found = new Set(res.stdout.trim().split("\n").filter(Boolean));
  return REQUIRED_GOOGLE_COOKIES.every((n) => found.has(n));
}

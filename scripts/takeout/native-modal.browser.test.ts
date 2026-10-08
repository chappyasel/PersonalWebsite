/**
 * Real-browser test for the one thing the native route cannot fake: finding the
 * process id of the browser it is driving.
 *
 * Headless, a throwaway profile deleted afterwards, and no navigation — so no
 * window, no network and no Google account. What this proves is that the pid is
 * obtainable through supported API and belongs to the Chromium we launched. It
 * does not exercise the accessibility driver, and the modal's real control
 * labels remain unverified (see `native-modal.ts`).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type BrowserContext, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { browserProcessPid, pickOwnedIdentity } from "./native-modal";

let profileDir: string;
let context: BrowserContext;

beforeAll(async () => {
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-pid-"));
  context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
  });
}, 120_000);

afterAll(async () => {
  await context?.close();
  fs.rmSync(profileDir, { recursive: true, force: true });
});

describe("browserProcessPid", () => {
  it("returns the live process id of the browser we launched", async () => {
    const pid = await browserProcessPid(context);
    expect(pid).toEqual(expect.any(Number));
    expect(pid).toBeGreaterThan(0);
    expect(pid).not.toBe(process.pid);

    // The pid is a running process, and it is Playwright's browser binary —
    // not this Node process, and not the user's everyday browser.
    const command = execFileSync("ps", ["-o", "comm=", "-p", String(pid)], {
      encoding: "utf8",
    }).trim();
    expect(command).toMatch(/ms-playwright/);
    expect(command).toMatch(/chrome|chromium/i);
  });

  it("can be asked twice without disturbing the browser", async () => {
    const first = await browserProcessPid(context);
    const second = await browserProcessPid(context);
    expect(second).toBe(first);
    expect(context.pages().length).toBeGreaterThanOrEqual(0);
  });

  it("reports unavailable instead of guessing when there is no browser", async () => {
    await expect(
      browserProcessPid({ browser: () => null } as unknown as BrowserContext),
    ).resolves.toBeNull();
  });

  it("will not accept an identity the window list does not vouch for", async () => {
    const pid = await browserProcessPid(context);
    // No accessibility driver runs here, so there is no window list to confirm
    // the application name — which is exactly when the route must stand down.
    expect(pickOwnedIdentity(pid!, [])).toBeNull();
  });
});

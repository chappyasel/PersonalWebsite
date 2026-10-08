/**
 * A real browser page wired to the shared attempt driver.
 *
 * `request.ts`, `session-host.ts` and the end-to-end fixture test all build
 * from here, so the test exercises the wiring production runs rather than a
 * copy of it.
 */
import { randomUUID } from "crypto";
import type { Page } from "playwright";

import { clickCreateExport, fillExportForm } from "./flow";
import type { RequestFlowDeps } from "./request-flow";
import { readRequestState, writeRequestState } from "./request-state";
import type { SessionView } from "./session";
import { detectAuthGate, formReady, observeManageQueue } from "./takeout-dom";

export function pageFlowDeps(input: {
  openPage: () => Promise<Page>;
  sessionView: () => SessionView;
}): RequestFlowDeps {
  return {
    now: () => new Date(),
    newAttemptId: () => randomUUID(),
    loadState: () => readRequestState(),
    saveState: writeRequestState,
    sessionView: input.sessionView,
    openPage: () => input.openPage(),
    fillForm: (page) => fillExportForm(page as Page, false),
    clickCreateExport: (page) => submitAndSettle(page as Page),
    observeQueue: (page) => observeManageQueue(page as Page),
    detectAuthGate: (page) => detectAuthGate(page as Page),
    formReady: (page) => formReady(page as Page),
  };
}

/**
 * Click "Create export" and wait for Google's answer. Checking for a gate the
 * instant after the click races the navigation, and a gate missed there means
 * the queue read that follows walks away from the challenge.
 */
async function submitAndSettle(page: Page): Promise<void> {
  const before = page.url();
  await clickCreateExport(page);
  await page
    .waitForURL((url) => url.toString() !== before, { timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(2000);
}

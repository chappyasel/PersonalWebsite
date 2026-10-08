/**
 * The browser boundary: everything the request flow needs to know about a
 * Takeout page, read off the DOM and turned into the observations the state
 * machine understands.
 *
 * The contract this encodes is a *contract*, not a transcript of Google's
 * markup. **The real selectors are unverified**: nothing here has been run
 * against takeout.google.com, because doing so needs an authentication route
 * that does not exist yet. The fixtures in `takeout-dom.browser.test.ts` are
 * what it has been proved against, and an operator has to confirm these markers
 * against the live page before the request path is enabled.
 *
 * Which is why every judgement is bound tightly and fails to "unreadable":
 *
 *   - A product and a status only count when they are read from the *same*
 *     export card. "Export in progress" somewhere and "YouTube" somewhere else
 *     is two facts about a page, not one fact about an export.
 *   - A row whose status cannot be read makes the whole queue unreadable. A
 *     baseline containing an unclassified row could let a real pending export
 *     slip past duplicate suppression.
 *   - An empty queue is trusted only when the page says so *and* nothing on it
 *     suggests an export is being built.
 *   - The page has to be served over HTTPS from takeout.google.com, on the
 *     expected path, or it is not the Takeout queue at all.
 */
import { type Page } from "playwright";

import {
  type ManageExportObservation,
  type Observation,
  manageQueueObservation,
  unknownObservation,
} from "./queue-evidence";
import type { AuthGateObservation } from "./request-flow";
import { AUTH_GATE_RE } from "./flow";

export const MANAGE_URL = "https://takeout.google.com/manage";
const TAKEOUT_HOST = "takeout.google.com";
/** Products Google names on an export card, lowercased as they are matched. */
const KNOWN_PRODUCTS: [RegExp, string][] = [
  [/youtube/i, "youtube and youtube music"],
  [/google photos|\bphotos\b/i, "google photos"],
  [/google drive|\bdrive\b/i, "google drive"],
  [/\bgmail\b|\bmail\b/i, "gmail"],
  [/\bcalendar\b/i, "calendar"],
  [/location history|\bmaps\b/i, "maps"],
  [/\bchrome\b/i, "chrome"],
  [/google keep|\bkeep\b/i, "keep"],
  [/\bcontacts\b/i, "contacts"],
  [/\bfit\b/i, "fit"],
];

/** Google's own wording for an export it is still building. */
const IN_PROGRESS_RE = /Export in progress|creating a copy of data|Preparing/i;
/** Wording for one it has finished. "Completed" is the live Summary page's. */
const COMPLETE_RE =
  /Completed|Download|available until|export is ready|Expired|Deleted|Failed/i;
/** The page saying, in as many words, that there are no exports. */
const EMPTY_RE =
  /No exports|You have no exports|haven'?t (?:created|exported)|nothing to show/i;

/**
 * HTTPS, the Takeout host, and — when given — the expected path prefix. A page
 * served from anywhere else is not the Takeout queue, whatever it contains.
 */
export function isTakeoutUrl(url: string, pathPrefix?: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.host !== TAKEOUT_HOST) return false;
    return pathPrefix === undefined || parsed.pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
}

function onTakeout(page: Page, pathPrefix?: string): boolean {
  return isTakeoutUrl(page.url(), pathPrefix);
}

/**
 * Is Google asking for a human right now, and for what?
 *
 * Checked before anything that navigates, because navigating away from a live
 * challenge abandons a sign-in someone may be halfway through.
 */
export async function detectAuthGate(
  page: Page,
): Promise<AuthGateObservation | null> {
  const passwordVisible = await page
    .locator("input[type=password]")
    .first()
    .isVisible()
    .catch(() => false);
  if (passwordVisible) {
    // The password prompt is reachable but entering one is not this code's job.
    return { step: "password", blocker: "credential_route_unavailable" };
  }
  if (AUTH_GATE_RE.test(page.url())) {
    return { step: "passkey", blocker: "passkey_tap_required" };
  }
  const passkeyPrompt = await page
    .getByText(/passkey|Verify it'?s you|Use your (?:fingerprint|face)/i)
    .first()
    .isVisible()
    .catch(() => false);
  return passkeyPrompt ? { step: "passkey", blocker: "passkey_tap_required" } : null;
}

/** Already on the delivery step with "Create export" in reach? */
export async function formReady(page: Page): Promise<boolean> {
  if (!onTakeout(page)) return false;
  if (await detectAuthGate(page)) return false;
  return await page
    .getByRole("button", { name: /Create export/i })
    .first()
    .isVisible()
    .catch(() => false);
}

/**
 * Read the export list.
 *
 * Navigating is the dangerous part — it walks away from any challenge on
 * screen — so this refuses to move while one is up, rather than trusting the
 * caller to have checked.
 */
export async function observeManageQueue(page: Page): Promise<Observation> {
  const observedAt = new Date().toISOString();
  if (AUTH_GATE_RE.test(page.url()) || (await detectAuthGate(page))) {
    return unknownObservation("auth_gate", observedAt);
  }

  try {
    await page.goto(MANAGE_URL, { waitUntil: "domcontentloaded" });
  } catch {
    return unknownObservation("unreadable", observedAt);
  }

  if (AUTH_GATE_RE.test(page.url())) {
    return unknownObservation("auth_gate", observedAt);
  }
  if (!onTakeout(page, "/manage")) {
    return unknownObservation("not_takeout", observedAt);
  }
  if (await detectAuthGate(page)) {
    return unknownObservation("auth_gate", observedAt);
  }

  const parsed = await page
    .evaluate(() => {
      const scope = document.querySelector("main") ?? document.body;
      if (!scope) return null;
      const anchors = Array.from(
        scope.querySelectorAll<HTMLAnchorElement>("a[href*='/manage/export/'], a[href*='/manage/archive/']"),
      );
      const seen = new Set<Element>();
      const rows: { exportId: string | null; text: string }[] = [];
      for (const anchor of anchors) {
        const row = anchor.closest("li, tr, article, section, div") ?? anchor;
        if (seen.has(row)) continue;
        seen.add(row);
        rows.push({
          exportId:
            /\/manage\/(?:export|archive)\/([^/?#]+)/.exec(anchor.getAttribute("href") ?? "")?.[1] ??
            null,
          text: (row as HTMLElement).innerText ?? "",
        });
      }
      return { text: scope.innerText ?? "", rows };
    })
    .catch(() => null);

  if (!parsed) return unknownObservation("unreadable", observedAt);

  const exports: ManageExportObservation[] = parsed.rows.map((row) => ({
    exportId: row.exportId,
    // Status and products come from one card's own text, never from the page.
    status: IN_PROGRESS_RE.test(row.text)
      ? "in_progress"
      : COMPLETE_RE.test(row.text)
        ? "complete"
        : "unknown",
    products: KNOWN_PRODUCTS.flatMap(([pattern, name]) =>
      pattern.test(row.text) ? [name] : [],
    ),
    createdAtText:
      /\b([A-Z][a-z]{2} \d{1,2}, \d{4})\b/.exec(row.text)?.[1] ?? null,
  }));

  // One unclassifiable row poisons the whole reading: as a baseline it could
  // hide a pending export, and as a result it could hide a queued one.
  if (exports.some((card) => card.status === "unknown")) {
    return unknownObservation("unreadable", observedAt);
  }
  if (exports.length > 0) return manageQueueObservation(exports, observedAt);

  // No rows at all. Trust that only when the page says there are none and
  // nothing on it contradicts that.
  if (EMPTY_RE.test(parsed.text) && !IN_PROGRESS_RE.test(parsed.text)) {
    return manageQueueObservation([], observedAt);
  }
  return unknownObservation("unreadable", observedAt);
}

/**
 * Wait up to `timeoutMs` for the locator to show. Google renders these steps
 * after the page settles (the "Try another way" button appears only once the
 * passkey request has failed), so checking once would race the page.
 */
async function visibleWithin(
  locator: ReturnType<Page["locator"]>,
  timeoutMs: number,
): Promise<boolean> {
  try {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/** The DOM control the native modal used to swallow. */
export async function clickTryAnotherWay(
  page: Page,
  timeoutMs = 10_000,
): Promise<boolean> {
  const control = page
    .getByRole("button", { name: /Try another way/i })
    .or(page.getByRole("link", { name: /Try another way/i }))
    .first();
  if (!(await visibleWithin(control, timeoutMs))) return false;
  await control.click().catch(() => undefined);
  return true;
}

export async function chooseEnterPassword(
  page: Page,
  timeoutMs = 10_000,
): Promise<boolean> {
  const control = page
    .getByRole("button", { name: /Enter your password/i })
    .or(page.getByRole("link", { name: /Enter your password/i }))
    .first();
  if (!(await visibleWithin(control, timeoutMs))) return false;
  await control.click().catch(() => undefined);
  return true;
}

/** Proof the route arrived. */
export async function passwordFieldVisible(
  page: Page,
  timeoutMs = 10_000,
): Promise<boolean> {
  return await visibleWithin(page.locator("input[type=password]").first(), timeoutMs);
}

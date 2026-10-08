/**
 * Dismissing one exact native dialog, and nothing else.
 *
 * When Google offers a passkey and the Mac has none to offer back, Chrome puts
 * up its own native "No passkeys available" window. It sits above the page and
 * swallows the click on the DOM's "Try another way", which is why the old
 * password route hung on "Loading". A DOM automation cannot reach a native
 * window, so clearing it needs the accessibility layer — here, cua-driver 0.22.
 *
 * That is a lot of reach for a weekly cron, so the authority is deliberately
 * narrow:
 *
 *   - The modal must belong to the browser process this run drives, matched by
 *     pid *and* application name, and must be a window that did not exist
 *     before. "Some Chrome somewhere is showing this dialog" is never enough —
 *     and the browser here is Playwright's own build, so the user's everyday
 *     Chrome is a different application with a different name.
 *   - That identity is read from the running browser, not guessed: a browser
 *     CDP session answers `SystemInfo.getProcessInfo`, whose `browser` entry is
 *     the process id, and the application name comes from that pid's own
 *     windows. The holder's pid would be Node's, so it is never used. If either
 *     step fails the native route reports itself unavailable.
 *   - The title must match exactly, and the control pressed must be an AXButton
 *     whose label is one of two known words.
 *   - Dismissal is proved by re-reading the exhaustive top-level window list and
 *     finding no matching modal for our process at all — not merely that one
 *     window id went away, since Chrome can put the same dialog back under a
 *     new id. The owned browser window must still be there too, or the
 *     "dismissal" was a crash. cua's own predicates refuse to assert absence,
 *     and rightly so, which is why this reads the window list rather than
 *     calling `verify_state`.
 *   - Anything ambiguous — two candidates, two buttons, a driver error, a
 *     partial or error-shaped reply, a single malformed row — fails closed. The caller then blocks and asks for a
 *     human instead of clicking into the dark.
 *   - The AX element tokens are per-snapshot and scoped to a driver session, so
 *     a stable session label travels with every call that accepts one
 *     (`get_window_state` and `click`; `list_windows` does not take one). Each
 *     CLI invocation is a separate process, and continuity across them cannot
 *     be assumed from the transport.
 *   - It is off unless an operator explicitly turns it on *and* acknowledges
 *     having reviewed it. The adapter uses read-only inspection plus one
 *     accessibility press; it never brings Chrome to the front, never launches
 *     an app, never changes driver configuration or permissions, and never
 *     captures the screen.
 */

import type { BrowserContext } from "playwright";

/** The one native dialog this module may touch. */
export const KNOWN_MODAL = {
  title: "No passkeys available",
  /** Exact AXButton labels, matched case-sensitively. */
  dismissLabels: ["OK", "Cancel"] as const,
} as const;

/**
 * Applications an owned browser may be. Playwright's bundled build reports
 * "Google Chrome for Testing"; a channel launch reports "Google Chrome". The
 * allow list keeps the adapter from being pointed at some unrelated app.
 */
export const OWNED_APP_NAMES = [
  "Google Chrome for Testing",
  "Google Chrome",
  "Chromium",
] as const;

export const NATIVE_MODAL_ENV = "YOUTUBE_TAKEOUT_NATIVE_MODAL";
export const NATIVE_MODAL_ACK_ENV = "YOUTUBE_TAKEOUT_NATIVE_MODAL_OPERATOR_ACK";
/** Spelled out so turning this on cannot be a stray `=1` in a shell profile. */
export const NATIVE_MODAL_ACK_TOKEN = "reviewed-dismiss-no-passkeys-modal";

export type NativeWindow = {
  window_id: number;
  pid: number;
  app_name: string;
  title: string;
};

export type NativeElement = {
  element_token: string;
  role: string;
  label: string;
};

/**
 * The browser this run drives: its process, its application name, and the
 * windows it already had. Supplied by an operator, never guessed.
 */
export type OwnedBrowser = {
  pid: number;
  appName: (typeof OWNED_APP_NAMES)[number];
  windowIds: number[];
};

/**
 * The browser process behind a Playwright context.
 *
 * `context.browser()` is non-null for a persistent context, and
 * `newBrowserCDPSession` is public API; `SystemInfo.getProcessInfo` lists the
 * browser's own process among its children. Verified headlessly against a
 * throwaway profile: the id it returns is the live Chromium process.
 *
 * `null` on any failure. There is no fallback, because every fallback would be
 * a guess about which browser to send accessibility clicks to.
 */
export async function browserProcessPid(
  context: BrowserContext,
): Promise<number | null> {
  try {
    const browser = context.browser();
    if (!browser) return null;
    const session = await browser.newBrowserCDPSession();
    try {
      const info = (await session.send("SystemInfo.getProcessInfo")) as {
        processInfo?: { type?: string; id?: number }[];
      };
      const main = info.processInfo?.find((entry) => entry.type === "browser");
      return typeof main?.id === "number" && main.id > 0 ? main.id : null;
    } finally {
      await session.detach().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

/**
 * Turn a pid and that pid's window list into an owned-browser identity.
 *
 * The application name is whatever those windows say it is, checked against the
 * known browsers — Playwright's build reports "Google Chrome for Testing", so
 * assuming "Google Chrome" would either match nothing or, worse, match the
 * user's everyday browser. Windows disagreeing about their own application, or
 * naming one we do not know, means no identity at all.
 */
export function pickOwnedIdentity(
  pid: number,
  windows: NativeWindow[],
): OwnedBrowser | null {
  const ours = windows.filter((window) => window.pid === pid);
  if (ours.length === 0) return null;
  const names = new Set(ours.map((window) => window.app_name));
  if (names.size !== 1) return null;
  const appName = OWNED_APP_NAMES.find((name) => name === [...names][0]);
  if (!appName) return null;
  return {
    pid,
    appName,
    windowIds: ours.map((window) => window.window_id),
  };
}

/**
 * Establish the owned browser before any modal exists, so the baseline windows
 * are genuinely pre-modal. Call it once the window is open and settled.
 */
export async function resolveOwnedBrowser(input: {
  context: BrowserContext;
  driver: NativeModalDriver;
}): Promise<OwnedBrowser | null> {
  const pid = await browserProcessPid(input.context);
  if (pid === null) return null;
  try {
    return pickOwnedIdentity(pid, await input.driver.listWindows(pid));
  } catch {
    return null;
  }
}

export type NativeModalDriver = {
  listWindows: (pid: number) => Promise<NativeWindow[]>;
  windowElements: (input: {
    pid: number;
    windowId: number;
  }) => Promise<NativeElement[]>;
  click: (input: {
    pid: number;
    elementToken: string;
    windowId?: number;
  }) => Promise<void>;
};

export type ModalMatch =
  | { kind: "found"; window: NativeWindow }
  | { kind: "absent" }
  | { kind: "ambiguous" }
  | { kind: "foreign_modal" }
  | { kind: "browser_gone" };

export type ModalGoneVerdict =
  | "dismissed"
  | "still_present"
  | "ambiguous"
  | "browser_gone";

/**
 * Re-read the window list after the press. Success needs two facts at once:
 * our browser is still there, and no window of ours matches the modal. A modal
 * recreated under a new id is still a modal.
 */
export function verifyModalGone(
  windows: NativeWindow[],
  owned: OwnedBrowser,
): ModalGoneVerdict {
  const ours = windows.filter((window) => window.pid === owned.pid);
  const browserStillListed = ours.some((window) =>
    owned.windowIds.includes(window.window_id),
  );
  if (!browserStillListed) return "browser_gone";
  const matching = ours.filter((window) => isKnownModal(window, owned));
  if (matching.length === 0) return "dismissed";
  return matching.length > 1 ? "ambiguous" : "still_present";
}

export type DismissOutcome =
  | { kind: "dismissed"; windowId: number }
  | { kind: "not_present" }
  | { kind: "dismiss_unconfirmed" }
  | { kind: "ambiguous_native_evidence" }
  | { kind: "foreign_modal" }
  | { kind: "dismiss_control_missing" }
  | { kind: "browser_gone" }
  | { kind: "driver_error" }
  | { kind: "driver_disabled" };

function isKnownModal(window: NativeWindow, owned: OwnedBrowser): boolean {
  return window.app_name === owned.appName && window.title === KNOWN_MODAL.title;
}

/**
 * Pick the modal out of a window list, bound to the owned browser process.
 * A candidate that is one of the browser's pre-existing windows is ambiguous,
 * not a match: pressing a button inside the Takeout window itself would be a
 * different action entirely.
 */
export function findOwnedModal(
  windows: NativeWindow[],
  owned: OwnedBrowser,
): ModalMatch {
  const titled = windows.filter((window) => isKnownModal(window, owned));
  const foreign = titled.filter((window) => window.pid !== owned.pid);
  const ours = titled.filter((window) => window.pid === owned.pid);

  const browserStillListed = windows.some(
    (window) => window.pid === owned.pid && owned.windowIds.includes(window.window_id),
  );
  if (!browserStillListed) return { kind: "browser_gone" };

  if (ours.some((window) => owned.windowIds.includes(window.window_id))) {
    return { kind: "ambiguous" };
  }
  if (ours.length > 1) return { kind: "ambiguous" };
  if (ours.length === 1) return { kind: "found", window: ours[0]! };
  return foreign.length > 0 ? { kind: "foreign_modal" } : { kind: "absent" };
}

function findDismissControl(
  elements: NativeElement[],
): { kind: "one"; element: NativeElement } | { kind: "none" } | { kind: "many" } {
  const candidates = elements.filter(
    (element) =>
      element.role === "AXButton" &&
      (KNOWN_MODAL.dismissLabels as readonly string[]).includes(element.label),
  );
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length > 1) return { kind: "many" };
  return { kind: "one", element: candidates[0]! };
}

export async function dismissOwnedModal(
  driver: NativeModalDriver,
  owned: OwnedBrowser,
): Promise<DismissOutcome> {
  try {
    const match = findOwnedModal(await driver.listWindows(owned.pid), owned);
    if (match.kind === "absent") return { kind: "not_present" };
    if (match.kind === "ambiguous") return { kind: "ambiguous_native_evidence" };
    if (match.kind === "foreign_modal") return { kind: "foreign_modal" };
    if (match.kind === "browser_gone") return { kind: "browser_gone" };

    const control = findDismissControl(
      await driver.windowElements({ pid: owned.pid, windowId: match.window.window_id }),
    );
    if (control.kind === "none") return { kind: "dismiss_control_missing" };
    if (control.kind === "many") return { kind: "ambiguous_native_evidence" };

    // A failed press is read before any conclusion is drawn from the window
    // list: "the modal is gone" and "we never managed to press anything" can
    // otherwise look identical.
    await driver.click({
      pid: owned.pid,
      elementToken: control.element.element_token,
      windowId: match.window.window_id,
    });

    // The top-level window list is exhaustive, so its absence is real evidence.
    const verdict = verifyModalGone(await driver.listWindows(owned.pid), owned);
    if (verdict === "dismissed") {
      return { kind: "dismissed", windowId: match.window.window_id };
    }
    if (verdict === "browser_gone") return { kind: "browser_gone" };
    if (verdict === "ambiguous") return { kind: "ambiguous_native_evidence" };
    return { kind: "dismiss_unconfirmed" };
  } catch {
    return { kind: "driver_error" };
  }
}

export function nativeModalEnabled(
  env: Record<string, string | undefined>,
): boolean {
  return (
    env[NATIVE_MODAL_ENV] === "1" &&
    env[NATIVE_MODAL_ACK_ENV] === NATIVE_MODAL_ACK_TOKEN
  );
}

type ToolRunner = (
  tool: string,
  payload: Record<string, unknown>,
) => Promise<string>;

/** Keys a cua reply uses to say the answer is an error or only part of one. */
const DEGRADED_KEYS = [
  "error",
  "isError",
  "is_error",
  "partial",
  "truncated",
  "degraded",
  "incomplete",
] as const;

/**
 * Parse one driver reply, refusing anything that is not a whole answer.
 *
 * This strictness is the difference between a dismissal and a guess. An error
 * object, or a reply whose window list was truncated, has no `windows` of its
 * own — and if that were quietly read as "no windows", the check that proves
 * the modal is gone would pass precisely when the driver had stopped answering.
 */
function parse(output: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(output) as unknown;
  } catch {
    // Driver output can include window titles; only the code is surfaced.
    throw new Error("native_driver_unparsable");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("native_driver_unparsable");
  }
  const envelope = value as Record<string, unknown>;
  for (const key of DEGRADED_KEYS) {
    if (envelope[key]) throw new Error("native_driver_degraded");
  }
  // `element_token` is documented as living under structuredContent, and the
  // CLI prints that payload directly. Accept either shape, then be strict.
  const inner = envelope.structuredContent;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const record = inner as Record<string, unknown>;
    for (const key of DEGRADED_KEYS) {
      if (record[key]) throw new Error("native_driver_degraded");
    }
    return record;
  }
  return envelope;
}

function requiredArray(
  payload: Record<string, unknown>,
  key: string,
): unknown[] {
  const value = payload[key];
  if (!Array.isArray(value)) throw new Error("native_driver_unparsable");
  return value;
}

function asWindow(value: unknown): NativeWindow | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.window_id !== "number" ||
    typeof record.pid !== "number" ||
    typeof record.app_name !== "string" ||
    typeof record.title !== "string"
  ) {
    return null;
  }
  return {
    window_id: record.window_id,
    pid: record.pid,
    app_name: record.app_name,
    title: record.title,
  };
}

function asElement(value: unknown): NativeElement | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.element_token !== "string" ||
    typeof record.role !== "string" ||
    typeof record.label !== "string"
  ) {
    return null;
  }
  return {
    element_token: record.element_token,
    role: record.role,
    label: record.label,
  };
}

/**
 * The cua-driver 0.22 adapter. The dismiss control's real labels are
 * **unverified**: `KNOWN_MODAL.dismissLabels` is what Chrome's dialog is
 * expected to offer, proved only against fixtures. The modal has not been
 * raised and dismissed live in this work, because doing so needs an
 * authentication route that does not exist yet.
 *
 * Exactly three tools, in this order of authority:
 * `list_windows` and `get_window_state` observe, `click` presses one
 * accessibility element in the background. Nothing here focuses, launches,
 * records or reconfigures anything, and `include_screenshot` is turned off so
 * no screen capture happens either.
 *
 * Every row has to parse. One malformed window is a reply this module will not
 * reason about, rather than a list with a hole in it.
 */
export function cuaDriverModalDriver(options: {
  run: ToolRunner;
  /** One stable label for the whole attempt, so snapshot tokens stay in scope. */
  session?: string;
}): NativeModalDriver {
  const session = options.session ? { session: options.session } : {};
  return {
    listWindows: async (pid) => {
      // list_windows takes no session; its schema rejects unknown properties.
      const payload = parse(await options.run("list_windows", { pid }));
      return requiredArray(payload, "windows").map((value) => {
        const window = asWindow(value);
        if (!window) throw new Error("native_driver_unparsable");
        return window;
      });
    },
    windowElements: async ({ pid, windowId }) => {
      const payload = parse(
        await options.run("get_window_state", {
          pid,
          window_id: windowId,
          include_screenshot: false,
          ...session,
        }),
      );
      return requiredArray(payload, "elements").map((value) => {
        const element = asElement(value);
        if (!element) throw new Error("native_driver_unparsable");
        return element;
      });
    },
    click: async ({ pid, elementToken, windowId }) => {
      // `parse` throws on an error-shaped reply, so a press that did not happen
      // can never be followed by a verification that reads as success.
      parse(
        await options.run("click", {
          pid,
          element_token: elementToken,
          ...(windowId === undefined ? {} : { window_id: windowId }),
          action: "press",
          delivery_mode: "background",
          ...session,
        }),
      );
    },
  };
}

/**
 * Build the driver only when an operator has turned it on and acknowledged it.
 * `null` is the default, and the caller must treat it as a blocker rather than
 * as permission to carry on without the native step.
 */
export function resolveModalDriver(
  env: Record<string, string | undefined>,
  run?: ToolRunner,
  session?: string,
): NativeModalDriver | null {
  if (!nativeModalEnabled(env)) return null;
  return cuaDriverModalDriver({ run: run ?? cuaDriverCliRunner(), session });
}

/** Shells out to the installed `cua-driver` binary. Not used unless enabled. */
export function cuaDriverCliRunner(
  bin = process.env.CUA_DRIVER_BIN ?? "cua-driver",
): ToolRunner {
  return async (tool, payload) => {
    const { execFile } = await import("child_process");
    return await new Promise<string>((resolve, reject) => {
      execFile(
        bin,
        ["call", tool, JSON.stringify(payload)],
        { encoding: "utf8", timeout: 20_000 },
        (error, stdout) => {
          // The driver's stderr can quote window titles, so it is dropped.
          if (error) reject(new Error("native_driver_failed"));
          else resolve(stdout);
        },
      );
    });
  };
}

/**
 * The only part that needs a browser: registering the emoji itself.
 *
 * Notion has no API for creating a custom emoji, so this drives the real
 * settings UI in a headless context carrying the operator's own session. It
 * does as little as possible there. Nothing about the page state is trusted as
 * proof of success; that comes from the API afterwards, which is also what
 * makes workspace confusion impossible to miss, since the integration token is
 * bound to the pinned workspace and simply will not see an emoji uploaded
 * somewhere else.
 *
 * A login or permission wall stops the run. Clicking through one is how an
 * automation ends up approving something nobody asked it to approve.
 */
import type { BrowserCookie } from "./cookies";
import { paths } from "./state";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";

export class NotionLoginRequired extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionLoginRequired";
  }
}

/**
 * Anything that goes wrong in the browser, at any point in the run.
 *
 * The distinction that matters is not setup versus upload, it is session
 * versus book. A panel that disappears halfway through a batch is a property
 * of the session: every later book will hit the same wall, and recording that
 * against each of them burns the catalog's retry budget and hides the real
 * cause. The first version of this only covered setup, so a mid-run failure
 * at one book silently poisoned every book after it.
 */
export class BrowserSessionError extends Error {
  constructor(
    message: string,
    options?: { cause?: unknown; diagnostics?: string },
  ) {
    super(
      options?.diagnostics ? `${message} (see ${options.diagnostics})` : message,
      { cause: options?.cause },
    );
    this.name = "BrowserSessionError";
  }
}

/** Kept as a distinct name for the setup phase; treated identically. */
export class BrowserSetupError extends BrowserSessionError {
  constructor(message: string, options?: { cause?: unknown; diagnostics?: string }) {
    super(message, options);
    this.name = "BrowserSetupError";
  }
}

/**
 * Photograph the failure before tearing anything down.
 *
 * A closed browser explains nothing. Twice now a run has ended with a timeout
 * whose cause was only visible on screen, so the screenshot is taken while the
 * page still exists and never lets its own failure mask the original error.
 */
export async function captureDiagnostics(
  page: Page,
  label: string,
): Promise<string | undefined> {
  try {
    const dir = join(paths.root, "diagnostics");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const shot = join(dir, `${stamp}-${slug}.png`);
    // Bounded: a hung page must not turn a failure into a stall.
    await withWatchdog(
      page.screenshot({ path: shot, fullPage: false }),
      10_000,
      "diagnostic screenshot",
    );
    const buttons = await withWatchdog(
      page.getByRole("button").allInnerTexts(),
      5_000,
      "diagnostic dom read",
    ).catch(() => [] as string[]);
    writeFileSync(
      join(dir, `${stamp}-${slug}.json`),
      `${JSON.stringify(
        {
          label,
          url: page.url(),
          buttons: buttons.map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 60),
        },
        null,
        2,
      )}\n`,
    );
    return shot;
  } catch {
    return undefined;
  }
}

export class WorkspaceMismatch extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceMismatch";
  }
}

export type Session = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export const LAUNCH_BUDGET_MS = 90_000;

export function openSession(cookies: BrowserCookie[]): Promise<Session> {
  return withWatchdog(openSessionUnbounded(cookies), LAUNCH_BUDGET_MS, "browser launch");
}

async function openSessionUnbounded(cookies: BrowserCookie[]): Promise<Session> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addCookies(cookies);
  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Run something with a deadline.
 *
 * A wedged renderer does not reject, it simply never settles. Every await that
 * touches the browser needs its own bound or the whole run stalls behind one
 * of them, which is exactly what happened: seven minutes of no progress with
 * the renderer pinned at 101% CPU.
 */
export async function withWatchdog<T>(
  task: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new BrowserSessionError(`${label} exceeded ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Close the browser, and mean it.
 *
 * `context.close()` is the call that hangs when the renderer is stuck, and it
 * buys nothing here because the browser is going away regardless. So skip it,
 * bound `browser.close()`, and fall back to killing the process. A teardown
 * that can block is a teardown that will eventually block forever.
 */
export async function closeSession(
  session: Session,
  timeoutMs = 15_000,
): Promise<void> {
  try {
    await withWatchdog(session.browser.close(), timeoutMs, "browser.close");
  } catch {
    // Fall through to the kill below.
  }
  try {
    // browser.process() exists on the Chromium browser but is not on the
    // cross-browser Browser type, so reach for it deliberately.
    const child = (
      session.browser as unknown as {
        process?: () => { exitCode: number | null; kill: (signal: string) => void } | null;
      }
    ).process?.();
    if (child?.exitCode === null) child.kill("SIGKILL");
  } catch {
    // Already gone.
  }
}

/**
 * Ask the app which workspaces this session can act in.
 *
 * getSpaces is the authoritative answer and it needs no guessing: it returns
 * the spaces the logged-in session belongs to, by id and name. An earlier
 * attempt scraped spaceId out of /api/v3 request bodies and produced eight
 * ids that were not spaces at all, which is exactly the kind of near-miss
 * that makes a guard worse than useless.
 *
 * The rule is deliberately strict. The pinned workspace must be the only one
 * visible. If the session can reach a second workspace, the run stops rather
 * than reasoning about which one an upload would land in.
 */
export type VisibleSpace = { id: string; name: string };

export async function listSpaces(page: Page): Promise<VisibleSpace[]> {
  const response = await page.request.post("https://www.notion.so/api/v3/getSpaces", {
    data: {},
    headers: { "content-type": "application/json" },
  });
  if (!response.ok()) {
    throw new WorkspaceMismatch(
      `could not read the workspace list (http ${response.status()}); refusing to upload`,
    );
  }
  const body = (await response.json()) as Record<string, { space?: Record<string, unknown> }>;
  const spaces: VisibleSpace[] = [];
  for (const account of Object.values(body)) {
    for (const [id, record] of Object.entries(account.space ?? {})) {
      const holder = record as { value?: { value?: { name?: string }; name?: string } };
      const name = holder.value?.value?.name ?? holder.value?.name ?? "?";
      spaces.push({ id: id.toLowerCase(), name });
    }
  }
  return spaces;
}

export function assertOnlyPinnedSpace(
  spaces: readonly VisibleSpace[],
  expectedId: string,
): VisibleSpace {
  const expected = expectedId.toLowerCase();
  if (spaces.length === 0) {
    throw new WorkspaceMismatch(
      "the session reports no workspaces at all; refusing to upload",
    );
  }
  const foreign = spaces.filter((space) => space.id !== expected);
  if (foreign.length > 0) {
    throw new WorkspaceMismatch(
      `this session can also reach ${foreign
        .map((space) => `${space.name} (${space.id})`)
        .join(", ")}; refusing to upload while more than the pinned workspace is reachable`,
    );
  }
  return spaces[0]!;
}

/** Guard every navigation: a login wall ends the run rather than being solved. */
async function assertAuthenticated(page: Page): Promise<void> {
  const url = page.url();
  if (url.includes("/login") || url.includes("/auth")) {
    throw new NotionLoginRequired(
      `Notion asked for login at ${url}. The Arc cookie bridge is stale. Sign in to Notion in Arc and rerun.`,
    );
  }
}

/**
 * Open Settings then the Emoji tab, and confirm the session is really in the
 * pinned workspace before anything is uploaded.
 */
/**
 * Reach the workspace Emoji settings.
 *
 * Notion has moved to app.notion.com, and the old route the reference script
 * used is gone: www.notion.so/settings now redirects to the library, and no
 * /settings URL on the new app renders the panel. Settings opens as a dialog
 * from the sidebar switcher instead, which is where the Emoji tab lives. That
 * was established by reading the live UI, not by guessing at selectors.
 */
export const SETUP_BUDGET_MS = 120_000;
export const UPLOAD_BUDGET_MS = 120_000;

export function openEmojiSettings(
  page: Page,
  expectedWorkspaceId: string,
): Promise<{ space: VisibleSpace; route: string }> {
  return withWatchdog(
    openEmojiSettingsUnbounded(page, expectedWorkspaceId),
    SETUP_BUDGET_MS,
    "opening the emoji settings",
  );
}

async function openEmojiSettingsUnbounded(
  page: Page,
  expectedWorkspaceId: string,
): Promise<{ space: VisibleSpace; route: string }> {
  await page.goto("https://app.notion.com/", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });

  // Wait for the app, not for a guess at how long the app takes. A fixed sleep
  // here is what broke the backfill: three seconds in, the body is about ten
  // characters because the SPA is still redirecting, and under load it had not
  // finished by seven either. Waiting on the element is both faster when the
  // app is quick and reliable when it is not.
  const switcher = page.locator(".notion-sidebar-switcher").first();
  try {
    await switcher.waitFor({ state: "visible", timeout: 60_000 });
  } catch (cause) {
    throw new BrowserSetupError(
      "the Notion sidebar never rendered; the app did not finish loading",
      { cause },
    );
  }
  await assertAuthenticated(page);

  // Verify before anything else. An upload must not be one selector away from
  // happening in a workspace nobody pinned.
  const space = assertOnlyPinnedSpace(await listSpaces(page), expectedWorkspaceId);

  await switcher.click();
  await page.waitForTimeout(2500);

  const settings = page.getByText("Settings", { exact: true }).first();
  try {
    await settings.waitFor({ state: "visible", timeout: 30_000 });
  } catch (cause) {
    throw new BrowserSetupError("Settings entry not found in the workspace menu", {
      cause,
    });
  }
  await settings.click();
  await page.waitForTimeout(5000);
  await assertAuthenticated(page);

  const emojiTab = page.getByRole("tab", { name: "Emoji", exact: true }).first();
  const add = page.getByRole("button", { name: "Add emoji", exact: true }).first();
  try {
    await emojiTab.waitFor({ state: "visible", timeout: 30_000 });
    await emojiTab.click();
    await add.waitFor({ state: "visible", timeout: 30_000 });
  } catch (cause) {
    throw new BrowserSetupError("the workspace Emoji settings never opened", {
      cause,
    });
  }
  await assertAuthenticated(page);
  return { space, route: "sidebar switcher > Settings > Emoji" };
}

const ADD_EMOJI = { name: "Add emoji", exact: true } as const;

/** isVisible() with a deadline, since the bare call has none. */
async function isVisibleWithin(
  locator: ReturnType<Page["getByRole"]>,
  ms: number,
): Promise<boolean> {
  try {
    return await withWatchdog(locator.isVisible(), ms, "isVisible");
  } catch {
    return false;
  }
}

/**
 * Make sure the emoji panel is actually in front of us before uploading.
 *
 * Notion's settings dialog can drift out from under a long run: a background
 * navigation, a re-render, a dismissed modal, and "Add emoji" is simply gone.
 * That is recoverable, so try re-opening the pinned settings once. What is not
 * acceptable is uploading into whatever happens to be on screen, or treating a
 * missing panel as the book's fault.
 */
export const PANEL_BUDGET_MS = 150_000;

export function ensureEmojiPanel(
  page: Page,
  expectedWorkspaceId: string,
): Promise<"ready" | "reopened"> {
  return withWatchdog(
    ensureEmojiPanelUnbounded(page, expectedWorkspaceId),
    PANEL_BUDGET_MS,
    "checking the emoji panel",
  );
}

/**
 * `isVisible()` looks harmless and is the call that stalled a whole run for
 * fifteen minutes: it carries no timeout of its own, and a wedged renderer
 * neither resolves nor rejects it, so the `.catch` never fires. No CPU, no
 * open socket, no output. Every entry point into the browser needs a deadline,
 * including the ones that normally answer instantly.
 */
async function ensureEmojiPanelUnbounded(
  page: Page,
  expectedWorkspaceId: string,
): Promise<"ready" | "reopened"> {
  const add = page.getByRole("button", ADD_EMOJI).first();
  if (await isVisibleWithin(add, 15_000)) return "ready";

  try {
    await openEmojiSettings(page, expectedWorkspaceId);
  } catch (cause) {
    const diagnostics = await captureDiagnostics(page, "panel-reopen-failed");
    throw new BrowserSessionError(
      "the emoji panel vanished and could not be re-opened",
      { cause, diagnostics },
    );
  }

  if (!(await isVisibleWithin(add, 15_000))) {
    const diagnostics = await captureDiagnostics(page, "panel-missing-after-reopen");
    throw new BrowserSessionError(
      "re-opened the settings but Add emoji is still not there",
      { diagnostics },
    );
  }
  return "reopened";
}

/**
 * Register one emoji, against the dialog as it actually is.
 *
 * Observed live, the "Add custom emoji" popover contains a visible
 * input[type=file] once the chooser has run, a Preview with a "Replace"
 * button, the name field as <input type="text" id="emojiName"
 * placeholder="have-fun-with-it"> whose "Emoji name" label is NOT wired up as
 * an accessible name, and Cancel and Save.
 *
 * Every failure in here is a session fault, not a book fault. The page is
 * photographed before the error propagates, because by the time the caller
 * sees it the browser is being closed.
 */
export function uploadEmoji(
  page: Page,
  name: string,
  pngPath: string,
): Promise<void> {
  return withWatchdog(
    uploadEmojiUnbounded(page, name, pngPath),
    UPLOAD_BUDGET_MS,
    `registering ${name}`,
  );
}

async function uploadEmojiUnbounded(
  page: Page,
  name: string,
  pngPath: string,
): Promise<void> {
  try {
    const add = page.getByRole("button", ADD_EMOJI).first();
    await add.click();
    await page.waitForTimeout(1500);

    // The dialog opens with an upload control and no file input in the DOM;
    // the input only exists once the chooser has run.
    let chosen = false;
    for (const label of ["Upload an image", "Upload image", "Upload", "Choose an image"]) {
      const control = page.getByRole("button", { name: label, exact: true }).first();
      if (!(await control.isVisible().catch(() => false))) continue;
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 30_000 }),
        control.click(),
      ]);
      await chooser.setFiles(pngPath);
      chosen = true;
      break;
    }
    if (!chosen) {
      const fileInput = page.locator('input[type="file"]').last();
      await fileInput.waitFor({ state: "attached", timeout: 20_000 });
      await fileInput.setInputFiles(pngPath);
    }

    await page
      .getByRole("button", { name: "Replace", exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });

    const nameBox = page.locator("#emojiName, input[placeholder='have-fun-with-it']").first();
    await nameBox.waitFor({ state: "visible", timeout: 30_000 });
    await nameBox.fill("");
    await nameBox.fill(name);
    const typed = await nameBox.inputValue();
    if (typed !== name) {
      throw new Error(`the name field holds "${typed}" but should hold "${name}"`);
    }

    const save = page.getByRole("button", { name: "Save", exact: true }).first();
    await save.waitFor({ state: "visible", timeout: 30_000 });
    await save.click();

    await nameBox.waitFor({ state: "detached", timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await assertAuthenticated(page);
  } catch (cause) {
    if (cause instanceof NotionLoginRequired) throw cause;
    const diagnostics = await captureDiagnostics(page, `upload-failed-${name}`);
    throw new BrowserSessionError(`registering ${name} failed in the browser`, {
      cause,
      diagnostics,
    });
  }
}

/**
 * End to end, short of Google: the real `request.ts` and `session-host.ts`
 * entry points, from argument parsing to exit code, in a headless browser.
 *
 * Real: both CLIs, the mutex, the session ownership record, the request state
 * machine, the Takeout form steps in `flow.ts`, the queue reads, and every
 * file written.
 *
 * Fake, and only these: Google, played by fixture pages served through
 * `page.route` (anything else is aborted, so nothing leaves the machine); the
 * person at the window, played by the fixture's passkey page finishing the
 * step by itself; and the cookie check, since there is no real Google session.
 *
 * The fixture Google behaves the way the request path has been observed to:
 * "Create export" bounces to a passkey challenge, and finishing the challenge
 * creates the pending export without a second click. That was seen live with a
 * passkey tap; whether every kind of reauth does the same is not known.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type Browser, type Page, chromium } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  blankRequestState,
  recordAwaitingAuth,
  recordBlocked,
  recordFormFilled,
  recordQueued,
  recordSubmitted,
  startAttempt,
  writeRequestState,
} from "./request-state";

const holder = vi.hoisted(() => ({ page: null as unknown }));

vi.mock("dotenv/config", () => ({}));
vi.mock("./browser", () => ({
  getPage: async () => holder.page,
  close: async () => undefined,
  hasGoogleSessionCookies: () => true,
  getContext: async () => null,
  getProfileDir: () => "/nonexistent",
}));

type FakeExport = { id: string; status: "in_progress" | "completed" | "expired" };

type FakeGoogle = {
  /** What /manage lists, newest last. */
  exports: FakeExport[];
  createClicks: number;
  /** A click is waiting on the challenge. */
  pendingCreate: boolean;
  /** Whether someone at the window finishes Google's step, and how soon. */
  person: "absent" | "approves";
  personDelayMs: number;
  /** What a new export's row says the first time /manage lists it. */
  newExportStatus: "in_progress" | "completed";
};

let browser: Browser;
let page: Page;
let home: string;
let stateDir: string;
let google: FakeGoogle;

const REAUTHED = "https://takeout.google.com/manage?reauthed=1";

const TAKEOUT_FORM = `
  <h1>Google Takeout</h1>
  <button id=deselect>Deselect all</button>
  <label><input type=checkbox aria-label="YouTube and YouTube Music"> YouTube and YouTube Music</label>
  <button id=formats aria-label="Multiple formats for YouTube and YouTube Music">Multiple formats</button>
  <div id=formatsDialog role=dialog hidden>
    <div role=combobox aria-label=history id=history tabindex=0>HTML</div>
    <div role=listbox id=historyList hidden><div role=option id=jsonOpt>JSON</div></div>
    <button id=ok>OK</button>
  </div>
  <button id=next>Next step</button>
  <section id=delivery hidden>
    <div role=combobox aria-label="Transfer to" id=transfer tabindex=0>Send download link via email</div>
    <div role=listbox id=transferList hidden><div role=option id=driveOpt>Add to Drive</div></div>
    <button id=create>Create export</button>
  </section>
  <script>
    const $ = (id) => document.getElementById(id);
    $("formats").onclick = () => ($("formatsDialog").hidden = false);
    $("history").onclick = () => ($("historyList").hidden = false);
    $("jsonOpt").onclick = () => { $("history").textContent = "JSON"; $("historyList").hidden = true; };
    $("ok").onclick = () => ($("formatsDialog").hidden = true);
    $("next").onclick = () => ($("delivery").hidden = false);
    $("transfer").onclick = () => ($("transferList").hidden = false);
    $("driveOpt").onclick = () => { $("transfer").textContent = "Add to Drive"; $("transferList").hidden = true; };
    $("create").onclick = async () => {
      await fetch("/_fixture/create", { method: "POST" });
      location.href = "https://accounts.google.com/v3/signin/challenge/pk?continue=takeout";
    };
  </script>`;

/** The person, when present, finishes the step a moment after it appears. */
const passkeyChallenge = () => `
  <h1>Verify it's you</h1>
  <p>Use your passkey to confirm it's really you</p>
  <script>
    if (${JSON.stringify(google.person)} === "approves") {
      setTimeout(() => (location.href = ${JSON.stringify(REAUTHED)}), ${google.personDelayMs});
    }
  </script>`;

function manage(): string {
  if (google.exports.length === 0) return `<h1>Your exports</h1><p>No exports to show</p>`;
  const rows = google.exports
    .map(
      (item) => `<li><a href="/manage/export/${item.id}">Export</a>
        <div>YouTube and YouTube Music · ${
          item.status === "in_progress"
            ? "Export in progress"
            : item.status === "completed"
              ? "Completed"
              : "Expired"
        } · Oct 5, 2026</div></li>`,
    )
    .join("");
  return `<h1>Your exports</h1><ul>${rows}</ul><button>Create new request</button>`;
}

function html(body: string): string {
  return `<!doctype html><html><body><main>${body}</main></body></html>`;
}

/** Google, as far as this test is concerned. */
async function serveFakeGoogle(target: Page): Promise<void> {
  await target.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const respond = (body: string) =>
      route.fulfill({ status: 200, contentType: "text/html", body: html(body) });

    if (url.protocol !== "https:") return route.abort("blockedbyclient");
    if (url.host === "takeout.google.com") {
      if (url.pathname === "/_fixture/create") {
        google.createClicks += 1;
        google.pendingCreate = true;
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
      if (url.pathname.startsWith("/manage")) {
        // Finishing the challenge completes the pending export.
        if (url.searchParams.get("reauthed") === "1" && google.pendingCreate) {
          google.pendingCreate = false;
          google.exports.push({
            id: `e2e-export-${google.createClicks}`,
            status: google.newExportStatus,
          });
        }
        return respond(manage());
      }
      return respond(TAKEOUT_FORM);
    }
    if (url.host === "accounts.google.com" && url.pathname.endsWith("/challenge/pk")) {
      return respond(passkeyChallenge());
    }
    return route.abort("blockedbyclient");
  });
}

function logged(): Record<string, unknown>[] {
  return vi
    .mocked(console.log)
    .mock.calls.flatMap(([line]) => {
      try {
        return [JSON.parse(String(line)) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
}

function requestState(): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.join(stateDir, "request-state.json"), "utf8"),
  ) as Record<string, unknown>;
}

async function runRequest(): Promise<number> {
  process.argv = ["node", "vitest"];
  vi.resetModules();
  const entry = (await import("./request")) as { main: () => Promise<number> };
  return await entry.main();
}

/** The approval window's owner, headless, polling fast. */
async function runHolder(args: string[] = []): Promise<number> {
  process.argv = ["node", "vitest", "--headless", "--poll", "0.25", "--deadline", "2", ...args];
  vi.resetModules();
  const entry = (await import("./session-host")) as { main: () => Promise<number> };
  return await entry.main();
}

/** The record left by the live run of 2026-10-05: clicked, bounced, never verified. */
function writeBouncedAttempt(attemptId: string): void {
  const at = new Date(Date.now() - 36 * 60 * 60_000);
  const expired = google.exports.map((item) => ({
    exportId: item.id,
    status: "complete" as const,
    products: ["youtube and youtube music"],
    createdAtText: null,
  }));
  const submitted = recordSubmitted(
    recordFormFilled(
      startAttempt(blankRequestState(), { now: at, attemptId, pendingBefore: expired }),
      { now: at },
    ),
    { now: at },
  );
  writeRequestState(
    recordBlocked(
      recordAwaitingAuth(submitted, { now: at, step: "passkey", blocker: "passkey_tap_required" }),
      { now: at, reason: "credential_route_unavailable" },
    ),
  );
}

/** Last cycle's confirmed export, ten days old and long since expired. */
function writeAgedQueuedAttempt(attemptId: string): void {
  const at = new Date(Date.now() - 10 * 24 * 60 * 60_000);
  const submitted = recordSubmitted(
    recordFormFilled(
      startAttempt(blankRequestState(), { now: at, attemptId, pendingBefore: [] }),
      { now: at },
    ),
    { now: at },
  );
  writeRequestState(
    recordQueued(submitted, {
      now: at,
      evidence: {
        source: "takeout_manage_queue",
        exportId: "expired-sep-27",
        createdAtText: null,
        observedAt: at.toISOString(),
      },
    }),
  );
}

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

beforeEach(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-e2e-"));
  stateDir = path.join(home, "state");
  vi.stubEnv("YOUTUBE_TAKEOUT_STATE_DIR", stateDir);
  vi.stubEnv("YOUTUBE_TAKEOUT_DATA_DIR", path.join(home, "data"));
  vi.stubEnv("YOUTUBE_TAKEOUT_CREDENTIALS_DIR", path.join(home, "credentials"));
  vi.stubEnv("YOUTUBE_TAKEOUT_NATIVE_MODAL", "");
  vi.stubEnv("DEBUG", "");
  google = {
    exports: [
      { id: "expired-sep-12", status: "expired" },
      { id: "expired-sep-27", status: "expired" },
    ],
    createClicks: 0,
    pendingCreate: false,
    person: "approves",
    personDelayMs: 1500,
    newExportStatus: "in_progress",
  };
  page = await browser.newPage();
  await serveFakeGoogle(page);
  holder.page = page;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (!page.isClosed()) await page.close();
  fs.rmSync(home, { recursive: true, force: true });
});

function expectNoImporterOrSession(): void {
  // The importer's state was never touched, and the window gave up ownership.
  expect(fs.existsSync(path.join(stateDir, "state.json"))).toBe(false);
  expect(fs.existsSync(path.join(stateDir, "request-session.json"))).toBe(false);
}

describe("request.ts, end to end against a fake Google", () => {
  it("parks a gated request for a person, having clicked once and typed nothing", async () => {
    google.person = "absent";
    await expect(runRequest()).resolves.toBe(4);
    expect(google.createClicks).toBe(1);
    expect(requestState()).toMatchObject({
      phase: "awaiting_auth",
      auth_step: "passkey",
      blocker: "passkey_tap_required",
    });
    expect(fs.existsSync(path.join(stateDir, "state.json"))).toBe(false);
  }, 90_000);
});

describe("session-host.ts, end to end against a fake Google", () => {
  it("fills the form, waits for the person, and confirms the export they approved", async () => {
    // Slower than the settle after the click, so the holder parks and polls.
    google.personDelayMs = 6000;
    await expect(runHolder()).resolves.toBe(0);

    expect(google.createClicks).toBe(1);
    expect(requestState()).toMatchObject({
      phase: "queued",
      blocker: null,
      queue_evidence: { source: "takeout_manage_queue", exportId: "e2e-export-1" },
    });
    // The two expired exports were the baseline, not the evidence.
    expect(requestState()).toMatchObject({
      attempt: {
        pending_before: [
          expect.objectContaining({ exportId: "expired-sep-12", status: "complete" }),
          expect.objectContaining({ exportId: "expired-sep-27", status: "complete" }),
        ],
      },
    });
    expect(logged()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "host_outcome", kind: "awaiting_auth" }),
        expect.objectContaining({ event: "host_finished", code: 0, reason: "queued" }),
      ]),
    );
    expectNoImporterOrSession();
  }, 120_000);

  it("confirms an export Google finished before any check saw it building", async () => {
    google.newExportStatus = "completed";
    await expect(runHolder()).resolves.toBe(0);
    expect(google.createClicks).toBe(1);
    expect(requestState()).toMatchObject({
      phase: "queued",
      queue_evidence: { exportId: "e2e-export-1" },
    });
    expectNoImporterOrSession();
  }, 120_000);

  it("ends when the person closes the window, still parked, still one click", async () => {
    google.person = "absent";
    const closer = setInterval(() => {
      if (page.url().includes("/challenge/pk")) {
        clearInterval(closer);
        setTimeout(() => void page.close(), 1000);
      }
    }, 100);
    await expect(runHolder()).resolves.toBe(4);
    clearInterval(closer);

    expect(google.createClicks).toBe(1);
    expect(requestState()).toMatchObject({ phase: "awaiting_auth", auth_step: "passkey" });
    expect(logged()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "host_finished", code: 4, reason: "window_closed" }),
      ]),
    );
    expectNoImporterOrSession();
  }, 120_000);

  it("recovers the live record: gives up the bounced click and queues a new export", async () => {
    writeBouncedAttempt("bounced-attempt");
    await expect(runHolder(["--retry-unconfirmed", "bounced-attempt"])).resolves.toBe(0);

    expect(google.createClicks).toBe(1);
    const state = requestState() as { attempt: { attempt_id: string } };
    expect(state).toMatchObject({
      phase: "queued",
      queue_evidence: { exportId: "e2e-export-1" },
    });
    expect(state.attempt.attempt_id).not.toBe("bounced-attempt");
    expect(logged()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "host_retry_unconfirmed",
          ok: true,
          abandoned: "bounced-attempt",
        }),
      ]),
    );
    expectNoImporterOrSession();
  }, 120_000);

  it("asks again a cycle later, once Google's list shows nothing building", async () => {
    writeAgedQueuedAttempt("last-week");
    await expect(runHolder()).resolves.toBe(0);

    expect(google.createClicks).toBe(1);
    const state = requestState() as { attempt: { attempt_id: string } };
    expect(state).toMatchObject({ phase: "queued", queue_evidence: { exportId: "e2e-export-1" } });
    expect(state.attempt.attempt_id).not.toBe("last-week");
    expectNoImporterOrSession();
  }, 120_000);

  it("refuses the retry when an export is building, and clicks nothing", async () => {
    writeBouncedAttempt("bounced-attempt");
    google.exports.push({ id: "maybe-the-bounced-one", status: "in_progress" });
    await expect(runHolder(["--retry-unconfirmed", "bounced-attempt"])).resolves.toBe(2);

    expect(google.createClicks).toBe(0);
    expect(requestState()).toMatchObject({
      phase: "awaiting_auth",
      attempt: { attempt_id: "bounced-attempt" },
    });
    expect(logged()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "host_retry_unconfirmed",
          ok: false,
          reason: "export_building",
        }),
        expect.objectContaining({ event: "host_finished", code: 2, reason: "retry_refused" }),
      ]),
    );
    expectNoImporterOrSession();
  }, 120_000);
});

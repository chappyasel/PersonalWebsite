/**
 * Real-browser tests for the DOM boundary.
 *
 * Headless Chromium, no window, and no network: every request to
 * takeout.google.com and accounts.google.com is fulfilled from a fixture string
 * by `page.route`, so nothing leaves the machine and no Google account is
 * involved. These prove the parse, not that Google's live markup matches the
 * fixtures — see the header of `takeout-dom.ts`.
 */
import {
  type Browser,
  type BrowserContext,
  type Page,
  chromium,
} from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  type ManageExportObservation,
  confirmQueueEvidence,
  pendingPossiblyYouTubeExports,
} from "./queue-evidence";
import {
  chooseEnterPassword,
  isTakeoutUrl,
  clickTryAnotherWay,
  detectAuthGate,
  formReady,
  observeManageQueue,
  passwordFieldVisible,
} from "./takeout-dom";

let browser: Browser;
let context: BrowserContext;
let page: Page;

function manage(body: string): string {
  return `<!doctype html><html><head><title>Google Takeout</title></head>
    <body><main>${body}</main></body></html>`;
}

const EXPORT_ROW = (id: string, text: string) =>
  `<li><a href="/manage/export/${id}">Export ${id}</a><div>${text}</div></li>`;

/** Serve one fixture for every Takeout/accounts URL this page may reach. */
async function serve(html: string, url = "https://takeout.google.com/manage") {
  await page.route("**/*", async (route) => {
    const target = route.request().url();
    if (
      target.startsWith("https://takeout.google.com") ||
      target.startsWith("https://accounts.google.com")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: html,
      });
      return;
    }
    // Anything else would be a real network call; fail the test loudly.
    await route.abort("blockedbyclient");
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
}

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

beforeAll(async () => {
  context = await browser.newContext();
  page = await context.newPage();
});

afterEach(async () => {
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => undefined);
});

afterAll(async () => {
  await context?.close();
});

describe("observeManageQueue", () => {
  it("reads the live Summary archive links rather than treating expired exports as unreadable", async () => {
    await serve(manage(`<h1>Summary</h1><div role="list">
      <div><a href="./manage/archive/old-one">YouTube and YouTube Music<p>Expired</p><p>Data backup to Drive</p><p>Created September 27, 10:59 PM</p></a></div>
      <div><a href="./manage/archive/old-two">YouTube and YouTube Music<p>Expired</p><p>Data backup to Drive</p><p>Created September 12, 7:13 PM</p></a></div>
    </div>`));
    const observation = await observeManageQueue(page);
    expect(observation).toMatchObject({source: "takeout_manage_queue", exports: [
      {exportId: "old-one", status: "complete", products: expect.arrayContaining(["youtube and youtube music"]) as string[]},
      {exportId: "old-two", status: "complete", products: expect.arrayContaining(["youtube and youtube music"]) as string[]},
    ]});
  });
  it("reads a row Google has already finished as complete, not unreadable", async () => {
    // The live Summary page, 2026-10-08, minutes after "Create export".
    await serve(manage(`<h1>Summary</h1><div role="list">
      <div><a href="./manage/archive/new-one">YouTube and YouTube Music<p>Completed</p><p>Data backup to Drive</p><p>Created 7 minutes ago</p></a></div>
      <div><a href="./manage/archive/old-one">YouTube and YouTube Music<p>Expired</p><p>Data backup to Drive</p><p>Created September 28, 1:59 AM</p></a></div>
    </div>`));
    const observation = await observeManageQueue(page);
    expect(observation).toMatchObject({source: "takeout_manage_queue", exports: [
      {exportId: "new-one", status: "complete"},
      {exportId: "old-one", status: "complete"},
    ]});
  });
  it("reads an in-progress YouTube export with its id and date", async () => {
    await serve(
      manage(
        `<h1>Your exports</h1><ul>${EXPORT_ROW(
          "abc123",
          "YouTube and YouTube Music · Export in progress · Oct 4, 2026",
        )}</ul>`,
      ),
    );
    const observation = await observeManageQueue(page);
    expect(observation).toMatchObject({ source: "takeout_manage_queue" });
    expect(observation).toHaveProperty("exports", [
      {
        exportId: "abc123",
        status: "in_progress",
        products: ["youtube and youtube music"],
        createdAtText: "Oct 4, 2026",
      },
    ]);
  });

  it("distinguishes a finished archive from one being built", async () => {
    await serve(
      manage(
        `<h1>Your exports</h1><ul>
          ${EXPORT_ROW("done1", "YouTube and YouTube Music · Download · available until Oct 20, 2026")}
          ${EXPORT_ROW("busy1", "YouTube and YouTube Music · Export in progress")}
        </ul>`,
      ),
    );
    const observation = await observeManageQueue(page);
    expect(
      (observation as { exports: { exportId: string; status: string }[] }).exports,
    ).toEqual([
      expect.objectContaining({ exportId: "done1", status: "complete" }),
      expect.objectContaining({ exportId: "busy1", status: "in_progress" }),
    ]);
  });

  it("leaves products empty when the row does not name one", async () => {
    await serve(
      manage(
        `<h1>Your exports</h1><ul>${EXPORT_ROW("x1", "Export in progress")}</ul>`,
      ),
    );
    const observation = await observeManageQueue(page);
    expect(
      (observation as { exports: { products: string[] }[] }).exports[0]!.products,
    ).toEqual([]);
  });

  it("trusts an empty list only when the page says there are none", async () => {
    await serve(manage("<h1>Your exports</h1><p>No exports to show</p>"));
    await expect(observeManageQueue(page)).resolves.toMatchObject({
      source: "takeout_manage_queue",
      exports: [],
    });
  });

  it("calls a page it cannot make sense of unreadable, not empty", async () => {
    await serve(manage("<h1>Your exports</h1><div id=app></div>"));
    await expect(observeManageQueue(page)).resolves.toMatchObject({
      source: "unknown",
      reason: "unreadable",
    });
  });

  it("will not invent a card from an in-progress marker with no row", async () => {
    await serve(
      manage("<h1>Your exports</h1><div>YouTube · Export in progress</div>"),
    );
    await expect(observeManageQueue(page)).resolves.toMatchObject({
      source: "unknown",
      reason: "unreadable",
    });
  });

  it("does not credit another product's export with YouTube text elsewhere", async () => {
    await serve(
      manage(
        `<h1>Your exports</h1>
         <p>Tip: your YouTube and YouTube Music history can be exported too.</p>
         <ul>${EXPORT_ROW("photos1", "Google Photos · Export in progress · Oct 4, 2026")}</ul>`,
      ),
    );
    const observation = await observeManageQueue(page);
    expect(
      (observation as { exports: ManageExportObservation[] }).exports,
    ).toEqual([
      expect.objectContaining({
        exportId: "photos1",
        status: "in_progress",
        products: ["google photos"],
      }),
    ]);
    // Strict confirmation refuses it; generous suppression leaves it alone too.
    expect(
      confirmQueueEvidence({ observation, pendingBefore: [] }),
    ).toEqual({ confirmed: false, reason: "product_mismatch" });
    expect(
      pendingPossiblyYouTubeExports(
        (observation as { exports: ManageExportObservation[] }).exports,
      ),
    ).toEqual([]);
  });

  it("calls the whole queue unreadable when one row's status is unclear", async () => {
    await serve(
      manage(
        `<h1>Your exports</h1><ul>
          ${EXPORT_ROW("busy1", "YouTube and YouTube Music · Export in progress")}
          ${EXPORT_ROW("huh1", "YouTube and YouTube Music · Oct 4, 2026")}
        </ul>`,
      ),
    );
    await expect(observeManageQueue(page)).resolves.toMatchObject({
      source: "unknown",
      reason: "unreadable",
    });
  });

  it("does not trust explanatory empty copy that an in-progress marker contradicts", async () => {
    await serve(
      manage(
        `<h1>Your exports</h1>
         <p>No exports are listed here until Google finishes building them.</p>
         <p>Export in progress</p>`,
      ),
    );
    await expect(observeManageQueue(page)).resolves.toMatchObject({
      source: "unknown",
      reason: "unreadable",
    });
  });

  it("will not call a page served over plain HTTP the Takeout form", async () => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.route("**/*", async (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: manage("<h2>Choose delivery</h2><button>Create export</button>"),
      }),
    );
    await page.goto("http://takeout.google.com/settings/takeout", {
      waitUntil: "domcontentloaded",
    });
    await expect(formReady(page)).resolves.toBe(false);
  });

  it("refuses to navigate while a challenge is on screen", async () => {
    await serve(
      `<!doctype html><html><body><main><h1>Verify it's you</h1>
        <input type=password aria-label=Password></main></body></html>`,
      "https://takeout.google.com/manage",
    );
    const before = page.url();
    await expect(observeManageQueue(page)).resolves.toMatchObject({
      source: "unknown",
      reason: "auth_gate",
    });
    expect(page.url()).toBe(before);
  });

  it("reports a sign-in redirect as an auth gate, never as an empty queue", async () => {
    await serve(
      `<!doctype html><html><body><main><h1>Verify it's you</h1>
        <button>Try another way</button></main></body></html>`,
      "https://accounts.google.com/v3/signin/challenge/pk",
    );
    await expect(observeManageQueue(page)).resolves.toMatchObject({
      source: "unknown",
      reason: "auth_gate",
    });
  });

  it("reports a password prompt on the Takeout host as an auth gate", async () => {
    await serve(
      manage("<h1>Your exports</h1><input type=password aria-label=Password>"),
    );
    await expect(observeManageQueue(page)).resolves.toMatchObject({
      source: "unknown",
      reason: "auth_gate",
    });
  });
});

describe("isTakeoutUrl", () => {
  it("accepts only HTTPS takeout.google.com, on the expected path", () => {
    expect(isTakeoutUrl("https://takeout.google.com/manage", "/manage")).toBe(true);
    expect(isTakeoutUrl("https://takeout.google.com/manage?hl=en", "/manage")).toBe(
      true,
    );
    expect(isTakeoutUrl("https://takeout.google.com/settings/takeout")).toBe(true);
  });

  it("refuses another origin, another scheme, or the wrong path", () => {
    for (const url of [
      "http://takeout.google.com/manage",
      "https://myaccount.google.com/data",
      "https://accounts.google.com/v3/signin/challenge/pk",
      "https://takeout.google.com.evil.test/manage",
      "https://evil.test/takeout.google.com/manage",
      "about:blank",
      "",
    ]) {
      expect(isTakeoutUrl(url, "/manage"), url).toBe(false);
    }
    expect(
      isTakeoutUrl("https://takeout.google.com/settings/takeout", "/manage"),
    ).toBe(false);
  });
});

describe("detectAuthGate", () => {
  it("finds the password step and says credentials are not its job", async () => {
    await serve(
      manage("<h1>Sign in</h1><input type=password aria-label=Password>"),
    );
    await expect(detectAuthGate(page)).resolves.toEqual({
      step: "password",
      blocker: "credential_route_unavailable",
    });
  });

  it("finds the passkey step from the challenge URL", async () => {
    await serve(
      manage("<h1>Checking</h1>"),
      "https://accounts.google.com/v3/signin/challenge/pk",
    );
    await expect(detectAuthGate(page)).resolves.toEqual({
      step: "passkey",
      blocker: "passkey_tap_required",
    });
  });

  it("finds the passkey step from the page's own words", async () => {
    await serve(manage("<h1>Use your passkey to continue</h1>"));
    await expect(detectAuthGate(page)).resolves.toEqual({
      step: "passkey",
      blocker: "passkey_tap_required",
    });
  });

  it("reports no gate on an ordinary export list", async () => {
    await serve(
      manage(
        `<h1>Your exports</h1><ul>${EXPORT_ROW("a1", "Export in progress")}</ul>`,
      ),
    );
    await expect(detectAuthGate(page)).resolves.toBeNull();
  });
});

describe("formReady", () => {
  it("is true on the delivery step", async () => {
    await serve(
      manage("<h2>Choose delivery</h2><button>Create export</button>"),
      "https://takeout.google.com/settings/takeout",
    );
    await expect(formReady(page)).resolves.toBe(true);
  });

  it("is false on the export list, and off the Takeout host", async () => {
    await serve(manage("<h1>Your exports</h1><p>No exports to show</p>"));
    await expect(formReady(page)).resolves.toBe(false);
    await serve(
      manage("<button>Create export</button>"),
      "https://accounts.google.com/v3/signin/challenge/pk",
    );
    await expect(formReady(page)).resolves.toBe(false);
  });
});

describe("the password route's DOM steps", () => {
  it("waits for a control Google renders late", async () => {
    await serve(
      `<!doctype html><html><body><main><h1>Verify it's you</h1>
        <script>setTimeout(() => {
          const b = document.createElement("button");
          b.textContent = "Try another way";
          document.querySelector("main").append(b);
        }, 400);</script></main></body></html>`,
      "https://accounts.google.com/v3/signin/challenge/pk",
    );
    await expect(clickTryAnotherWay(page, 3000)).resolves.toBe(true);
  });

  it("clicks through Try another way to a password field", async () => {
    await serve(
      `<!doctype html><html><body><main>
        <h1>Verify it's you</h1>
        <button id=another>Try another way</button>
        <div id=choices hidden><button id=pw>Enter your password</button></div>
        <div id=form hidden><input type=password aria-label=Password></div>
        <script>
          document.getElementById('another').onclick = () =>
            document.getElementById('choices').hidden = false;
          document.getElementById('pw').onclick = () =>
            document.getElementById('form').hidden = false;
        </script>
      </main></body></html>`,
      "https://accounts.google.com/v3/signin/challenge/pk",
    );
    await expect(passwordFieldVisible(page, 300)).resolves.toBe(false);
    await expect(clickTryAnotherWay(page)).resolves.toBe(true);
    await expect(chooseEnterPassword(page)).resolves.toBe(true);
    await expect(passwordFieldVisible(page)).resolves.toBe(true);
  });

  it("reports a missing control rather than clicking something else", async () => {
    await serve(
      `<!doctype html><html><body><main><h1>Verify it's you</h1>
        <button>Use your phone instead</button></main></body></html>`,
      "https://accounts.google.com/v3/signin/challenge/pk",
    );
    await expect(clickTryAnotherWay(page, 300)).resolves.toBe(false);
    await expect(chooseEnterPassword(page, 300)).resolves.toBe(false);
    await expect(passwordFieldVisible(page, 300)).resolves.toBe(false);
  });

  it("does not mistake a hidden choice for an available one", async () => {
    await serve(
      `<!doctype html><html><body><main><h1>Verify it's you</h1>
        <button hidden>Enter your password</button></main></body></html>`,
      "https://accounts.google.com/v3/signin/challenge/pk",
    );
    await expect(chooseEnterPassword(page, 300)).resolves.toBe(false);
  });
});

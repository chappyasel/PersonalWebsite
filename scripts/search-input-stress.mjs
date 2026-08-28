// Universal Search input stress test over the live 3D scene.
//
// Run against a dev server: `node scripts/search-input-stress.mjs`
// (STACKS_URL overrides the target, default http://localhost:3000).
//
// This exists because the palette's automated component tests once passed
// while real typing corrupted in the browser: the scene's document-level
// selectionchange clearer collapsed the input's caret to 0 whenever typing
// paused long enough for the coalesced selectionchange task to run. Chrome
// hides input carets from window.getSelection(), so the clearer's anchorNode
// allowlist never matched the field. The slow-typing and idle-pause checks
// below reproduce that failure shape; the fast-burst checks alone do not.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const failures = [];
const passes = [];
function check(name, ok, detail = "") {
  (ok ? passes : failures).push(
    `${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-gpu",
    "--use-angle=metal",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
});

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('html[data-world="ready"]', { timeout: 120000 });
await page.waitForTimeout(3000); // let the boot glide settle

const value = () => page.locator("[cmdk-input]").inputValue();
const sel = () =>
  page.evaluate(() => {
    const el = document.querySelector("[cmdk-input]");
    return { v: el.value, s: el.selectionStart, e: el.selectionEnd };
  });
const activeIsInput = () =>
  page.evaluate(
    () => document.activeElement?.hasAttribute("cmdk-input") ?? false,
  );

// Open with Cmd+K.
await page.keyboard.press("Meta+KeyK");
await page.waitForSelector("[cmdk-input]", { timeout: 10000 });
await page.waitForTimeout(300);
check("palette opens on Cmd+K", true);
check("input autofocused", await activeIsInput());
check(
  "scene marker set",
  await page.evaluate(() =>
    document.documentElement.hasAttribute("data-universal-search-open"),
  ),
);

// Fast typing burst — order must be exact.
const burst = "the quick brown fox 42";
await page.keyboard.type(burst, { delay: 5 });
check(
  "fast burst ordered",
  (await value()) === burst,
  JSON.stringify(await value()),
);

// Typing across the debounce + async result arrivals.
await page.keyboard.press("Meta+KeyA");
await page.keyboard.type("boo", { delay: 30 });
await page.waitForTimeout(400);
await page.keyboard.type("k notes", { delay: 30 });
check(
  "typing across result arrivals",
  (await value()) === "book notes",
  JSON.stringify(await value()),
);

// Caret movement + mid-string insertion after an idle pause.
await page.keyboard.press("Meta+KeyA");
await page.keyboard.type("abcdef", { delay: 10 });
for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(250);
await page.keyboard.type("XY", { delay: 10 });
check(
  "mid-string insertion",
  (await value()) === "abcXYdef",
  JSON.stringify(await value()),
);

// Keyboard selection.
await page.keyboard.press("Shift+ArrowLeft");
await page.keyboard.press("Shift+ArrowLeft");
await page.keyboard.type("Z");
check(
  "shift-selection replace",
  (await value()) === "abcZdef",
  JSON.stringify(await value()),
);
await page.keyboard.press("Meta+KeyA");
await page.keyboard.type("fresh");
check(
  "select-all replace",
  (await value()) === "fresh",
  JSON.stringify(await value()),
);
await page.keyboard.press("Backspace");
check("backspace", (await value()) === "fres", JSON.stringify(await value()));
await page.keyboard.press("Meta+ArrowLeft");
await page.keyboard.press("Delete");
check(
  "forward delete at start",
  (await value()) === "res",
  JSON.stringify(await value()),
);

// THE historical failure shape: human-speed typing, each keystroke followed
// by a pause long enough for the coalesced selectionchange task to run.
await page.keyboard.press("Meta+KeyA");
const slow = "weightlifting";
let caretDrift = null;
for (const ch of slow) {
  await page.keyboard.type(ch);
  await page.waitForTimeout(160);
  const state = await sel();
  if (state.s !== state.v.length || state.e !== state.v.length) {
    caretDrift = JSON.stringify(state);
    break;
  }
}
check("caret pinned at end during churn", caretDrift === null, caretDrift ?? "");
check(
  "slow typed value ordered",
  (await value()) === slow,
  JSON.stringify(await value()),
);

// Focus war: the dialog trap must reclaim a scene focus steal.
await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  canvas?.setAttribute("tabindex", "-1");
  canvas?.focus();
});
await page.waitForTimeout(100);
check("focus reclaimed from canvas steal", await activeIsInput());
await page.keyboard.type("!", { delay: 10 });
check(
  "keystroke lands after steal",
  (await value()).endsWith("!"),
  JSON.stringify(await value()),
);

// Mouse drag selection must survive the scene's selectionchange clearer.
// The panel is top-anchored so the input must not move while results churn;
// the position check makes that explicit before mouse coordinates are used.
await page.keyboard.press("Meta+KeyA");
await page.keyboard.type("hello world", { delay: 10 });
const box = await page.locator("[cmdk-input]").boundingBox();
await page.waitForTimeout(600); // providers settle, panel height changes
const settledBox = await page.locator("[cmdk-input]").boundingBox();
check(
  "input holds a fixed Y through loading states",
  Math.abs(settledBox.y - box.y) < 1,
  `${box.y} -> ${settledBox.y}`,
);
const y = settledBox.y + settledBox.height / 2;
await page.mouse.move(settledBox.x + 160, y);
await page.mouse.down();
await page.mouse.move(settledBox.x + 60, y, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
const dragSel = await sel();
check(
  "mouse drag selection survives",
  dragSel.e - dragSel.s > 0,
  JSON.stringify(dragSel),
);
await page.mouse.dblclick(settledBox.x + 20, y);
await page.waitForTimeout(400);
const dbl = await sel();
check(
  "double-click word selection survives",
  dbl.e - dbl.s > 0,
  JSON.stringify(dbl),
);

// Copy/paste round trip.
await page.keyboard.press("Meta+KeyA");
await page.keyboard.type("alpha beta", { delay: 10 });
await page.keyboard.press("Meta+KeyA");
await page.keyboard.press("Meta+KeyC");
await page.keyboard.press("Meta+KeyA");
await page.keyboard.press("Backspace");
await page.keyboard.press("Meta+KeyV");
await page.waitForTimeout(200);
check(
  "copy/paste round trip",
  (await value()) === "alpha beta",
  JSON.stringify(await value()),
);

// List navigation + close/reopen/activate.
await page.keyboard.press("Meta+KeyA");
await page.keyboard.type("manual", { delay: 20 });
await page.waitForTimeout(250);
const hadSelected = await page.evaluate(
  () =>
    document.querySelector('[cmdk-item][data-selected="true"]')?.textContent ??
    "",
);
check("a result is keyboard-selected", hadSelected.length > 0, hadSelected);
await page.keyboard.press("ArrowDown");
const afterArrow = await page.evaluate(
  () =>
    document.querySelector('[cmdk-item][data-selected="true"]')?.textContent ??
    "",
);
check(
  "ArrowDown moves selection",
  afterArrow !== hadSelected,
  `${hadSelected} -> ${afterArrow}`,
);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("Escape closes", (await page.locator("[cmdk-input]").count()) === 0);
check(
  "scene marker cleared",
  await page.evaluate(
    () => !document.documentElement.hasAttribute("data-universal-search-open"),
  ),
);
await page.keyboard.press("Meta+KeyK");
await page.waitForSelector("[cmdk-input]", { timeout: 10000 });
await page.waitForTimeout(200);
check("reopens with empty query", (await value()) === "");
await page.keyboard.type("dice", { delay: 5 });
check(
  "immediate typing after reopen",
  (await value()) === "dice",
  JSON.stringify(await value()),
);
await page.waitForTimeout(250);
const beforeUrl = page.url();
await page.keyboard.press("Enter");
await page.waitForTimeout(1200);
const afterUrl = page.url();
check(
  "Enter activates a destination",
  afterUrl !== beforeUrl ||
    (await page.locator("[cmdk-input]").count()) === 0,
  `${beforeUrl} -> ${afterUrl}`,
);

const relevantErrors = consoleErrors.filter(
  (e) => !/favicon|404|Failed to load resource|PostHog|posthog/i.test(e),
);
check(
  "no page errors",
  relevantErrors.length === 0,
  relevantErrors.slice(0, 3).join(" | "),
);

console.log([...passes, ...failures].join("\n"));
console.log(
  `\n${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILURES`}`,
);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);

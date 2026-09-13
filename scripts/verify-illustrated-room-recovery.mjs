import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const base =
  process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) ??
  "http://localhost:3333";
const output = "docs/reviews/illustrated-room-integration-evidence/raw";
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-gpu", "--use-angle=metal"],
});
const results = [];
async function run(name, options, test) {
  const selected = process.argv
    .find((arg) => arg.startsWith("--case="))
    ?.slice(7);
  if (selected && selected !== name) return;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    reducedMotion: "no-preference",
    ...options,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const details = await test(page, context);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/${name}.png` });
    results.push({ name, passed: true, ...details, errors });
    console.log("PASS", name, JSON.stringify(details));
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: String(error),
      errors,
      state: await page.evaluate(() => ({
        phase: document.documentElement.dataset.roomView,
        url: location.href,
        attrs: [...document.documentElement.attributes].map((a) => [
          a.name,
          a.value,
        ]),
        boot: document
          .querySelector("[data-boot-status]")
          ?.outerHTML.slice(0, 600),
        handoff: window.__roomHandoff,
      })),
    });
    console.log("FAIL", name, String(error));
    await page.screenshot({ path: `${output}/${name}-failure.png` });
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}
const waitPhase = (page, phase) =>
  page.waitForFunction(
    (value) => document.documentElement.dataset.roomView === value,
    phase,
    { timeout: 45_000 },
  );
const waitDrawing = (page) =>
  page.waitForSelector("[data-room-artwork][data-artwork-key]", {
    state: "visible",
  });

await fs.mkdir(output, { recursive: true });
try {
  await run("no-webgl-navigation", {}, async (page, context) => {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return kind === "webgl" || kind === "webgl2"
          ? null
          : original.call(this, kind, ...args);
      };
    });
    await page.goto(`${base}/projects`);
    await waitDrawing(page);
    await waitPhase(page, "illustrated");
    assert.equal(await page.locator(".stacks-canvas-shell canvas").count(), 0);
    const rail = page.locator(".stacks-unit-rail-desktop");
    const first = rail.getByRole("button").first();
    const appearance = await first.evaluate((node) => ({
      opacity: getComputedStyle(node).opacity,
      color: getComputedStyle(node).color,
    }));
    assert.equal(appearance.opacity, "1");
    await rail.getByRole("button", { name: "Systems", exact: true }).click();
    await page.waitForSelector('[data-room-artwork][data-unit="3"]');
    assert.equal(new URL(page.url()).hash, "#systems");
    await page.goBack();
    await page.waitForSelector('[data-room-artwork][data-unit="4"]');
    assert.equal(
      await page.getByRole("button", { name: "Retry 3D" }).count(),
      1,
    );
    return { appearance, historyReturnedToProjects: true };
  });

  await run("context-loss-reader", {}, async (page) => {
    await page.goto(`${base}/projects`);
    await waitPhase(page, "live");
    // Scroll the real panel, then focus an existing link without leaving it.
    const panel = page.locator(
      "[data-stacks-desktop-panel][data-stacks-active] .placard-scroll",
    );
    await panel.hover();
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(300);
    const before = await panel.evaluate((node) => {
      const focus = node.querySelector("a[href], button");
      focus?.focus({ preventScroll: true });
      window.__readerBeforeLoss = { node, focus };
      return {
        scroll: node.scrollTop,
        focused: document.activeElement === focus,
        url: location.href,
      };
    });
    assert.ok(before.scroll > 0);
    assert.ok(before.focused);
    assert.equal(
      before.url,
      `${base}/projects`,
      "Reader scrolling must not move to another shelf",
    );
    const lost = await page.evaluate(() => {
      const canvas = document.querySelector(".stacks-canvas-shell canvas");
      const gl = canvas?.getContext("webgl2");
      const extension = gl?.getExtension("WEBGL_lose_context");
      extension?.loseContext();
      return Boolean(extension);
    });
    assert.ok(lost);
    await waitPhase(page, "illustrated");
    await waitDrawing(page);
    const after = await page.evaluate(() => {
      const { node, focus } = window.__readerBeforeLoss;
      return {
        connected: node.isConnected,
        scroll: node.scrollTop,
        focused: document.activeElement === focus,
        url: location.href,
      };
    });
    assert.ok(after.connected);
    assert.equal(after.scroll, before.scroll);
    assert.equal(after.focused, before.focused);
    assert.equal(after.url, before.url);
    await waitPhase(page, "live");
    return { before, after, automaticRecoveryReachedLive: true };
  });

  await run("stale-registration-explicit-retry", {}, async (page) => {
    await page.route("**/projects/*.registration.json", async (route) => {
      const response = await route.fetch();
      const registration = await response.json();
      await route.fulfill({
        json: { ...registration, sourceFingerprint: "stale-test-fixture" },
      });
    });
    await page.goto(`${base}/projects`);
    await waitDrawing(page);
    await page.getByRole("button", { name: "Retry 3D" }).waitFor();
    assert.equal(await page.locator(".stacks-canvas-shell canvas").count(), 0);
    await page.getByRole("button", { name: "Retry 3D" }).click();
    await waitPhase(page, "live");
    return { mismatchedArtworkKept2D: true, explicitRetryReachedLive: true };
  });

  await run("stalled-image-reader", {}, async (page) => {
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/projects/*.svg", async (route) => {
      await held;
      await route.continue().catch(() => {});
    });
    try {
      await page.goto(`${base}/projects`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => document.documentElement.dataset.illustratedUi === "ready",
      );
      const shell = await page
        .locator(".room-first-paint")
        .evaluate((node) => getComputedStyle(node).display);
      assert.equal(shell, "none");
      assert.equal(
        await page.locator("[data-room-artwork][data-artwork-key]").count(),
        0,
      );
      await page
        .locator(".stacks-unit-rail-desktop")
        .getByRole("button", { name: "Systems", exact: true })
        .click();
      await page.waitForSelector('[data-room-artwork][data-unit="3"]');
      return { readerAvailableBeforeDecode: true, navigationWorked: true };
    } finally {
      release();
    }
  });

  await run("failed-image-explicit-retry", {}, async (page) => {
    await page.route("**/projects/*.svg", (route) => route.abort());
    await page.goto(`${base}/projects`, { waitUntil: "domcontentloaded" });
    await page.locator(".room-illustration-unavailable").waitFor();
    await page.getByRole("button", { name: "Retry 3D" }).click();
    await waitPhase(page, "live");
    return {
      failedImageLeftReaderAvailable: true,
      explicitRetryReachedLive: true,
    };
  });

  await run(
    "reduced-motion-document",
    { reducedMotion: "reduce" },
    async (page) => {
      await page.goto(`${base}/projects`);
      await waitPhase(page, "document");
      assert.equal(
        await page.locator(".stacks-canvas-shell canvas").count(),
        0,
      );
      await page.locator("main").waitFor({ state: "visible" });
      assert.ok(await page.locator("main").isVisible());
      return { semanticDocumentVisible: true, canvasMounted: false };
    },
  );
} finally {
  await fs.writeFile(
    `${output}/recovery.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
  await browser.close();
}

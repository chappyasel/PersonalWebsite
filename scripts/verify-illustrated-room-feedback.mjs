import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const base =
  process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) ??
  "http://localhost:3333";
const output = "docs/reviews/illustrated-room-integration-evidence/raw";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-gpu", "--use-angle=metal"],
});
const results = [];
const waitDrawing = (page, unit) =>
  page.waitForSelector(
    `[data-room-artwork][data-artwork-key][data-unit="${unit}"]`,
    { state: "visible", timeout: 45000 },
  );
try {
  for (const mode of [
    "automatic-navigation",
    "fallback-wheel",
    "fallback-phone",
  ]) {
    const selectedMode = process.argv
      .find((arg) => arg.startsWith("--mode="))
      ?.slice(7);
    if (selectedMode && selectedMode !== mode) continue;
    const phone = mode === "fallback-phone";
    const context = await browser.newContext({
      viewport: phone
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      isMobile: phone,
      hasTouch: phone,
      colorScheme: "light",
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let release = () => {};
    try {
      if (mode !== "automatic-navigation")
        await context.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
            return kind === "webgl" || kind === "webgl2"
              ? null
              : original.call(this, kind, ...args);
          };
        });
      else {
        const held = new Promise((resolve) => {
          release = resolve;
        });
        await page.route("**/*.registration.json", async (route) => {
          await held;
          await route.continue().catch(() => {});
        });
        await context.addInitScript(() => {
          window.__feedbackTrace = [];
          const frame = () => {
            const phase = document.documentElement.dataset.roomView;
            if (phase === "dissolve" || phase === "travel")
              window.__feedbackTrace.push({
                phase,
                camera: window.__roomHandoff?.camera,
                unit: window.__stacks?.state().activeUnit,
              });
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
      }
      await page.goto(`${base}/projects`, { waitUntil: "domcontentloaded" });
      await waitDrawing(page, 4);
      if (mode === "automatic-navigation") {
        await page
          .locator(".stacks-unit-rail-desktop")
          .getByRole("button", { name: "Systems", exact: true })
          .click();
        await waitDrawing(page, 3);
        assert.equal(
          await page.getByRole("button", { name: "Retry 3D" }).count(),
          0,
        );
        release();
        await page.waitForFunction(
          () => document.documentElement.dataset.roomView === "live",
          undefined,
          { timeout: 45000 },
        );
        const result = await page.evaluate(() => ({
          phase: document.documentElement.dataset.roomView,
          scene: window.__stacks?.state(),
          trace: window.__feedbackTrace,
          url: location.pathname + location.hash,
        }));
        assert.equal(result.url, "/#systems");
        if (result.scene) assert.equal(result.scene.activeUnit, 3);
        const xs = result.trace
          .map((f) => f.camera?.[12])
          .filter(Number.isFinite);
        if (xs.length) {
          assert.ok(
            Math.min(...xs) > 9,
            `Camera detoured toward About: ${Math.min(...xs)}`,
          );
          assert.ok(
            Math.max(...xs) - Math.min(...xs) < 4,
            "Camera crossed another shelf during handoff",
          );
        }
        results.push({
          mode,
          passed: true,
          cameraXRange: xs.length ? [Math.min(...xs), Math.max(...xs)] : null,
          liveCamera: result.scene?.camera,
          url: result.url,
        });
      } else {
        const viewport = page.locator(".room-illustration-traverse");
        const before = await viewport.evaluate((node) => node.scrollLeft);
        await page.mouse.move(phone ? 190 : 600, 300);
        if (phone) {
          const cdp = await context.newCDPSession(page);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: 320, y: 300 }],
          });
          for (const x of [280, 230, 180, 130, 80]) {
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [{ x, y: 300 }],
            });
            await page.waitForTimeout(35);
          }
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
        } else await page.mouse.wheel(0, 1500);
        await waitDrawing(page, 5);
        const after = await viewport.evaluate((node) => node.scrollLeft);
        assert.ok(after > before);
        assert.equal(new URL(page.url()).pathname, "/musings");
        const artwork = await page
          .locator('[data-room-artwork][data-artwork-key][data-unit="5"]')
          .boundingBox();
        const background = await page
          .locator(".stacks-world-shell .room-illustration")
          .evaluate((node) => getComputedStyle(node).backgroundImage);
        assert.ok(background.includes("gradient"));
        if (phone) {
          const inactive = await page
            .locator("[data-stacks-mobile-panel]:not([data-stacks-panel])")
            .evaluateAll((nodes) =>
              nodes.map((node) => Number(getComputedStyle(node).opacity)),
            );
          assert.ok(
            inactive.every((opacity) => opacity === 0),
            "Inactive phone panel titles overlap the selected section",
          );
        }
        results.push({
          mode,
          passed: true,
          before,
          after,
          artwork,
          background,
        });
      }
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${output}/feedback-${mode}.png` });
      console.log("PASS", mode);
    } catch (error) {
      release();
      results.push({
        mode,
        passed: false,
        error: String(error),
        errors,
        state: await page
          .evaluate(() => ({
            phase: document.documentElement.dataset.roomView,
            url: location.href,
            boot: document
              .querySelector("[data-boot-status]")
              ?.getAttribute("data-boot-status"),
            handoff: window.__roomHandoff,
          }))
          .catch(() => null),
      });
      await page
        .screenshot({ path: `${output}/feedback-${mode}-failure.png` })
        .catch(() => {});
      console.log("FAIL", mode, String(error));
      process.exitCode = 1;
    } finally {
      release();
      await context.close();
    }
  }
} finally {
  await fs.writeFile(
    `${output}/feedback.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
  await browser.close();
}

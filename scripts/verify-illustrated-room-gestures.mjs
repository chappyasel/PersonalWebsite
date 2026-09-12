import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const base =
  process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) ??
  "http://localhost:3333";
const output =
  "docs/reviews/illustrated-room-integration-evidence/raw/gestures.json";
const results = [];
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-gpu", "--use-angle=metal"],
});
try {
  const repetitions = Number(
    process.argv.find((arg) => arg.startsWith("--repeat="))?.slice(9) ?? 1,
  );
  for (const gesture of Array.from({ length: repetitions }, () => [
    "held-touch",
    "continuous-wheel",
  ]).flat()) {
    const selected = process.argv
      .find((arg) => arg.startsWith("--gesture="))
      ?.slice(10);
    if (selected && selected !== gesture) continue;
    const phone = gesture === "held-touch";
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
    await page.addInitScript(() => {
      window.__gestureTrace = [];
      let previous = "";
      const frame = () => {
        const key =
          document.documentElement.dataset.roomView +
          ":" +
          document
            .querySelector("[data-room-artwork][data-artwork-key]")
            ?.getAttribute("data-artwork-key");
        if (key !== previous) {
          previous = key;
          window.__gestureTrace.push([performance.now(), key]);
          if (window.__gestureTrace.length > 12) window.__gestureTrace.shift();
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let release = () => {};
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/*.registration.json", async (route) => {
      await held;
      await route.continue().catch(() => {});
    });
    try {
      await page.goto(`${base}/projects`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(
        '[data-room-artwork][data-artwork-key][data-unit="4"]',
      );
      await page.waitForSelector('[data-boot-wait="opening"]', {
        state: "attached",
        timeout: 45000,
      });
      assert.equal(
        await page.getByRole("status", { name: "Room view" }).textContent(),
        "Loading 3D…You can explore while it loads.",
      );
      if (phone) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: 200, y: 330 }],
        });
        release();
        await page.waitForTimeout(700);
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.roomView),
          "illustrated",
        );
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      } else {
        await page.mouse.move(500, 380);
        await page.mouse.wheel(0, 60);
        release();
        for (let frame = 0; frame < 7; frame++) {
          await page.waitForTimeout(90);
          await page.mouse.wheel(0, 60);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.dataset.roomView,
            ),
            "illustrated",
          );
        }
      }
      await page.waitForFunction(
        () => document.documentElement.dataset.roomView === "live",
        undefined,
        { timeout: 45000 },
      );
      assert.equal(new URL(page.url()).pathname, "/projects");
      assert.equal(
        await page.getByRole("status", { name: "Room view" }).count(),
        0,
      );
      assert.deepEqual(errors, []);
      results.push({
        gesture,
        passed: true,
        automaticEntryAfterSettling: true,
        errors,
      });
      console.log("PASS", gesture);
    } catch (error) {
      process.exitCode = 1;
      results.push({
        gesture,
        passed: false,
        error: String(error),
        errors,
        state: await page.evaluate(() => ({
          phase: document.documentElement.dataset.roomView,
          handoff: window.__roomHandoff,
          trace: window.__gestureTrace?.slice(-12),
          hidden: document.hidden,
          modalOpen: window.__stacks?.state().modalOpen,
          panelState: window.__stacks?.state().panelState,
        })),
      });
      console.log("FAIL", gesture, String(error));
    } finally {
      release();
      await context.close();
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(output, JSON.stringify(results, null, 2) + "\n");
}

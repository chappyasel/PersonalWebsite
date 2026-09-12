import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const base =
  process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) ??
  "http://localhost:3334";
const out = "docs/reviews/illustrated-room-integration-evidence/raw";
const results = [];
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-gpu", "--use-angle=metal"],
});
try {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: "light",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("stacks-scene-sound-muted:v1", "true");
      window.__entryTrace = [];
      const inspect = () => {
        const shell = document.querySelector("[data-room-entrance]");
        if (shell) {
          const nav = document.querySelector(
            innerWidth >= 1200
              ? ".stacks-unit-rail-desktop"
              : ".stacks-unit-rail-mobile",
          );
          const card = document.querySelector(
            innerWidth >= 1200
              ? '[data-stacks-desktop-panel="projects"] [data-placard-surface]'
              : '[data-stacks-mobile-intro="sheet"][data-stacks-panel]',
          );
          const image = document.querySelector(
            "[data-illustration-selected] [data-illustration-image]",
          );
          const rect = image?.getBoundingClientRect();
          window.__entryTrace.push({
            at: performance.now(),
            phase: shell.dataset.roomEntrance,
            navOpacity: nav ? Number(getComputedStyle(nav).opacity) : null,
            cardOpacity: card ? Number(getComputedStyle(card).opacity) : null,
            box: rect ? [rect.x, rect.y, rect.width, rect.height] : null,
          });
          if (shell.dataset.roomEntrance === "complete") return;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    });
    try {
      await page.goto(`${base}/projects?hold-boot=1`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector('[data-room-entrance="complete"]');
      await page.waitForFunction(
        () => window.__entryTrace?.at(-1)?.phase === "complete",
      );
      const trace = await page.evaluate(() => window.__entryTrace);
      const phases = [...new Set(trace.map((frame) => frame.phase))];
      assert.deepEqual(phases, ["shelf", "content", "navigation", "complete"]);
      assert.equal(
        trace.find((frame) => frame.phase === "shelf")?.navOpacity,
        0,
      );
      assert.equal(
        trace.find((frame) => frame.phase === "shelf")?.cardOpacity,
        0,
      );
      // A busy frame can publish the final phase while CSS finishes its fade.
      // Require the actual controls to settle, without forcing a visible snap.
      await page.waitForFunction(
        () => {
          const nav = document.querySelector(
            innerWidth >= 1200
              ? ".stacks-unit-rail-desktop"
              : ".stacks-unit-rail-mobile",
          );
          const card = document.querySelector(
            innerWidth >= 1200
              ? '[data-stacks-desktop-panel="projects"] [data-placard-surface]'
              : '[data-stacks-mobile-intro="sheet"][data-stacks-panel]',
          );
          return (
            nav &&
            card &&
            Number(getComputedStyle(nav).opacity) === 1 &&
            Number(getComputedStyle(card).opacity) === 1
          );
        },
        undefined,
        { timeout: 2000 },
      );
      const boxes = trace.map((frame) => frame.box).filter(Boolean);
      assert.ok(boxes.length > 1);
      const artworkMovement = Math.max(
        ...boxes.flatMap((box) =>
          box.map((value, axis) => Math.abs(value - boxes[0][axis])),
        ),
      );
      assert.ok(
        artworkMovement <= 0.25,
        `Artwork moved ${artworkMovement}px during the UI entrance`,
      );
      assert.equal(await page.locator(".room-illustrated-chrome").count(), 1);
      assert.equal(
        await page.locator(".stacks-scene-controls:visible").count(),
        0,
      );
      assert.equal(
        await page.locator(".room-illustrated-chrome button").count(),
        1,
      );
      await page.waitForSelector(
        '[data-sound-toggle][data-sound-state="muted"]',
        { state: "attached" },
      );
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${out}/entrance-${width}.png` });
      results.push({
        name: `entrance-${width}`,
        passed: true,
        phases,
        errors,
        trace,
      });
      console.log("PASS", `entrance-${width}`);
    } catch (error) {
      results.push({
        name: `entrance-${width}`,
        passed: false,
        error: String(error),
        errors,
        trace: await page.evaluate(() => window.__entryTrace).catch(() => null),
      });
      console.log("FAIL", `entrance-${width}`, String(error));
      process.exitCode = 1;
    } finally {
      await context.close();
    }
  }
  for (const [route, width, height] of process.argv.includes("--entrance-only")
    ? []
    : [
        ["/projects", 1200, 900],
        ["/projects", 1024, 768],
        ["/projects", 2560, 1440],
        ["/projects", 820, 1180],
        ["/#books", 1200, 900],
      ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: "light",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => document.documentElement.dataset.roomView === "live",
        undefined,
        { timeout: 45000 },
      );
      assert.equal(await page.locator(".room-illustrated-chrome").count(), 0);
      await page.waitForSelector(".stacks-scene-controls");
      assert.deepEqual(errors, []);
      results.push({
        name: `cold-${route}-${width}x${height}`,
        passed: true,
        automaticEntry: true,
        errors,
      });
      console.log("PASS", `cold-${route}-${width}x${height}`);
    } catch (error) {
      results.push({
        name: `cold-${route}-${width}x${height}`,
        passed: false,
        error: String(error),
        errors,
      });
      console.log("FAIL", `cold-${route}-${width}x${height}`, String(error));
      process.exitCode = 1;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(
    `${out}/entrance.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
}

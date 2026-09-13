import assert from "node:assert/strict";
import { chromium } from "playwright";

const base =
  process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) ??
  "http://localhost:3334";
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-gpu", "--use-angle=metal"],
});
const results = [];
async function run(name, options, check) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...options,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await check(page, context);
    if (name !== "blocked-bundle") assert.deepEqual(errors, []);
    results.push({ name, passed: true });
    console.log("PASS", name);
  } catch (error) {
    console.log("FAIL", name, String(error));
    results.push({ name, passed: false, error: String(error) });
    await page.screenshot({ path: `/tmp/room-document-${name}-failed.png` });
  } finally {
    await context.close();
  }
}
try {
  for (const [route, id, viewport, colorScheme] of [
    ["/projects", "projects", { width: 1440, height: 900 }],
    ["/talks", "talks", { width: 390, height: 844 }],
    ["/golf", "golf", { width: 1440, height: 900 }],
    ["/#books", "books", { width: 390, height: 844 }],
    ["/projects", "projects", { width: 390, height: 844 }, "dark"],
  ]) {
    await run(
      `no-js-${id}-${colorScheme ?? "light"}`,
      {
        javaScriptEnabled: false,
        viewport,
        colorScheme: colorScheme ?? "light",
      },
      async (page) => {
        await page.goto(`${base}${route}`, { waitUntil: "load" });
        const doc = page.locator(".room-document:visible").first();
        await doc.waitFor();
        await doc
          .locator(`.room-document-section[id="${id}"]`)
          .waitFor({ state: "visible" });
        assert.equal(await page.locator(".stacks-flat").count(), 0);
        await doc
          .getByRole("link", { name: "Personal Systems", exact: true })
          .click();
        await doc.locator("#systems").waitFor({ state: "visible" });
        assert.equal(
          await doc.locator(".room-document-section:visible").count(),
          1,
        );
        const appearance = await doc
          .locator("#systems")
          .evaluate((section) => ({
            filters: [...section.querySelectorAll('[class*="intersect:"]')].map(
              (node) => getComputedStyle(node).filter,
            ),
            artwork: getComputedStyle(
              section.querySelector(".room-document-drawing"),
            ).backgroundImage,
          }));
        assert(appearance.filters.every((filter) => filter === "none"));
        assert(appearance.artwork.includes(`${colorScheme ?? "light"}-`));
      },
    );
  }
  await run("blocked-bundle", {}, async (page) => {
    await page.clock.install();
    await page.route("**/_next/**/*.js*", (route) => route.abort());
    await page.goto(`${base}/projects`, { waitUntil: "load" });
    await page.clock.fastForward(40_000);
    const doc = page.locator(".room-document:visible").first();
    await doc.waitFor();
    await doc.locator("#projects").waitFor({ state: "visible" });
    await doc
      .getByRole("link", { name: "Featured Talks", exact: true })
      .click();
    await doc.locator("#talks").waitFor({ state: "visible" });
  });
  for (const name of ["reduced-motion", "save-data", "no-webgl"]) {
    await run(
      name,
      { reducedMotion: name === "reduced-motion" ? "reduce" : "no-preference" },
      async (page, context) => {
        await context.addInitScript((name) => {
          if (name === "save-data")
            Object.defineProperty(navigator, "connection", {
              value: { saveData: true },
              configurable: true,
            });
          if (name === "no-webgl") {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
              return kind === "webgl" || kind === "webgl2"
                ? null
                : original.call(this, kind, ...args);
            };
          }
        }, name);
        await page.goto(`${base}/projects`);
        await page.waitForSelector(
          '.stacks-world-shell[data-room-presentation="illustrated"]',
        );
        await page
          .locator(".stacks-unit-rail-desktop")
          .getByRole("button", { name: "Systems", exact: true })
          .click();
        await page.waitForSelector('[data-room-artwork][data-unit="3"]', {
          timeout: 30_000,
        });
        assert.equal(
          await page.locator(".stacks-canvas-shell canvas").count(),
          0,
        );
        assert.equal(await page.locator(".room-document:visible").count(), 0);
      },
    );
  }
  await run("golf-auto-3d", {}, async (page) => {
    await page.goto(`${base}/golf`);
    await page.waitForFunction(
      () => document.documentElement.dataset.roomView === "live",
      {},
      { timeout: 60_000 },
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Retry 3D" })
        .isVisible()
        .catch(() => false),
      false,
    );
  });
} finally {
  await browser.close();
}
console.log(JSON.stringify(results));
if (results.some((row) => !row.passed)) process.exitCode = 1;

// Explicitly headless. Defaults to the isolated prototype; integration can
// select its own preview and evidence prefix without touching that server.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const base =
  process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) ??
  "http://127.0.0.1:3337";
const output =
  process.argv.find((arg) => arg.startsWith("--out="))?.slice(6) ??
  "/tmp/plant-leaf-wind";
const browser = await chromium.launch({
  headless: true,
  args: process.argv.includes("--gpu=native")
    ? ["--enable-gpu", "--use-angle=metal"]
    : [],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" || message.text().includes("Plant wind"))
    errors.push(message.text());
});
const url = `${base}/?debug=1&quality=balanced`;
const report = { url, headless: true, errors, samples: [] };
const control = page.getByRole("checkbox", {
  name: "Plant foliage wind",
});
const showControl = async () => {
  await page
    .getByRole("tab", { name: "Render", exact: true })
    .evaluate((node) => node.click());
  await page
    .locator("summary")
    .filter({ hasText: "Scene effects" })
    .evaluate((node) => {
      if (!node.parentElement.open) node.click();
    });
};
const capture = async (label) => {
  const state = await page.evaluate(() => {
    const s = window.__stacks.state();
    return {
      calls: s.calls,
      triangles: s.triangles,
      textures: s.textures,
      geometries: s.geometries,
      quality: s.quality,
      measurement: s.measurement,
      plant: window.__stacks.node("stacks-monstera-sway-body"),
    };
  });
  report.samples.push({ label, ...state });
};
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(
    () => window.__stacks?.state().controlsReady,
    null,
    { timeout: 120000 },
  );
  await page.waitForFunction(
    () => document.documentElement.getAttribute("data-world") === "ready",
    null,
    { timeout: 120000 },
  );
  await showControl();
  assert.equal(await control.isChecked(), true);
  await control.evaluate((node) => node.click());
  assert.equal(await control.isChecked(), false);
  await page.waitForTimeout(3000);
  await capture("about-disabled");
  await control.evaluate((node) => node.click());
  assert.equal(await control.isChecked(), true);
  await page.waitForTimeout(5000);
  await capture("about-enabled");
  assert.deepEqual(report.samples.at(-1).plant.parentRotation, [0, 0, 0]);
  await page
    .getByRole("button", { name: "Close scene diagnostics" })
    .evaluate((node) => node.click());
  await page.keyboard.press("h");
  await page.screenshot({ path: `${output}-monstera.png` });
  await page.evaluate(() => window.__stacks.scrollTo(6, { instant: true }));
  await page.waitForTimeout(6000);
  await capture("talks-enabled");
  for (const unit of [3, 4, 5]) {
    await page.evaluate(
      (unit) => window.__stacks.scrollTo(unit, { instant: true }),
      unit,
    );
    await page.waitForTimeout(2000);
    await capture(`unit-${unit}-enabled`);
  }
  await page.evaluate(() => window.__stacks.scrollTo(6, { instant: true }));
  await page.screenshot({ path: `${output}-pothos.png` });
  await page.keyboard.press("h");
  await page.keyboard.press("Backquote");
  await showControl();
  await control.evaluate((node) => node.click());
  assert.equal(await control.isChecked(), false);
  await page.waitForTimeout(3000);
  await capture("talks-disabled");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(
    () => window.__stacks?.state().controlsReady,
    null,
    { timeout: 120000 },
  );
  await showControl();
  assert.equal(await control.isChecked(), true);
  report.reloadResets = true;
  assert.deepEqual(errors, []);
} finally {
  await fs.writeFile(
    `${output}-headless.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
console.log(`Headless comparison passed; ${output}-headless.json`);

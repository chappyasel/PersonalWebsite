// Runs an ephemeral local fixture. It never touches a shared preview server.
import { build } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { chromium } from "playwright";

const bundle = await build({
  entryPoints: ["scripts/prototypes/plant-leaf-wind-lab.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const server = http.createServer(async (req, res) => {
  if (req.url === "/bundle.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles[0].contents);
    return;
  }
  if (
    /^\/models\/(monstera\.glb|pothos\.glb|potted-plant\.glb|sansevieria\.glb|yucca-plant\.glb|succulent-pot\.glb|atlas-light\.png|tiny-treats-light\.png)$/.test(
      req.url ?? "",
    )
  ) {
    res.end(await fs.readFile(`public${req.url}`));
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><html><body><script type="module" src="/bundle.js"></script></body></html>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.plantWindLab);
  const measurements = await page.evaluate(() => window.plantWindLab.measure());
  const baseline = measurements[0];
  for (const sample of measurements) {
    assert.equal(sample.calls, baseline.calls);
    assert.equal(sample.triangles, baseline.triangles);
    assert.equal(sample.textures, baseline.textures);
    assert.equal(
      sample.geometries,
      baseline.geometries + (sample.enabled ? 6 : 0),
    );
  }
  await page.screenshot({ path: "/tmp/plant-leaf-wind-lab-rest.png" });
  await page.evaluate(() => {
    window.plantWindLab.setEnabled(true);
    window.plantWindLab.renderAt(4);
  });
  await page.screenshot({ path: "/tmp/plant-leaf-wind-lab-wind.png" });
  await page.evaluate(() => window.plantWindLab.renderAt(7));
  await page.screenshot({ path: "/tmp/plant-leaf-wind-lab-wind-later.png" });
  await page.evaluate(() => window.plantWindLab.renderAt(7, 2.5));
  await page.screenshot({ path: "/tmp/plant-leaf-wind-lab-strong.png" });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "/tmp/plant-leaf-wind-lab.json",
    JSON.stringify({ measurements, errors }, null, 2),
  );
  console.log(JSON.stringify({ measurements, errors }, null, 2));
} finally {
  await browser.close();
  server.close();
}

import { verifyDependencies } from "../generate/room-artwork.mjs";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const unit = args[0] ?? "books";
const label = args[1] ?? "light-desktop";
const option = (key, fallback) => {
  const i = args.indexOf(key);
  return i < 0 ? fallback : args[i + 1];
};
const base = option("--base", "http://localhost:3338");
const folder = `${option("--out", "/tmp/room-artwork-display")}/${unit}/${label}`;
const contractBytes = await readFile(
  `scripts/generate/room-artwork-inputs/${unit}/${label}/capture.json`,
);
const contract = JSON.parse(contractBytes);
await verifyDependencies(
  process.cwd(),
  JSON.parse(
    await readFile("scripts/generate/room-artwork-inputs/manifest.json"),
  ),
);
const bundle = await build({
  entryPoints: ["scripts/room-artwork-quality/render-display.mjs"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
});
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-angle=metal",
    "--enable-webgl",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
try {
  const page = await browser.newPage({
    viewport: {
      width: contract.browserViewport[0],
      height: contract.browserViewport[1],
    },
    deviceScaleFactor: contract.raster[0] / contract.browserViewport[0],
  });
  await page.addInitScript((theme) => {
    window.__qualityRoots = new Map();
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject(renderer) {
        const id = this.renderers.size + 1;
        this.renderers.set(id, renderer);
        return id;
      },
      onCommitFiberRoot: (id, root) => window.__qualityRoots.set(root, root),
      onCommitFiberUnmount: () => undefined,
      checkDCE: () => undefined,
    };
    localStorage.setItem("theme", theme);
    localStorage.setItem("stacks-scene-sound-muted:v1", "true");
  }, label.split("-")[0]);
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGEERROR", e.message);
  });
  const url = new URL(
    ["projects", "musings", "talks"].includes(unit) ? `/${unit}` : "/",
    base,
  );
  url.search = "harness=1&quality=balanced";
  if (!["projects", "musings", "talks"].includes(unit)) url.hash = unit;
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(
    (index) => {
      if (document.documentElement.dataset.roomView !== "live") return false;
      for (const root of window.__qualityRoots.values()) {
        const q = [root.current];
        while (q.length) {
          const f = q.pop();
          const o = f.stateNode?.object ?? f.stateNode;
          if (o?.isObject3D && o.__r3f?.root) {
            const get = o.__r3f.root.getState;
            if (get().scene.getObjectByName(`room-unit:${index}`)) {
              window.__qualityState = get;
              return true;
            }
          }
          if (f.child) q.push(f.child);
          if (f.sibling) q.push(f.sibling);
        }
      }
      return false;
    },
    contract.index,
    { timeout: 120000 },
  );
  // Let entrance, camera-following key light, environment and focus converge.
  await page.waitForTimeout(8000);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(
    (c) => window.__captureDisplay(c),
    contract,
  );
  result.contractSha256 = createHash("sha256")
    .update(contractBytes)
    .digest("hex");
  await mkdir(folder, { recursive: true });
  for (const [name, uri] of Object.entries(result.images)) {
    await writeFile(
      `${folder}/${name}.png`,
      Buffer.from(uri.split(",")[1], "base64"),
    );
    result.images[name] = `${name}.png`;
  }
  await writeFile(
    `${folder}/display.json`,
    JSON.stringify({ ...result, errors }, null, 2) + "\n",
  );
  if (errors.length) throw Error("Page errors: " + errors.join("; "));
  console.log(
    "SAVED",
    folder,
    JSON.stringify({
      canvas: result.metadata.canvas,
      owners: result.metadata.owners.length,
      restoredWind: result.metadata.restoredWind,
    }),
  );
} finally {
  await browser.close();
}

import { verifyDependencies } from "../generate/room-artwork.mjs";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const input = "scripts/generate/room-artwork-inputs";
const args = process.argv.slice(2);
const unit = args[0] ?? "projects",
  label = args[1] ?? "light-desktop";
const option = (key, fallback) => {
  const index = args.indexOf(key);
  return index < 0 ? fallback : args[index + 1];
};
const base = option("--base", "http://localhost:3338");
const folder = path.join(
  option("--out", "/tmp/room-artwork-quality-captures"),
  unit,
  label,
);
const contractBytes = await readFile(`${input}/${unit}/${label}/capture.json`);
const contract = JSON.parse(contractBytes);
const spec = JSON.parse(
  await readFile("scripts/room-artwork-quality/capture-specs.json", "utf8"),
).cases[`${unit}/${label}`];
if (
  createHash("sha256").update(contractBytes).digest("hex") !==
  spec.contractSha256
)
  throw Error("Capture contract changed; review specs before recapture");
const specs = spec.owners;
for (const owner of contract.owners) {
  const item = specs.find((s) => s.id === owner.id);
  if (!item || item.details.length !== owner.paths.length)
    throw Error("Capture inventory mismatch " + owner.id);
}
await verifyDependencies(
  process.cwd(),
  JSON.parse(await readFile(`${input}/manifest.json`, "utf8")),
);
const bundle = await build({
  entryPoints: ["scripts/room-artwork-quality/render.mjs"],
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
process.on("SIGTERM", async () => {
  await browser.close();
  process.exit(1);
});
try {
  const page = await browser.newPage({
    viewport: {
      width: contract.browserViewport[0],
      height: contract.browserViewport[1],
    },
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
  }, label.split("-")[0]);
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGEERROR", e.stack);
  });
  page.on("console", (m) => {
    if (m.text().startsWith("QUALITY")) console.log(m.text());
  });
  const url = new URL(unit === "projects" ? "/projects" : "/", base);
  url.search = "harness=1&nomeadow=1";
  if (unit !== "projects") url.hash = unit === "musings" ? "musings" : unit;
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 120000 });
  console.log(
    "PAGE_STATE",
    await page.evaluate(() => ({
      html: document.documentElement.outerHTML.slice(0, 500),
      canvas: document.querySelectorAll("canvas").length,
      roots: window.__qualityRoots.size,
    })),
  );
  await page
    .waitForFunction(
      (index) => {
        for (const root of window.__qualityRoots.values()) {
          const q = [root.current];
          while (q.length) {
            const f = q.pop();
            const object = f.stateNode?.object ?? f.stateNode;
            if (object?.isObject3D && object.__r3f?.root) {
              const get = object.__r3f.root.getState;
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
      { timeout: 60000 },
    )
    .catch(async (e) => {
      console.log(
        "NO_SCENE",
        await page.evaluate(() => ({
          html: document.documentElement.outerHTML.slice(0, 600),
          text: document.body.innerText.slice(-1500),
          roots: [...window.__qualityRoots.values()].map((r) => {
            let count = 0,
              objects = 0,
              names = [];
            let q = [r.current];
            while (q.length) {
              let f = q.pop();
              count++;
              if (f.stateNode?.isObject3D) objects++;
              if (f.type?.name) names.push(f.type.name);
              if (f.child) q.push(f.child);
              if (f.sibling) q.push(f.sibling);
            }
            return { count, objects, names: names.slice(-30) };
          }),
        })),
      );
      throw e;
    });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  let result, last;
  const started = Date.now();
  while (Date.now() - started < 90000) {
    try {
      result = await page.evaluate(
        ({ contract, specs }) => window.__qualityCapture(contract, specs, 4),
        { contract, specs },
      );
      break;
    } catch (e) {
      if (
        !/Missing|Texture not ready|Unit missing|Books data identity mismatch/.test(
          e.message,
        )
      )
        throw e;
      last = e;
      console.log("WAIT", e.message.slice(0, 450));
      await page.waitForTimeout(1000);
    }
  }
  if (!result) throw last;
  if (errors.length) throw Error("Page errors " + JSON.stringify(errors));
  await mkdir(folder, { recursive: true });
  for (const owner of result.owners) {
    for (const [kind, uri] of Object.entries(owner.images)) {
      await writeFile(
        `${folder}/${owner.id}.${kind}.png`,
        Buffer.from(uri.split(",")[1], "base64"),
      );
      owner.images[kind] = `${owner.id}.${kind}.png`;
    }
  }
  await writeFile(
    `${folder}/capture.json`,
    JSON.stringify(
      {
        ...result,
        contractSha256: await import("node:crypto").then(({ createHash }) =>
          createHash("sha256").update(JSON.stringify(contract)).digest("hex"),
        ),
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("SAVED", folder);
} finally {
  await browser.close();
}

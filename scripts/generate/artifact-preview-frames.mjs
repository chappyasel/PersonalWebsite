// Capture the artifact preview frames the room registers, for the 2D view.
//
// A photo's frame — mat insets, border tone, corner radius, finish — is
// published by the scene component that draws it, through
// useRegisterArtifactPreviewFrame, under the artifact id its Grabbable puts
// on SceneArtifactIdContext. So the association between an artifact and its
// frame lives in the shape of the scene graph and nowhere else.
//
// The 2D illustration opens the same fullscreen inspector from a drawing,
// with no renderer and therefore no registrations, so every preview there
// fell back to BARE_ARTIFACT_PREVIEW_FRAME. This walks the live room once,
// lets every unit mount, and writes what it registered to a JSON file the
// registry seeds itself from.
//
// Why not import the layer constants directly: they live in scene modules
// that reach @react-three/drei and fiber, and the 2D path is on the
// homepage's initial graph. initialGraph.test.ts fails that, correctly — one
// value import of three costs about 98 KB gzipped before first paint.
//
//   node scripts/generate/artifact-preview-frames.mjs [--base http://localhost:3102]
//
// Needs a server already running that build. It does not start one, because
// `pnpm dev` evicts whoever holds the dev lock.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT = path.join(
  process.cwd(),
  "src/app/components/stacks/scene/artifactPreviewFrames.generated.json",
);
const UNITS = 7;

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
}

const base = arg("base", "http://localhost:3102");

const browser = await chromium.launch({
  args: [
    // Headless Chromium falls back to SwiftShader, which loses the GL context
    // this scene needs. Metal on darwin, and the blocklist has to go or the
    // flags are ignored.
    "--enable-gpu",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`  page: ${message.text()}`);
  });

  // `harness` installs the read-only dev hooks in a production build without
  // mounting the expensive diagnostic probes.
  await page.goto(`${base}/?harness=1&quality=safety`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.world === "ready",
    null,
    { timeout: 120_000 },
  );
  await page.waitForFunction(() => typeof window.__stacks?.frames === "function");

  const frames = {};
  for (let unit = 0; unit < UNITS; unit += 1) {
    await page.evaluate((u) => window.__stacks.scrollTo(u, { instant: true }), unit);
    // Offscreen shelves stay mounted, but a unit that has never been visited
    // mounts its forms on arrival and registers in an effect after that.
    await page.waitForTimeout(900);
    const seen = await page.evaluate(() => window.__stacks.frames());
    const added = Object.keys(seen).filter((id) => !(id in frames));
    Object.assign(frames, seen);
    console.log(
      `unit ${unit}: ${Object.keys(seen).length} registered, ${added.length} new`,
    );
  }

  const ordered = Object.fromEntries(
    Object.keys(frames)
      .sort()
      .map((id) => [id, frames[id]]),
  );
  const count = Object.keys(ordered).length;
  if (!count) {
    console.error("No frames registered. Refusing to write an empty capture.");
    process.exit(1);
  }

  let previous = 0;
  try {
    previous = Object.keys(JSON.parse(readFileSync(OUT, "utf8"))).length;
  } catch {
    previous = 0;
  }
  // A capture that loses frames is far more likely to be a run that raced the
  // scene than a real deletion. Say so rather than committing the loss.
  if (previous && count < previous)
    console.warn(
      `WARNING: captured ${count} frames, down from ${previous}. Check before committing.`,
    );

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(ordered, null, 2)}\n`);
  console.log(`\nWrote ${count} frames to ${path.relative(process.cwd(), OUT)}`);
} finally {
  await browser.close();
}

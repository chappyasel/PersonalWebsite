#!/usr/bin/env node
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 630;
// The live desktop camera leaves the right third open for its placard. Capture
// mode removes that UI, so crop the unused side and enlarge the focal shelf.
// 900x472.5 is exactly the OG card's 40:21 aspect ratio.
// Start the crop slightly lower in the framebuffer so the shelves land a
// little higher in the finished card, leaving a quieter meadow band for the
// overlaid name without changing the horizontal composition.
const SCENE_CROP = { x: 70, y: 90, width: 900, height: 472.5 };
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "public/images/stacks/home-og-scene.jpg",
);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function captureUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("--url must use http or https");
  }
  url.searchParams.set("og-capture", "1");
  // Keep the authored post-processing deterministic in software-rendered CI:
  // rung 0 retains AO, bloom, depth of field, tilt shift, and the final grade.
  url.searchParams.set("quality", "0");
  return url;
}

const sourceUrl = captureUrl(
  valueAfter("--url") ??
    process.env.HOME_OG_SOURCE_URL ??
    "http://localhost:3000",
);
const outputPath = path.resolve(ROOT, valueAfter("--output") ?? DEFAULT_OUTPUT);
const temporaryOutputPath = `${outputPath}.tmp-${process.pid}`;
const rawOutputPath = `${outputPath}.raw-${process.pid}.png`;

await mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});

try {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    // Render at the card's native pixel density. Full AO, bloom, depth of
    // field, and tilt shift exhaust SwiftShader at the former 1.5x setting.
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();

  // Make the capture independent of the machine or CI runner's saved theme.
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
  });

  const failures = [];
  page.on("requestfailed", (request) => {
    failures.push(
      `${request.url()}: ${request.failure()?.errorText ?? "failed"}`,
    );
  });

  const response = await page.goto(sourceUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (!response?.ok()) {
    throw new Error(
      `Homepage returned ${response?.status() ?? "no response"} at ${sourceUrl.href}`,
    );
  }

  // StacksHome owns this signal. It is set after WebGL has painted its first
  // frame. Capture mode hides the normal reveal curtain, then gives suspended
  // textures and the meadow a fixed settle window of their own. That avoids
  // coupling an offline render to the visitor-facing boot choreography.
  await page.waitForSelector(
    "html[data-og-capture] .stacks-world-shell[data-canvas-ready]",
    {
      state: "attached",
      // Full post-processing takes roughly 60–90 seconds to compile under
      // SwiftShader on a cold runner before the canvas can paint its frame.
      timeout: 120_000,
    },
  );
  await page.evaluate(async () => document.fonts?.ready);
  const uiVisibility = await page
    .locator(".stacks-og-ui")
    .evaluate((element) => getComputedStyle(element).visibility);
  if (uiVisibility !== "hidden") {
    throw new Error(
      `Capture UI should be hidden; computed visibility is ${uiVisibility}`,
    );
  }

  // Full post-processing takes long enough to compile under SwiftShader that
  // secondary textures have already settled by the first painted frame. Keep
  // this final pause short so a software renderer is not asked to sustain the
  // expensive composer for several idle seconds before reading its framebuffer.
  await page.waitForTimeout(1_000);
  await page.evaluate(() => {
    // `next dev` injects its launcher as a custom-element portal. It is not
    // present in production, but removing it makes local/manual regeneration
    // produce the same clean frame as the deployment workflow.
    document.querySelectorAll("nextjs-portal").forEach((portal) => {
      portal.remove();
    });
  });
  await page.waitForSelector(
    "html[data-og-capture] .stacks-world-shell[data-canvas-ready]",
    { state: "attached", timeout: 5_000 },
  );
  await page.screenshot({
    path: rawOutputPath,
    type: "png",
    clip: SCENE_CROP,
    animations: "disabled",
    caret: "hide",
    fullPage: false,
    scale: "device",
    timeout: 120_000,
  });

  await sharp(rawOutputPath)
    .resize(WIDTH, HEIGHT, { fit: "fill" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(temporaryOutputPath);

  const metadata = await sharp(temporaryOutputPath).metadata();
  if (metadata.width !== WIDTH || metadata.height !== HEIGHT) {
    throw new Error(
      `Expected ${WIDTH}x${HEIGHT}, wrote ${metadata.width ?? "?"}x${metadata.height ?? "?"}`,
    );
  }

  const { size } = await stat(temporaryOutputPath);
  await rename(temporaryOutputPath, outputPath);
  console.log(
    `Captured ${sourceUrl.origin} to ${path.relative(ROOT, outputPath)} (${Math.round(size / 1024)} KiB)`,
  );
  if (failures.length > 0) {
    console.warn(
      `Capture completed with ${failures.length} failed request(s); first: ${failures[0]}`,
    );
  }
} finally {
  await browser.close();
  await Promise.all([
    rm(rawOutputPath, { force: true }),
    rm(temporaryOutputPath, { force: true }),
  ]);
}

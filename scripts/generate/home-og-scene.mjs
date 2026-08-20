#!/usr/bin/env node
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

import {
  HOME_OG_CAMERA_Y,
  HOME_OG_DEVICE_SCALE_FACTOR,
  HOME_OG_FOV,
  HOME_OG_LENS_CENTER,
  HOME_OG_LOOK_Y,
  HOME_OG_OUTPUT,
  HOME_OG_RESOLUTION_CEILING,
  HOME_OG_SCENE_CROP,
  HOME_OG_VIEWPORT,
} from "./home-og-scene-config.mjs";

const { width: WIDTH, height: HEIGHT } = HOME_OG_OUTPUT;
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
  // Capture with the scene's manual-only maximum-quality profile: full-resolution
  // AO and depth of field, 10-level bloom, 8x MSAA, and maximum environment detail.
  url.searchParams.set("quality", "cinematic");
  url.searchParams.set("og-resolution", HOME_OG_RESOLUTION_CEILING.toString());
  url.searchParams.set("og-head-on", "1");
  // A slightly narrower capture lens gives the shelf more of the finished
  // card without changing the live homepage camera.
  url.searchParams.set("og-fov", HOME_OG_FOV.toString());
  url.searchParams.set("og-look-y", HOME_OG_LOOK_Y.toString());
  url.searchParams.set("og-camera-y", HOME_OG_CAMERA_Y.toString());
  // Keep the full cinematic side lens, but center its clear band on the crop
  // instead of the hidden rail and reading dock.
  url.searchParams.set("og-lens-center", HOME_OG_LENS_CENTER.toString());
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
    viewport: HOME_OG_VIEWPORT,
    // The 4:3 device scale turns the CSS crop into at least a native
    // 1200x630 raster without changing the authored viewport composition.
    deviceScaleFactor: HOME_OG_DEVICE_SCALE_FACTOR,
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
  // `.stacks-og-ui` uses `display: contents`, so hiding only that wrapper is
  // not enough in Chromium. Hide its descendants directly while retaining
  // their layout measurements for the scene's authored camera composition.
  await page.addStyleTag({
    content:
      "html[data-og-capture] .stacks-og-ui * { visibility: hidden !important; }",
  });
  await page.evaluate(async () => document.fonts?.ready);
  const uiVisibility = await page
    .locator("[data-stacks-desktop-panel][data-stacks-active]")
    .evaluate((element) => getComputedStyle(element).visibility);
  if (uiVisibility !== "hidden") {
    throw new Error(
      `Capture placard should be hidden; computed visibility is ${uiVisibility}`,
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
  // Chromium's screenshot command repeatedly deadlocks on the continuously
  // painted software-WebGL surface in CI. The renderer preserves its drawing
  // buffer, so read that buffer directly and let Sharp perform the crop.
  const canvasCapture = await page
    .locator("html[data-og-capture] .stacks-world-shell canvas")
    .first()
    .evaluate((canvas) => ({
      dataUrl: canvas.toDataURL("image/png"),
      height: canvas.height,
      width: canvas.width,
    }));
  const pngPrefix = "data:image/png;base64,";
  if (!canvasCapture.dataUrl.startsWith(pngPrefix)) {
    throw new Error("WebGL canvas did not return a PNG capture");
  }
  await writeFile(
    rawOutputPath,
    Buffer.from(canvasCapture.dataUrl.slice(pngPrefix.length), "base64"),
  );

  const scaleX = canvasCapture.width / HOME_OG_VIEWPORT.width;
  const scaleY = canvasCapture.height / HOME_OG_VIEWPORT.height;
  const canvasCrop = {
    left: Math.round(HOME_OG_SCENE_CROP.x * scaleX),
    top: Math.round(HOME_OG_SCENE_CROP.y * scaleY),
    width: Math.round(HOME_OG_SCENE_CROP.width * scaleX),
    height: Math.round(HOME_OG_SCENE_CROP.height * scaleY),
  };

  const rawMetadata = await sharp(rawOutputPath).metadata();
  if (
    (rawMetadata.width ?? 0) < canvasCrop.left + canvasCrop.width ||
    (rawMetadata.height ?? 0) < canvasCrop.top + canvasCrop.height
  ) {
    throw new Error(
      `Raw canvas ${rawMetadata.width ?? "?"}x${rawMetadata.height ?? "?"} does not contain crop ${canvasCrop.left},${canvasCrop.top} ${canvasCrop.width}x${canvasCrop.height}`,
    );
  }

  await sharp(rawOutputPath)
    .extract(canvasCrop)
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

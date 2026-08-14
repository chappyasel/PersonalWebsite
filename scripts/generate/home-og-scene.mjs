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
const SCENE_CROP = { x: 70, y: 75, width: 900, height: 472.5 };
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
  // The interactive scene uses photographic softness at its edges and in the
  // distant meadow. A social card is already downsampled by every platform,
  // so keep the rest of the grade but render this still without blur passes.
  url.searchParams.set("nodof", "1");
  url.searchParams.set("notiltshift", "1");
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
    // Oversample enough to keep the enlarged crop crisp without asking a
    // software CI renderer to sustain the scene's full 2x performance tier.
    deviceScaleFactor: 1.5,
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();

  // Make the capture independent of the machine or CI runner's saved theme.
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
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
      timeout: 60_000,
    },
  );
  await page.evaluate(async () => document.fonts?.ready);
  const uiDisplay = await page
    .locator(".stacks-og-ui")
    .evaluate((element) => getComputedStyle(element).display);
  if (uiDisplay !== "none") {
    throw new Error(
      `Capture UI should be hidden; computed display is ${uiDisplay}`,
    );
  }

  // The first canvas frame deliberately permits secondary props to stream in.
  // Give those textures a fixed settle window before freezing CSS animations
  // and reading the framebuffer.
  await page.waitForTimeout(7_500);
  await page.evaluate(() => {
    // `next dev` injects its launcher as a custom-element portal. It is not
    // present in production, but removing it makes local/manual regeneration
    // produce the same clean frame as the deployment workflow.
    document.querySelectorAll("nextjs-portal").forEach((portal) => {
      portal.remove();
    });
  });
  await page.screenshot({
    path: rawOutputPath,
    type: "png",
    clip: SCENE_CROP,
    animations: "disabled",
    caret: "hide",
    fullPage: false,
    scale: "device",
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

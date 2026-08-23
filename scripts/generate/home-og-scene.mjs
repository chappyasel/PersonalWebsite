#!/usr/bin/env node
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

import {
  homeOgInputManifest,
  stampHomeOgImage,
  writeHomeOgManifest,
} from "./home-og-inputs.mjs";
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

/** When to take the shot.
 *
 * These numbers are measured, not guessed. Three independent page loads were
 * screenshotted at a fixed three seconds and again at ten: at three seconds
 * they differed by two CSS pixels of horizontal camera travel, at ten they
 * landed on the same pixels (mean absolute difference 0.67 and 1.21 against
 * the first load). The camera is still converging when the old fixed
 * `waitForTimeout(3_000)` fired, so which frame the generator got depended on
 * how many frames the machine had rendered.
 *
 * That is why the committed JPEG used to churn on every regeneration, and why
 * the freshness gate could never tell a real change from capture noise. Wait
 * for the frame to stop moving instead, and the artifact becomes reproducible.
 */
const SETTLE = Object.freeze({
  /** Consecutive quiet comparisons required before the shot is taken.
   *
   * Counted in samples rather than seconds because a sample is not cheap. At
   * the cinematic profile this capture asks for, one frame costs roughly half
   * a minute to produce, so the gap between two samples is already a long
   * baseline for drift and a wall-clock stability window would be theatre.
   * Two quiet comparisons add about a minute to a generator run that is
   * already dominated by a production build. */
  stableSamples: 2,
  /** Give up after this many samples and capture regardless, so a machine that
   * never goes quiet still produces a card instead of nothing. */
  maxSamples: 8,
  /** Alignment search radius in raster pixels, for the diagnostic only. Two CSS
   * pixels at the capture's 4:3 device scale is under three. */
  searchPx: 4,
  /** Ambient motion never stops — dust drifts, insects move — so a settled
   * frame is never identical to the one before it. Measured under the real
   * capture parameters, quiet samples sit between 1.4 and 4.2 while a still
   * arriving scene is above 20, so this only has to split those two. */
  maxDifference: 8,
});

/** The line between "the render is the same" and "the render changed", as a
 * mean absolute difference over the decoded card.
 *
 * Two settled captures of identical code measured 2.26 and 2.08: dust and
 * insects move between them, so the floor is never zero. Before settling was
 * enforced, two captures of identical code measured 11.04 with three pixels of
 * reframing. Five sits clear of the floor and well under a real change. */
const UNCHANGED_RENDER_TOLERANCE = 5;

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

/** Greyscale raster of the exact region the capture will crop, so settling is
 * judged on the pixels that end up in the card and not on chrome around them.
 * @param {import("playwright").Page} page
 */
async function settleFrame(page) {
  const shot = await page.screenshot({
    type: "png",
    clip: HOME_OG_SCENE_CROP,
    animations: "allow",
    caret: "hide",
    scale: "device",
    timeout: 120_000,
  });
  const { data, info } = await sharp(shot)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Mean absolute difference between two frames with no realignment.
 *
 * This, not the alignment search below, is what decides that the scene has
 * stopped moving. An offset search sounds more precise and is worse for the
 * job: ambient motion is enough to make the best-scoring offset flip between
 * zero and one pixel at random, so "settled" never arrives. Compared straight,
 * the two populations separate cleanly — a converged sample against its
 * reference sits near 1 to 4, and two CSS pixels of camera travel lands above
 * 10. Consecutive samples are a long enough baseline to catch slow drift here
 * only because producing one costs tens of seconds.
 */
function frameDifference(reference, frame) {
  const { width, height } = reference;
  const left = Math.round(width * 0.25);
  const right = Math.round(width * 0.75);
  const top = Math.round(height * 0.2);
  const bottom = Math.round(height * 0.8);
  let sum = 0;
  let count = 0;
  for (let y = top; y < bottom; y += 3) {
    for (let x = left; x < right; x += 3) {
      sum += Math.abs(
        reference.data[y * width + x] - frame.data[y * width + x],
      );
      count += 1;
    }
  }
  return count === 0 ? Number.POSITIVE_INFINITY : sum / count;
}

/** Best whole-pixel alignment of `frame` onto `reference`, and the mean
 * absolute difference there. Diagnostics only: it turns "never settled" into
 * "never settled, and it was sliding two pixels left".
 */
function alignFrames(reference, frame, radius) {
  const { width, height } = reference;
  const left = Math.round(width * 0.25);
  const right = Math.round(width * 0.75);
  const top = Math.round(height * 0.2);
  const bottom = Math.round(height * 0.8);
  let best = { dx: 0, dy: 0, residual: Number.POSITIVE_INFINITY };
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      let sum = 0;
      let count = 0;
      for (let y = top; y < bottom; y += 3) {
        const referenceY = y + dy;
        if (referenceY < 0 || referenceY >= height) continue;
        for (let x = left; x < right; x += 3) {
          const referenceX = x + dx;
          if (referenceX < 0 || referenceX >= width) continue;
          sum += Math.abs(
            reference.data[referenceY * width + referenceX] -
              frame.data[y * width + x],
          );
          count += 1;
        }
      }
      const residual = count === 0 ? Number.POSITIVE_INFINITY : sum / count;
      if (residual < best.residual) best = { dx, dy, residual };
    }
  }
  return best;
}

/** Hold until the framing has not moved for `stableForMs`. The reference frame
 * resets whenever the scene moves, so the clock measures stillness rather than
 * elapsed time.
 * @param {import("playwright").Page} page
 */
async function waitForSettledFrame(page) {
  const startedAt = Date.now();
  let previous = await settleFrame(page);
  let frame = previous;
  let difference = Number.POSITIVE_INFINITY;
  let quiet = 0;
  for (let sample = 0; sample < SETTLE.maxSamples; sample += 1) {
    frame = await settleFrame(page);
    difference = frameDifference(previous, frame);
    if (process.env.HOME_OG_SETTLE_TRACE) {
      console.log(
        `  settle sample ${sample + 1} at ${((Date.now() - startedAt) / 1000).toFixed(1)}s difference=${difference.toFixed(2)} quiet=${quiet}`,
      );
    }
    quiet = difference <= SETTLE.maxDifference ? quiet + 1 : 0;
    if (quiet >= SETTLE.stableSamples) {
      return { settled: true, waitedMs: Date.now() - startedAt, difference };
    }
    previous = frame;
  }
  return {
    settled: false,
    waitedMs: Date.now() - startedAt,
    difference,
    drift: alignFrames(previous, frame, SETTLE.searchPx),
  };
}

/** Did this capture render the same picture as the one already committed?
 * Compared after decoding, so JPEG encoding noise and the trailing provenance
 * stamp cannot masquerade as a visual change.
 */
async function renderedPixelsMatch(candidatePath, committedPath) {
  try {
    const decode = (file) =>
      sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const [candidate, committed] = await Promise.all([
      decode(candidatePath),
      decode(committedPath),
    ]);
    if (candidate.data.length !== committed.data.length) return null;
    let sum = 0;
    for (let i = 0; i < candidate.data.length; i += 1) {
      sum += Math.abs(candidate.data[i] - committed.data[i]);
    }
    const difference = sum / candidate.data.length;
    return { matches: difference <= UNCHANGED_RENDER_TOLERANCE, difference };
  } catch {
    // No committed image yet, or it is unreadable. Treat this as a change.
    return null;
  }
}

const sourceUrl = captureUrl(
  valueAfter("--url") ??
    process.env.HOME_OG_SOURCE_URL ??
    "http://localhost:3000",
);
const outputPath = path.resolve(ROOT, valueAfter("--output") ?? DEFAULT_OUTPUT);
const temporaryOutputPath = path.join(
  tmpdir(),
  `home-og-scene-${process.pid}.jpg`,
);
const rawOutputPath = path.join(tmpdir(), `home-og-scene-${process.pid}.png`);

await mkdir(path.dirname(outputPath), { recursive: true });
const startingInputs = await homeOgInputManifest({ root: ROOT });

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
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
  const uiVisibility = await page.evaluate(() => {
    const element = document.querySelector(
      "[data-stacks-desktop-panel][data-stacks-active]",
    );
    return element ? getComputedStyle(element).visibility : null;
  });
  if (uiVisibility !== "hidden") {
    throw new Error(
      `Capture placard should be hidden; computed visibility is ${uiVisibility}`,
    );
  }

  // The freshness manifest stops watching the boot screen and the flat page on
  // the grounds that capture mode removes them from the layout entirely. Prove
  // it here, so that exclusion cannot quietly stop being true.
  const removedSurfaces = await page.evaluate(() =>
    [".stacks-boot", ".stacks-flat"].map((selector) => {
      const element = document.querySelector(selector);
      return {
        selector,
        display: element ? getComputedStyle(element).display : "absent",
      };
    }),
  );
  for (const { selector, display } of removedSurfaces) {
    if (display !== "none" && display !== "absent") {
      throw new Error(
        `${selector} must be display:none during capture (CAPTURE_REMOVED_INPUTS depends on it); computed display is ${display}`,
      );
    }
  }

  // `boot/aboutBootStage.ts` is unwatched for a different reason, and the check
  // above cannot speak for it. That file renders nothing: it writes
  // `data-boot-stage` and the `--stacks-boot-stage-*` custom properties onto
  // documentElement, which capture mode very much does not remove — the
  // attribute is still "start" here. What makes it inert is that everything it
  // writes is read only inside `.stacks-boot`. Check that directly, so a future
  // change that has it publish something the world consumes fails the capture
  // instead of quietly leaving the manifest blind to it.
  const stageVariables = await page.evaluate(() => {
    const leaked = [];
    let scanned = 0;
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules) {
          walk(Array.from(rule.cssRules));
          continue;
        }
        scanned += 1;
        const selector = rule.selectorText;
        if (!selector || !rule.cssText.includes("--stacks-boot-stage-")) {
          continue;
        }
        if (!selector.includes(".stacks-boot")) leaked.push(selector);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(Array.from(sheet.cssRules));
      } catch {
        // A cross-origin sheet cannot be read. Counted as unscanned below.
      }
    }
    return { leaked, scanned };
  });
  if (stageVariables.scanned === 0) {
    throw new Error(
      "No CSS rules could be read during capture, so the boot-stage variable guard proved nothing.",
    );
  }
  if (stageVariables.leaked.length > 0) {
    throw new Error(
      `--stacks-boot-stage-* is read outside the boot screen by ${stageVariables.leaked.join(", ")}; ` +
        "boot/aboutBootStage.ts can no longer be left out of CAPTURE_REMOVED_INPUTS.",
    );
  }

  const settle = await waitForSettledFrame(page);
  if (settle.settled) {
    console.log(
      `Frame settled after ${(settle.waitedMs / 1000).toFixed(1)}s (difference ${settle.difference.toFixed(2)}).`,
    );
  } else {
    console.warn(
      `Frame never went quiet across ${SETTLE.maxSamples} samples (${(settle.waitedMs / 1000).toFixed(0)}s); capturing anyway. ` +
        `Last difference ${settle.difference.toFixed(2)}, drifting dx=${settle.drift?.dx ?? "?"} dy=${settle.drift?.dy ?? "?"}. ` +
        "Expect this capture to differ from the next one.",
    );
  }
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
    clip: HOME_OG_SCENE_CROP,
    animations: "allow",
    caret: "hide",
    fullPage: false,
    scale: "device",
    timeout: 120_000,
  });

  const rawMetadata = await sharp(rawOutputPath).metadata();
  if ((rawMetadata.width ?? 0) < WIDTH || (rawMetadata.height ?? 0) < HEIGHT) {
    throw new Error(
      `Raw capture ${rawMetadata.width ?? "?"}x${rawMetadata.height ?? "?"} is smaller than ${WIDTH}x${HEIGHT}`,
    );
  }

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

  // The digest is deliberately not re-read here. These pixels came out of the
  // production build, which was made before this process started, so a file
  // written while the browser was open cannot have changed them. Re-checking
  // aborted whole runs over edits that provably could not affect the capture.
  //
  // When the render is unchanged, keep the committed pixels rather than a
  // freshly encoded copy of the same picture. The stamp still has to be
  // rewritten — provenance lives inside the JPEG on purpose — but the image
  // itself only ever moves when the scene actually looks different.
  const unchanged = await renderedPixelsMatch(temporaryOutputPath, outputPath);
  if (unchanged?.matches) {
    console.log(
      `Render unchanged (mean difference ${unchanged.difference.toFixed(2)}); keeping the committed pixels and restamping.`,
    );
    await rm(temporaryOutputPath, { force: true });
    await stampHomeOgImage({
      imagePath: outputPath,
      inputDigest: startingInputs.digest,
    });
  } else {
    if (unchanged) {
      console.log(
        `Render changed (mean difference ${unchanged.difference.toFixed(2)}).`,
      );
    }
    await stampHomeOgImage({
      imagePath: temporaryOutputPath,
      inputDigest: startingInputs.digest,
    });
    await rename(temporaryOutputPath, outputPath);
  }
  const { size } = await stat(outputPath);
  if (outputPath === DEFAULT_OUTPUT) {
    await writeHomeOgManifest({ root: ROOT });
  }
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

#!/usr/bin/env node
// Run under research/personal-website-performance-overnight/benchmark_lock.py.
// Audio uses the real runtime and assets in an isolated page. Scene uses a
// production server. PCM totals measure allocation, not retained JS heap.
import { build } from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const suite = option("--suite", "audio");
const out = option("--out", "/tmp/stacks-asset-memory.json");
const repetitions = Number(option("--repeats", "3"));
const cycles = Number(option("--cycles", "6"));
const base = process.env.BASE ?? "http://127.0.0.1:3123";
assert.ok(
  Number.isInteger(repetitions) && repetitions > 0,
  "--repeats must be positive",
);
assert.ok(
  Number.isInteger(cycles) && cycles >= 4,
  "--cycles must be at least 4 for a heap slope",
);
const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-gpu",
    "--use-angle=metal",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const report = {
  suite,
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirtyFiles: execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" })
    .trim()
    .split("\n"),
  browser: browser.version(),
  repetitions,
  cycles,
  results: [],
};
let server;
const watchdog = setTimeout(
  () => {
    console.error("Asset memory benchmark exceeded its time limit");
    void browser.close();
  },
  Number(option("--timeout-ms", "600000")),
);

async function memory(page, cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  await page.waitForTimeout(50);
  await cdp.send("HeapProfiler.collectGarbage");
  const heap = await cdp.send("Runtime.getHeapUsage");
  const dom = await cdp.send("Memory.getDOMCounters");
  const elements = await page.evaluate(() => ({
    connectedCanvases: document.querySelectorAll("canvas").length,
    connectedImages: document.images.length,
    focused: document.hasFocus(),
    visibility: document.visibilityState,
  }));
  return { ...heap, ...dom, ...elements };
}

try {
  if (suite === "audio") {
    const suppliedBundle = option("--bundle", null);
    const bundle = suppliedBundle
      ? await readFile(suppliedBundle, "utf8")
      : (
          await build({
            entryPoints: ["src/app/components/stacks/audio/sceneAudio.ts"],
            bundle: true,
            format: "iife",
            globalName: "SceneAudioModule",
            write: false,
          })
        ).outputFiles[0].text;
    report.bundleSha256 = createHash("sha256").update(bundle).digest("hex");
    server = createServer(async (req, res) => {
      if (req.url === "/") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          "<!doctype html><title>Audio lifetime allocation fixture</title>",
        );
        return;
      }
      if (
        !/^\/audio\/[a-z0-9/.-]+\.ogg$/.test(req.url ?? "") ||
        req.url.includes("..")
      ) {
        res.writeHead(404).end();
        return;
      }
      try {
        const bytes = await readFile(
          path.join(process.cwd(), "public", req.url),
        );
        res.setHeader("Content-Type", "audio/ogg");
        res.end(bytes);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (let repeat = 0; repeat < repetitions; repeat += 1) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await page.goto(origin);
      await page.addScriptTag({ content: bundle });
      const before = await memory(page, cdp);
      const allocation = await page.evaluate(async () => {
        const { SceneAudioRuntime } = SceneAudioModule;
        const runtime = new SceneAudioRuntime();
        const originalDecode = AudioContext.prototype.decodeAudioData;
        const originalFetch = window.fetch;
        const failedResponses = [];
        const decodedSampleRates = new Set();
        let fetches = 0;
        let decodes = 0;
        let pcmBytes = 0;
        let releaseOld;
        let markOldReady;
        const oldReady = new Promise((resolve) => {
          markOldReady = resolve;
        });
        const oldGate = new Promise((resolve) => {
          releaseOld = resolve;
        });
        window.fetch = (...args) => {
          fetches += 1;
          return originalFetch(...args).then((response) => {
            if (response.status !== 200)
              failedResponses.push({
                url: String(args[0]),
                status: response.status,
              });
            return response;
          });
        };
        AudioContext.prototype.decodeAudioData = async function (data) {
          const index = ++decodes;
          const buffer = await originalDecode.call(this, data);
          decodedSampleRates.add(buffer.sampleRate);
          pcmBytes += buffer.length * buffer.numberOfChannels * 4;
          if (index === 1) {
            markOldReady();
            await oldGate;
          }
          return buffer;
        };
        try {
          runtime.unlock();
          const oldLoad = runtime.loading;
          let readyTimeout;
          try {
            await Promise.race([
              oldReady,
              new Promise((_, reject) => {
                readyTimeout = setTimeout(
                  () =>
                    reject(
                      new Error(
                        `First native decode never completed: ${JSON.stringify(failedResponses)}`,
                      ),
                    ),
                  15000,
                );
              }),
            ]);
          } finally {
            clearTimeout(readyTimeout);
          }
          runtime.teardown();
          runtime.unlock();
          await runtime.loading;
          const replacementReady = { fetches, decodes, pcmBytes };
          releaseOld();
          await oldLoad;
          return {
            replacementReady,
            settled: { fetches, decodes, pcmBytes },
            failedResponses,
            decodedSampleRates: [...decodedSampleRates],
          };
        } finally {
          releaseOld();
          runtime.teardown();
          window.fetch = originalFetch;
          AudioContext.prototype.decodeAudioData = originalDecode;
        }
      });
      assert.deepEqual(
        allocation.failedResponses,
        [],
        "audio fixture returned a non-200 response",
      );
      assert.equal(
        allocation.replacementReady.decodes,
        13,
        "replacement must fully load all 12 real sound assets",
      );
      const after = await memory(page, cdp);
      report.results.push({ repeat, before, allocation, after });
      console.log(JSON.stringify(report.results.at(-1)));
      await context.close();
    }
    if (args.includes("--assert")) {
      for (const result of report.results) {
        assert.equal(
          result.allocation.settled.decodes,
          13,
          "stale audio session decoded replacement assets",
        );
        assert.deepEqual(
          result.allocation.settled,
          result.allocation.replacementReady,
        );
      }
    }
  } else if (suite === "scene") {
    report.base = base;
    report.buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
    report.viewport = { width: 1440, height: 900, deviceScaleFactor: 2 };
    for (const profile of ["basic", "no-meadow", "full"]) {
      for (let repeat = 0; repeat < repetitions; repeat += 1) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 2,
        });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.addInitScript(() => {
          window.__assetCounts = {
            imageDecodes: 0,
            imageDecodeUrls: {},
            audioDecodes: 0,
            audioPcmBytes: 0,
          };
          const decode = HTMLImageElement.prototype.decode;
          HTMLImageElement.prototype.decode = function () {
            window.__assetCounts.imageDecodes += 1;
            const url = (this.currentSrc || this.src).slice(0, 240);
            window.__assetCounts.imageDecodeUrls[url] =
              (window.__assetCounts.imageDecodeUrls[url] ?? 0) + 1;
            return decode.call(this);
          };
          const decodeAudio = AudioContext.prototype.decodeAudioData;
          AudioContext.prototype.decodeAudioData = async function (data) {
            window.__assetCounts.audioDecodes += 1;
            const buffer = await decodeAudio.call(this, data);
            window.__assetCounts.audioPcmBytes +=
              buffer.length * buffer.numberOfChannels * 4;
            return buffer;
          };
        });
        const query =
          profile === "basic"
            ? "quality=safety&nomeadow&nopostfx"
            : profile === "no-meadow"
              ? "quality=showcase&nomeadow"
              : "quality=showcase";
        await page.goto(`${base}/?hud=1&${query}`, {
          waitUntil: "domcontentloaded",
        });
        await page.waitForFunction(
          () =>
            window.__stacks?.state().controlsReady &&
            document.documentElement.dataset.world === "ready" &&
            document.documentElement.dataset.roomView === "live",
          null,
          { timeout: 180_000 },
        );
        // Unlock real audio, then visit all units before the retained-heap baseline.
        await page.keyboard.press("Shift");
        await page.waitForFunction(
          () => window.__stacks.state().audio.unlocked === true,
        );
        const traverse = async () => {
          for (const unit of [0, 1, 2, 3, 4, 5, 6, 0]) {
            await page.evaluate(
              (unit) => window.__stacks.scrollTo(unit, { instant: true }),
              unit,
            );
            await page.waitForFunction(
              (unit) => window.__stacks.state().activeUnit === unit,
              unit,
              { timeout: 30_000 },
            );
            await page.waitForTimeout(300);
          }
        };
        await traverse();
        await page.waitForTimeout(3000);
        const samples = [];
        const sample = async (cycle) => {
          const state = await page.evaluate(() => ({
            assets: window.__assetCounts,
            scene: window.__stacks.state(),
          }));
          assert.equal(
            state.scene.audio.unlocked,
            true,
            "audio must remain unlocked",
          );
          assert.ok(Number.isFinite(state.scene.quality.effectiveDpr));
          assert.ok(Number.isFinite(state.scene.quality.physicalPixels));
          samples.push({ cycle, memory: await memory(page, cdp), ...state });
        };
        await cdp.send("HeapProfiler.startSampling", {
          samplingInterval: 32768,
        });
        await sample(0);
        for (let cycle = 1; cycle <= cycles; cycle += 1) {
          await traverse();
          // The real R key switches the retained 3D room to 2D and back.
          await page.keyboard.press("r");
          await page.waitForFunction(
            () => document.documentElement.dataset.roomView === "illustrated",
            null,
            { timeout: 30_000 },
          );
          await page.waitForTimeout(700);
          await page.keyboard.press("r");
          await page.waitForFunction(
            () =>
              window.__stacks?.state().controlsReady &&
              document.documentElement.dataset.world === "ready" &&
              document.documentElement.dataset.roomView === "live",
            null,
            { timeout: 60_000 },
          );
          await page.waitForTimeout(700);
          await sample(cycle);
        }
        const allocation = await cdp.send("HeapProfiler.stopSampling");
        await writeFile(
          `${out}.${profile}.${repeat}.allocations.json`,
          JSON.stringify(allocation),
        );
        const resolution = samples.map(({ scene }) => ({
          dpr: scene.quality.effectiveDpr,
          pixels: scene.quality.physicalPixels,
        }));
        const constantResolution = resolution.every(
          (value) => JSON.stringify(value) === JSON.stringify(resolution[0]),
        );
        assert.equal(
          constantResolution,
          true,
          "resolved resolution changed between memory samples",
        );
        const journals = samples.map(({ scene }) => scene.quality.transitions);
        assert.ok(
          journals.every(Array.isArray),
          "quality transition journal is missing",
        );
        const constantQualityTransitions = journals.every(
          (value) => JSON.stringify(value) === JSON.stringify(journals[0]),
        );
        assert.equal(
          constantQualityTransitions,
          true,
          "quality axes changed during the memory trial",
        );
        const points = samples
          .filter(({ cycle }) => cycle >= 2)
          .map(({ cycle, memory }) => [cycle, memory.usedSize]);
        const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
        const meanY = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
        const slope =
          points.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0) /
          points.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
        const total = points.reduce((sum, [, y]) => sum + (y - meanY) ** 2, 0);
        const residual = points.reduce(
          (sum, [x, y]) => sum + (y - meanY - slope * (x - meanX)) ** 2,
          0,
        );
        const heapFit = {
          fromCycle: 2,
          bytesPerCycle: slope,
          rSquared: total === 0 ? 1 : 1 - residual / total,
          constantResolution,
          constantQualityTransitions,
        };
        report.results.push({
          profile,
          repeat,
          query,
          samples,
          errors,
          heapFit,
        });
        console.log(
          JSON.stringify({
            profile,
            repeat,
            heapFit,
            samples: samples.map(({ cycle, memory, assets }) => ({
              cycle,
              memory,
              assets,
            })),
            errors,
          }),
        );
        await context.close();
      }
    }
  } else throw new Error(`Unknown suite ${suite}`);
} finally {
  clearTimeout(watchdog);
  await writeFile(out, JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}

// Production-only comparison. Start Next separately, then run:
// BASE=http://localhost:3117 node scripts/stacks-gpu-detail-benchmark.mjs --out /tmp/gpu-detail.json
// Cold cells use fresh browser processes and cache directories; warm reloads reuse them.
// Headless Chromium is not a physical 120 Hz display. Report intervals against
// the 8.333 ms budget without claiming that its RAF cadence emulates a panel.
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (key, fallback) => {
  const index = args.indexOf(`--${key}`);
  return index < 0 ? fallback : args[index + 1];
};
const base = process.env.BASE ?? "http://localhost:3117";
const output = option("out", "/tmp/stacks-gpu-detail.json");
const profiles = option("profiles", "basic,no-meadow,full").split(",");
const repeats = Number(option("repeats", "2"));
const seconds = Number(option("seconds", "6"));
const gpu = args.includes("--gpu");
const cycles = Number(option("cycles", "2"));
const theme = option("theme", "light");
const preflightScript = option("preflight", null);
async function preflight(tag) {
  if (!preflightScript) return { verdict: "not-run" };
  const path = `${output}.${tag}.json`;
  spawnSync(
    "python3",
    [
      preflightScript,
      "--author",
      "gpu-detail-codex",
      "--tag",
      tag,
      "--json",
      path,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(await readFile(path, "utf8"));
}
const beforePreflight = await preflight("before");
if (args.includes("--require-quiet") && beforePreflight.verdict !== "quiet") {
  throw new Error(
    `Machine preflight is ${beforePreflight.verdict}; see ${output}.before.json`,
  );
}
const queries = {
  basic: "&nomeadow=1&nopostfx=1",
  "no-meadow": "&nomeadow=1",
  full: "",
};
for (const profile of profiles) {
  if (!(profile in queries)) throw new Error(`Unknown profile: ${profile}`);
}

const summarize = (values, cadence = null) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const p = (q) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)];
  return {
    count: sorted.length,
    totalMs: values.reduce((a, b) => a + b, 0),
    p50: p(0.5),
    p95: p(0.95),
    p99: p(0.99),
    max: sorted.at(-1),
    long50: sorted.filter((v) => v > 50).length,
    long100: sorted.filter((v) => v > 100).length,
    ...(cadence
      ? {
          observedCadenceMs: cadence,
          missedCadenceIntervals: sorted.filter((v) => v > cadence * 1.5)
            .length,
          missedCadenceSlots: sorted.reduce(
            (n, v) => n + Math.max(0, Math.round(v / cadence) - 1),
            0,
          ),
          // Only name a 120 Hz miss count when the idle compositor demonstrates it.
          ...(cadence >= 7.5 && cadence <= 9.2
            ? { missed120: sorted.filter((v) => v > 12.5).length }
            : {}),
        }
      : {}),
  };
};
const fixedWorkload = (scene) => {
  if (!Array.isArray(scene.quality?.transitions))
    throw new Error("Missing quality controller transition journal");
  return JSON.stringify({
    framebuffer: scene.framebuffer,
    effectiveDpr: scene.quality.effectiveDpr,
    physicalPixels: scene.quality.physicalPixels,
    axes: scene.quality.axes,
    transitions: scene.quality.transitions,
    postprocessing: scene.quality.postprocessing,
    contentTier: scene.quality.contentTier,
    meadowRung: scene.quality.meadowRung,
  });
};
const report = {
  browser: null,
  gpuTimerAvailable: null,
  measurementScope:
    "Headless RAF intervals, calibrated against an idle page; no physical 120 Hz presentation claim. GPU-instrumented runs omit frame-time summaries. Renderer state counters are end-window snapshots, not frame-aligned samples.",
  profileDefinitions: queries,
  gpuInstrumented: gpu,
  viewport: [1440, 900],
  deviceDpr: 2,
  targetHz: 120,
  theme,
  preflight: { before: beforePreflight },
  timingVerdict: "exploratory",
  runs: [],
};
try {
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const profile of repeat % 2 ? [...profiles].reverse() : profiles) {
      const cacheDirectory = await mkdtemp(join(tmpdir(), "gpu-detail-cache-"));
      const browser = await chromium.launch({
        headless: true,
        args: [
          "--enable-gpu",
          "--use-angle=metal",
          "--enable-webgl",
          "--ignore-gpu-blocklist",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          `--disk-cache-dir=${cacheDirectory}`,
        ],
      });
      report.browser = browser.version();
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      });
      await context.addInitScript(
        ({ gpu, theme }) => {
          localStorage.setItem("theme", theme);
          const state = {
            frames: [],
            timestamps: [],
            missingHookFrames: 0,
            longTasks: [],
            gpu: [],
            counters: {},
            active: false,
            renderer: null,
            timerAvailable: false,
            qualityChanges: [],
            foregroundFailures: 0,
            epoch: 0,
            disjoint: false,
          };
          const bootLongTasks = [];
          let bootComplete = false;
          let lastQuality = null;
          let sampleIndex = 0;
          let sceneRenderer = null;
          if (gpu) {
            const devtools = new EventTarget();
            devtools.addEventListener("observe", (event) => {
              if (event.detail?.isWebGLRenderer) sceneRenderer = event.detail;
            });
            window.__THREE_DEVTOOLS__ = devtools;
          }
          let last = 0;
          const tick = (at) => {
            requestAnimationFrame(tick);
            if (state.active) {
              if (last) state.frames.push(at - last);
              state.timestamps.push(at);
              if (
                document.visibilityState !== "visible" ||
                !document.hasFocus()
              )
                state.foregroundFailures++;
              if (!window.__stacks) state.missingHookFrames++;
              if (sampleIndex++ % 30 === 0) {
                const q = window.__stacks?.quality();
                if (
                  q &&
                  (!lastQuality ||
                    [
                      "profile",
                      "effectiveDpr",
                      "physicalPixels",
                      "postprocessing",
                      "contentTier",
                      "meadowRung",
                      "cloudDetail",
                    ].some((key) => q[key] !== lastQuality[key]))
                ) {
                  state.qualityChanges.push({
                    at,
                    profile: q.profile,
                    dpr: q.effectiveDpr,
                    physicalPixels: q.physicalPixels,
                    postprocessing: q.postprocessing,
                    contentTier: q.contentTier,
                    meadowRung: q.meadowRung,
                    cloudDetail: q.cloudDetail,
                  });
                }
                lastQuality = q;
              }
            }
            last = at;
          };
          requestAnimationFrame(tick);
          new PerformanceObserver((list) => {
            if (!bootComplete)
              bootLongTasks.push(
                ...list
                  .getEntries()
                  .map((e) => ({ at: e.startTime, ms: e.duration })),
              );
            if (state.active)
              state.longTasks.push(...list.getEntries().map((e) => e.duration));
          }).observe({ type: "longtask", buffered: true });
          if (gpu) {
            const contexts = new WeakMap();
            const proto = WebGL2RenderingContext.prototype;
            for (const method of [
              "drawArrays",
              "drawElements",
              "drawArraysInstanced",
              "drawElementsInstanced",
              "clear",
              "texImage2D",
              "texSubImage2D",
              "bufferData",
              "bufferSubData",
              "linkProgram",
              "createTexture",
              "deleteTexture",
              "createFramebuffer",
              "deleteFramebuffer",
            ]) {
              const original = proto[method];
              proto[method] = function (...args) {
                state.counters[method] = (state.counters[method] ?? 0) + 1;
                if (
                  state.active &&
                  (method.startsWith("draw") || method === "clear")
                ) {
                  let record = contexts.get(this);
                  if (!record) {
                    const ext = this.getExtension(
                      "EXT_disjoint_timer_query_webgl2",
                    );
                    const debug = this.getExtension(
                      "WEBGL_debug_renderer_info",
                    );
                    state.renderer = debug
                      ? this.getParameter(debug.UNMASKED_RENDERER_WEBGL)
                      : this.getParameter(this.RENDERER);
                    state.timerAvailable = !!ext;
                    record = { ext, pending: [], open: false };
                    contexts.set(this, record);
                  }
                  const { ext, pending } = record;
                  if (ext && !record.open) {
                    if (this.getParameter(ext.GPU_DISJOINT_EXT)) {
                      state.disjoint = true;
                      state.gpu = [];
                      for (const { query } of pending.splice(0))
                        this.deleteQuery(query);
                    }
                    while (
                      pending.length &&
                      this.getQueryParameter(
                        pending[0].query,
                        this.QUERY_RESULT_AVAILABLE,
                      )
                    ) {
                      const { query, epoch } = pending.shift();
                      if (!state.disjoint && epoch === state.epoch)
                        state.gpu.push(
                          this.getQueryParameter(query, this.QUERY_RESULT) /
                            1e6,
                        );
                      this.deleteQuery(query);
                    }
                    // Bound driver query allocations if results stop arriving.
                    if (
                      pending.length < 8 &&
                      !this.getQuery(ext.TIME_ELAPSED_EXT, this.CURRENT_QUERY)
                    ) {
                      const query = this.createQuery();
                      const epoch = state.epoch;
                      this.beginQuery(ext.TIME_ELAPSED_EXT, query);
                      record.open = true;
                      queueMicrotask(() => {
                        this.endQuery(ext.TIME_ELAPSED_EXT);
                        pending.push({ query, epoch });
                        record.open = false;
                      });
                    }
                  }
                }
                return original.apply(this, args);
              };
            }
          }
          window.__gpuDetail = {
            boot: () => ({
              longTasks: bootLongTasks,
              focused: document.hasFocus(),
              visibility: document.visibilityState,
            }),
            start() {
              bootComplete = true;
              state.frames = [];
              state.timestamps = [];
              state.missingHookFrames = 0;
              sampleIndex = 0;
              state.longTasks = [];
              state.gpu = [];
              state.counters = {};
              state.qualityChanges = [];
              state.foregroundFailures = 0;
              state.disjoint = false;
              state.epoch++;
              lastQuality = null;
              last = 0;
              state.active = true;
              window.__stacks.measure("start");
            },
            stop() {
              state.active = false;
              window.__stacks.measure("stop");
              return {
                ...state,
                heap: performance.memory?.usedJSHeapSize ?? null,
                programReferences:
                  sceneRenderer?.info.programs?.reduce(
                    (sum, program) => sum + program.usedTimes,
                    0,
                  ) ?? null,
              };
            },
          };
        },
        { gpu, theme },
      );
      const page = await context.newPage();
      await page.bringToFront();
      const idleFrames = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const frames = [];
            let last = 0;
            const tick = (at) => {
              if (last) frames.push(at - last);
              last = at;
              if (frames.length >= 120) resolve(frames);
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
      );
      const idle = summarize(idleFrames);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        for (const cache of ["cold", "warm"]) {
          const errorStart = errors.length;
          const started = Date.now();
          await page.goto(
            `${base}/?quality=showcase&harness=1${queries[profile]}`,
            { waitUntil: "commit" },
          );
          await page.waitForFunction(
            () =>
              document.documentElement.dataset.world === "ready" &&
              window.__stacks?.state().controlsReady,
            null,
            { timeout: 180_000 },
          );
          const run = {
            repeat,
            profile,
            cache,
            cacheDefinition:
              cache === "cold"
                ? "fresh browser process, profile and disk cache; OS/driver caches uncontrolled"
                : "same-process warm reload",
            idle: { ...idle, rawIntervals: idleFrames },
            readyMs: Date.now() - started,
            boot: await page.evaluate(() => window.__gpuDetail.boot()),
            phases: [],
            errors: [],
          };
          for (const [phase, unit] of [
            ["settle", 0],
            ...Array.from({ length: cycles }, (_, index) => [
              [`outbound-${index + 1}`, 6],
              [`return-${index + 1}`, 0],
            ]).flat(),
            ["rest", 0],
          ]) {
            const before = await page.evaluate(() => window.__stacks.state());
            await page.evaluate((unit) => {
              window.__gpuDetail.start();
              window.__stacks.scrollTo(unit);
            }, unit);
            if (phase.startsWith("outbound-") || phase.startsWith("return-")) {
              await page.waitForFunction(
                (unit) => {
                  const stacks = window.__stacks;
                  if (stacks?.quality().moving !== false) return false;
                  // Avoid allocating the full scene inventory on every travel frame.
                  return stacks.state().activeUnit === unit;
                },
                unit,
                { timeout: 30_000, polling: 200 },
              );
            } else {
              await page.waitForTimeout(seconds * 1000);
            }
            // The renderer inventory is an end-window snapshot; command totals
            // come from the GL counters, never from a potentially stale gl.info frame.
            const captured = await page.evaluate(() => ({
              sample: window.__gpuDetail.stop(),
              scene: window.__stacks.state(),
            }));
            run.phases.push({
              phase,
              before,
              ...captured,
              frameMs: gpu ? null : summarize(captured.sample.frames, idle.p50),
              gpuMs: summarize(captured.sample.gpu),
              valid:
                captured.sample.frames.length > 0 &&
                captured.sample.missingHookFrames === 0 &&
                captured.sample.foregroundFailures === 0 &&
                captured.sample.qualityChanges.length === 1 &&
                fixedWorkload(before) === fixedWorkload(captured.scene),
            });
          }
          run.errors = errors.slice(errorStart);
          if (gpu) {
            report.gpuTimerAvailable = run.phases.some(
              (p) => p.sample.timerAvailable,
            );
            if (!report.gpuTimerAvailable)
              console.error(
                "GPU TIMER UNAVAILABLE: counters only; no GPU-time evidence.",
              );
          }
          report.runs.push(run);
          await writeFile(output, JSON.stringify(report, null, 2));
          console.log(
            JSON.stringify({
              repeat,
              profile,
              cache,
              readyMs: run.readyMs,
              phases: run.phases.map((p) => ({
                phase: p.phase,
                frameMs: p.frameMs,
                gpuMs: p.gpuMs,
                programs: p.scene.programs,
                textures: p.scene.textures,
              })),
            }),
          );
        }
      } finally {
        await context.close();
        await browser.close();
        await rm(cacheDirectory, { recursive: true, force: true });
      }
    }
  }
} finally {
  report.preflight.after = await preflight("after");
  report.timingVerdict =
    report.preflight.before.verdict === "quiet" &&
    report.preflight.after.verdict === "quiet" &&
    report.runs.length === profiles.length * repeats * 2 &&
    report.runs.every(
      (run) =>
        run.errors.length === 0 &&
        run.boot.focused &&
        run.boot.visibility === "visible" &&
        run.phases.every((phase) => phase.valid),
    )
      ? "quiet-controlled"
      : "provisional";
  await writeFile(output, JSON.stringify(report, null, 2));
}

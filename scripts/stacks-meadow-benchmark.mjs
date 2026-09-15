// Meadow performance benchmark: one command, one JSON file, two kinds of
// number that must never be confused.
//
//   node scripts/stacks-meadow-benchmark.mjs --label before --out /tmp/before.json
//   BASE=http://localhost:3121 node scripts/stacks-meadow-benchmark.mjs --cases full,basic,no-meadow
//
// WHY TWO KINDS. Draw calls, instanced draws, submitted vertices, program
// count and instance totals come from a wrapper installed on
// WebGL2RenderingContext before any module loads. They are exact integers and
// a busy machine cannot move them, so they stay quotable on a contended host.
// Frame times cannot: another lane's browser, a build, or the owner's window
// changes them. Every timing block therefore carries the preflight verdict
// that was recorded around it, and a run taken while the host was contended
// is written out with `quotable: false`.
//
// WHAT IT MEASURES. Three cases by default — the production-shaped scene
// (`full`), the same scene with the meadow off (`no-meadow`, the control that
// isolates this lane's subject), and the constrained rung (`basic`). Each case
// is sampled at rest and across a scripted traverse of every unit, because a
// meadow that is free while the camera is parked can still dominate a travel.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const base = process.env.BASE ?? "http://localhost:3121";
const label = opt("label", "run");
const outPath = opt("out", null);
const restSeconds = Number(opt("rest", "8"));
const repeats = Number(opt("repeats", "2"));
const viewport = { width: 1440, height: 900 };
const deviceScaleFactor = Number(opt("dpr", "2"));
const units = opt("units", "0,1,2,3,4,5,6").split(",").map(Number);

/** Every case names its hypothesis in its URL. `quality` is forced by name so
 * Auto cannot quietly move the workload between two runs a week apart. */
const CASES = {
  full: "?quality=showcase&hud=1",
  basic: "?quality=safety&hud=1",
  "no-meadow": "?quality=showcase&hud=1&perf-profile=no-meadow",
  "full-no-postfx": "?quality=showcase&hud=1&nopostfx=1",
};
const selected = opt("cases", "full,no-meadow,basic")
  .split(",")
  .map((name) => name.trim());
for (const name of selected)
  if (!CASES[name]) throw new Error(`Unknown case "${name}"`);

const PREFLIGHT = path.resolve(
  process.env.HOME ?? "",
  "Desktop/Agents/research/personal-website-performance-overnight/tools/preflight.py",
);
/** The shared quiet-host gate. Absent, the run still happens and every timing
 * block is marked unquotable rather than silently trusted. */
function preflight(tag) {
  if (!fs.existsSync(PREFLIGHT)) return { verdict: "unavailable", tag };
  const file = path.join(
    fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "meadow-pf-")),
    "pf.json",
  );
  try {
    execFileSync(
      "python3",
      [PREFLIGHT, "--author", "meadow-claude", "--tag", tag, "--json", file],
      { stdio: "ignore" },
    );
  } catch {
    // Exit 2 means contended, which is a result, not a failure.
  }
  try {
    return { ...JSON.parse(fs.readFileSync(file, "utf8")), tag };
  } catch {
    return { verdict: "unavailable", tag };
  }
}

const quantile = (sorted, q) =>
  sorted.length === 0
    ? null
    : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/** Wrap the GL context before any application module runs. Counts only. */
const glCounter = () => {
  const P = WebGL2RenderingContext.prototype;
  const blank = () => ({
    draws: 0,
    instDraws: 0,
    instances: 0,
    verts: 0,
    useProgram: 0,
    bindFB: 0,
    texUpload: 0,
    bufUpload: 0,
  });
  let frame = blank();
  let frames = [];
  let recording = false;
  const wrap = (name, fn) => {
    const original = P[name];
    if (!original) return;
    P[name] = function (...a) {
      fn(a);
      return original.apply(this, a);
    };
  };
  const draw = (verts, instanced, instances) => {
    frame.draws += 1;
    frame.verts += verts;
    if (instanced) {
      frame.instDraws += 1;
      frame.instances += instances;
    }
  };
  wrap("drawElements", (a) => draw(a[1], false, 0));
  wrap("drawArrays", (a) => draw(a[2], false, 0));
  wrap("drawElementsInstanced", (a) => draw(a[1] * a[4], true, a[4]));
  wrap("drawArraysInstanced", (a) => draw(a[2] * a[3], true, a[3]));
  wrap("useProgram", () => (frame.useProgram += 1));
  wrap("bindFramebuffer", () => (frame.bindFB += 1));
  wrap("texImage2D", () => (frame.texUpload += 1));
  wrap("texSubImage2D", () => (frame.texUpload += 1));
  wrap("bufferData", () => (frame.bufUpload += 1));
  wrap("bufferSubData", () => (frame.bufUpload += 1));
  // Frame pacing is sampled here rather than through the app's own sampler on
  // purpose. `window.__stacks.measure` only records while the full
  // diagnostics harness is mounted, and mounting it changes the workload
  // being measured (StacksCanvas marks those frames instrumented so Auto
  // ignores them). A requestAnimationFrame clock installed before the app
  // loads measures what the visitor actually sees — presentation pacing,
  // including GPU backpressure — and adds nothing to the scene.
  let intervals = [];
  let previous = 0;
  const tick = (now) => {
    if (recording) {
      if (frame.draws > 0) frames.push(frame);
      if (previous > 0) intervals.push(now - previous);
    }
    previous = now;
    frame = blank();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__meadowGl = {
    start: () => {
      frames = [];
      intervals = [];
      previous = 0;
      recording = true;
    },
    stop: () => {
      recording = false;
      return { frames, intervals };
    },
  };
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0
    ? null
    : sorted[Math.floor((sorted.length - 1) / 2)];
};

/** Collapse a window of per-frame GL tallies into the integers a reader can
 * compare across machines. Medians, not means: one boot frame that uploads a
 * texture must not move the steady-state number. */
const summarizeGl = (frames) => {
  if (frames.length === 0) return null;
  const keys = Object.keys(frames[0]);
  const out = { frames: frames.length };
  for (const key of keys) out[key] = median(frames.map((f) => f[key]));
  return out;
};

/** Presentation pacing from the rAF clock. `over120Hz`/`over60Hz` count the
 * frames that missed each budget: a mean hides exactly the stalls a visitor
 * notices, and this scene's target on the owner's panel is 120Hz. */
function summarizePacing(intervals) {
  if (!intervals || intervals.length === 0) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const round = (value) =>
    value === null ? null : Number(value.toFixed(2));
  return {
    frames: sorted.length,
    fps: round(1000 / (sorted.reduce((sum, v) => sum + v, 0) / sorted.length)),
    p50: round(quantile(sorted, 0.5)),
    p95: round(quantile(sorted, 0.95)),
    p99: round(quantile(sorted, 0.99)),
    max: round(sorted[sorted.length - 1]),
    missed120Hz: sorted.filter((v) => v > 1000 / 120 * 1.5).length,
    missed60Hz: sorted.filter((v) => v > 1000 / 60 * 1.5).length,
  };
}

async function sample(page, { seconds, traverse }) {
  await page.evaluate(() => {
    window.__stacks.measure("reset");
    window.__stacks.measure("start");
    window.__meadowGl.start();
  });
  const deadline = Date.now() + seconds * 1000;
  if (traverse) {
    let index = 0;
    while (Date.now() < deadline) {
      const unit = units[index % units.length];
      index += 1;
      await page.evaluate((i) => window.__stacks.scrollTo(i), unit);
      await page
        .waitForFunction(
          (i) => window.__stacks.state().activeUnit === i,
          unit,
          { timeout: 20_000 },
        )
        .catch(() => undefined);
      await page.waitForTimeout(400);
    }
  } else {
    await page.waitForTimeout(seconds * 1000);
  }
  return page.evaluate(() => {
    const measurement = window.__stacks.measure("stop");
    const { frames: glFrames, intervals } = window.__meadowGl.stop();
    const state = window.__stacks.state();
    const memory = performance.memory ?? null;
    return {
      measurement,
      glFrames,
      intervals,
      focused: document.hasFocus(),
      visibility: document.visibilityState,
      renderer: {
        calls: state.calls,
        triangles: state.triangles,
        programs: state.programs,
        textures: state.textures,
        geometries: state.geometries,
      },
      quality: {
        profile: state.quality?.profile ?? null,
        effectiveDpr: state.quality?.effectiveDpr ?? null,
        meadowRung: state.quality?.meadowRung ?? null,
        contentTier: state.quality?.contentTier ?? null,
        postprocessing: state.quality?.postprocessing ?? null,
        transitions: state.quality?.transitions?.length ?? null,
        metrics: state.quality?.metrics ?? null,
      },
      heapMb: memory
        ? Math.round(memory.usedJSHeapSize / 1024 / 1024)
        : null,
    };
  });
}

const browser = await chromium.launch({
  headless: true,
  // Metal ANGLE keeps real GL on darwin; SwiftShader loses the context
  // compiling this scene, and a software renderer would make every timing
  // number describe the CPU rasterizer instead of the meadow.
  args: [
    "--enable-gpu",
    "--use-angle=metal",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ],
});

const report = {
  label,
  base,
  startedAt: new Date().toISOString(),
  viewport,
  deviceScaleFactor,
  repeats,
  restSeconds,
  // The revision the SERVED BUILD came from. It is an explicit flag, not
  // `git rev-parse HEAD`, because the working tree routinely moves ahead of
  // the .next the server is still serving, and a benchmark that guesses this
  // wrong attributes a change to the wrong commit.
  buildRev:
    opt("rev", null) ??
    (() => {
      try {
        return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
          .trim();
      } catch {
        return null;
      }
    })(),
  renderer: null,
  preflight: { before: preflight(`${label}-before`), after: null },
  cases: {},
};

try {
  for (const name of selected) {
    report.cases[name] = { query: CASES[name], runs: [] };
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      // A fresh context per repeat: a warm shader cache and a warm texture
      // cache are a different workload, and mixing them inside one case is
      // how a benchmark starts measuring its own ordering.
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor,
      });
      await context.addInitScript(glCounter);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
      const bootStart = Date.now();
      await page.goto(base + "/" + CASES[name], { waitUntil: "commit" });
      await page.waitForFunction(
        () =>
          document.documentElement.dataset.world === "ready" &&
          window.__stacks?.state?.().controlsReady === true,
        null,
        { timeout: 120_000 },
      );
      const bootMs = Date.now() - bootStart;
      report.renderer ??= await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2");
        const debug = gl?.getExtension("WEBGL_debug_renderer_info");
        return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
      });
      // Let the quality controller's first decisions land before sampling.
      await page.waitForTimeout(4000);
      const rest = await sample(page, { seconds: restSeconds, traverse: false });
      const travel = await sample(page, {
        seconds: restSeconds,
        traverse: true,
      });
      report.cases[name].runs.push({
        repeat,
        bootMs,
        errors,
        rest: {
          ...rest,
          glFrames: summarizeGl(rest.glFrames),
          pacing: summarizePacing(rest.intervals),
          intervals: undefined,
        },
        travel: {
          ...travel,
          glFrames: summarizeGl(travel.glFrames),
          pacing: summarizePacing(travel.intervals),
          intervals: undefined,
        },
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

report.preflight.after = preflight(`${label}-after`);
const quiet =
  report.preflight.before?.verdict === "quiet" &&
  report.preflight.after?.verdict === "quiet";
report.timingQuotable = quiet;
report.countsQuotable = true;
report.finishedAt = new Date().toISOString();

const line = (name, phase, run) => {
  const p = run[phase].pacing ?? {};
  const g = run[phase].glFrames ?? {};
  return [
    name.padEnd(16),
    phase.padEnd(7),
    `draws ${String(g.draws ?? "-").padStart(4)}`,
    `inst ${String(g.instDraws ?? "-").padStart(3)}`,
    `kverts ${String(Math.round((g.verts ?? 0) / 1000)).padStart(5)}`,
    `fps ${String(p.fps ?? "-").padStart(6)}`,
    `p50 ${String(p.p50 ?? "-").padStart(6)}`,
    `p95 ${String(p.p95 ?? "-").padStart(6)}`,
    `p99 ${String(p.p99 ?? "-").padStart(6)}`,
    `miss120 ${String(p.missed120Hz ?? "-").padStart(4)}`,
    `heap ${String(run[phase].heapMb ?? "-").padStart(4)}MB`,
  ].join("  ");
};

console.log(`## meadow benchmark "${label}"  ${report.buildRev ?? ""}`);
console.log(`renderer: ${report.renderer}`);
console.log(
  `preflight before=${report.preflight.before?.verdict} after=${report.preflight.after?.verdict} -> timing ${quiet ? "QUOTABLE" : "PROVISIONAL (counts still exact)"}`,
);
for (const [name, entry] of Object.entries(report.cases))
  for (const run of entry.runs)
    for (const phase of ["rest", "travel"])
      console.log(line(`${name}#${run.repeat}`, phase, run));

if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`wrote ${outPath}`);
}

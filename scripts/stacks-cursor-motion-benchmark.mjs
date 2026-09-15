// Cursor-motion benchmark: what a moving mouse costs the room.
//
// The question this answers is not "how fast is the scene" but "how much
// worse does the scene get WHILE THE POINTER MOVES". So every quality setting
// is measured twice against itself: once with the cursor parked, once with it
// sweeping across the shelf at a fixed rate. The delta between those two runs
// is the pointer pipeline's bill, and it is the only number here that a
// change to that pipeline is allowed to claim.
//
// Two instruments, because frame pacing alone cannot name a cause:
//   - `window.__stacks.measure()` reports the r3f frame interval (p50/p95/p99
//     and the dropped-frame ratio). That is what the visitor feels.
//   - A `devtools.timeline` trace reports EventDispatch entries whose type is
//     `pointermove`. That is where the time goes, and it is attributable to
//     the hover raycast rather than to anything the renderer does.
//
// Usage:
//   node scripts/stacks-cursor-motion-benchmark.mjs \
//     --base=http://localhost:3121 --out=/tmp/cursor-baseline.json
//
// Run it through the overnight benchmark lock so two lanes never time the
// same machine at once.
import fs from "node:fs/promises";
import { chromium } from "playwright";

const arg = (name, fallback) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(
    name.length + 3,
  ) ?? fallback;

const base = arg("base", "http://localhost:3121");
const out = arg("out", "/tmp/stacks-cursor-motion.json");
const repeats = Number(arg("repeat", "3"));
const holdMs = Number(arg("hold", "6000"));
const sweepMs = Number(arg("sweep", "6000"));
// One pointer move every 8ms is a 125Hz stream: at or just above what a
// ProMotion display asks for, so the browser coalesces the way it would for a
// real hand rather than receiving an unrealistic burst.
const moveIntervalMs = Number(arg("moveInterval", "8"));
const only = arg("only", null);
const skipDiagnosis = process.argv.includes("--no-diagnosis");

const VIEWPORT = { width: 1440, height: 900 };

/** The two settings the lane brief names. `basic` is the low rung with the
 * meadow off; `full` is the top forced rung. `hud=1` installs the read-only
 * `window.__stacks` hooks without mounting the expensive diagnostic probes,
 * so measuring does not change the workload being measured. */
const SETTINGS = [
  { id: "basic-no-meadow", search: "?hud=1&quality=safety&nomeadow" },
  { id: "full-showcase", search: "?hud=1&quality=showcase" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sweep the cursor horizontally across the middle band of the shelf, turning
 * around at the edges. Left of the dock and above the placard, so the path
 * crosses real props rather than empty sky. */
function sweepPoint(elapsed) {
  const x0 = 260;
  const x1 = 980;
  // 1.4s for a full there-and-back pass: a browsing speed, not a flick.
  const phase = (elapsed % 1400) / 1400;
  const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  return {
    x: x0 + (x1 - x0) * triangle,
    // A slight vertical weave so the sweep meets shelf props at more than one
    // height instead of tracing a single row forever.
    y: 430 + Math.sin((elapsed / 1400) * Math.PI * 2) * 90,
  };
}

async function driveSweep(page, durationMs) {
  const started = Date.now();
  let moves = 0;
  while (Date.now() - started < durationMs) {
    const { x, y } = sweepPoint(Date.now() - started);
    await page.mouse.move(x, y);
    moves += 1;
    await sleep(moveIntervalMs);
  }
  return moves;
}

/** Sum the pointermove EventDispatch entries out of a devtools timeline
 * trace. `dur` is wall time inside the dispatch, which for a hover move is
 * the r3f raycast plus whatever the handlers do with it. */
function pointerMoveCost(events) {
  const durations = [];
  for (const event of events) {
    if (event.name !== "EventDispatch") continue;
    if (event.args?.data?.type !== "pointermove") continue;
    if (typeof event.dur !== "number") continue;
    durations.push(event.dur / 1000);
  }
  durations.sort((a, b) => a - b);
  const at = (amount) =>
    durations.length
      ? Number(
          durations[
            Math.min(
              durations.length - 1,
              Math.max(0, Math.ceil(durations.length * amount) - 1),
            )
          ].toFixed(3),
        )
      : null;
  const total = durations.reduce((sum, ms) => sum + ms, 0);
  return {
    dispatches: durations.length,
    totalMs: Number(total.toFixed(2)),
    meanMs: durations.length ? Number((total / durations.length).toFixed(3)) : null,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: durations.length ? Number(durations[durations.length - 1].toFixed(3)) : null,
  };
}

async function collectTrace(client, run) {
  const events = [];
  const collect = (payload) => events.push(...payload.value);
  client.on("Tracing.dataCollected", collect);
  await client.send("Tracing.start", {
    traceConfig: {
      includedCategories: ["devtools.timeline"],
      recordMode: "recordAsMuchAsPossible",
    },
    transferMode: "ReportEvents",
  });
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 100 });
  await client.send("Profiler.start");
  const result = await run();
  const { profile } = await client.send("Profiler.stop");
  await client.send("Profiler.disable");
  const complete = new Promise((resolve) =>
    client.once("Tracing.tracingComplete", resolve),
  );
  await client.send("Tracing.end");
  await complete;
  client.off("Tracing.dataCollected", collect);
  return { result, events, profile };
}

/** Self time per call frame, so a run can name WHERE the pointer's cost is
 * rather than only how much it is. A production bundle mangles local names,
 * so the frame's url:line:column is reported alongside whatever name survived
 * — that pair is enough to find the function in the chunk. */
function hotFrames(profile, limit = 14) {
  if (!profile?.nodes) return [];
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const hits = new Map();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let index = 0; index < samples.length; index++) {
    const id = samples[index];
    const micros = Math.max(0, deltas[index] ?? 0);
    hits.set(id, (hits.get(id) ?? 0) + micros);
  }
  const rows = [];
  for (const [id, micros] of hits) {
    const node = byId.get(id);
    if (!node) continue;
    const frame = node.callFrame;
    rows.push({
      name: frame.functionName || "(anonymous)",
      at: `${(frame.url || "").split("/").pop()}:${frame.lineNumber}:${frame.columnNumber}`,
      selfMs: Number((micros / 1000).toFixed(2)),
    });
  }
  rows.sort((a, b) => b.selfMs - a.selfMs);
  return rows.slice(0, limit);
}

/** Frame pacing only: no tracer, no profiler, nothing attached that could
 * pay for the thing it is measuring. This is the number a change is judged on. */
async function measurePhase(page, { sweep }) {
  await page.evaluate(() => window.__stacks?.measure("reset"));
  await page.evaluate(() => window.__stacks?.measure("start"));
  const moves = sweep ? await driveSweep(page, sweepMs) : await sleep(holdMs);
  await page.evaluate(() => window.__stacks?.measure("stop"));
  const frames = await page.evaluate(() => window.__stacks?.measure() ?? null);
  return { frames, moves: sweep ? moves : 0 };
}

/** Diagnosis only. The tracer and the sampling profiler both cost time, so
 * this pass reports WHERE the pointer's work happens and its frame numbers
 * are deliberately discarded. Never compare a traced run to an untraced one. */
async function diagnosePhase(page, client) {
  const { events, profile } = await collectTrace(client, () =>
    driveSweep(page, Math.min(sweepMs, 4_000)),
  );
  return { pointerMove: pointerMoveCost(events), hotFrames: hotFrames(profile) };
}

async function runOnce(browser, setting, index) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${base}/${setting.search}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector('html[data-world="ready"]', { timeout: 90_000 });
    await page.waitForFunction(() => window.__stacks != null, null, {
      timeout: 30_000,
    });
    // Park the pointer inside the canvas first: r3f only writes its pointer on
    // an event, and the rig's arrival ramp needs to be finished before either
    // phase is timed, or the hold would be measuring the ramp.
    await page.mouse.move(620, 430);
    await sleep(4_000);
    const hold = await measurePhase(page, { sweep: false });
    // Return to rest between phases so the sweep starts from the same pose.
    await page.mouse.move(620, 430);
    await sleep(1_500);
    const sweepRun = await measurePhase(page, { sweep: true });
    // Only the first run of a setting pays for diagnosis; the rest stay clean
    // repeats of the pacing measurement.
    let diagnosis = null;
    if (index === 0 && !skipDiagnosis) {
      await page.mouse.move(620, 430);
      await sleep(1_000);
      const client = await context.newCDPSession(page);
      diagnosis = await diagnosePhase(page, client);
      await client.detach();
    }
    return {
      diagnosis,
      setting: setting.id,
      run: index,
      hold,
      sweep: sweepRun,
      delta: {
        p50Ms:
          hold.frames?.frameMs && sweepRun.frames?.frameMs
            ? Number(
                (
                  sweepRun.frames.frameMs.p50 - hold.frames.frameMs.p50
                ).toFixed(3),
              )
            : null,
        p95Ms:
          hold.frames?.frameMs && sweepRun.frames?.frameMs
            ? Number(
                (
                  sweepRun.frames.frameMs.p95 - hold.frames.frameMs.p95
                ).toFixed(3),
              )
            : null,
        p99Ms:
          hold.frames?.frameMs && sweepRun.frames?.frameMs
            ? Number(
                (
                  sweepRun.frames.frameMs.p99 - hold.frames.frameMs.p99
                ).toFixed(3),
              )
            : null,
        droppedFrameRatio:
          hold.frames && sweepRun.frames
            ? Number(
                (
                  (sweepRun.frames.droppedFrameRatio ?? 0) -
                  (hold.frames.droppedFrameRatio ?? 0)
                ).toFixed(4),
              )
            : null,
      },
      errors,
    };
  } finally {
    await context.close();
  }
}

const median = (values) => {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return Number(
    (sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2
    ).toFixed(3),
  );
};

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"],
});
const runs = [];
try {
  for (const setting of SETTINGS) {
    if (only && only !== setting.id) continue;
    for (let index = 0; index < repeats; index++) {
      const run = await runOnce(browser, setting, index);
      runs.push(run);
      console.log(
        `${setting.id} run ${index}: hold p95 ${run.hold.frames?.frameMs?.p95} ms, ` +
          `sweep p95 ${run.sweep.frames?.frameMs?.p95} ms, moves ${run.sweep.moves}` +
          (run.diagnosis
            ? `, traced pointermove mean ${run.diagnosis.pointerMove.meanMs} ms x${run.diagnosis.pointerMove.dispatches}`
            : ""),
      );
    }
  }
} finally {
  await browser.close();
}

const summary = {};
for (const setting of SETTINGS) {
  const own = runs.filter((run) => run.setting === setting.id);
  if (!own.length) continue;
  summary[setting.id] = {
    runs: own.length,
    holdP50Ms: median(own.map((run) => run.hold.frames?.frameMs?.p50)),
    holdP95Ms: median(own.map((run) => run.hold.frames?.frameMs?.p95)),
    sweepP50Ms: median(own.map((run) => run.sweep.frames?.frameMs?.p50)),
    sweepP95Ms: median(own.map((run) => run.sweep.frames?.frameMs?.p95)),
    sweepP99Ms: median(own.map((run) => run.sweep.frames?.frameMs?.p99)),
    deltaP50Ms: median(own.map((run) => run.delta.p50Ms)),
    deltaP95Ms: median(own.map((run) => run.delta.p95Ms)),
    sweepDroppedRatio: median(
      own.map((run) => run.sweep.frames?.droppedFrameRatio),
    ),
    holdDroppedRatio: median(
      own.map((run) => run.hold.frames?.droppedFrameRatio),
    ),
    sweepMoves: median(own.map((run) => run.sweep.moves)),
    // Traced, so not comparable to the pacing numbers above. Kept because it
    // is the only figure that says how much of a frame the pointer pipeline
    // itself consumes.
    tracedPointerMoveMeanMs: median(
      own.map((run) => run.diagnosis?.pointerMove.meanMs),
    ),
    tracedPointerMoveP95Ms: median(
      own.map((run) => run.diagnosis?.pointerMove.p95Ms),
    ),
    tracedPointerMoveDispatches: median(
      own.map((run) => run.diagnosis?.pointerMove.dispatches),
    ),
  };
}

await fs.writeFile(
  out,
  `${JSON.stringify({ base, repeats, holdMs, sweepMs, moveIntervalMs, summary, runs }, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
console.log(`wrote ${out}`);

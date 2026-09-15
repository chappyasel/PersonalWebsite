/** Run against a production build, inside the shared benchmark lock.
 * Defaults to headed system Chrome so rAF follows the real display cadence.
 * Touch/viewport/CPU emulation is a workload simulation, not an iPhone result.
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3111" },
    out: { type: "string", default: "/tmp/stacks-frame-pacing.json" },
    device: { type: "string", default: "both" },
    seconds: { type: "string", default: "10" },
    repeats: { type: "string", default: "3" },
    "cpu-rate": { type: "string", default: "1" },
    "no-meadow": { type: "boolean", default: false },
    trace: { type: "boolean", default: false },
    headless: { type: "boolean", default: false },
  },
});
const duration = Number(values.seconds) * 1000;
const repeats = Number(values.repeats);
if (!(duration >= 1000 && repeats >= 1))
  throw new Error("Use positive seconds/repeats");
const report = {
  recordedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirty: execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  buildId: await readFile(".next/BUILD_ID", "utf8").catch(() => null),
  options: values,
  measurementScope:
    "Instrumented harness vs same harness only. No ordinary-visit absolute FPS or cross-lane/browser comparison. CPU rate throttles main thread only, not GPU/device. Live motion cases test partial preference wiring only.",
  input: {
    desktop: "wheel 650px / 16ms, reverse every 1200ms",
    mobile:
      "native touch scroll gestures, 3 viewport widths at 4000px/s, alternate directions",
  },
  cases: [],
};
await mkdir(dirname(values.out), { recursive: true });
const artifactDir = values.out.replace(/\.json$/, "") + "-artifacts";
await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: values.headless,
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});
report.browser = browser.version();
const save = () => writeFile(values.out, JSON.stringify(report, null, 2));

function summarize(frames, cadenceMs) {
  const sorted = frames.slice().sort((a, b) => a - b);
  const percentile = (q) =>
    sorted[
      Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))
    ];
  return {
    frames: frames.length,
    fps: (frames.length * 1000) / frames.reduce((a, b) => a + b, 0),
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1),
    ...(cadenceMs
      ? {
          observedCadenceMs: cadenceMs,
          overCadence: frames.filter((x) => x > cadenceMs * 1.5).length,
        }
      : {}),
    over25ms: frames.filter((x) => x > 25).length,
    over50ms: frames.filter((x) => x > 50).length,
  };
}
async function snapshot(page) {
  return page.evaluate(() => {
    const s = window.__stacks?.state();
    return {
      world: document.documentElement.dataset.world,
      modalOpen: s?.modalOpen ?? false,
      searchOpen: document.documentElement.hasAttribute(
        "data-universal-search-open",
      ),
      panelState: s?.panelState ?? null,
      visionRide: s?.visionRide?.phase ?? null,
      progress: s?.offset ?? null,
      dragging: s?.dragging ?? null,
      roomView: document.documentElement.dataset.roomView,
      focused: document.hasFocus(),
      visibility: document.visibilityState,
      butterflyMounted: Boolean(window.__stacks?.node("butterfly:0")),
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      viewport: [innerWidth, innerHeight, devicePixelRatio],
      renderer: s
        ? {
            activeUnit: s.activeUnit,
            camera: s.camera,
            calls: s.calls,
            triangles: s.triangles,
            programs: s.programs,
            textures: s.textures,
            geometries: s.geometries,
            framebuffer: s.framebuffer,
            quality: s.quality,
          }
        : null,
      illustration:
        document
          .querySelector("img[data-room-artwork]")
          ?.getAttribute("data-unit") ?? null,
    };
  });
}
async function frames(page, ms) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const samples = [];
        let start;
        let last;
        function tick(now) {
          if (!document.hasFocus() || document.visibilityState !== "visible") {
            resolve({ error: "Page lost focus or visibility" });
            return;
          }
          start ??= now;
          if (last !== undefined) samples.push(now - last);
          last = now;
          if (now - start < ms) requestAnimationFrame(tick);
          else resolve(samples);
        }
        requestAnimationFrame(tick);
      }),
    ms,
  );
}
async function input(cdp, device, ms, signal) {
  const start = performance.now();
  let sent = 0;
  if (device.mobile) {
    let direction = 1;
    while (performance.now() - start < ms && !signal?.aborted) {
      sent++;
      await cdp.send("Input.synthesizeScrollGesture", {
        x: device.width * 0.5,
        y: device.height * 0.3,
        xDistance: direction * device.width * 3,
        yDistance: 0,
        speed: 4000,
        gestureSourceType: "touch",
        preventFling: false,
      });
      direction *= -1;
    }
  } else {
    const pending = [];
    const timer = setInterval(() => {
      if (signal?.aborted) return;
      const direction =
        Math.floor((performance.now() - start) / 1200) % 2 ? -1 : 1;
      sent++;
      pending.push(
        cdp
          .send("Input.dispatchMouseEvent", {
            type: "mouseWheel",
            x: Math.round(device.width * 0.3),
            y: Math.round(device.height * 0.3),
            deltaX: 0,
            deltaY: direction * 650,
          })
          .then(
            () => null,
            (error) => error,
          ),
      );
    }, 16);
    try {
      await new Promise((resolve) => {
        const timeout = setTimeout(finish, ms);
        function finish() {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", finish);
          resolve();
        }
        signal?.addEventListener("abort", finish, { once: true });
        if (signal?.aborted) finish();
      });
    } finally {
      clearInterval(timer);
    }
    const failures = (await Promise.all(pending)).filter(Boolean);
    if (failures.length) throw failures[0];
  }
  return {
    eventsSent: sent,
    elapsedMs: performance.now() - start,
    requestedTravelPx: sent * (device.mobile ? device.width * 3 : 650),
  };
}
function fixedWorkload(snapshot) {
  const renderer = snapshot.renderer;
  const presentation = {
    roomView: snapshot.roomView,
    modalOpen: snapshot.modalOpen,
    searchOpen: snapshot.searchOpen,
    panelState: snapshot.panelState,
    visionRide: snapshot.visionRide,
  };
  if (!renderer) return presentation;
  return {
    ...presentation,
    framebuffer: renderer.framebuffer,
    dpr: renderer.quality.effectiveDpr,
    pixels: renderer.quality.physicalPixels,
    axes: renderer.quality.axes,
    transitions: renderer.quality.transitions,
  };
}
async function measure(page, cdp, device, ms, moving) {
  const before = await snapshot(page);
  if (
    before.modalOpen ||
    before.searchOpen ||
    (before.visionRide !== null && before.visionRide !== "idle")
  )
    throw new Error(
      "An overlay or immersive experience paused the travel workload",
    );
  const controller = new AbortController();
  const capture = frames(page, ms).then((samples) => {
    if (!Array.isArray(samples)) {
      controller.abort();
      throw new Error(samples.error);
    }
    return samples;
  });
  const delivery = moving
    ? input(cdp, device, ms, controller.signal)
    : Promise.resolve();
  try {
    const [sampleResult, inputResult] = await Promise.allSettled([
      capture,
      delivery,
    ]);
    if (sampleResult.status === "rejected") throw sampleResult.reason;
    if (inputResult.status === "rejected") throw inputResult.reason;
    const after = await snapshot(page);
    if (
      JSON.stringify(fixedWorkload(before)) !==
      JSON.stringify(fixedWorkload(after))
    ) {
      throw new Error(
        "Renderer, quality, or framebuffer changed within the measurement window",
      );
    }
    return {
      summary: summarize(sampleResult.value, device.cadenceMs),
      delivery: inputResult.value,
      frames: sampleResult.value,
      workload: fixedWorkload(before),
    };
  } finally {
    controller.abort();
  }
}
async function runCase(page, cdp, device, name, errors) {
  const errorStart = errors.length;
  const result = {
    name,
    status: "running",
    purpose: name.includes("live-")
      ? "wiring observation only; do not calculate whole-scene motion performance deltas"
      : "fixed Safety workload; startup reduced may select a different renderer",
    before: await snapshot(page),
    trials: [],
  };
  report.cases.push(result);
  if (
    name.endsWith("no-preference") &&
    !values["no-meadow"] &&
    !result.before.butterflyMounted
  ) {
    throw new Error(
      "Expected butterfly:0 before comparing live preference wiring",
    );
  }
  result.butterflyWiringApplicable = !values["no-meadow"];
  await page.evaluate(() => {
    const seen = new Set();
    const observer = new MutationObserver((records) => {
      for (const { target } of records)
        if (target.hasAttribute("data-stacks-active"))
          seen.add(target.getAttribute("data-stacks-desktop-panel"));
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-stacks-active"],
    });
    window.__pacingUnits = { seen, observer };
  });
  result.firstTraverse = await measure(page, cdp, device, 6000, true);
  await page.waitForTimeout(1500);
  result.idle = await measure(page, cdp, device, 3000, false);
  for (let i = 0; i < repeats; i++) {
    await page.waitForTimeout(1500);
    await page.waitForFunction(
      () => !window.__stacks || !window.__stacks.state().quality.moving,
      null,
      { timeout: 30000 },
    );
    result.trials.push(await measure(page, cdp, device, duration, true));
  }
  result.after = await snapshot(page);
  result.runtimeErrors = errors.slice(errorStart);
  if (
    name.includes("live-") &&
    result.before.butterflyMounted !== result.after.butterflyMounted
  )
    throw new Error(
      "Live toggle changed butterfly mounting; reassess wiring assumption",
    );
  result.visitedPanels = await page.evaluate(() => {
    const { seen, observer } = window.__pacingUnits;
    observer.disconnect();
    delete window.__pacingUnits;
    return [...seen];
  });
  if (result.visitedPanels.filter(Boolean).length < 2)
    throw new Error("Travel input did not visit at least two panels");
  if (result.runtimeErrors.length)
    throw new Error("Runtime errors occurred during the case");
  await page.screenshot({ path: join(artifactDir, `${name}.png`) });
  if (values.trace) {
    const events = [];
    cdp.on("Tracing.dataCollected", (e) => events.push(...e.value));
    await cdp.send("Tracing.start", {
      categories: "devtools.timeline,blink.user_timing",
      options: "record-as-much-as-possible",
    });
    await input(cdp, device, 6000);
    const completed = new Promise((resolve) =>
      cdp.once("Tracing.tracingComplete", resolve),
    );
    await cdp.send("Tracing.end");
    await completed;
    result.renderingEvents = Object.fromEntries(
      ["UpdateLayoutTree", "Layout", "PrePaint", "Paint"].map((name) => {
        const matching = events.filter((e) => e.name === name && e.dur);
        return [
          name,
          {
            count: matching.length,
            totalMs: matching.reduce((n, e) => n + e.dur / 1000, 0),
            maxMs: Math.max(0, ...matching.map((e) => e.dur / 1000)),
          },
        ];
      }),
    );
    const updates = events.filter(
      (e) => e.name === "UpdateLayoutTree" && e.dur,
    );
    result.style = {
      count: updates.length,
      totalMs: updates.reduce((s, e) => s + e.dur / 1000, 0),
      worst: updates
        .sort((a, b) => b.dur - a.dur)
        .slice(0, 8)
        .map((e) => ({ ms: e.dur / 1000, elements: e.args?.elementCount })),
    };
    await writeFile(
      join(artifactDir, `${name}.trace.json`),
      JSON.stringify({ traceEvents: events }),
    );
    cdp.removeAllListeners("Tracing.dataCollected");
  }
  result.status = "passed";
  await save();
  console.log(
    JSON.stringify({
      name,
      view: result.after.roomView,
      visitedPanels: result.visitedPanels,
      firstTraverse: result.firstTraverse.summary,
      idle: result.idle.summary,
      trials: result.trials.map((t) => t.summary),
      style: result.style,
    }),
  );
}

// A failed case remains failed. Preserve its state before closing the page,
// then continue independent cases (especially startup in a new context).
// The overall command still exits nonzero if any case fails a gate.
async function captureCase(page, cdp, device, name, errors) {
  try {
    await runCase(page, cdp, device, name, errors);
  } catch (error) {
    const result = report.cases.findLast((item) => item.name === name);
    const failure = {
      name,
      error: String(error.stack ?? error),
      snapshot: await snapshot(page).catch(() => null),
      sceneState: await page
        .evaluate(() => window.__stacks?.state() ?? null)
        .catch(() => null),
      scroll: await page
        .evaluate(() => {
          const el = document.querySelector(
            '[aria-label="Horizontal scene navigation"]',
          );
          const panel = document.querySelector(
            "[data-stacks-mobile-panel][data-stacks-panel]",
          );
          return {
            left: el?.scrollLeft,
            width: el?.scrollWidth,
            clientWidth: el?.clientWidth,
            panel: panel?.getAttribute("data-stacks-panel-unit"),
            sheet: panel?.getAttribute("data-sheet"),
            world: document.documentElement.dataset.world,
            roomView: document.documentElement.dataset.roomView,
          };
        })
        .catch(() => null),
    };
    if (result) {
      result.status = "failed";
      result.failure = failure;
    }
    report.failures ??= [];
    report.failures.push(failure);
    await page
      .screenshot({ path: join(artifactDir, `${name}-FAILED.png`) })
      .catch(() => undefined);
    await page
      .evaluate(() => {
        window.__pacingUnits?.observer.disconnect();
        delete window.__pacingUnits;
      })
      .catch(() => undefined);
    console.error(JSON.stringify({ name, failed: failure }));
    await save();
  }
}

const devices = [
  { name: "desktop", width: 2036, height: 1270, dpr: 2, mobile: false },
  { name: "mobile", width: 393, height: 852, dpr: 3, mobile: true },
].filter((d) => values.device === "both" || d.name === values.device);
if (!devices.length) throw new Error("device must be desktop, mobile, or both");
try {
  for (const device of devices) {
    for (const startupReduced of [false, true]) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: device.dpr,
        isMobile: device.mobile,
        hasTouch: device.mobile,
        reducedMotion: startupReduced ? "reduce" : "no-preference",
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
        await page.bringToFront();
        const calibration = await frames(page, 3000);
        if (!Array.isArray(calibration)) throw new Error(calibration.error);
        device.cadenceMs = summarize(calibration).p50;
        if (!(device.cadenceMs >= 4 && device.cadenceMs <= 20))
          throw new Error(
            `Implausible blank-page cadence: ${device.cadenceMs}ms`,
          );
        // A plausible 60/90Hz cadence is observable but proves nothing at120Hz.
        device.calibrated120Hz =
          device.cadenceMs >= 7.5 && device.cadenceMs <= 9.2;
        report.calibrations ??= [];
        report.calibrations.push({
          device: device.name,
          startupReduced,
          calibrated120Hz: device.calibrated120Hz,
          blank: summarize(calibration),
          frames: calibration,
        });
        await cdp.send("Emulation.setCPUThrottlingRate", {
          rate: Number(values["cpu-rate"]),
        });
        const url = new URL("/?quality=safety&harness=1#systems", values.base);
        if (values["no-meadow"]) url.searchParams.set("nomeadow", "1");
        await page.goto(url.href, { waitUntil: "load", timeout: 90000 });
        await page.waitForFunction(
          (reduced) =>
            reduced
              ? document.documentElement.dataset.roomView === "illustrated" &&
                !!document.querySelector("img[data-room-artwork]")
              : document.documentElement.dataset.roomView === "live" &&
                window.__stacks?.state().controlsReady,
          startupReduced,
          { timeout: 120000 },
        );
        await captureCase(
          page,
          cdp,
          device,
          `${device.name}-${startupReduced ? "startup-reduce" : "no-preference"}`,
          errors,
        );
        if (!startupReduced) {
          await page.emulateMedia({ reducedMotion: "reduce" });
          await captureCase(
            page,
            cdp,
            device,
            `${device.name}-live-reduce`,
            errors,
          );
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await captureCase(
            page,
            cdp,
            device,
            `${device.name}-live-restored`,
            errors,
          );
        }
        await save();
      } finally {
        await context.close();
      }
    }
  }
  if (report.failures?.length)
    throw new Error(
      `${report.failures.length} case(s) failed; see retained failure states`,
    );
} catch (error) {
  report.error = String(error.stack ?? error);
  await save();
  throw error;
} finally {
  await browser.close();
}

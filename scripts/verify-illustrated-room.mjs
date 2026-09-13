// Run serially against an already-running local server. Uses the ordinary quality policy.
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const option = (name, fallback) =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
const route = option("route", "/projects");
const theme = option("theme", "light");
const width = Number(option("width", "1440"));
const height = Number(option("height", "900"));
const base = option("base", "http://localhost:3333");
const label = option(
  "label",
  `${route.replace(/\W+/g, "-")}-${theme}-${width}`,
);
const out = option(
  "out",
  "docs/reviews/illustrated-room-integration-evidence/raw",
);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: option("headed", "false") !== "true",
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--enable-webgl",
    "--enable-gpu",
    ...(option("gpu", "software") === "software"
      ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : ["--use-angle=metal"]),
  ],
});
try {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme,
    reducedMotion: "no-preference",
    deviceScaleFactor: 1,
  });
  await context.addCookies([{ name: "theme", value: theme, url: base }]);
  await context.addInitScript((tone) => {
    localStorage.setItem("theme", tone);
    window.__illustrationTrace = [];
    const observe = () => {
      const phase = document.documentElement.dataset.roomView;
      if (phase === "dissolve" || phase === "travel") {
        const artwork = document.querySelector(
          "[data-room-artwork][data-artwork-key]",
        );
        const overlay = artwork?.closest(".room-illustration");
        window.__illustrationTrace.push({
          at: performance.now(),
          phase,
          opacity: overlay ? Number(getComputedStyle(overlay).opacity) : null,
          ready: document.documentElement.dataset.world === "ready",
          camera: window.__roomHandoff?.camera,
          projection: window.__roomHandoff?.projection,
          painted: window.__roomHandoff?.painted,
        });
      }
      if (window.__illustrationTrace.length < 500)
        requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }, theme);
  const page = await context.newPage();
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (/\/images\/stacks\/boot\/.*\.svg/.test(url))
      requests.push(new URL(url).pathname);
  });
  const started = Date.now();
  console.log("START", route, theme, width, height);
  await page.goto(new URL(route, base).href, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.illustratedUi === "ready",
    undefined,
    { timeout: 40_000 },
  );
  await page.screenshot({ path: path.join(out, `${label}-illustrated.png`) });
  let state;
  for (let i = 0; i < Number(option("polls", "120")); i++) {
    state = await page.evaluate(() => ({
      url: location.href,
      attributes: [...document.documentElement.attributes].map((a) => [
        a.name,
        a.value,
      ]),
      heading: document.querySelector("h1")?.textContent,
      drawingOpacity: (() => {
        const drawing = document.querySelector(
          ".stacks-world-shell .room-illustration",
        );
        return drawing ? Number(getComputedStyle(drawing).opacity) : null;
      })(),
      phase: document.documentElement.dataset.roomView,
      world: document.documentElement.dataset.world,
      canvas: document.querySelectorAll(".stacks-canvas-shell canvas").length,
      boot: Object.fromEntries(
        [...(document.querySelector("[data-boot-status]")?.attributes ?? [])]
          .filter((a) => a.name.startsWith("data-boot"))
          .map((a) => [a.name, a.value]),
      ),
      unit: document
        .querySelector("[data-room-artwork][data-unit]")
        ?.getAttribute("data-unit"),
      handoff: window.__roomHandoff,
      scene: window.__stacks?.state(),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    if (
      state.phase === "live" ||
      state.handoff?.error ||
      state.boot?.["data-boot-failure"] ||
      state.boot?.["data-boot-ineligibility"] ||
      errors.length ||
      state.heading === "404"
    )
      break;
    if (i % 10 === 0)
      console.log(
        "WAIT",
        Math.round((Date.now() - started) / 1000),
        state.phase,
        state.canvas,
        state.unit,
        state.handoff?.stage,
        state.handoff?.error,
        state.boot,
      );
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(out, `${label}-result.png`) });
  const trace = await page.evaluate(() => window.__illustrationTrace);
  const result = {
    route,
    theme,
    viewport: [width, height],
    elapsedMs: Date.now() - started,
    normalEffects: true,
    headless: option("headed", "false") !== "true",
    gpuRequested: option("gpu", "software"),
    errors,
    artworkRequests: [...new Set(requests)],
    state,
    trace,
  };
  await fs.writeFile(
    path.join(out, `${label}.json`),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        phase: state?.phase,
        boot: state?.boot,
        unit: state?.unit ?? state?.scene?.activeUnit,
        canvas: state?.canvas,
        error: state?.handoff?.error,
        maxResidualPx: state?.handoff?.residuals
          ? Math.max(...state.handoff.residuals.map((p) => p.px))
          : null,
        painted: state?.handoff?.painted,
        errors,
        overflow: state?.overflow,
        traceFrames: trace.length,
        elapsedMs: result.elapsedMs,
      },
      null,
      2,
    ),
  );
  if (
    state?.phase !== "live" ||
    errors.length ||
    state.overflow ||
    state.drawingOpacity !== 0
  )
    process.exitCode = 1;
  await context.close();
} finally {
  await browser.close();
}

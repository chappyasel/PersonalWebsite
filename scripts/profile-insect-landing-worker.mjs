import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.INSECT_PROFILE_URL ?? "http://localhost:3217";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("This comparison only runs against a local server");
const output =
  process.env.INSECT_PROFILE_OUTPUT ?? "/tmp/insect-landing-worker-profile";
const smoke = process.argv.includes("--smoke");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--use-angle=metal",
  ],
});
const results = [];
try {
  for (const [theme, enabled] of smoke
    ? [["dark", true]]
    : [
        ["dark", false],
        ["dark", true],
        ["light", true],
        ["light", false],
      ]) {
    const context = await browser.newContext({
      viewport: { width: 1512, height: 982 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const workers = [],
      errors = [];
    page.on("worker", (worker) => workers.push(worker.url()));
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      (value) => localStorage.setItem("theme", value),
      theme,
    );
    await page.goto(
      `${origin}/?harness=1&quality=showcase${enabled ? "&insectLandingWorker=1" : ""}`,
      { waitUntil: "domcontentloaded" },
    );
    await page.bringToFront();
    await page.waitForFunction(
      () =>
        window.__stacks?.state().controlsReady &&
        document.documentElement.dataset.world === "ready",
      { timeout: 120000 },
    );
    const environment = await page.evaluate(() => ({
      theme: document.documentElement.className,
      visibility: document.visibilityState,
      dpr: devicePixelRatio,
      renderer: window.__stacks.qualityLog().renderer,
      quality: window.__stacks.state().quality,
    }));
    console.log(JSON.stringify({ theme, enabled, environment }));
    const segments = [];
    for (const unit of smoke ? [4] : [3, 4, 2, 3]) {
      await page.evaluate(
        (u) => window.__stacks.scrollTo(u, { instant: true }),
        unit,
      );
      await page.waitForTimeout(smoke ? 1000 : 6000);
      await page.evaluate(() => {
        window.__insectFrames = [];
        window.__insectLongTasks = [];
        window.__insectSampling = true;
        window.__insectObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.__insectLongTasks.push(entry.duration);
        });
        window.__insectObserver.observe({ type: "longtask" });
        let previous = performance.now();
        const frame = (now) => {
          if (!window.__insectSampling) return;
          window.__insectFrames.push(now - previous);
          previous = now;
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const before = await page.evaluate(
        () => window.__stacks.state().insectPlanning,
      );
      await page.waitForTimeout(smoke ? 20000 : 20000);
      const capture = await page.evaluate(() => {
        window.__insectSampling = false;
        window.__insectObserver.disconnect();
        return {
          frames: window.__insectFrames,
          longTasks: window.__insectLongTasks,
          planning: window.__stacks.state().insectPlanning,
          quality: window.__stacks.state().quality,
          visibility: document.visibilityState,
        };
      });
      const sorted = capture.frames.slice(1).sort((a, b) => a - b);
      const percentile = (p) =>
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
      const summary = {
        p95: percentile(0.95),
        p99: percentile(0.99),
        max: sorted.at(-1),
        over50: sorted.filter((n) => n > 50).length,
        over100: sorted.filter((n) => n > 100).length,
        longTasks: capture.longTasks.length,
      };
      segments.push({ unit, before, ...capture, summary });
      console.log(
        JSON.stringify({
          theme,
          enabled,
          unit,
          summary,
          planning: capture.planning,
          workers: workers.length,
          errors,
        }),
      );
    }
    results.push({ theme, enabled, environment, workers, errors, segments });
    await writeFile(
      `${output}/${theme}-${enabled ? "worker" : "sync"}.json`,
      JSON.stringify(results.at(-1)),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(`${output}/results.json`, JSON.stringify(results));

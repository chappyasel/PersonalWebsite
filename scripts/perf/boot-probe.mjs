// Cold-boot probe for the 3D room. One fresh headless Chrome per run, real GPU
// through ANGLE Metal, optional CPU slowdown. It turns on `?perf-report=1`,
// catches the boot report on its way to /api/performance-diagnostic, answers
// 202 itself, and blocks PostHog, so nothing reaches analytics.
//
//   node scripts/perf/boot-probe.mjs [label] [extraQuery] [cpuRate] [origin]
//   node scripts/perf/boot-probe.mjs base "" 4
//   node scripts/perf/boot-probe.mjs light "&perf-profile=light-boot" 4 http://localhost:3000
//
// PROBE_RTT=150 adds that many ms of round-trip latency and caps throughput at
// 10 Mbit/s down, a phone on a middling connection.
//
// Prints one JSON line: wall time, the boot_complete report (gate milestones
// and timeline), and every resource as [start, end, KB, initiator, path].
// Exits 1 when the boot did not reach the live room.
import { chromium } from "playwright";

const [
  label = "base",
  extra = "",
  cpu = "1",
  origin = "https://www.chappyasel.com",
] = process.argv.slice(2);
const url = `${origin}/?perf-report=1${extra}`;

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "no-preference",
});
const reports = [];
await context.route(/posthog|i\.ph\.|\/ingest\//, (route) => route.abort());
await context.route("**/api/performance-diagnostic", async (route) => {
  try {
    reports.push(JSON.parse(route.request().postData() ?? "{}"));
  } catch {}
  await route.fulfill({
    status: 202,
    body: "{}",
    headers: { "content-type": "application/json" },
  });
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(cpu) });
const rtt = Number(process.env.PROBE_RTT ?? 0);
if (rtt > 0)
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: rtt,
    downloadThroughput: (10 * 1024 * 1024) / 8,
    uploadThroughput: (5 * 1024 * 1024) / 8,
  });

const t0 = Date.now();
await page.goto(url, { waitUntil: "commit" });
let done = null;
for (let i = 0; i < 400 && !done; i++) {
  await page.waitForTimeout(250);
  done = reports.find((r) => r.report_kind === "boot_complete");
}
const wall = Date.now() - t0;
const res = await page.evaluate(() =>
  performance
    .getEntriesByType("resource")
    .map((r) => [
      Math.round(r.startTime),
      Math.round(r.responseEnd),
      Math.round((r.encodedBodySize || 0) / 1024),
      r.initiatorType,
      r.name.replace(location.origin, "").slice(0, 110),
    ]),
);
console.log(
  JSON.stringify({
    label,
    cpu: Number(cpu),
    wall,
    report: done ?? reports.at(-1) ?? null,
    res,
  }),
);
await browser.close();
// A boot that never reported, or reported without reaching the live room
// (failed, or the 2D illustration only), is not a reveal time.
process.exit(done?.boot_status === "live" ? 0 : 1);

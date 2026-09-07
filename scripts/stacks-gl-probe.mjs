// Per-frame WebGL command profile of the homepage scene, taken from outside the
// app: an init script wraps WebGL2RenderingContext before any module loads, so
// it survives dev-server hot reloads and does not depend on `renderer.info`
// (which the composer resets per pass). Counts are deterministic and comparable
// across machines; frame times are not, so this script does not report them.
//
//   node scripts/stacks-gl-probe.mjs                # frames mode, units 0..6
//   node scripts/stacks-gl-probe.mjs --mode passes  # one frame, per framebuffer segment
//   node scripts/stacks-gl-probe.mjs --mode census  # one frame, draws by shader/blend/depth mask
//   node scripts/stacks-gl-probe.mjs --query "?quality=showcase&noaotransparency=1" --units 0,1
//
// Needs a running server (BASE, default http://localhost:3000) and Playwright's
// Chromium. Metal ANGLE keeps real GL on darwin; SwiftShader loses the context
// compiling this scene.
//
// Reading the output. `passes` lists every framebuffer bind in one frame with
// the draws it received and its viewport; the room pass is the first segment,
// the composer follows. A segment at full resolution with dozens of draws and
// few vertices is a scene re-render, not a fullscreen effect. `census` names
// the shader behind each draw (SHADER_TYPE:SHADER_NAME from the compiled
// source), whether blending was on and whether depth writes were on, which is
// enough to tell contact-shade sprites from meadow instances from props.
import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const mode = opt("mode", "frames");
const query = opt("query", "?quality=showcase");
const units = opt("units", "0,1,2,3,4,5,6").split(",").map(Number);
const base = process.env.BASE ?? "http://localhost:3000";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-gpu",
    "--use-angle=metal",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

await context.addInitScript(() => {
  const P = WebGL2RenderingContext.prototype;
  const wrap = (name, fn) => {
    const original = P[name];
    if (!original) return;
    P[name] = function (...a) {
      fn(a, this);
      return original.apply(this, a);
    };
  };
  // Shared state ------------------------------------------------------------
  const shaderSource = new WeakMap();
  const programName = new WeakMap();
  const framebufferIds = new WeakMap();
  let nextFramebufferId = 1;
  const framebufferId = (fb) => {
    if (!fb) return 0;
    if (!framebufferIds.has(fb)) framebufferIds.set(fb, nextFramebufferId++);
    return framebufferIds.get(fb);
  };
  let program = null;
  let blend = false;
  let depthMask = true;
  wrap("shaderSource", (a) => shaderSource.set(a[0], a[1]));
  wrap("attachShader", (a) => {
    const source = shaderSource.get(a[1]) ?? "";
    const type = /#define SHADER_TYPE (\S+)/.exec(source)?.[1];
    const name = /#define SHADER_NAME (\S*)/.exec(source)?.[1];
    if (type) programName.set(a[0], type + (name ? ":" + name : ""));
  });
  wrap("useProgram", (a) => {
    program = a[0] ? (programName.get(a[0]) ?? "?") : null;
    frame.useProgram++;
    if (segment) segment.prog++;
  });
  wrap("enable", (a) => {
    if (a[0] === 3042) blend = true;
  });
  wrap("disable", (a) => {
    if (a[0] === 3042) blend = false;
  });
  wrap("depthMask", (a) => {
    depthMask = a[0];
  });
  // Frames mode: rolling per-frame tallies ----------------------------------
  const blank = () => ({
    draws: 0,
    instDraws: 0,
    instances: 0,
    verts: 0,
    useProgram: 0,
    bindFB: 0,
    clear: 0,
    texUpload: 0,
    bufUpload: 0,
    bindTex: 0,
  });
  let frame = blank();
  const frames = [];
  // Passes / census mode: one recorded frame, segmented by framebuffer ------
  let recording = false;
  let segments = [];
  let segment = null;
  const newSegment = (fb) => {
    segment = {
      fb: framebufferId(fb),
      vp: "",
      draws: 0,
      inst: 0,
      prog: 0,
      verts: 0,
      clear: 0,
      groups: {},
    };
    segments.push(segment);
  };
  const draw = (verts, instanced, instances) => {
    frame.draws++;
    frame.verts += verts;
    if (instanced) {
      frame.instDraws++;
      frame.instances += instances;
    }
    if (!recording) return;
    if (!segment) newSegment(null);
    segment.draws++;
    segment.verts += verts;
    if (instanced) segment.inst++;
    const key = `${program}|${blend ? "blend" : "opaque"}|${depthMask ? "dw" : "nodw"}${instanced ? "|inst" : ""}`;
    const group = (segment.groups[key] ??= { n: 0, verts: 0 });
    group.n++;
    group.verts += verts;
  };
  wrap("drawElements", (a) => draw(a[1], false, 0));
  wrap("drawArrays", (a) => draw(a[2], false, 0));
  wrap("drawElementsInstanced", (a) => draw(a[1] * a[4], true, a[4]));
  wrap("drawArraysInstanced", (a) => draw(a[2] * a[3], true, a[3]));
  wrap("bindFramebuffer", (a) => {
    frame.bindFB++;
    if (recording) newSegment(a[1]);
  });
  wrap("viewport", (a) => {
    if (recording && segment) segment.vp = a[2] + "x" + a[3];
  });
  wrap("clear", () => {
    frame.clear++;
    if (segment) segment.clear++;
  });
  wrap("texImage2D", () => frame.texUpload++);
  wrap("texSubImage2D", () => frame.texUpload++);
  wrap("compressedTexImage2D", () => frame.texUpload++);
  wrap("bufferData", () => frame.bufUpload++);
  wrap("bufferSubData", () => frame.bufUpload++);
  wrap("bindTexture", () => frame.bindTex++);
  const tick = () => {
    frames.push(frame);
    if (frames.length > 600) frames.shift();
    frame = blank();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__glProbe = {
    frames: () => frames.slice(-120),
    captureFrame: () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          segments = [];
          segment = null;
          recording = true;
          requestAnimationFrame(() => {
            recording = false;
            resolve(segments);
          });
        }),
      ),
  };
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message.slice(0, 160)));
const startedAt = Date.now();
await page.goto(base + "/" + query, { waitUntil: "commit" });
await page.waitForFunction(
  () =>
    document.documentElement.dataset.world === "ready" &&
    window.__stacks?.state?.().controlsReady === true,
  null,
  { timeout: 180_000 },
);
console.log(`## ${query}  mode=${mode}  boot=${Date.now() - startedAt}ms`);
await page.waitForTimeout(3000);

const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const rows = [];
for (const unit of units) {
  await page.evaluate(
    (i) => window.__stacks.scrollTo(i, { instant: true }),
    unit,
  );
  await page.waitForFunction(
    (i) => window.__stacks.state().activeUnit === i,
    unit,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(2500);
  if (mode === "frames") {
    const sampled = await page.evaluate(() => window.__glProbe.frames());
    const active = sampled.filter((f) => f.draws > 0);
    const med = (key) => median(active.map((f) => f[key]));
    const info = await page.evaluate(() => {
      const s = window.__stacks.state();
      return {
        programs: s.programs,
        textures: s.textures,
        geometries: s.geometries,
      };
    });
    rows.push({
      unit,
      frames: active.length,
      draws: med("draws"),
      inst: med("instDraws"),
      instances: med("instances"),
      kverts: Math.round(med("verts") / 1000),
      useProgram: med("useProgram"),
      fbo: med("bindFB"),
      clear: med("clear"),
      texUp: med("texUpload"),
      bufUp: med("bufUpload"),
      ...info,
    });
    continue;
  }
  const segments = await page.evaluate(() => window.__glProbe.captureFrame());
  const total = segments.reduce((sum, s) => sum + s.draws, 0);
  console.log(
    `\n## unit ${unit}: ${segments.length} framebuffer segments, ${total} draws`,
  );
  if (mode === "passes") {
    console.table(
      segments
        .filter((s) => s.draws > 0)
        .map((s) => ({
          fb: s.fb,
          vp: s.vp,
          draws: s.draws,
          inst: s.inst,
          prog: s.prog,
          kverts: Math.round(s.verts / 1000),
          clear: s.clear,
        })),
    );
  } else {
    for (const s of segments) {
      if (s.draws < 5) continue;
      console.log(`-- fb ${s.fb} vp ${s.vp} draws ${s.draws}`);
      const groups = Object.entries(s.groups)
        .map(([key, g]) => ({
          key,
          n: g.n,
          kverts: Math.round(g.verts / 1000),
        }))
        .sort((a, b) => b.n - a.n);
      for (const g of groups)
        console.log(
          `   ${String(g.n).padStart(4)}  ${String(g.kverts).padStart(6)}k  ${g.key}`,
        );
    }
  }
}
if (mode === "frames") console.table(rows);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();

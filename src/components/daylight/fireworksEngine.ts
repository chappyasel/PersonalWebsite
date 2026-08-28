// The dome shader's firing script (SceneEnvironment.tsx, "Fireworks over
// the Golden Gate"), run on a 2D canvas: seven staggered shells per launch,
// four types off a real firing script — peony, willow, ring, chrysanthemum
// with a pistil — the same hue deal, rise-from-the-strait phase, gravity,
// double breaks, crackle, white-hot -> hue -> ember color life, the burst's
// glow on the air, and the light theme's smoke doing the work while the
// additive is pulled back.
//
// Coordinates map through the SKYLINE STRIP's live rect each frame: on
// phones the strip is an overgrown panning element, and the pan is a camera
// move — the shells live in that sky, so they ride it. The composer's
// softness is two blit passes from one half-resolution offscreen render
// (the bloom/core canvases' blurs live in daylight.css).
//
// Loaded via dynamic import on the FIRST click only — the scene's own rule
// is that the display costs nothing until somebody fires it, and keeping
// this module out of the static graph also keeps it out of the homepage's
// budgeted chunks (a shared-chunk merge once dragged it in).

const FIRE_WINDOW = 7.8;
const AZ_LEFT = -2.24;
const AZ_SPAN = 1.215;

// The shader's own hash1.
function hash1(n: number): number {
  n = n * 0.1031 - Math.floor(n * 0.1031);
  n *= n + 33.33;
  n *= n + n;
  return n - Math.floor(n);
}
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

type Launch = { start: number; seed: number };

const HUES: ReadonlyArray<readonly [number, number, number]> = [
  [1.0, 0.84, 0.5],
  [1.0, 0.42, 0.28],
  [0.5, 0.76, 1.0],
  [0.55, 0.95, 0.66],
  [0.95, 0.58, 0.95],
];
function shellHue(hh: number, typ: number): readonly [number, number, number] {
  // A willow is gold by definition — burning charcoal, not a colour star.
  if (typ === 1) return [1.0, 0.8, 0.42];
  if (hh < 0.28) return HUES[0]!;
  if (hh < 0.5) return HUES[1]!;
  if (hh < 0.7) return HUES[2]!;
  if (hh < 0.87) return HUES[3]!;
  return HUES[4]!;
}

function rgba(
  c: readonly [number, number, number],
  gain: number,
  a: number,
): string {
  const r = Math.min(255, Math.round(c[0] * gain * 255));
  const g = Math.min(255, Math.round(c[1] * gain * 255));
  const b = Math.min(255, Math.round(c[2] * gain * 255));
  return `rgba(${r},${g},${b},${Math.min(Math.max(a, 0), 1)})`;
}

function renderLaunches(
  g: CanvasRenderingContext2D,
  launches: Launch[],
  now: number,
  map: { ppr: number; ox: number; oy: number },
) {
  const dark = document.documentElement.classList.contains("dark");
  // The strip's own scale and pan offset: aspect-true, so one number serves
  // both axes, and the strip's bottom edge is e = 0.
  const { ppr, ox, oy } = map;
  const X = (az: number) => (az - AZ_LEFT) * ppr + ox;
  const Y = (e: number) => oy - e * ppr;
  const time = now / 1000;
  // No composer here, so brightness takes the shader's uPost=0 lift.
  const sparkGain = 1.45 * 0.92 * (dark ? 1 : 0.6);
  const glowGain = 1.5 * 0.34 * (dark ? 1 : 0.3);
  g.lineCap = "round";

  for (const launch of launches) {
    const fireAge = (now - launch.start) / 1000;
    const seed = launch.seed;
    for (let si = 0; si < 7; si++) {
      const fs = si;
      const h0 = hash1(seed + fs * 4.1);
      const h1 = hash1(seed + fs * 9.7);
      const h2 = hash1(seed + fs * 2.3);
      const h3 = hash1(seed + fs * 13.1);
      const h4 = hash1(seed + fs * 6.7);
      const t = fireAge - (fs * 0.46 + h0 * 0.34);
      if (t <= 0) continue;
      // Biased west of the bridge, where the open sky is.
      const az = -2.04 + (h1 - 0.72) * 0.17;
      const burstE = 0.106 + h2 * 0.044;
      const rise = 0.86 + h4 * 0.22;
      const typ = Math.floor(h3 * 4);
      const hue = shellHue(hash1(seed + fs * 21.3), typ);

      if (t < rise) {
        // The shell on its way up: a hot dot with a short flickering trail,
        // drifting a little downrange as it slows.
        const u = t / rise;
        const sy = mix(0.026, burstE, u * (2 - u));
        const drift = 0.007 * u * u * (h4 - 0.5) * 2;
        const hx = X(az + drift);
        g.globalCompositeOperation = "lighter";
        for (let k = 0; k < 4; k++) {
          const ee = sy - (k / 3) * 0.014;
          if (ee < 0.022) continue;
          const flick = 0.62 + 0.38 * Math.sin(ee * 900 + seed + fs);
          const a = 0.45 * smoothstep(0.014, 0, sy - ee) * flick * sparkGain;
          g.fillStyle = rgba([1, 0.72, 0.36], 1, a);
          g.fillRect(hx - 0.7, Y(ee) - 1.4, 1.4, 2.8);
        }
        g.fillStyle = rgba([1, 0.72, 0.36], 1, (1.15 - 0.4 * u) * sparkGain);
        g.beginPath();
        g.arc(hx, Y(sy), 0.0018 * ppr, 0, Math.PI * 2);
        g.fill();
        continue;
      }

      const age = t - rise;
      const dur = typ === 1 ? 3.4 : 2.6;
      if (age > dur) continue;
      const u = age / dur;
      // Every spark shares the same drop; a willow's stars are heavy and
      // burn long, so they fall visibly — that IS the shell.
      const drop = (typ === 1 ? 0.027 : 0.015) * age * age;
      const cE = burstE - drop;

      // The flash on the air (sigma from exp(-r^2 * 2380)).
      const glowA = Math.exp(-age * 3.4) * glowGain;
      if (glowA > 0.004) {
        const gr = 0.036 * ppr;
        const grad = g.createRadialGradient(X(az), Y(cE), 0, X(az), Y(cE), gr);
        grad.addColorStop(0, rgba(hue, 1, glowA));
        grad.addColorStop(1, rgba(hue, 1, 0));
        g.globalCompositeOperation = "lighter";
        g.fillStyle = grad;
        g.fillRect(X(az) - gr, Y(cE) - gr, gr * 2, gr * 2);
      }
      // Daytime: the additive is pulled back and the smoke does the work —
      // a puff DARKER than the sky behind it.
      if (!dark) {
        const win =
          smoothstep(0, 0.25, u) * (1 - smoothstep(0.35, 1, u)) * 0.176;
        if (win > 0.004) {
          const sr = 0.03 * ppr;
          const sg = g.createRadialGradient(X(az), Y(cE), 0, X(az), Y(cE), sr);
          sg.addColorStop(0, `rgba(20,24,32,${win})`);
          sg.addColorStop(1, "rgba(20,24,32,0)");
          g.globalCompositeOperation = "source-over";
          g.fillStyle = sg;
          g.fillRect(X(az) - sr, Y(cE) - sr, sr * 2, sr * 2);
        }
      }

      // The stars. A ring is drawn with more, thinner rays because it has
      // to close; everyone else gets a per-ray velocity, which is what
      // gives a peony its depth.
      const bins = typ === 2 ? 46 : 28;
      const Rk = typ === 1 ? 0.06 : typ === 2 ? 0.044 : 0.05;
      const len = typ === 1 ? 0.2 : typ === 2 ? 0.46 : 0.34;
      const hl = 0.0026 / len;
      const fade =
        Math.exp(-age * (typ === 1 ? 0.78 : 1.15)) *
        (1 - smoothstep(0.72, 1, u));
      if (fade < 0.01) continue;
      const twd = typ === 3 ? 0.62 : 0.38;
      // White-hot at the burst, into the shell's own colour, cooling to a
      // dim ember as it falls.
      const hot = smoothstep(0, 0.11, u);
      const cool = smoothstep(0.45, 1, u);
      const sc: [number, number, number] = [
        mix(mix(1.0, hue[0], hot), hue[0] * 0.7, cool),
        mix(mix(0.97, hue[1], hot), hue[1] * 0.4, cool),
        mix(mix(0.9, hue[2], hot), hue[2] * 0.3, cool),
      ];
      const brk =
        h4 > 0.55
          ? smoothstep(0.58, 0.8, age) * (1 - smoothstep(0.72, 1, u))
          : 0;
      const R2 = 0.017 * (1 - Math.exp(-4.2 * Math.max(age - 0.58, 0)));
      const Rp = 0.019 * (1 - Math.exp(-5.4 * u));

      g.globalCompositeOperation = "lighter";
      g.lineWidth = Math.max(0.0022 * ppr, 1.1);
      for (let bi = 0; bi < bins; bi++) {
        const sp =
          typ === 2 ? 1 : 0.52 + 0.8 * hash1(bi * 1.37 + seed + fs * 5.9);
        const R = Rk * (1 - Math.exp(-3.6 * u)) * sp;
        const ca = ((bi + 0.5) / bins) * Math.PI * 2 - Math.PI;
        const dx = Math.cos(ca);
        const dy = Math.sin(ca);
        const twinkle =
          1 - twd + twd * (0.5 + 0.5 * Math.sin(time * 41 + bi * 2.7 + fs));
        const a = twinkle * fade * sparkGain;
        if (a < 0.012) continue;
        g.strokeStyle = rgba(sc, 1, a);
        const seg = (r0: number, r1: number) => {
          g.beginPath();
          g.moveTo(X(az + dx * r0), Y(cE + dy * r0));
          g.lineTo(X(az + dx * r1), Y(cE + dy * r1));
          g.stroke();
        };
        seg(Math.max(R - hl, 0), R + hl);
        // The pistil — the chrysanthemum's own inner break.
        if (typ === 3) {
          g.strokeStyle = rgba(sc, 1, a * 0.85);
          seg(Math.max(Rp - 0.0047, 0), Rp + 0.0047);
          g.strokeStyle = rgba(sc, 1, a);
        }
        // Double break: the secondaries come off the SAME rays as the
        // primary, because that is where they come from.
        if (brk > 0.01) {
          g.strokeStyle = rgba(sc, 1, a * 0.75 * brk);
          seg(Math.max(R + R2 - 0.0052, 0), R + R2 + 0.0052);
          g.strokeStyle = rgba(sc, 1, a);
        }
      }
    }
  }
}

export type FireworksEngine = { fire: () => void; dispose: () => void };

export function createFireworksEngine(
  layer: HTMLDivElement,
  bloom: HTMLCanvasElement,
  core: HTMLCanvasElement,
): FireworksEngine {
  const launches: Launch[] = [];
  let raf = 0;
  // Half resolution: the dome renders its backdrop soft, not vector-crisp.
  const offscreen = document.createElement("canvas");

  const draw = () => {
    raf = 0;
    const container = layer.parentElement;
    const strip =
      container?.querySelector<HTMLElement>(
        ":scope > .dl-skyline, :scope > .dl-horizon-strip",
      ) ?? layer;

    const cRect = layer.getBoundingClientRect();
    const sRect = strip.getBoundingClientRect();
    const W = cRect.width;
    const H = cRect.height;
    if (W === 0 || H === 0) return;

    const oW = Math.ceil(W / 2);
    const oH = Math.ceil(H / 2);
    if (offscreen.width !== oW || offscreen.height !== oH) {
      offscreen.width = oW;
      offscreen.height = oH;
    }
    const g = offscreen.getContext("2d");
    if (!g) return;
    g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    g.clearRect(0, 0, W, H);

    const now = performance.now();
    for (let i = launches.length - 1; i >= 0; i--) {
      if ((now - launches[i]!.start) / 1000 >= FIRE_WINDOW) {
        launches.splice(i, 1);
      }
    }
    if (launches.length > 0) {
      renderLaunches(g, launches, now, {
        ppr: sRect.width / AZ_SPAN,
        ox: sRect.left - cRect.left,
        oy: sRect.bottom - cRect.top,
      });
    }

    // Blit the render through the two display canvases: wide bloom under a
    // soft core.
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of [bloom, core]) {
      if (canvas.width !== Math.round(W * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, 0, 0, oW, oH, 0, 0, W, H);
    }

    if (launches.length > 0) raf = requestAnimationFrame(draw);
  };

  return {
    fire() {
      // Four slots, like the shader's uFires pool.
      if (launches.length >= 4) launches.shift();
      launches.push({ start: performance.now(), seed: Math.random() * 100 });
      if (!raf) raf = requestAnimationFrame(draw);
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

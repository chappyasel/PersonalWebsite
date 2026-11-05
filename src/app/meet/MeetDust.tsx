"use client";

import { useEffect, useRef, useState } from "react";

import { INTRO } from "./intro";
import styles from "./meet.module.css";

/*
 * The long entrance's dust (intro.ts): faint blue dust, as Companion's
 * pages open with, that forms the page. From the first frame the screen is
 * full of grains drifting at random through space, some far behind the
 * screen and some in front of it, while the photo and title come in at the
 * middle. Just after the title starts its glide up, the dust gathers,
 * quickly, and springs into the shapes of the open times on screen, the
 * stars, the meeting, and the Book button. Each part comes in out of its
 * dust and is all the way in just as its dust lands, and the dust fades
 * into it. Nothing stays. The short entrance has none.
 *
 * The grains fill each shape, most densely the meeting and Book, then the
 * stars, and least the open times.
 *
 * Depth: each grain has its own distance and is drawn in perspective from
 * the middle of the screen, far ones small and dim, near ones large and
 * soft, out of focus. The whole cloud turns slowly about the vertical, so
 * the parallax shows it's in space, and comes square as it gathers. Every
 * grain lands at the screen's own depth, on its shape.
 *
 * The canvas spans the document and scrolls with it, not fixed: a fixed
 * layer touching the screen's bottom brings back Safari's strip under its
 * toolbar (gotcha_safari26_fixed_bottom_strip).
 */

type Kind = "meeting" | "book" | "star" | "open";

/** Grains per thousand square pixels, by kind: the meeting and Book most. */
const DENSITY: Record<Kind, number> = {
  meeting: 72,
  book: 52,
  star: 0,
  open: 24,
};
/** Grains per star, which is too small to count by area. */
const PER_STAR = 110;
/** The most grains on the page, so a big screen stays smooth. */
const MOST = 10000;

/** The entrance's animations in meet.module.css that bring a part in. */
const ENTRANCES = /(^|_)meet-(pop|cascade|enter|fade)$/; // CSS modules prefix it
/** A part mostly cut off by what clips it isn't formed at all. */
const LEAST_SHOWN = 0.3;
/** A part counts as in once it's this opaque. */
const IN = 0.92;

/** The grains show in this fast at the start. None gathers before the
 * title has started its glide and this long more. A grain gathers in
 * about this long, and fades into its part over this long once it lands. */
const APPEAR = 450;
const STILL_AFTER_RISE = 140;
const GATHER = 700;
const OUT = 200;
/** Over the end of its gather a grain dims to this share of its light on
 * the faintest part, and to the other on a solid one: it turns into what
 * it forms, as strong as that is. */
const END_FAINT = 0.3;
const END_SOLID = 0.85;
/** Past this far behind the screen a grain is drawn behind the page's
 * head, the photo and the title; nearer, in front of everything. */
const BEHIND = 60;

/** The camera: its focal length in pixels, how far grains sit in front of
 * and behind the screen, and the cloud's turn while it drifts. */
const FOCAL = 900;
const NEAREST = -480;
const FARTHEST = 1600;
const NEAR_SHARE = 0.3;
/** How bright a near grain is, against a far one's dimming. */
const NEAR_LIGHT = 1.25;
const TURN = 0.32; // radians at the start
const TURNING = 0.09; // radians a second, while it drifts

interface Shape {
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  /** When it's in, in ms on the dust's clock. */
  at: number;
  /** How solid it is, from its fill's alpha: 0 to 1. */
  solid: number;
}

interface Grain {
  sx: number;
  sy: number;
  sz: number;
  vx: number;
  vy: number;
  vz: number;
  hx: number;
  hy: number;
  end: number;
  gather: number;
  land: number;
  /** The spring's ring, in radians across the gather. */
  ring: number;
  size: number;
  peak: number;
  curl: number;
  phase: number;
}

const flowAt = (x: number, y: number, t: number) => {
  const a =
    Math.sin(x * 0.0021 + t * 0.35) +
    Math.cos(y * 0.0027 - t * 0.27) +
    Math.sin((x + y) * 0.0013 + t * 0.21);
  return [Math.cos(a * 1.7), Math.sin(a * 1.7)] as const;
};

/** A spring from rest: off slowly, a quick pull, a small overshoot, and
 * settled by the end. */
const DAMPING = 6.5;
const spring = (s: number, ring: number) =>
  s >= 1
    ? 1
    : 1 -
      Math.exp(-DAMPING * s) *
        (Math.cos(ring * s) + (DAMPING / ring) * Math.sin(ring * s));

/** Where a CSS cubic-bezier, or one of its keywords, first reaches `y`, as
 * a share of the animation's time. */
function timeToReach(easing: string, y: number) {
  const named: Record<string, number[]> = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": [0.42, 0, 1, 1],
    "ease-out": [0, 0, 0.58, 1],
    "ease-in-out": [0.42, 0, 0.58, 1],
  };
  const [x1, y1, x2, y2] =
    named[easing] ??
    /cubic-bezier\(([^)]+)\)/.exec(easing)?.[1]?.split(",").map(Number) ??
    named.ease!;
  const at = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  for (let i = 1; i <= 200; i++) {
    const t = i / 200;
    if (at(y1!, y2!, t) >= y) return at(x1!, x2!, t);
  }
  return 1;
}

function sprite(rgb: string, dark: boolean, soft: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) {
    // Out of focus: an even disc with a soft rim, no bright core.
    g.addColorStop(0, `rgb(${rgb} / 0.8)`);
    g.addColorStop(0.55, `rgb(${rgb} / 0.6)`);
    g.addColorStop(1, `rgb(${rgb} / 0)`);
  } else {
    g.addColorStop(0, dark ? "rgb(255 255 255 / 1)" : `rgb(${rgb} / 1)`);
    g.addColorStop(0.14, `rgb(${rgb} / 1)`);
    g.addColorStop(0.42, `rgb(${rgb} / 0.3)`);
    g.addColorStop(1, `rgb(${rgb} / 0)`);
  }
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
}

/** A computed colour's alpha, or 1 with none to read (no fill at all, as
 * a star's glyph). */
function fillAlpha(color: string) {
  const alpha =
    /\/\s*([\d.]+)(%?)\s*\)$/.exec(color) ??
    /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)()\)$/.exec(color);
  if (!alpha) return 1;
  const a = Number(alpha[1]) / (alpha[2] ? 100 : 1);
  return a > 0 ? a : 1;
}

/** The entrance animation on an element itself, if it has one. */
function entranceOn(el: Element) {
  return el
    .getAnimations()
    .find(
      (a): a is CSSAnimation =>
        a instanceof CSSAnimation && ENTRANCES.test(a.animationName),
    );
}

/**
 * The parts the dust forms, in page coordinates, where each comes to rest
 * and as much of it as is shown, with when each is in on the dust's clock
 * (`elapsed` in at the time of reading): when it and every container
 * coming in around it are nearly opaque. The Days either side of the shown
 * ones wait out of sight past the strip's clip, so they're skipped.
 */
function shapesOnScreen(elapsed: number): Shape[] {
  const found: { kind: Kind; el: Element }[] = [
    ...[...document.querySelectorAll(`.${styles.open}`)].map((el) => ({
      kind: "open" as const,
      el,
    })),
    ...[...document.querySelectorAll(`.${styles.bestDot}`)].map((el) => ({
      kind: "star" as const,
      el,
    })),
    ...[...document.querySelectorAll("[data-selection]")].map((el) => ({
      kind: "meeting" as const,
      el,
    })),
    // The computer's card. A phone's Book button waits in the sheet's
    // dock, out of sight until the card opens.
    ...[...document.querySelectorAll("form button[type=submit]")]
      .filter((el) => !el.closest('[role="dialog"]'))
      .map((el) => ({ kind: "book" as const, el })),
  ];

  // When each is in, read first: a finished animation drops out of
  // getAnimations.
  const inAt = new Map<Element, number | null>();
  const whenIn = (el: Element) => {
    if (!inAt.has(el)) {
      const animation = entranceOn(el);
      const timing = animation?.effect?.getTiming();
      inAt.set(
        el,
        animation && typeof timing?.delay === "number"
          ? elapsed +
              timing.delay -
              Number(animation.currentTime ?? 0) +
              Number(timing.duration) *
                timeToReach(getComputedStyle(el).animationTimingFunction, IN)
          : null,
      );
    }
    return inAt.get(el);
  };
  const entering = found.map(({ kind, el }) => {
    let at: number | null = null;
    for (let a: Element | null = el; a; a = a.parentElement) {
      const t = whenIn(a);
      if (t != null) at = Math.max(at ?? t, t);
    }
    return at == null ? null : { kind, el, at };
  });

  // Read where everything comes to rest: every entrance skipped to its
  // end for the reading, and put back, all in one task, so nothing paints.
  const entrances = document
    .getAnimations()
    .filter(
      (a): a is CSSAnimation =>
        a instanceof CSSAnimation && ENTRANCES.test(a.animationName),
    );
  const times = entrances.map((a) => a.currentTime);
  for (const a of entrances)
    a.currentTime = a.effect?.getComputedTiming().endTime as number;

  const clips = new Map<Element, DOMRect | null>();
  const clipOf = (el: Element) => {
    if (!clips.has(el)) {
      const style = getComputedStyle(el);
      clips.set(
        el,
        style.overflowX !== "visible" || style.overflowY !== "visible"
          ? el.getBoundingClientRect()
          : null,
      );
    }
    return clips.get(el);
  };
  const shapes: Shape[] = [];
  for (const part of entering) {
    if (!part) continue;
    const { kind, el, at } = part;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    let left = Math.max(r.left, 0);
    let top = Math.max(r.top, 0);
    let right = Math.min(r.right, innerWidth);
    let bottom = Math.min(r.bottom, innerHeight);
    for (
      let a = el.parentElement;
      a && a !== document.body;
      a = a.parentElement
    ) {
      const clip = clipOf(a);
      if (!clip) continue;
      left = Math.max(left, clip.left);
      top = Math.max(top, clip.top);
      right = Math.min(right, clip.right);
      bottom = Math.min(bottom, clip.bottom);
    }
    const shown = Math.max(0, right - left) * Math.max(0, bottom - top);
    if (shown < LEAST_SHOWN * r.width * r.height) continue;
    shapes.push({
      kind,
      x: left + scrollX,
      y: top + scrollY,
      w: right - left,
      h: bottom - top,
      radius:
        kind === "star"
          ? r.width / 2
          : parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
      at,
      solid: fillAlpha(getComputedStyle(el).backgroundColor),
    });
  }

  entrances.forEach((a, i) => (a.currentTime = times[i] ?? null));
  return shapes;
}

/** A point inside a rounded rectangle, clear of its corners. */
function pointIn(s: Shape): [number, number] {
  const r = Math.min(s.radius, s.w / 2, s.h / 2);
  for (let i = 0; i < 12; i++) {
    const x = s.x + 1.5 + Math.random() * (s.w - 3);
    const y = s.y + 1.5 + Math.random() * (s.h - 3);
    const cx = Math.min(Math.max(x, s.x + r), s.x + s.w - r);
    const cy = Math.min(Math.max(y, s.y + r), s.y + s.h - r);
    if (Math.hypot(x - cx, y - cy) <= r) return [x, y];
  }
  return [s.x + s.w / 2, s.y + s.h / 2];
}

/** Inside a star's dot, a little past its rim. */
function starPoint(s: Shape): [number, number] {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * (s.w / 2 + 1.5);
  return [s.x + s.w / 2 + Math.cos(a) * r, s.y + s.h / 2 + Math.sin(a) * r];
}

/** How far into the entrance the page is: its open times' animations
 * started with it. */
function entranceElapsed() {
  const time = document
    .querySelector(`.${styles.open}`)
    ?.getAnimations()[0]?.currentTime;
  return typeof time === "number" ? time : 0;
}

const between = (a: number, b: number) => a + Math.random() * (b - a);

export function MeetDust() {
  const [on, setOn] = useState(false);
  const front = useRef<HTMLCanvasElement>(null);
  const back = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (document.querySelector(".meet-root[data-intro]")) setOn(true);
  }, []);

  useEffect(() => {
    const canvases = [front.current, back.current];
    const [ahead, behind] = canvases.map((c) => c?.getContext("2d"));
    if (!on || !ahead || !behind) return;

    const root = document.querySelector<HTMLElement>(".meet-root")!;
    const style = getComputedStyle(root);
    const accent = style.getPropertyValue("--mt-accent").trim() || "0 122 255";
    const page = (style.getPropertyValue("--mt-page").trim() || "245 245 245")
      .split(/\s+/)
      .map(Number);
    const dark = (page[0]! + page[1]! + page[2]!) / 3 < 128;
    const sharp = sprite(accent, dark, false);
    const soft = sprite(accent, dark, true);

    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = document.documentElement.clientWidth;
    const H = Math.max(document.documentElement.scrollHeight, innerHeight);
    for (const canvas of canvases) {
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
    }

    // The dust's clock starts with the page's entrance, a frame or two ago.
    const elapsed = entranceElapsed();
    const start = performance.now() - elapsed;
    const shapes = shapesOnScreen(elapsed);
    const wanted = shapes.map((s) =>
      s.kind === "star" ? PER_STAR : (DENSITY[s.kind] * s.w * s.h) / 1000,
    );
    const sum = wanted.reduce((a, b) => a + b, 0);
    const scale = Math.min(1, MOST / Math.max(1, sum));
    const earliest = INTRO.rise + STILL_AFTER_RISE;

    // The camera looks at the middle of the screen as it is at the start.
    const cx0 = scrollX + innerWidth / 2;
    const cy0 = scrollY + innerHeight / 2;
    const grains: Grain[] = [];
    shapes.forEach((s, i) => {
      const n = Math.max(
        s.kind === "star" ? 24 : 12,
        Math.round(wanted[i]! * scale),
      );
      for (let k = 0; k < n; k++) {
        const [hx, hy] = s.kind === "star" ? starPoint(s) : pointIn(s);
        // Starts anywhere on the screen, a little past its sides, at its
        // own depth: placed in space so it's drawn there at the start.
        const sz =
          Math.random() < NEAR_SHARE
            ? NEAREST * between(0.2, 1)
            : FARTHEST * between(0.1, 1);
        const k0 = FOCAL / (FOCAL + sz);
        const px = scrollX + between(-0.1, 1.1) * innerWidth;
        const py = scrollY + between(-0.1, 1.1) * innerHeight;
        const heading = Math.random() * Math.PI * 2;
        const speed = between(8, 26);
        const land = s.at + between(-60, 20);
        grains.push({
          sx: cx0 + (px - cx0) / k0,
          sy: cy0 + (py - cy0) / k0,
          sz,
          vx: Math.cos(heading) * speed,
          vy: Math.sin(heading) * speed,
          vz: between(-60, 60),
          hx,
          hy,
          end: END_FAINT + (END_SOLID - END_FAINT) * s.solid,
          land,
          // Never sooner than the title's glide allows, and never so late
          // that it has no time to gather.
          gather: Math.min(
            land - GATHER * 0.4,
            Math.max(
              earliest + between(0, 120),
              land - GATHER * between(0.85, 1.15),
            ),
          ),
          ring: between(6, 8.5),
          size: between(0.45, 1.05),
          peak: (s.kind === "open" ? 0.5 : 0.68) + Math.random() * 0.3,
          curl: between(20, 60),
          phase: Math.random() * 7,
        });
      }
    });
    const last = Math.max(0, ...grains.map((g) => g.land)) + OUT;

    let raf = 0;
    const tick = (nowMs: number) => {
      const ms = nowMs - start;
      const t = ms / 1000;
      const top = scrollY - 40;
      const bottom = scrollY + innerHeight + 40;
      for (const ctx of [ahead, behind]) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, top, W, bottom - top);
      }
      const cx = scrollX + innerWidth / 2;
      const cy = scrollY + innerHeight / 2;
      for (const g of grains) {
        let alpha: number;
        let x: number;
        let y: number;
        let k = 1;
        let blur = 0;
        let far = false;
        if (ms < g.land) {
          // Drifting where it was going, then sprung home.
          const at = Math.min(ms, g.gather) / 1000;
          const s = Math.max(0, (ms - g.gather) / (g.land - g.gather));
          const e = spring(s, g.ring);
          const left = Math.max(0, 1 - e);
          const [fx, fy] = flowAt(g.sx, g.sy, t);
          const dx = g.sx + g.vx * at + fx * g.curl * left;
          const dy = g.sy + g.vy * at + fy * g.curl * left;
          const dz = g.sz + g.vz * at;
          const wx = dx + (g.hx - dx) * e;
          const wy = dy + (g.hy - dy) * e;
          const wz = dz * (1 - e);
          // The cloud's turn about the vertical, through the screen's
          // middle: slow while it drifts, square once it's gathered.
          const turn = (TURN - TURNING * at) * left ** 2;
          const ox = wx - cx;
          const rx = ox * Math.cos(turn) - wz * Math.sin(turn);
          const rz = Math.max(
            -FOCAL * 0.7,
            ox * Math.sin(turn) + wz * Math.cos(turn),
          );
          k = FOCAL / (FOCAL + rz);
          x = cx + rx * k;
          y = cy + (wy - cy) * k;
          // In focus at the screen's depth: softer the further off it, a
          // near one less so, so it reads as close, not lost.
          blur = Math.min(1, rz > 0 ? rz / 700 : -rz / 1100);
          // A grain that starts in front stays in front.
          far = g.sz > 0 && rz > BEHIND;
          // Far grains dim; near ones stay bright, over the title too.
          const depthLight = k < 1 ? k ** 0.35 : NEAR_LIGHT;
          // Over the end of its gather, it dims to what it forms.
          const ending = Math.min(1, Math.max(0, (s - 0.55) / 0.45));
          const turning = 1 - (1 - g.end) * ending * ending * (3 - 2 * ending);
          alpha = g.peak * Math.min(1, ms / APPEAR) * depthLight * turning;
        } else {
          x = g.hx;
          y = g.hy;
          alpha = g.peak * g.end * (1 - (ms - g.land) / OUT);
        }
        if (alpha <= 0.005 || y < top || y > bottom) continue;
        const twinkle = 0.85 + 0.15 * Math.sin(t * 2.1 + g.phase);
        const size = g.size * (dark ? 5 : 4.4) * k * (1 + blur * 1.2);
        const light = Math.min(1, alpha * twinkle * (dark ? 1 : 0.75));
        // Sharp at the screen's depth, cross-fading to a soft disc off it.
        const ctx = far ? behind : ahead;
        if (blur < 0.98) {
          ctx.globalAlpha = light * (1 - blur);
          ctx.drawImage(sharp, x - size / 2, y - size / 2, size, size);
        }
        if (blur > 0.02) {
          ctx.globalAlpha = light * blur;
          ctx.drawImage(soft, x - size / 2, y - size / 2, size, size);
        }
      }
      if (ms < last) raf = requestAnimationFrame(tick);
      else setOn(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  if (!on) return null;
  // The far dust is positioned with no z-index, ahead of the page's head
  // in the document, so the head, positioned after it, draws over it: the
  // photo and title stand in front. The near dust is over everything.
  return (
    <>
      <canvas
        ref={back}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0"
      />
      <canvas
        ref={front}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-[60]"
      />
    </>
  );
}

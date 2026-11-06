"use client";

import { useEffect, useRef, useState } from "react";

import { blues, curl, trackPointer } from "./confirmed/dust";
import { INTRO } from "./intro";
import styles from "./meet.module.css";

/*
 * The long entrance's dust (intro.ts), in the confirmation's Gather style.
 * As the photo pops in at the middle of the screen it bursts into a puff
 * of blue dust, in shades from deep to icy, that billows out
 * around the photo and title, stirred by a slow swirl. A share of it never
 * leaves the photo: it becomes a tilted ring orbiting it, passing behind
 * it and in front, and rides up with it as the title starts its glide.
 *
 * Just after the glide starts, the dust springs, quickly and a touch past
 * its mark, into the shapes of the open times on screen, the stars, the
 * meeting, and the Book button, the ring breaking up to join it. Each part
 * comes in out of its dust and is all the way in just as its dust lands,
 * and the dust fades into it. Nothing stays. The short entrance has none.
 *
 * The grains fill each shape, most densely the meeting and Book, then the
 * stars, and least the open times. Grains scatter out of the pointer's way
 * as they fly.
 *
 * Most of the puff is drawn behind the page's head, so the photo and title
 * stand in front; some of it, and the near half of the ring, in front of
 * everything.
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
 * title has started its glide and this long more. A grain springs home in
 * about this long, and fades into its part over this long once it lands. */
const APPEAR = 140;
const STILL_AFTER_RISE = 140;
const GATHER = 640;
const OUT = 220;
/** Over the end of its gather a grain dims to this share of its light on
 * the faintest part, and to the other on a solid one: it turns into what
 * it forms, as strong as that is. */
const END_FAINT = 0.3;
const END_SOLID = 0.85;
/** The share of the puff drawn in front of the head. */
const FRONT = 0.25;
/** The share of grains that orbit the photo, and the most that do. */
const ORBIT = 0.16;
const MOST_ORBIT = 460;
/** The spring home: stiffness and damping, a touch under critical. */
const K = 240;
const DAMP = 12.5;

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
  x: number;
  y: number;
  vx: number;
  vy: number;
  hx: number;
  hy: number;
  end: number;
  gather: number;
  land: number;
  size: number;
  peak: number;
  tint: number;
  phase: number;
  front: boolean;
  /** Orbiting the photo until it gathers. */
  orbit?: { a: number; r: number; w: number; lift: number };
}

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

/** An element's live box, in page coordinates. */
function pageBox(el: Element | null) {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0
    ? {
        x: r.left + scrollX,
        y: r.top + scrollY,
        w: r.width,
        h: r.height,
        cx: r.left + r.width / 2 + scrollX,
        cy: r.top + r.height / 2 + scrollY,
      }
    : null;
}

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
    const { sprites: tints, pick } = blues(accent, dark);

    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = document.documentElement.clientWidth;
    const H = Math.max(document.documentElement.scrollHeight, innerHeight);
    for (const canvas of canvases) {
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
    }
    const pointer = trackPointer();

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

    // The puff comes out of the photo and the title, where they sit now,
    // in the middle of the screen.
    const photo = document.querySelector(`.meet-root .${styles.portrait}`);
    const title = document.querySelector(`.meet-root .${styles.title}`);
    const face = pageBox(photo) ?? {
      x: scrollX + innerWidth / 2 - 30,
      y: scrollY + innerHeight * 0.44 - 30,
      w: 60,
      h: 60,
      cx: scrollX + innerWidth / 2,
      cy: scrollY + innerHeight * 0.44,
    };
    const words = pageBox(title) ?? face;

    const total = shapes.reduce(
      (n, s, i) =>
        n +
        Math.max(s.kind === "star" ? 24 : 12, Math.round(wanted[i]! * scale)),
      0,
    );
    const orbitShare = Math.min(ORBIT, MOST_ORBIT / Math.max(1, total));
    const grains: Grain[] = [];
    shapes.forEach((s, i) => {
      const n = Math.max(
        s.kind === "star" ? 24 : 12,
        Math.round(wanted[i]! * scale),
      );
      for (let k = 0; k < n; k++) {
        const [hx, hy] = s.kind === "star" ? starPoint(s) : pointIn(s);
        const land = s.at + between(-60, 20);
        const orbits = Math.random() < orbitShare;
        // A little over a quarter from the photo, the rest from along the
        // title, each thrown out from where it starts: round the photo, and
        // wide of the title.
        let x: number;
        let y: number;
        let a: number;
        if (orbits || Math.random() < 0.28) {
          a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * face.w * 0.45;
          x = face.cx + Math.cos(a) * d;
          y = face.cy + Math.sin(a) * d;
        } else {
          x = between(words.x, words.x + words.w);
          y = between(words.y, words.y + words.h);
          a =
            Math.atan2(y - words.cy, (x - words.cx) * 0.4) + between(-0.6, 0.6);
        }
        const speed = between(140, 860);
        grains.push({
          x,
          y,
          vx: Math.cos(a) * speed * 1.5,
          vy: Math.sin(a) * speed - 120,
          hx,
          hy,
          end: END_FAINT + (END_SOLID - END_FAINT) * s.solid,
          land,
          // Never sooner than the title's glide allows, and never so late
          // that it has no time to spring home.
          gather: Math.min(
            land - GATHER * 0.5,
            Math.max(
              earliest + between(0, 120),
              land - GATHER * between(0.9, 1.1),
            ),
          ),
          size: orbits ? between(2.3, 4) : between(1.3, 2.9),
          peak: orbits
            ? 1
            : (s.kind === "open" ? 0.55 : 0.72) + Math.random() * 0.28,
          tint: pick(),
          phase: Math.random() * 7,
          front: Math.random() < FRONT,
          ...(orbits
            ? {
                vx: between(-60, 60),
                vy: between(-60, 60),
                orbit: {
                  a: Math.random() * Math.PI * 2,
                  r:
                    Math.random() < 0.75 ? between(1.35, 2.1) : between(2.1, 3),
                  w: between(0.55, 0.95),
                  lift: between(-0.1, 0.1),
                },
              }
            : {}),
        });
      }
    });
    const last = Math.max(0, ...grains.map((g) => g.land)) + OUT;

    let raf = 0;
    let prev = performance.now();
    const tick = (nowMs: number) => {
      const ms = nowMs - start;
      const t = ms / 1000;
      const dt = Math.min(1 / 30, (nowMs - prev) / 1000);
      prev = nowMs;
      const top = scrollY - 40;
      const bottom = scrollY + innerHeight + 40;
      for (const ctx of [ahead, behind]) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, top, W, bottom - top);
      }
      const p = pointer.p;
      // The ring rides with the photo as it glides.
      const ring = pageBox(photo) ?? face;
      const R = ring.w / 2;
      for (const g of grains) {
        let tx = g.hx;
        let ty = g.hy;
        let z = 1;
        const homing = ms >= g.gather;
        if (!homing && g.orbit) {
          const a = g.orbit.a + t * 1.6 * g.orbit.w;
          const rr = R * g.orbit.r;
          const ex = Math.cos(a) * rr;
          const ey = Math.sin(a) * rr * (0.36 + g.orbit.lift);
          const tilt = -0.38;
          tx = ring.cx + ex * Math.cos(tilt) - ey * Math.sin(tilt);
          ty = ring.cy + ex * Math.sin(tilt) + ey * Math.cos(tilt);
          z = Math.sin(a);
          const kk = 260 * Math.min(1, ms / 260);
          g.vx += (kk * (tx - g.x) - 22 * g.vx) * dt;
          g.vy += (kk * (ty - g.y) - 22 * g.vy) * dt;
        } else if (!homing) {
          // The puff: thrown out, slowing, stirred.
          const [fx, fy] = curl(g.x, g.y, t);
          g.vx += fx * 110 * dt - g.vx * 1.9 * dt;
          g.vy += fy * 110 * dt - g.vy * 1.9 * dt;
        } else {
          const ramp = Math.min(1, (ms - g.gather) / 200);
          const kk = K * ramp * ramp;
          g.vx += (kk * (tx - g.x) - DAMP * g.vx) * dt;
          g.vy += (kk * (ty - g.y) - DAMP * g.vy) * dt;
        }
        // Out of the pointer's way while it flies.
        if (ms < g.land) {
          const dx = g.x - p.x;
          const dy = g.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 3600 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = (1 - d / 60) * 2400 * dt;
            g.vx += (dx / d) * push;
            g.vy += (dy / d) * push;
          }
        }
        g.x += g.vx * dt;
        g.y += g.vy * dt;

        let alpha: number;
        if (ms < g.land) {
          // Over the end of its gather, it dims to what it forms.
          const s = Math.max(0, (ms - g.gather) / (g.land - g.gather));
          const ending = Math.min(1, Math.max(0, (s - 0.55) / 0.45));
          const turning = 1 - (1 - g.end) * ending * ending * (3 - 2 * ending);
          alpha = g.peak * Math.min(1, ms / APPEAR) * turning;
        } else {
          alpha = g.peak * g.end * (1 - (ms - g.land) / OUT);
        }
        if (alpha <= 0.005 || g.y < top || g.y > bottom) continue;
        const twinkle = 0.78 + 0.22 * Math.sin(t * 9 + g.phase);
        const near = !homing && g.orbit ? z > 0 : g.front || homing;
        // Behind the photo the ring is dimmer, as if in its shadow.
        const light =
          Math.min(1, alpha * twinkle * (dark ? 1 : 0.8)) *
          (!homing && g.orbit && z < 0 ? 0.5 : 1);
        const landing = ms < g.land ? 1 : 0.6 + 0.4 * (1 - (ms - g.land) / OUT);
        const size = g.size * landing;
        const ctx = near ? ahead : behind;
        ctx.globalAlpha = light;
        ctx.drawImage(
          tints[g.tint]!,
          g.x - size,
          g.y - size,
          size * 2,
          size * 2,
        );
      }
      if (ms < last) raf = requestAnimationFrame(tick);
      else setOn(false);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      pointer.stop();
    };
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

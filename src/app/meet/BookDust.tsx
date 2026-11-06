"use client";

import { useEffect, useRef } from "react";

import {
  type Point,
  blues,
  canAnimate,
  curl,
  offerRing,
  overlay,
  palette,
  trackPointer,
} from "./confirmed/dust";

/** Grains in the Book button's ring, per pixel of its orbit. */
const PER_PX = 0.14;
/** How far the ring's orbit clears the button's ends. */
const RING_CLEAR = 20;
/** The ring's perspective, as the ticket's is. */
const PERSPECTIVE = 900;
/** A click near the ring: its pull, then its burst. The burst opens a
 * patch of the ring about the click, not the whole ring: the grains it
 * reaches go as hard as ever, the rest keep orbiting. */
const PULL_MS = 170;
const BLAST = 70;
/** The trail: grains per pixel the meeting moves, and the most per frame. */
const TRAIL_PER_PX = 0.45;
const TRAIL_MOST = 14;
/** The meeting's speed for its whole stretch and lean, in px a second;
 * its lean then, and its tip toward a hovering pointer, in degrees. */
const FULL_SPEED = 1400;
/** How much longer along its way it gets at full speed, and narrower
 * across. */
const STRETCH = 0.3;
const SQUEEZE = 0.1;
const LEAN = 8;
const HOVER_TILT = 5;
/** A jump farther than this is a new week, not a move: no trail. */
const TRAIL_FARTHEST = 420;

type Orbiter = {
  /** Where on the orbit, and how fast it goes round. */
  angle: number;
  speed: number;
  /** Its own lane: how far out (of the ring's radius) and how far off
   * the ring's plane; its own wobble. */
  r: number;
  dy: number;
  phase: number;
  size: number;
  tint: number;
  /** How bright it is at most. */
  peak: number;
  /** Thrown by a click until then; then easing home as `back` reaches 1. */
  free: number;
  back: number;
  /** Whether it was last drawn in front of the button, and the side a
   * click's throw keeps it on till it's home. */
  ahead?: boolean;
  /** Where it is, following its place on the orbit. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** How readily it follows. */
  follow: number;
};

type Blast = { x: number; y: number; at: number; popped: boolean };

type Mote = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
  tint: number;
};

/**
 * The booking form's dust, on a layer over the page. Once the name and the
 * email are good and a time is picked (`ready`), a ring of dust gathers out
 * of the email field and orbits the Book button in depth, the far half
 * passing behind it; it drifts off if the form stops being ready. And the
 * picked meeting sheds dust as it moves, as if it were dust moving, and
 * stretches and leans with its speed (bend).
 */
export function BookDust({ ready }: { ready: boolean }) {
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    if (!canAnimate()) return;
    const layer = overlay(70);
    if (!layer) return;
    const { ctx } = layer;
    const root =
      document.querySelector<HTMLElement>(".meet-root") ??
      document.documentElement;
    const { accent, dark } = palette();
    const { sprites, pick } = blues(accent, dark);
    const pointer = trackPointer();
    const p = pointer.p;

    let ring: Orbiter[] = [];
    let amount = 0;
    let wasReady = false;
    let spin = 0;
    let centre: Point & { R: number } = { x: 0, y: 0, R: 0 };
    const blasts: Blast[] = [];
    const motes: Mote[] = [];
    const seen = new WeakMap<Element, DOMRect>();
    let drew = false;
    let last = performance.now();
    let raf = 0;

    // The meeting as a thing being moved: stretched along its way, up to
    // 1.3x as long at full speed and a little narrower across, its
    // leading edge tipped up toward the eye as if pulled; and, hovered,
    // tipped toward the pointer. All on springs, so it wobbles to rest.
    const hoverable = matchMedia("(hover: hover)").matches;
    const bends = new WeakMap<
      Element,
      {
        vx: number;
        vy: number;
        sx: number;
        sxv: number;
        sy: number;
        syv: number;
        ax: number;
        axv: number;
        ay: number;
        ayv: number;
      }
    >();
    const bend = (
      el: HTMLElement,
      box: DOMRect,
      dx: number,
      dy: number,
      dt: number,
    ) => {
      let b = bends.get(el);
      if (!b) {
        b = {
          vx: 0,
          vy: 0,
          sx: 1,
          sxv: 0,
          sy: 1,
          syv: 0,
          ax: 0,
          axv: 0,
          ay: 0,
          ayv: 0,
        };
        bends.set(el, b);
      }
      if (dt <= 0) return;
      const ease = Math.min(1, dt * 14);
      b.vx += (dx / dt - b.vx) * ease;
      b.vy += (dy / dt - b.vy) * ease;
      const hx = Math.max(-1, Math.min(1, b.vx / FULL_SPEED));
      const hy = Math.max(-1, Math.min(1, b.vy / FULL_SPEED));
      let sxT = 1 + STRETCH * Math.abs(hx) - SQUEEZE * Math.abs(hy);
      let syT = 1 + STRETCH * Math.abs(hy) - SQUEEZE * Math.abs(hx);
      let axT = hy * LEAN;
      let ayT = -hx * LEAN;
      const held =
        el.hasAttribute("data-dragging") || el.hasAttribute("data-lifted");
      if (
        hoverable &&
        !held &&
        p.x > box.left &&
        p.x < box.right &&
        p.y > box.top &&
        p.y < box.bottom
      ) {
        const nx = ((p.x - box.left) / box.width) * 2 - 1;
        const ny = ((p.y - box.top) / box.height) * 2 - 1;
        axT += -ny * HOVER_TILT;
        ayT += nx * HOVER_TILT;
      }
      if (held) {
        sxT = Math.max(sxT, 1);
        syT = Math.max(syT, 1);
      }
      const spring = (x: number, v: number, to: number) => {
        const nv = v + (380 * (to - x) - 20 * v) * dt;
        return [x + nv * dt, nv] as const;
      };
      [b.sx, b.sxv] = spring(b.sx, b.sxv, sxT);
      [b.sy, b.syv] = spring(b.sy, b.syv, syT);
      [b.ax, b.axv] = spring(b.ax, b.axv, axT);
      [b.ay, b.ayv] = spring(b.ay, b.ayv, ayT);
      const still =
        Math.abs(b.sx - 1) < 0.001 &&
        Math.abs(b.sy - 1) < 0.001 &&
        Math.abs(b.ax) < 0.02 &&
        Math.abs(b.ay) < 0.02 &&
        Math.abs(b.sxv) + Math.abs(b.syv) < 0.01 &&
        Math.abs(b.axv) + Math.abs(b.ayv) < 0.5;
      el.style.transform = still
        ? ""
        : `perspective(500px) rotateX(${b.ax.toFixed(2)}deg) rotateY(${b.ay.toFixed(2)}deg) scale(${b.sx.toFixed(4)}, ${b.sy.toFixed(4)})`;
    };

    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    };
    // The Book button on show: the phone's sits in the sheet's dock.
    const bookButton = () => {
      for (const el of document.querySelectorAll("[data-book]")) {
        const r = visible(el);
        if (r) return r;
      }
      return null;
    };

    const gather = (button: DOMRect) => {
      const email = document.querySelector('input[type="email"]');
      const from = email ? visible(email) : null;
      const origin: Point = from
        ? { x: from.left + scrollX + from.width * 0.7, y: from.top + scrollY }
        : {
            x: button.left + scrollX + button.width / 2,
            y: button.top + scrollY + button.height / 2,
          };
      const count = Math.round(
        Math.PI * (button.width + 2 * RING_CLEAR) * PER_PX,
      );
      // Clumps round the ring, and strays: not an even bead.
      const clumps = Array.from(
        { length: 5 + Math.floor(Math.random() * 3) },
        () => Math.random() * Math.PI * 2,
      );
      const between = (a: number, b: number) => a + Math.random() * (b - a);
      ring = Array.from({ length: count }, () => {
        const clumped = Math.random() < 0.55;
        const stray = Math.random() < 0.12;
        return {
          angle: clumped
            ? clumps[Math.floor(Math.random() * clumps.length)]! +
              (Math.random() - 0.5) * between(0.2, 0.7)
            : Math.random() * Math.PI * 2,
          speed: between(0.88, 1.12),
          r: stray ? between(0.78, 1.3) : between(0.93, 1.07),
          dy: (Math.random() - 0.5) * (stray ? 22 : 7),
          phase: Math.random() * Math.PI * 2,
          // The meeting's trail's sizes (motes), so the two read as one
          // dust: a bigger grain is only a bigger, softer glow.
          size: stray ? between(0.45, 0.9) : between(0.6, 1.8),
          tint: pick(),
          peak: stray ? between(0.35, 0.6) : between(0.6, 1),
          free: 0,
          back: 1,
          x: origin.x + (Math.random() - 0.5) * (from ? from.width * 0.5 : 30),
          y: origin.y + (Math.random() - 0.5) * 16,
          vx: (Math.random() - 0.5) * 120,
          vy: (Math.random() - 0.5) * 120,
          follow: between(0.55, 1.45),
        };
      });
    };

    // A click near the ring: it pulls in, then bursts.
    const onDown = (e: PointerEvent) => {
      if (!ring.length || amount < 0.5) return;
      const x = e.pageX;
      const y = e.pageY;
      if (
        Math.abs(x - centre.x) > centre.R + 70 ||
        Math.abs(y - centre.y) > centre.R * 0.45 + 70
      )
        return;
      blasts.push({ x, y, at: performance.now(), popped: false });
    };
    window.addEventListener("pointerdown", onDown, { passive: true });

    // Booked, the ring goes on as the confirmation's dust: its grains as
    // they are, on the screen, drawn from then on by the confirmation.
    offerRing({
      read: () =>
        ring.length && amount > 0.3
          ? ring.map((g) => ({
              x: g.x - scrollX,
              y: g.y - scrollY,
              vx: g.vx,
              vy: g.vy,
              size: g.size * 3.2,
              tint: g.tint,
              delay: 0,
            }))
          : [],
      hide: () => {
        ring = [];
        motes.length = 0;
        layer.clear();
        drew = false;
      },
    });

    const draw = (x: number, y: number, size: number, tint: number, a = 1) => {
      ctx.globalAlpha = a;
      const s = size * 3.2;
      ctx.drawImage(sprites[tint]!, x - s, y - s, s * 2, s * 2);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const t = now / 1000;
      const entering = root.hasAttribute("data-entering");

      // The picked meeting's trail.
      if (!entering) {
        for (const el of document.querySelectorAll("[data-selection]")) {
          const r = visible(el);
          if (!r) continue;
          const box = new DOMRect(
            r.left + scrollX,
            r.top + scrollY,
            r.width,
            r.height,
          );
          const was = seen.get(el);
          seen.set(el, box);
          // By its centre, so a lift's grow isn't taken for a move.
          const dx = was ? box.x + box.width / 2 - (was.x + was.width / 2) : 0;
          const dy = was
            ? box.y + box.height / 2 - (was.y + was.height / 2)
            : 0;
          const moved = Math.hypot(dx, dy);
          bend(
            el as HTMLElement,
            box,
            moved > TRAIL_FARTHEST ? 0 : dx,
            moved > TRAIL_FARTHEST ? 0 : dy,
            dt,
          );
          if (!was || moved < 0.6 || moved > TRAIL_FARTHEST) continue;
          const n = Math.min(TRAIL_MOST, Math.ceil(moved * TRAIL_PER_PX));
          // The edges it's leaving, each as likely as it faces away
          // from the move: both of them on a diagonal.
          const ux = dx / moved;
          const uy = dy / moved;
          const side = Math.abs(ux) * box.height;
          const end = Math.abs(uy) * box.width;
          const backX = dx > 0 ? 0 : box.width;
          const backY = dy > 0 ? 0 : box.height;
          const vx = dx / dt;
          const vy = dy / dt;
          for (let i = 0; i < n; i++) {
            // Somewhere along what it swept this frame, on a trailing edge.
            const u = Math.random();
            const onSide = Math.random() * (side + end) < side;
            const x =
              box.x -
              dx * (1 - u) +
              (onSide ? backX : Math.random() * box.width) +
              (Math.random() - 0.5) * 3;
            const y =
              box.y -
              dy * (1 - u) +
              (onSide ? Math.random() * box.height : backY) +
              (Math.random() - 0.5) * 3;
            // Carried a little the way it goes, then left in its wake:
            // never thrown back past where the move began.
            motes.push({
              x,
              y,
              vx: vx * 0.1 + (Math.random() - 0.5) * 18,
              vy: vy * 0.1 + (Math.random() - 0.5) * 18,
              life: 0.45 + Math.random() * 0.6,
              age: 0,
              size: 0.6 + Math.random() * 1.2,
              tint: pick(),
            });
          }
        }
      }

      // The ring round the Book button.
      const button = bookButton();
      const isReady = readyRef.current && !!button && !entering;
      if (isReady && !wasReady && button) gather(button);
      wasReady = isReady;
      amount +=
        ((isReady ? 1 : 0) - amount) * Math.min(1, dt * (isReady ? 3 : 2));
      if (amount < 0.01 && !isReady) ring = [];

      if (!ring.length && !motes.length) {
        if (drew) layer.clear();
        drew = false;
        return;
      }
      layer.clear();
      drew = true;
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";

      if (ring.length && button) {
        // A real ring in 3D, as the ticket's is: round, tipped back so its
        // near half swings low across the front and its far half passes
        // behind the button, seen in perspective. It rolls and tips as it
        // goes, never at rest.
        const cx = button.left + scrollX + button.width / 2;
        const cy = button.top + scrollY + button.height / 2;

        // A steady turn: the pointer pushes grains aside but never
        // changes its speed.
        spin += dt;
        const R = button.width / 2 + RING_CLEAR;
        centre = { x: cx, y: cy, R };

        const inc =
          Math.max(0.3, (button.height / 2 + 18) / R) +
          0.07 * Math.sin(t * 0.17 + 2) +
          0.03 * Math.sin(t * 0.43);
        const roll =
          0.15 * Math.sin(t * 0.21) + 0.06 * Math.sin(t * 0.57 + 1.3);
        const cInc = Math.cos(inc);
        const sInc = Math.sin(inc);
        const cRoll = Math.cos(roll);
        const sRoll = Math.sin(roll);
        const radius = Math.min(12, button.height / 2);
        const inButton = (x: number, y: number) =>
          x > button.left + scrollX - 1 &&
          x < button.right + scrollX + 1 &&
          y > button.top + scrollY - 1 &&
          y < button.bottom + scrollY + 1 &&
          !(
            (x < button.left + scrollX + radius ||
              x > button.right + scrollX - radius) &&
            (y < button.top + scrollY + radius ||
              y > button.bottom + scrollY - radius)
          );

        // A click: a pull toward it, then a burst away, falling.
        for (let i = blasts.length - 1; i >= 0; i--) {
          const b = blasts[i]!;
          if (now - b.at > 1400) {
            blasts.splice(i, 1);
            continue;
          }
          if (b.popped || now - b.at < PULL_MS) continue;
          b.popped = true;
          for (const g of ring) {
            const d = Math.hypot(g.x - b.x, g.y - b.y);
            if (d > BLAST) continue;
            const a =
              Math.atan2(g.y - b.y, g.x - b.x) + (Math.random() - 0.5) * 0.6;
            const v = (190 + Math.random() * 300) * (1.25 - d / BLAST);
            g.vx += Math.cos(a) * v;
            g.vy += Math.sin(a) * v - 80;
            g.free = now + 260 + Math.random() * 260;
            g.back = 0;
          }
        }

        for (const g of ring) {
          const a = g.angle + (spin * g.speed * 0.5 * 180) / R;
          const rr = R * g.r + Math.sin(t * 1.3 + g.phase) * 2.5;
          // On the ring's plane, tipped toward the eye, rolled, then
          // through the perspective onto the page.
          const px = Math.cos(a) * rr;
          const pz = Math.sin(a) * rr;
          const py = g.dy + pz * sInc;
          const qz = pz * cInc;
          const qx = px * cRoll - py * sRoll;
          const qy = px * sRoll + py * cRoll;
          const s3 = PERSPECTIVE / (PERSPECTIVE - qz);
          const tx = cx + qx * s3;
          const ty = cy + qy * s3;
          const [fx, fy] = curl(g.x, g.y, t * 0.4);
          if (!isReady) {
            // Let go: off on the swirl.
            g.vx += (fx * 60 - 1.2 * g.vx) * dt;
            g.vy += (fy * 60 - 1.2 * g.vy - 20) * dt;
          } else if (now < g.free) {
            // Thrown: falling, with air.
            g.vy += 900 * dt;
            g.vx -= g.vx * 1.1 * dt;
            g.vy -= g.vy * 1.1 * dt;
          } else {
            if (g.back < 1) g.back = Math.min(1, g.back + dt * 1.8);
            const k = 70 * g.follow * g.back * g.back;
            const damp = 9 * Math.sqrt(g.follow);
            g.vx += (k * (tx - g.x) - damp * g.vx + fx * 18) * dt;
            g.vy += (k * (ty - g.y) - damp * g.vy + fy * 18) * dt;
          }
          for (const b of blasts) {
            if (b.popped) continue;
            const dx = b.x - g.x;
            const dy = b.y - g.y;
            const d = Math.hypot(dx, dy);
            if (d > BLAST * 1.1 || d < 1) continue;
            const pullIn = (1 - d / (BLAST * 1.1)) * 1300 * dt;
            g.vx += (dx / d) * pullIn;
            g.vy += (dy / d) * pullIn;
          }
          // Out of the pointer's way.
          const ox = g.x - p.x;
          const oy = g.y - p.y;
          const d2 = ox * ox + oy * oy;
          if (d2 < 3600 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = (1 - d / 60) * 2600 * dt;
            g.vx += (ox / d) * push;
            g.vy += (oy / d) * push;
          }
          g.x += g.vx * dt;
          g.y += g.vy * dt;

          // Sides change only clear of the button, however far a tap has
          // thrown the grain from its place on the ring.
          // Behind the button anywhere; in front only off it.
          let ahead = qz >= 0;
          if (
            g.ahead === false &&
            ahead &&
            g.x > button.left + scrollX - 8 &&
            g.x < button.right + scrollX + 8 &&
            g.y > button.top + scrollY - 8 &&
            g.y < button.bottom + scrollY + 8
          )
            ahead = false;
          g.ahead = ahead;
          if (!ahead && inButton(g.x, g.y)) continue;
          const depth = Math.max(0, Math.min(1, (qz / rr + 1) / 2));
          const twinkle = 0.75 + 0.25 * Math.sin(t * 3 + g.phase);
          draw(
            g.x,
            g.y,
            // Near grains a touch larger, never past a fresh mote by much.
            g.size * s3 * (0.85 + depth * 0.2),
            g.tint,
            amount *
              g.peak *
              twinkle *
              (dark ? 0.7 : 0.62) *
              (ahead && g.back < 1 ? 1 : 0.55 + depth * 0.45),
          );
        }
      }

      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i]!;
        m.age += dt;
        if (m.age >= m.life) {
          motes.splice(i, 1);
          continue;
        }
        const [fx, fy] = curl(m.x, m.y, t * 0.5);
        m.vx += (fx * 14 - 3.5 * m.vx) * dt;
        m.vy += (fy * 14 - 3.5 * m.vy) * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const left = 1 - m.age / m.life;
        draw(
          m.x,
          m.y,
          m.size * (0.5 + left * 0.5),
          m.tint,
          left * left * (dark ? 0.7 : 0.55),
        );
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", onDown);
      offerRing(null);
      pointer.stop();
      layer.remove();
    };
  }, []);

  return null;
}

"use client";

import { useEffect, useRef } from "react";

import { blues, canAnimate, palette, trackPointer } from "./confirmed/dust";
import styles from "./meet.module.css";

/** Grains in the ring. */
const COUNT = 150;
/** How long a tap shows it on a phone. */
const TAP_SHOWS = 3600;
/** How far the photo tips toward the pointer, in degrees. */
const TILT = 9;
/** A drag turns the photo this many degrees a pixel: slowly, a coin
 * turned under the finger rather than spun off it. */
const DEG_PER_PX = 0.9;
/** How far out of the photo the canvas reaches, in photo radii. */
const REACH = 3.4;

type Grain = {
  a: number;
  r: number;
  w: number;
  lift: number;
  size: number;
  peak: number;
  tint: number;
  phase: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

/**
 * The intro's ring round the photo (MeetDust), back while the pointer is on
 * the photo, or for a few seconds after a tap on a phone. It blooms out of
 * the photo onto its orbit, tilted, passing behind the photo and in front,
 * and on the way out draws back into the photo as it fades. The photo
 * turns badge meanwhile: lifted on a shadow, tipped toward the pointer in
 * 3D, glossed where the light catches it, with a bright rim on top. And
 * it spins like a coin under a drag any way, or once for a tap.
 *
 * Its two canvases sit where MeetDust's do: the far one with no z-index,
 * ahead of the page's head in the document, so the photo draws over it;
 * the near one over everything.
 */
export function PortraitRing() {
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const far = back.current;
    const near = front.current;
    const behind = far?.getContext("2d");
    const ahead = near?.getContext("2d");
    if (!canAnimate() || !far || !near || !behind || !ahead) return;
    const root = document.querySelector<HTMLElement>(".meet-root");
    const selector = `.meet-root .${styles.portrait}`;
    const dpr = Math.min(2, devicePixelRatio || 1);

    let sprites: HTMLCanvasElement[] = [];
    let pick = () => 0;
    let grains: Grain[] = [];
    let shown = false;
    let amount = 0;
    let raf = 0;
    let prev = 0;
    let hideAt = 0;
    let side = 0;
    let pointer: ReturnType<typeof trackPointer> | null = null;
    // The photo's tilt toward the pointer, in degrees, on a spring.
    const tilt = { x: 0, y: 0, vx: 0, vy: 0 };
    // Its turn, a coin's spun any way: a drag turns it about the line
    // across the drag, under the finger. The turn is a vector in the
    // photo's plane, its direction the axis and its length the angle in
    // degrees (rotate3d). Let go, it springs to the nearest whole turn
    // about that axis (the photo the right way round again), a flick
    // carrying it on. A tap spins it once.
    const flip = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    let grab: {
      id: number;
      x: number;
      y: number;
      fromX: number;
      fromY: number;
      moved: boolean;
      lastX: number;
      lastY: number;
      at: number;
      vx: number;
      vy: number;
    } | null = null;
    // The nearest whole turn to a turn, about the same axis.
    const whole = (x: number, y: number, more = 0) => {
      const angle = Math.hypot(x, y);
      if (angle < 0.001) return more ? { x: 0, y: more } : { x: 0, y: 0 };
      const to = Math.round(angle / 360) * 360 + more;
      return { x: (x / angle) * to, y: (y / angle) * to };
    };

    const photoEl = () => document.querySelector<HTMLElement>(selector);
    // Its middle and radius, untilted: the tilt and lift turn and grow it
    // about its middle.
    const photoBox = () => {
      const el = photoEl();
      const r = el?.getBoundingClientRect();
      if (!el || !r || r.width === 0) return null;
      return {
        el,
        cx: r.left + scrollX + r.width / 2,
        cy: r.top + scrollY + r.height / 2,
        R: el.offsetWidth / 2,
      };
    };
    const settle = () => {
      const el = photoEl();
      if (!el) return;
      el.style.transform = "";
      el.style.boxShadow = "";
      tilt.x = tilt.y = tilt.vx = tilt.vy = 0;
      flip.x = flip.y = flip.vx = flip.vy = flip.tx = flip.ty = 0;
    };

    // The canvases' corner, in page coordinates, and their size.
    const place = (cx: number, cy: number, R: number) => {
      const want = Math.ceil(R * REACH * 2);
      if (want !== side) {
        side = want;
        for (const c of [far, near]) {
          c.width = c.height = side * dpr;
          c.style.width = c.style.height = `${side}px`;
        }
      }
      const parent = far.offsetParent?.getBoundingClientRect();
      const ox = parent ? parent.left + scrollX : 0;
      const oy = parent ? parent.top + scrollY : 0;
      const left = cx - side / 2;
      const top = cy - side / 2;
      for (const c of [far, near]) {
        c.style.left = `${left - ox}px`;
        c.style.top = `${top - oy}px`;
      }
      return { left, top };
    };

    const seed = (cx: number, cy: number, R: number) => {
      const between = (a: number, b: number) => a + Math.random() * (b - a);
      grains = Array.from({ length: COUNT }, () => {
        // Out of the photo, thrown gently outward.
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * R * 0.6;
        return {
          a: Math.random() * Math.PI * 2,
          r: Math.random() < 0.75 ? between(1.35, 2.1) : between(2.1, 2.8),
          w: between(0.55, 0.95),
          lift: between(-0.1, 0.1),
          size: between(2.8, 5),
          peak: between(0.8, 1),
          tint: pick(),
          phase: Math.random() * 7,
          x: cx + Math.cos(a) * d,
          y: cy + Math.sin(a) * d,
          vx: Math.cos(a) * between(40, 160),
          vy: Math.sin(a) * between(40, 160),
        };
      });
    };

    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(1 / 30, (now - prev) / 1000));
      prev = now;
      const t = now / 1000;
      // Held, it stays out however long the hold.
      if (grab && hideAt) hideAt = now + TAP_SHOWS;
      if (hideAt && now > hideAt) {
        shown = false;
        hideAt = 0;
      }
      // In, a little quicker than out.
      amount +=
        ((shown ? 1 : 0) - amount) * Math.min(1, dt * (shown ? 4.5 : 3.8));
      const box = photoBox();
      for (const ctx of [ahead, behind]) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, side, side);
      }
      if (!grab) {
        flip.vx += (24 * (flip.tx - flip.x) - 8 * flip.vx) * dt;
        flip.vy += (24 * (flip.ty - flip.y) - 8 * flip.vy) * dt;
        flip.x += flip.vx * dt;
        flip.y += flip.vy * dt;
      }
      const turning =
        !!grab ||
        Math.abs(flip.tx - flip.x) + Math.abs(flip.ty - flip.y) > 0.3 ||
        Math.abs(flip.vx) + Math.abs(flip.vy) > 1;
      if (!box || (!shown && amount < 0.01 && !turning)) {
        amount = 0;
        raf = 0;
        settle();
        return;
      }
      const { el, cx, cy, R } = box;
      const { left, top } = place(cx, cy, R);
      // Blooms out onto its orbit; draws back in as it goes.
      const bloom = 0.2 + 0.8 * Math.pow(amount, 0.7);
      const fade = amount * amount * (3 - 2 * amount);
      const p = pointer!.p;

      // The photo as a badge: lifted a little on a shadow all round, and
      // tipped toward the pointer, with a gloss where the light catches.
      const nx = shown ? Math.max(-1, Math.min(1, (p.x - cx) / (R * 2.2))) : 0;
      const ny = shown ? Math.max(-1, Math.min(1, (p.y - cy) / (R * 2.2))) : 0;
      tilt.vx += (120 * (-ny * TILT - tilt.x) - 13 * tilt.vx) * dt;
      tilt.vy += (120 * (nx * TILT - tilt.y) - 13 * tilt.vy) * dt;
      tilt.x += tilt.vx * dt;
      tilt.y += tilt.vy * dt;
      const lift = 1 + 0.08 * fade;
      const spun = Math.hypot(flip.x, flip.y);
      el.style.transform = `perspective(${Math.round(R * 9)}px) rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg)${spun > 0.01 ? ` rotate3d(${flip.x.toFixed(3)}, ${flip.y.toFixed(3)}, 0, ${spun.toFixed(2)}deg)` : ""} scale(${lift.toFixed(4)})`;
      el.style.boxShadow = `0 0 0 1px rgb(var(--mt-ink) / 0.08), 0 0 ${(3 + 16 * fade).toFixed(1)}px rgb(0 0 0 / ${(0.24 * fade).toFixed(3)})`;
      {
        const gx = cx - left + (tilt.y / TILT) * R * 0.55;
        const gy = cy - top - (tilt.x / TILT) * R * 0.55 - R * 0.25;
        const r = R * lift;
        ahead.save();
        ahead.beginPath();
        ahead.arc(cx - left, cy - top, r * 0.98, 0, Math.PI * 2);
        ahead.clip();
        const gloss = ahead.createRadialGradient(gx, gy, 0, gx, gy, r * 1.2);
        gloss.addColorStop(0, `rgb(255 255 255 / ${0.5 * fade})`);
        gloss.addColorStop(0.45, `rgb(255 255 255 / ${0.12 * fade})`);
        gloss.addColorStop(1, "rgb(255 255 255 / 0)");
        ahead.globalAlpha = 1;
        ahead.fillStyle = gloss;
        ahead.fillRect(cx - left - r, cy - top - r, r * 2, r * 2);
        ahead.restore();
        // A bright rim along its top edge, as a badge's bevel.
        ahead.beginPath();
        ahead.arc(cx - left, cy - top, r - 0.75, Math.PI * 1.1, Math.PI * 1.9);
        ahead.strokeStyle = `rgb(255 255 255 / ${0.45 * fade})`;
        ahead.lineWidth = 1.2;
        ahead.stroke();
      }
      const tiltRing = -0.38;
      for (const g of grains) {
        const a = g.a + t * 1.6 * g.w;
        const rr = R * g.r * bloom;
        const ex = Math.cos(a) * rr;
        const ey = Math.sin(a) * rr * (0.36 + g.lift);
        const tx = cx + ex * Math.cos(tiltRing) - ey * Math.sin(tiltRing);
        const ty = cy + ex * Math.sin(tiltRing) + ey * Math.cos(tiltRing);
        g.vx += (220 * (tx - g.x) - 20 * g.vx) * dt;
        g.vy += (220 * (ty - g.y) - 20 * g.vy) * dt;
        // Out of the pointer's way, gently: it's on the photo.
        const dx = g.x - p.x;
        const dy = g.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 600 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (1 - d / 24.5) * 1800 * dt;
          g.vx += (dx / d) * push;
          g.vy += (dy / d) * push;
        }
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        const z = Math.sin(a);
        const twinkle = 0.78 + 0.22 * Math.sin(t * 9 + g.phase);
        // Behind the photo it's dimmer, as if in its shadow.
        const light = g.peak * fade * twinkle * (z < 0 ? 0.6 : 1);
        if (light < 0.005) continue;
        const s = g.size * (0.75 + 0.25 * bloom);
        const ctx = z > 0 ? ahead : behind;
        ctx.globalAlpha = light;
        ctx.drawImage(
          sprites[g.tint]!,
          g.x - left - s,
          g.y - top - s,
          s * 2,
          s * 2,
        );
      }
      raf = requestAnimationFrame(tick);
    };

    const show = (on: boolean) => {
      if (on && root?.hasAttribute("data-entering")) return;
      if (on === shown) return;
      shown = on;
      if (!on) return;
      const box = photoBox();
      if (!box) return;
      if (!sprites.length) {
        const colours = palette();
        ({ sprites, pick } = blues(colours.accent, colours.dark));
      }
      pointer ??= trackPointer();
      // From inside the photo again if it had all gone.
      if (amount < 0.05) seed(box.cx, box.cy, box.R);
      if (!raf) {
        prev = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const onPhoto = (e: Event) =>
      e.target instanceof Element && e.target.closest(selector) !== null;
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (onPhoto(e)) show(true);
    };
    const out = (e: PointerEvent) => {
      if (e.pointerType === "touch" || grab) return;
      if (
        onPhoto(e) &&
        !(
          e.relatedTarget instanceof Element &&
          e.relatedTarget.closest(selector)
        )
      )
        show(false);
    };
    // A tap on the photo shows it a while; a tap anywhere else lets it go.
    // Either way, a press on the photo may turn it.
    const down = (e: PointerEvent) => {
      if (onPhoto(e)) {
        if (root?.hasAttribute("data-entering")) return;
        show(true);
        if (e.pointerType === "touch") hideAt = performance.now() + TAP_SHOWS;
        grab = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          fromX: flip.x,
          fromY: flip.y,
          moved: false,
          lastX: e.clientX,
          lastY: e.clientY,
          at: performance.now(),
          vx: 0,
          vy: 0,
        };
      } else if (e.pointerType === "touch" && shown) {
        hideAt = performance.now();
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== grab?.id) return;
      // Released where this never heard of it (another window, say).
      if (e.pointerType === "mouse" && e.buttons === 0) {
        up(e);
        return;
      }
      const dx = e.clientX - grab.x;
      const dy = e.clientY - grab.y;
      if (!grab.moved && Math.hypot(dx, dy) > 6) grab.moved = true;
      if (!grab.moved) return;
      const now = performance.now();
      const span = Math.max(8, now - grab.at) / 1000;
      grab.vx = (e.clientX - grab.lastX) / span;
      grab.vy = (e.clientY - grab.lastY) / span;
      grab.lastX = e.clientX;
      grab.lastY = e.clientY;
      grab.at = now;
      // Right turns it about the vertical; down, about the horizontal,
      // its top coming toward you.
      flip.x = flip.tx = grab.fromX - dy * DEG_PER_PX;
      flip.y = flip.ty = grab.fromY + dx * DEG_PER_PX;
      flip.vx = flip.vy = 0;
      if (e.pointerType === "touch") hideAt = now + TAP_SHOWS;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== grab?.id) return;
      const { moved, vx, vy } = grab;
      grab = null;
      if (e.pointerType === "touch") hideAt = performance.now() + TAP_SHOWS;
      if (!moved) {
        ({ x: flip.tx, y: flip.ty } = whole(flip.x, flip.y, 360));
        return;
      }
      // The flick, as a turn, at most 300 degrees of it.
      let fx = -vy * DEG_PER_PX * 0.08;
      let fy = vx * DEG_PER_PX * 0.08;
      const most = Math.hypot(fx, fy);
      if (most > 300) {
        fx *= 300 / most;
        fy *= 300 / most;
      }
      ({ x: flip.tx, y: flip.ty } = whole(flip.x + fx, flip.y + fy));
      flip.vx = -vy * DEG_PER_PX * 0.15;
      flip.vy = vx * DEG_PER_PX * 0.15;
      // A mouse that dragged off the photo lets the ring go now.
      if (
        e.pointerType !== "touch" &&
        !(e.target instanceof Element && e.target.closest(selector))
      )
        show(false);
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", down, { passive: true });
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    // Held as the window loses focus, it never hears the release: it lets
    // go then, settling on a whole turn.
    const drop = () => {
      if (!grab) return;
      grab = null;
      ({ x: flip.tx, y: flip.ty } = whole(flip.x, flip.y));
      if (!raf) {
        prev = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    const hidden = () => document.hidden && drop();
    window.addEventListener("blur", drop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", drop);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", down);
      cancelAnimationFrame(raf);
      pointer?.stop();
      settle();
    };
  }, []);

  return (
    <>
      <canvas
        ref={back}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 size-0"
      />
      <canvas
        ref={front}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-[60] size-0"
      />
    </>
  );
}

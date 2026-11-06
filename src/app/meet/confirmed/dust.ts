/**
 * Shared pieces for /meet's dust, the confirmation's and the intro's: the
 * page's colours, a canvas laid over the document, glow sprites, a swirl
 * to stir drifting grains with, and the pointer.
 *
 * The overlay spans the document and scrolls with it rather than being
 * fixed: a fixed layer touching the screen's bottom brings back Safari's
 * strip under its toolbar (MeetDust).
 */

export type Point = { x: number; y: number };

/** Motion is wanted and the browser can draw it (jsdom can't). */
export function canAnimate() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function palette() {
  const root =
    document.querySelector<HTMLElement>(".meet-root") ??
    document.documentElement;
  const s = getComputedStyle(root);
  const accent = s.getPropertyValue("--mt-accent").trim() || "0 122 255";
  const page = (s.getPropertyValue("--mt-page").trim() || "245 245 247")
    .split(/\s+/)
    .map(Number);
  const dark = (page[0]! + page[1]! + page[2]!) / 3 < 128;
  return { accent, dark };
}

export type Overlay = {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  /** Clears what's on screen now, in page coordinates. */
  clear: () => void;
  remove: () => void;
};

/** A canvas over the whole document, drawn in page coordinates. */
export function overlay(z = 60): Overlay | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    left: "0",
    top: "0",
    pointerEvents: "none",
    zIndex: String(z),
  });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = () => {
    canvas.style.width = canvas.style.height = "0px";
    const w = document.documentElement.clientWidth;
    const h = Math.max(document.documentElement.scrollHeight, innerHeight);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  };
  document.body.appendChild(canvas);
  size();
  window.addEventListener("resize", size);
  return {
    ctx,
    dpr,
    clear: () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(
        scrollX - 20,
        scrollY - 20,
        innerWidth + 40,
        innerHeight + 40,
      );
    },
    remove: () => {
      window.removeEventListener("resize", size);
      canvas.remove();
    },
  };
}

/** A round glow: a white-hot core on dark, solid colour on light. */
export function sprite(rgb: string, dark: boolean, hot = true) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, hot && dark ? "rgb(255 255 255 / 1)" : `rgb(${rgb} / 1)`);
  g.addColorStop(0.16, `rgb(${rgb} / 1)`);
  g.addColorStop(0.45, `rgb(${rgb} / 0.28)`);
  g.addColorStop(1, `rgb(${rgb} / 0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
}

/** An element's centre, in page coordinates. */
export function centreOf(el: Element): Point {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + r.width / 2 + scrollX,
    y: r.top + r.height / 2 + scrollY,
  };
}

/** The point `t` (0 to 1) of the way round a rounded rectangle's edge. */
export function aroundRect(
  r: { left: number; top: number; width: number; height: number },
  radius: number,
  t: number,
): Point {
  const R = Math.min(radius, r.width / 2, r.height / 2);
  const sw = r.width - 2 * R;
  const sh = r.height - 2 * R;
  const arc = (Math.PI / 2) * R;
  const total = 2 * sw + 2 * sh + 4 * arc;
  let d = (((t % 1) + 1) % 1) * total;
  const L = r.left;
  const T = r.top;
  const segs: [number, (d: number) => Point][] = [
    [sw, (d) => ({ x: L + R + d, y: T })],
    [arc, (d) => corner(L + r.width - R, T + R, -Math.PI / 2 + d / R)],
    [sh, (d) => ({ x: L + r.width, y: T + R + d })],
    [arc, (d) => corner(L + r.width - R, T + r.height - R, d / R)],
    [sw, (d) => ({ x: L + r.width - R - d, y: T + r.height })],
    [arc, (d) => corner(L + R, T + r.height - R, Math.PI / 2 + d / R)],
    [sh, (d) => ({ x: L, y: T + r.height - R - d })],
    [arc, (d) => corner(L + R, T + R, Math.PI + d / R)],
  ];
  function corner(cx: number, cy: number, a: number) {
    return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
  }
  for (const [len, at] of segs) {
    if (d <= len) return at(d);
    d -= len;
  }
  return { x: L, y: T };
}

export const between = (a: number, b: number) => a + Math.random() * (b - a);

/** A smooth swirl to stir drifting grains with. */
export function curl(x: number, y: number, t: number): [number, number] {
  const a =
    Math.sin(x * 0.006 + t * 0.9) +
    Math.cos(y * 0.007 - t * 0.7) +
    Math.sin((x + y) * 0.004 + t * 0.5);
  return [Math.cos(a * 1.7), Math.sin(a * 1.7)];
}

/** The pointer in page coordinates, and how fast it's moving. */
export function trackPointer() {
  const p = { x: -9999, y: -9999, vx: 0, vy: 0, inside: false, at: 0 };
  const move = (e: PointerEvent) => {
    const x = e.pageX;
    const y = e.pageY;
    const now = performance.now();
    const dt = Math.max(8, now - p.at) / 1000;
    if (p.inside) {
      p.vx = (x - p.x) / dt;
      p.vy = (y - p.y) / dt;
    }
    p.x = x;
    p.y = y;
    p.at = now;
    p.inside = true;
  };
  const leave = () => {
    p.inside = false;
    p.x = p.y = -9999;
  };
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerdown", move, { passive: true });
  document.addEventListener("pointerleave", leave);
  return {
    p,
    stop: () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      document.removeEventListener("pointerleave", leave);
    },
  };
}

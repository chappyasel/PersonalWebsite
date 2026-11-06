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
  if (navigator.userAgent.includes("jsdom")) return false;
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
/**
 * The stretch of the page a frame has to wipe, in page coordinates: all
 * the screen can show, not just `innerHeight`. iOS Safari draws the page
 * on under its translucent toolbars, below `innerHeight`, so dust that
 * drifts there was drawn and never wiped, and froze into streaks behind
 * the bar. Kept with the last frame's band, so a grain drawn before a fast
 * scroll is still wiped after it.
 */
export function wiper(margin = 120) {
  let last: { top: number; bottom: number } | null = null;
  return () => {
    const tall = Math.max(
      innerHeight,
      screen.height,
      window.visualViewport?.height ?? 0,
    );
    const band = { top: scrollY - margin, bottom: scrollY + tall + margin };
    const top = Math.min(band.top, last?.top ?? band.top);
    const bottom = Math.max(band.bottom, last?.bottom ?? band.bottom);
    last = band;
    return { top, height: bottom - top };
  };
}

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
  const band = wiper();
  document.body.appendChild(canvas);
  size();
  window.addEventListener("resize", size);
  return {
    ctx,
    dpr,
    clear: () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { top, height } = band();
      // The canvas is the document's width: wipe all of it across.
      ctx.clearRect(0, top, canvas.width / dpr, height);
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

/**
 * The dust's colours: shades of the one blue, from deep to icy, with the
 * accent itself most often. `pick` draws one, weighted toward the accent.
 */
export function blues(accent: string, dark: boolean) {
  const shades = [
    accent,
    dark ? "120 190 255" : "60 150 255",
    dark ? "40 100 255" : "0 84 210",
    dark ? "190 225 255" : "110 175 255",
  ];
  const sprites = shades.map((rgb) => sprite(rgb, dark));
  return {
    sprites,
    pick: () => {
      const r = Math.random();
      return r < 0.55 ? 0 : r < 0.75 ? 1 : r < 0.9 ? 2 : 3;
    },
  };
}

/** The foil's glints: white and the pale end of the blue. */
export const GLINTS = [
  "255 255 255",
  "205 230 255",
  "160 205 255",
  "110 175 255",
  "70 145 255",
];

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

/**
 * The handoff from the booking form to its confirmation: the dust the form
 * leaves where it stood, in screen coordinates, the moment it books. The
 * Book button's ring grains carry on as they were moving; the form's own
 * dust (its edge, its fields, its words, the button) holds the form's shape
 * until `delay`, then lets go, in a wave out from the button.
 */
export type Seed = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  tint?: number;
  delay: number;
};

export type Handoff = Point & { seeds?: Seed[] };

let ringHandle: { read: () => Seed[]; hide: () => void } | null = null;

/** BookDust offers its ring for the handoff while it's up. */
export function offerRing(handle: typeof ringHandle) {
  ringHandle = handle;
}

/** The ring's grains as they are, and the ring gone from its own layer:
 * from here the confirmation draws them. */
export function takeRing(): Seed[] {
  const seeds = ringHandle?.read() ?? [];
  ringHandle?.hide();
  return seeds;
}

/** The most grains the form turns into, and the rest of the screen. */
const FORM_GRAINS = 2000;
const SCREEN_GRAINS = 1800;

/** What's on screen of `el`, inside anything that clips it (a phone's
 * sheet). */
function visibleClip(el: Element) {
  let clip = new DOMRect(0, 0, innerWidth, innerHeight);
  for (let up = el.parentElement; up; up = up.parentElement) {
    const o = getComputedStyle(up);
    if (o.overflowX === "visible" && o.overflowY === "visible") continue;
    const r = up.getBoundingClientRect();
    const left = Math.max(clip.left, r.left);
    const top = Math.max(clip.top, r.top);
    clip = new DOMRect(
      left,
      top,
      Math.max(0, Math.min(clip.right, r.right) - left),
      Math.max(0, Math.min(clip.bottom, r.bottom) - top),
    );
  }
  return clip;
}

/** Dust laid over a part of the screen, clipped to what shows of it. */
function sampler(clip: DOMRect, cover?: DOMRect) {
  const seeds: Seed[] = [];
  const add = (x: number, y: number, size: number) => {
    if (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom)
      return;
    if (
      cover &&
      x > cover.left &&
      x < cover.right &&
      y > cover.top &&
      y < cover.bottom
    )
      return;
    seeds.push({ x, y, vx: 0, vy: 0, size, delay: 0 });
  };
  const jitter = () => (Math.random() - 0.5) * 1.5;
  return {
    seeds,
    outline(r: DOMRect, every: number, size: number) {
      if (!r.width || !r.height) return;
      for (let x = r.left; x <= r.right; x += every) {
        add(x + jitter(), r.top + jitter(), size);
        add(x + jitter(), r.bottom + jitter(), size);
      }
      for (let y = r.top + every; y < r.bottom; y += every) {
        add(r.left + jitter(), y + jitter(), size);
        add(r.right + jitter(), y + jitter(), size);
      }
    },
    fill(r: DOMRect, per: number, size: number, inset = 0) {
      const n = Math.round((r.width * r.height) / per);
      for (let i = 0; i < n; i++)
        add(
          r.left + r.width * Math.random(),
          r.top + r.height * (inset + (1 - 2 * inset) * Math.random()),
          size * (0.7 + Math.random() * 0.6),
        );
    },
    /** Each line of the words under `root`, as a dusty smear its size. */
    words(root: Node, per: number, size: number, skip?: Element) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent?.trim()) continue;
        if (skip?.contains(n)) continue;
        const host = n.parentElement;
        if (host?.closest("[aria-hidden=true], .sr-only, script, style"))
          continue;
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) this.fill(r, per, size, 0.2);
      }
      range.detach();
    },
  };
}

/** Thins dust evenly down to `most`, which keeps its shape. */
function thin(seeds: Seed[], most: number) {
  for (let i = seeds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [seeds[i], seeds[j]] = [seeds[j]!, seeds[i]!];
  }
  seeds.length = Math.min(seeds.length, most);
  return seeds;
}

/**
 * The booking screen as dust, the moment it books: the form most of all
 * (its card's edge, each field's outline, every line of its words, the
 * Book button filled), then, lighter, the rest of the screen (its words,
 * the Days' panel, their open times, and the picked meeting). All of it
 * lets go in one wave out from the Book button (`button`).
 */
export function sampleForm(form: Element, book: Element | null): Seed[] {
  const near = sampler(visibleClip(form));
  const box = form.getBoundingClientRect();
  if (getComputedStyle(form).borderTopWidth !== "0px") near.outline(box, 4, 2);
  for (const field of form.querySelectorAll<HTMLElement>(
    "input:not([type=hidden]), textarea",
  ))
    near.outline(field.getBoundingClientRect(), 3, 1.9);
  // The Book button, inside the form or docked outside it on a phone.
  const shown = new DOMRect(0, 0, innerWidth, innerHeight);
  const pressed = book?.getBoundingClientRect();
  const keys = sampler(shown);
  if (pressed) keys.fill(pressed, 12, 2.4);
  near.seeds.push(...keys.seeds);
  near.words(form, 5, 1.9);

  // The rest of the screen, but not what's under a phone's sheet, which
  // the form rides in (fixed, over the Days).
  let sheet: Element | null = form.parentElement;
  while (sheet && getComputedStyle(sheet).position !== "fixed")
    sheet = sheet.parentElement;
  const screen = form.closest("main");
  const far = sampler(
    new DOMRect(0, 0, innerWidth, innerHeight),
    sheet?.getBoundingClientRect(),
  );
  if (screen) {
    far.words(screen, 8, 1.8, form);
    for (const panel of screen.querySelectorAll('[role="group"]'))
      far.outline(panel.getBoundingClientRect(), 4, 1.9);
    for (const day of screen.querySelectorAll("[data-day]"))
      for (const block of day.children) {
        const fill = getComputedStyle(block).backgroundColor;
        if (fill === "transparent" || fill.endsWith(", 0)")) continue;
        far.fill(block.getBoundingClientRect(), 55, 1.9);
      }
    for (const picked of screen.querySelectorAll("[data-selection]"))
      far.fill(picked.getBoundingClientRect(), 10, 2.3);
  }

  const from = pressed
    ? {
        x: pressed.left + pressed.width / 2,
        y: pressed.top + pressed.height / 2,
      }
    : { x: box.left + box.width / 2, y: box.bottom };
  const seeds = [
    ...thin(near.seeds, FORM_GRAINS),
    ...thin(far.seeds, SCREEN_GRAINS),
  ];
  for (const s of seeds) {
    const d = Math.hypot(s.x - from.x, s.y - from.y);
    s.delay = 50 + Math.min(440, d / 1.8) + Math.random() * 40;
  }
  return seeds;
}

/** And back: the confirmation offers its ring the same way, for "Book
 * another time". */
let ticketRing: (() => Seed[]) | null = null;
export function offerTicketRing(read: typeof ticketRing) {
  ticketRing = read;
}

/**
 * The confirmation as dust, as it leaves for another booking: the ticket's
 * edge, the words on its face, its foil, the "Book another time" button,
 * and the ring round it as it is.
 */
export function sampleTicket(
  card: Element,
  face: Element | null,
  foil: Element | null,
  button: Element | null,
): Seed[] {
  const all = sampler(new DOMRect(0, 0, innerWidth, innerHeight));
  all.outline(card.getBoundingClientRect(), 4, 2);
  if (foil) all.fill(foil.getBoundingClientRect(), 34, 2);
  if (face) all.words(face, 6, 1.9);
  if (button) {
    all.fill(button.getBoundingClientRect(), 14, 2.2);
    all.words(button, 6, 1.8);
  }
  return [...(ticketRing?.() ?? []), ...thin(all.seeds, 1800)];
}

/**
 * Dust from `from` flies to `to` and becomes it: each grain drifts off
 * where it was, then is drawn to its place, in a wave out from where the
 * dust came from, and fades there as what it made comes in under it.
 * Resolves its layer away when it's all settled.
 */
export function reassemble(from: Seed[], to: Seed[]) {
  if (!from.length || !to.length || !canAnimate()) return;
  const layer = overlay(70);
  if (!layer) return;
  const { ctx } = layer;
  const { accent, dark } = palette();
  const { sprites, pick } = blues(accent, dark);
  const between = (a: number, b: number) => a + Math.random() * (b - a);
  let cx = 0;
  let cy = 0;
  for (const s of from) {
    cx += s.x / from.length;
    cy += s.y / from.length;
  }
  const grains = to.map((t, i) => {
    const s = from[i % from.length]!;
    const extra = i >= from.length;
    const d = Math.hypot(t.x - cx, t.y - cy);
    return {
      x: s.x + scrollX + (extra ? between(-4, 4) : 0),
      y: s.y + scrollY + (extra ? between(-4, 4) : 0),
      vx: s.vx * 0.4 + between(-70, 70),
      vy: s.vy * 0.4 - between(30, 160),
      tx: t.x + scrollX,
      ty: t.y + scrollY,
      from: s.size,
      size: t.size,
      tint: s.tint ?? pick(),
      go: 60 + Math.min(380, d / 2.2) + between(0, 60),
    };
  });
  const began = performance.now();
  let last = began;
  let raf = 0;
  const frame = (now: number) => {
    const ms = now - began;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    const t = now / 1000;
    layer.clear();
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    let live = 0;
    for (const g of grains) {
      const since = ms - g.go;
      const a = since < 420 ? 1 : 1 - (since - 420) / 380;
      if (a <= 0) continue;
      live++;
      if (since < 0) {
        // Let go: drifting, stirred, slowing.
        const [fx, fy] = curl(g.x, g.y, t);
        g.vx += (fx * 300 - g.vx * 2.6) * dt;
        g.vy += (fy * 300 - g.vy * 2.6) * dt;
      } else {
        g.vx += (190 * (g.tx - g.x) - 15 * g.vx) * dt;
        g.vy += (190 * (g.ty - g.y) - 15 * g.vy) * dt;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      const k = Math.max(0, Math.min(1, since / 420));
      const s = g.from + (g.size - g.from) * k;
      ctx.globalAlpha = a * (dark ? 1 : 0.85);
      ctx.drawImage(sprites[g.tint]!, g.x - s, g.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (live) raf = requestAnimationFrame(frame);
    else layer.remove();
  };
  frame(began);
  return () => {
    cancelAnimationFrame(raf);
    layer.remove();
  };
}

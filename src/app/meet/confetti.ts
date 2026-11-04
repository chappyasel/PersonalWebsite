/**
 * A burst of confetti from a rect, such as the Book button once a booking
 * lands. It draws on a canvas laid over the page for about two seconds and
 * then removes itself; it takes no clicks, and Reduce motion skips it.
 */
const COLORS = [
  "#007aff",
  "#64d2ff",
  "#ffcc00",
  "#ff9f0a",
  "#30d158",
  "#ff375f",
];
const PIECES = 90;
const LIFE_MS = 2200;
const GRAVITY = 1400; // px/s²
const DRAG = 1.6; // per second

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  w: number;
  h: number;
  color: string;
};

export function confettiFrom(rect: DOMRect) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "200",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(ratio, ratio);

  const pieces: Piece[] = Array.from({ length: PIECES }, () => {
    // Up and out in a fan over the button, faster toward its middle.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = 520 + Math.random() * 560;
    return {
      x: rect.left + rect.width * (0.2 + Math.random() * 0.6),
      y: rect.top + rect.height * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      spin: (Math.random() - 0.5) * 18,
      angle: Math.random() * Math.PI,
      w: 5 + Math.random() * 5,
      h: 8 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    };
  });

  const began = performance.now();
  let last = began;
  const frame = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    const age = now - began;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.globalAlpha = Math.max(
      0,
      1 - Math.max(0, age - LIFE_MS * 0.6) / (LIFE_MS * 0.4),
    );
    for (const p of pieces) {
      p.vx -= p.vx * DRAG * dt;
      p.vy += GRAVITY * dt - p.vy * DRAG * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      // A flat flake turning over: its height swings through zero.
      ctx.scale(1, Math.cos(p.angle * 1.7));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (age < LIFE_MS) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

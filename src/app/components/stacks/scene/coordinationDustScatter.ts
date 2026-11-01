/** The orb's grains thrown out across the window. It runs in the page's pixels
 * on the page's own spring, damping, and field, because these are the grains
 * the next page's dust picks up from. Free of Three so it can be tested alone. */

const SPRING = 1.5;
const DAMPING = 2.5;
const FLOW = 40;
/** Pixels per second out of the orb, before damping takes it. */
const BLAST = { least: 500, range: 1100 };

export type DustScatter = {
  count: number;
  position: Float32Array;
  velocity: Float32Array;
  home: Float32Array;
  time: number;
};

type Point = Readonly<{ x: number; y: number }>;
type Viewport = Readonly<{ width: number; height: number }>;

/** Each grain leaves along its own line out of the orb and settles somewhere of
 * its own across the window. */
export function scatterCoordinationDust(
  grains: readonly Point[],
  orb: Point,
  viewport: Viewport,
  random: () => number = Math.random,
): DustScatter {
  const count = grains.length;
  const scatter: DustScatter = {
    count,
    position: new Float32Array(count * 2),
    velocity: new Float32Array(count * 2),
    home: new Float32Array(count * 2),
    time: 0,
  };
  grains.forEach((grain, index) => {
    const at = index * 2;
    scatter.position[at] = grain.x;
    scatter.position[at + 1] = grain.y;
    scatter.home[at] = random() * viewport.width;
    scatter.home[at + 1] = random() * viewport.height;
    const away =
      grain.x === orb.x && grain.y === orb.y
        ? random() * Math.PI * 2
        : Math.atan2(grain.y - orb.y, grain.x - orb.x);
    const speed = BLAST.least + random() * BLAST.range;
    scatter.velocity[at] = Math.cos(away) * speed;
    scatter.velocity[at + 1] = Math.sin(away) * speed;
  });
  return scatter;
}

function stepOnce(scatter: DustScatter, dt: number) {
  scatter.time += dt;
  const { position, velocity, home, time } = scatter;
  for (let at = 0; at < scatter.count * 2; at += 2) {
    const x = position[at]!;
    const y = position[at + 1]!;
    const a =
      Math.sin(x * 0.0021 + time * 0.35) +
      Math.cos(y * 0.0027 - time * 0.27) +
      Math.sin((x + y) * 0.0013 + time * 0.21);
    const vx =
      velocity[at]! +
      (SPRING * (home[at]! - x) -
        DAMPING * velocity[at]! +
        Math.cos(a * 1.7) * FLOW) *
        dt;
    const vy =
      velocity[at + 1]! +
      (SPRING * (home[at + 1]! - y) -
        DAMPING * velocity[at + 1]! +
        Math.sin(a * 1.7) * FLOW) *
        dt;
    velocity[at] = vx;
    velocity[at + 1] = vy;
    position[at] = x + vx * dt;
    position[at + 1] = y + vy * dt;
  }
}

/** A long frame takes fixed steps, so a slow device moves the same dust. */
export function stepDustScatter(scatter: DustScatter, delta: number) {
  for (let left = Math.min(delta, 0.25); left > 0; left -= 1 / 60) {
    stepOnce(scatter, Math.min(left, 1 / 60));
  }
}

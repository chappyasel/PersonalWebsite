/** coordination.sh's dust (src/app/components/Dust.tsx), gathered into a ball
 * around the blinker. It keeps the page's units: distances are the page's
 * pixels and `DUST_LOCAL_PER_PX` scales the whole cloud into the room, so the
 * page's forces read here unchanged. Free of Three so it can be tested alone. */

type Rgb = readonly [number, number, number];

/** The page's dark --human, --agent, and --rest. The sphere is the dark page
 * here, so the room's own theme does not change them. */
export const COORDINATION_DUST_COLORS: readonly [Rgb, Rgb, Rgb] = Object.freeze([
  [99, 142, 252],
  [255, 154, 82],
  [200, 200, 204],
]);

export const COORDINATION_DUST_COUNT = 150;
const CLOUD_RADIUS = 190;
/** The page's turn is wider than tall. Flatter than this leaves the sphere's
 * top and bottom empty. */
const TILT = 0.92;
/** The sphere's radius, so the cloud at rest just fills it. */
export const DUST_LOCAL_PER_PX = 0.1 / CLOUD_RADIUS;
/** The page's blinker is 0.6em by 1.15em, and this is its em in the room. */
export const BLINKER_EM = Object.freeze({ width: 0.6, height: 1.15 });
export const BLINKER_LOCAL_PER_EM = 0.062 / BLINKER_EM.height;
/** Faster than the page's 0.025: the same grain speed on a smaller turn. */
export const DUST_REST_SPIN = 0.07;

const HAND = { reach: 266, drag: 5, push: 2.5, fade: 5, most: 170 };
const WIND = { depth: 0.7, ease: 6, most: 110 };
const SPRING = 1.5;
const DAMPING = 2.5;
const FLOW = 40;
const REST_MIN = 0.25;
const REST_RANGE = 0.5;

export type CoordinationDust = {
  count: number;
  position: Float32Array;
  velocity: Float32Array;
  /** Each grain's turn around the blinker: radius, angle, height. */
  turnRadius: Float32Array;
  turnAngle: Float32Array;
  turnHeight: Float32Array;
  kind: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  peak: Float32Array;
  phase: Float32Array;
  hand: { x: number; y: number; z: number; vx: number; vy: number; vz: number } | null;
  gust: { x: number; y: number; z: number };
  time: number;
};

export type CoordinationDustInput = {
  /** Radians per second around the blinker. */
  spin: number;
  /** 1 holds the cloud at rest; lower gathers it in. */
  gather: number;
};

const roll = (value: number) => (value < 0.45 ? 1 : value < 0.88 ? 0 : 2);

export function createCoordinationDust(
  count = COORDINATION_DUST_COUNT,
  random: () => number = Math.random,
): CoordinationDust {
  const dust: CoordinationDust = {
    count,
    position: new Float32Array(count * 3),
    velocity: new Float32Array(count * 3),
    turnRadius: new Float32Array(count),
    turnAngle: new Float32Array(count),
    turnHeight: new Float32Array(count),
    kind: new Float32Array(count),
    size: new Float32Array(count),
    alpha: new Float32Array(count),
    peak: new Float32Array(count),
    phase: new Float32Array(count),
    hand: null,
    gust: { x: 0, y: 0, z: 0 },
    time: 0,
  };
  for (let index = 0; index < count; index += 1) {
    const reach = CLOUD_RADIUS * Math.sqrt(random());
    const rise = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radius = reach * Math.sqrt(1 - rise * rise);
    const height = reach * rise * TILT;
    dust.turnRadius[index] = radius;
    dust.turnAngle[index] = angle;
    dust.turnHeight[index] = height;
    dust.position[index * 3] = Math.cos(angle) * radius;
    dust.position[index * 3 + 1] = height;
    dust.position[index * 3 + 2] = Math.sin(angle) * radius;
    dust.kind[index] = roll(random());
    dust.size[index] = 0.5 + random() * 0.8;
    dust.peak[index] = REST_MIN + random() * REST_RANGE;
    dust.phase[index] = random() * 7;
  }
  return dust;
}

/** Reduced motion's cloud: every grain already showing, nothing to rise. */
export function settleCoordinationDust(dust: CoordinationDust) {
  dust.alpha.set(dust.peak);
}

/** The pointer's recent travel, which dies away, so a pointer at rest stirs
 * nothing. */
export function moveCoordinationDustHand(
  dust: CoordinationDust,
  x: number,
  y: number,
  z: number,
) {
  const hand = dust.hand;
  if (!hand) {
    dust.hand = { x, y, z, vx: 0, vy: 0, vz: 0 };
    return;
  }
  hand.vx += x - hand.x;
  hand.vy += y - hand.y;
  hand.vz += z - hand.z;
  hand.x = x;
  hand.y = y;
  hand.z = z;
  const over = Math.hypot(hand.vx, hand.vy, hand.vz) / HAND.most;
  if (over > 1) {
    hand.vx /= over;
    hand.vy /= over;
    hand.vz /= over;
  }
}

/** Distance the wind has yet to carry. The room moving past the dust, or the
 * dust being carried through the room, both blow it. */
export function blowCoordinationDust(
  dust: CoordinationDust,
  x: number,
  y: number,
  z: number,
) {
  const gust = dust.gust;
  gust.x += x;
  gust.y += y;
  gust.z += z;
  const over = Math.hypot(gust.x, gust.y, gust.z) / WIND.most;
  if (over > 1) {
    gust.x /= over;
    gust.y /= over;
    gust.z /= over;
  }
}

export function kickCoordinationDust(
  dust: CoordinationDust,
  by: number,
  random: () => number = Math.random,
) {
  for (let index = 0; index < dust.count * 3; index += 1) {
    dust.velocity[index]! += (random() - 0.5) * by;
  }
}

function flowAt(
  x: number,
  y: number,
  z: number,
  t: number,
  out: { x: number; y: number; z: number },
) {
  // The page's field across a window, tightened to fit across the cloud, so
  // grains still wander apart instead of drifting as one.
  const a =
    Math.sin(x * 0.0074 + t * 0.35) +
    Math.cos(y * 0.0095 - t * 0.27) +
    Math.sin((x + z) * 0.0046 + t * 0.21);
  const b =
    Math.cos(z * 0.0074 - t * 0.31) + Math.sin((y - x) * 0.0046 + t * 0.19);
  out.x = Math.cos(a * 1.7) * Math.cos(b);
  out.y = Math.sin(a * 1.7);
  out.z = Math.cos(a * 1.7) * Math.sin(b);
}

const flow = { x: 0, y: 0, z: 0 };

function stepOnce(
  dust: CoordinationDust,
  dt: number,
  input: CoordinationDustInput,
) {
  dust.time += dt;
  const { position, velocity, turnAngle, turnHeight, turnRadius } = dust;
  const hand = dust.hand;
  if (hand) {
    const fade = Math.exp(-dt * HAND.fade);
    hand.vx *= fade;
    hand.vy *= fade;
    hand.vz *= fade;
  }
  const gust = dust.gust;
  const carried = 1 - Math.exp(-dt * WIND.ease);
  const blowX = gust.x * carried;
  const blowY = gust.y * carried;
  const blowZ = gust.z * carried;
  gust.x -= blowX;
  gust.y -= blowY;
  gust.z -= blowZ;
  const handSpeed = hand ? Math.hypot(hand.vx, hand.vy, hand.vz) : 0;

  for (let index = 0; index < dust.count; index += 1) {
    const at = index * 3;
    const angle = turnAngle[index]! + input.spin * dt;
    turnAngle[index] = angle;
    const size = dust.size[index]!;
    let x = position[at]! + blowX * WIND.depth * size;
    let y = position[at + 1]! + blowY * WIND.depth * size;
    let z = position[at + 2]! + blowZ * WIND.depth * size;
    const homeX = Math.cos(angle) * turnRadius[index]! * input.gather;
    const homeY = turnHeight[index]! * input.gather;
    const homeZ = Math.sin(angle) * turnRadius[index]! * input.gather;
    flowAt(x, y, z, dust.time, flow);
    let vx = velocity[at]!;
    let vy = velocity[at + 1]!;
    let vz = velocity[at + 2]!;
    let ax = SPRING * (homeX - x) - DAMPING * vx + flow.x * FLOW;
    let ay = SPRING * (homeY - y) - DAMPING * vy + flow.y * FLOW;
    let az = SPRING * (homeZ - z) - DAMPING * vz + flow.z * FLOW;
    if (hand && handSpeed > 0.01) {
      const dx = x - hand.x;
      const dy = y - hand.y;
      const dz = z - hand.z;
      const distance = Math.max(1, Math.hypot(dx, dy, dz));
      if (distance < HAND.reach) {
        const near = (1 - distance / HAND.reach) ** 2;
        const push = (near * handSpeed * HAND.push) / distance;
        ax += near * hand.vx * HAND.drag + dx * push;
        ay += near * hand.vy * HAND.drag + dy * push;
        az += near * hand.vz * HAND.drag + dz * push;
      }
    }
    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    velocity[at] = vx;
    velocity[at + 1] = vy;
    velocity[at + 2] = vz;
    position[at] = x;
    position[at + 1] = y;
    position[at + 2] = z;
    const alpha = dust.alpha[index]!;
    dust.alpha[index] =
      alpha + (dust.peak[index]! - alpha) * Math.min(1, dt * 0.8);
  }
}

/** A long frame takes fixed steps, so a slow device moves the same dust. */
export function stepCoordinationDust(
  dust: CoordinationDust,
  delta: number,
  input: CoordinationDustInput,
) {
  for (let left = Math.min(delta, 0.25); left > 0; left -= 1 / 60) {
    stepOnce(dust, Math.min(left, 1 / 60), input);
  }
}

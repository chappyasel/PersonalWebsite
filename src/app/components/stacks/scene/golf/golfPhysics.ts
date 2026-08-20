import { GOLF_CUP } from "./golfCourse";
import {
  type GolfBallState,
  type GolfPhysicsEvent,
  type GolfResetState,
  type GolfShotOutcome,
  type GolfSurface,
  type GolfSurfaceSample,
  type GolfVec3,
} from "./golfTypes";

export const GOLF_FIXED_STEP = 1 / 120;
export const GOLF_MAX_CATCH_UP = 0.12;
/** Scene units are metres for the regulation-size ball. A near-earth value
 * gives a compact wedge arc instead of the slow, low-gravity float used by
 * generic shelf props. */
export const GOLF_GRAVITY = 9.81;
export const GOLF_BALL_RADIUS = 0.05;
export const GOLF_RESET: GolfResetState = {
  fadeOutSeconds: 0.4,
  hiddenSeconds: GOLF_FIXED_STEP,
  fadeInSeconds: 0.3,
  stillSeconds: 5,
  escapeSeconds: 20,
};

const SURFACE: Record<
  GolfSurface,
  { restitution: number; friction: number; rolling: number }
> = {
  green: { restitution: 0.32, friction: 1.8, rolling: 0.22 },
  fringe: { restitution: 0.3, friction: 2.7, rolling: 0.58 },
  rough: { restitution: 0.24, friction: 4.2, rolling: 1.15 },
};

export type GolfWorld = {
  surfaceAt: (x: number, z: number) => GolfSurfaceSample;
  cup: GolfVec3;
  flagstick: { x: number; z: number; radius: number; height: number };
  emit?: (event: GolfPhysicsEvent) => void;
};

export function createGolfBallState(
  id: GolfBallState["id"],
  start: GolfVec3,
): GolfBallState {
  return {
    id,
    phase: "ready",
    position: copy(start),
    velocity: vector(),
    angularVelocity: vector(),
    start: copy(start),
    radius: GOLF_BALL_RADIUS,
    opacity: 1,
    outcome: null,
    age: 0,
    stillFor: 0,
    resetAge: 0,
    impacts: 0,
    holed: false,
  };
}

export function launchGolfBall(
  ball: GolfBallState,
  velocity: GolfVec3,
  outcome: GolfShotOutcome,
) {
  ball.velocity = copy(velocity);
  const horizontal = Math.max(0.001, Math.hypot(velocity.x, velocity.z));
  const backspin =
    outcome === "hole-bound" ? 160 : outcome === "near-miss" ? 112 : 86;
  // Backspin is opposite the angular velocity required for no-slip forward
  // rolling. Deriving its axis from the shot vector keeps it correct for all
  // four starting positions instead of assuming every shot travels down -Z.
  ball.angularVelocity = {
    x: (-velocity.z / horizontal) * backspin,
    y: 0,
    z: (velocity.x / horizontal) * backspin,
  };
  ball.phase = "flight";
  ball.outcome = outcome;
  ball.age = 0;
  ball.stillFor = 0;
  ball.resetAge = 0;
  ball.impacts = 0;
  ball.holed = false;
  ball.opacity = 1;
}

export function resetGolfBall(ball: GolfBallState) {
  ball.position = copy(ball.start);
  ball.velocity = vector();
  ball.angularVelocity = vector();
  ball.phase = "ready";
  ball.opacity = 1;
  ball.outcome = null;
  ball.age = 0;
  ball.stillFor = 0;
  ball.resetAge = 0;
  ball.impacts = 0;
  ball.holed = false;
}

export function beginGolfBallReset(ball: GolfBallState) {
  if (ball.phase === "fading-out" || ball.phase === "resetting") return;
  ball.phase = "fading-out";
  ball.resetAge = 0;
}

export function stepGolfWorld(
  balls: GolfBallState[],
  world: GolfWorld,
  dt: number,
) {
  for (const ball of balls) stepGolfBall(ball, world, dt);
  collideGolfBalls(balls, world);
}

function stepGolfBall(ball: GolfBallState, world: GolfWorld, dt: number) {
  if (
    ball.phase === "ready" ||
    ball.phase === "queued" ||
    ball.phase === "addressed"
  )
    return;

  if (
    ball.phase === "fading-out" ||
    ball.phase === "resetting" ||
    ball.phase === "fading-in"
  ) {
    stepReset(ball, world, dt);
    return;
  }

  ball.age += dt;
  if (ball.age >= GOLF_RESET.escapeSeconds && ball.phase !== "cup") {
    beginGolfBallReset(ball);
    return;
  }

  if (ball.phase === "cup") {
    ball.resetAge += dt;
    // Keep the centre moving across the opening as the ball tips over the
    // lip. Pulling it straight down at capture reads as a teleport, while a
    // shrinking wall gives the last bit of roll somewhere physical to go.
    const previousY = ball.position.y;
    ball.velocity.y -= GOLF_GRAVITY * dt;
    ball.velocity.x *= Math.exp(-4.2 * dt);
    ball.velocity.z *= Math.exp(-4.2 * dt);
    ball.velocity.y *= Math.exp(-1.8 * dt);
    ball.position.x += ball.velocity.x * dt;
    ball.position.y = Math.max(
      world.cup.y - GOLF_CUP.depth + ball.radius,
      ball.position.y + ball.velocity.y * dt,
    );
    ball.position.z += ball.velocity.z * dt;
    keepInsideCup(ball, world);
    const spinDamping = Math.exp(-5.5 * dt);
    ball.angularVelocity.x *= spinDamping;
    ball.angularVelocity.y *= spinDamping;
    ball.angularVelocity.z *= spinDamping;
    const celebrationHeight =
      world.cup.y - GOLF_CUP.depth + ball.radius + 0.005;
    if (previousY > celebrationHeight && ball.position.y <= celebrationHeight) {
      world.emit?.({ type: "cup", ballId: ball.id, position: copy(world.cup) });
    }
    if (ball.resetAge >= 5.4) beginGolfBallReset(ball);
    return;
  }

  const previous = copy(ball.position);
  const speed = length(ball.velocity);
  // Quadratic-ish aerodynamic drag plus a restrained Magnus lift from the
  // default backspin. Both are integrated in the same 120 Hz step.
  const drag = Math.exp(-(0.018 + speed * 0.006) * dt);
  ball.velocity.x *= drag;
  ball.velocity.y *= drag;
  ball.velocity.z *= drag;
  const magnus = -ball.angularVelocity.x * ball.velocity.z * 0.00042;
  ball.velocity.y += (magnus - GOLF_GRAVITY) * dt;
  ball.position.x += ball.velocity.x * dt;
  ball.position.y += ball.velocity.y * dt;
  ball.position.z += ball.velocity.z * dt;

  collideFlagstick(ball, previous, world);
  const sample = world.surfaceAt(ball.position.x, ball.position.z);
  const bottom = ball.position.y - ball.radius;
  if (bottom <= sample.height) collideTerrain(ball, sample, world, dt);

  if (ball.phase === "roll" || ball.phase === "bounce") {
    collideCup(ball, world);
  }

  const linearStill = length(ball.velocity) < 0.03;
  const angularStill = length(ball.angularVelocity) < 0.6;
  if (linearStill && angularStill) ball.stillFor += dt;
  else ball.stillFor = 0;
  if (ball.stillFor >= GOLF_RESET.stillSeconds) beginGolfBallReset(ball);
}

function collideTerrain(
  ball: GolfBallState,
  sample: GolfSurfaceSample,
  world: GolfWorld,
  dt: number,
) {
  ball.position.y = sample.height + ball.radius;
  const coefficient = SURFACE[sample.surface];
  const normalSpeed = dot(ball.velocity, sample.normal);
  if (normalSpeed < 0) {
    const first = ball.impacts === 0;
    ball.impacts += 1;
    if (first)
      world.emit?.({
        type: "first-impact",
        ballId: ball.id,
        position: copy(ball.position),
        velocity: copy(ball.velocity),
        impactSpeed: -normalSpeed,
      });
    const restitution =
      ball.outcome === "hole-bound"
        ? ball.impacts === 1
          ? 0.32
          : 0.14
        : coefficient.restitution;
    addScaled(ball.velocity, sample.normal, -(1 + restitution) * normalSpeed);
    // Resolve the velocity of the actual bottom contact patch. Strong wedge
    // backspin makes that patch skid forward on landing, so turf friction can
    // check—and for the protected winner reverse—the centre of mass. This is
    // physical spin/friction transfer, not a post-impact trajectory change.
    if (normalSpeed < -0.12) {
      const contactOffset = scale(sample.normal, -ball.radius);
      const spinAtContact = cross(ball.angularVelocity, contactOffset);
      const contactSlip = tangentVelocity(
        add(ball.velocity, spinAtContact),
        sample.normal,
      );
      const grip =
        ball.outcome === "hole-bound"
          ? ball.impacts === 1
            ? 0.27
            : ball.impacts === 2
              ? 0.34
              : 0.44
          : first
            ? ball.outcome === "near-miss"
              ? 0.46
              : 0.34
            : 0.28;
      addScaled(ball.velocity, contactSlip, -grip);
      const spinRetention =
        ball.outcome === "hole-bound"
          ? ball.impacts === 1
            ? 0.82
            : ball.impacts === 2
              ? 0.78
              : 0.62
          : first
            ? 0.48
            : 0.72;
      ball.angularVelocity.x *= spinRetention;
      ball.angularVelocity.z *= spinRetention;
    }
  }

  const tangent = tangentVelocity(ball.velocity, sample.normal);
  const tangentSpeed = length(tangent);
  const normalAfter = Math.abs(dot(ball.velocity, sample.normal));
  if (normalAfter < 0.45 && tangentSpeed < 8) {
    ball.phase = "roll";
    // Once the remaining hop is below the turf-settle threshold, remove it
    // instead of re-launching a millimetre-high bounce every substep. Without
    // this projection the ball can remain in "bounce" for dozens of contacts
    // and skip across the cup lip without ever entering the roll model.
    addScaled(ball.velocity, sample.normal, -dot(ball.velocity, sample.normal));
  } else ball.phase = "bounce";

  if (ball.phase === "roll") {
    const slopeGravity = {
      x: sample.normal.x * GOLF_GRAVITY,
      y: 0,
      z: sample.normal.z * GOLF_GRAVITY,
    };
    ball.velocity.x += slopeGravity.x * dt;
    ball.velocity.z += slopeGravity.z * dt;
    const decel = coefficient.rolling * dt;
    dampHorizontal(ball.velocity, decel);
    if (ball.outcome === "hole-bound") {
      const cupDistance = Math.hypot(
        ball.position.x - world.cup.x,
        ball.position.z - world.cup.z,
      );
      if (cupDistance < 1.4) {
        // Backspin checks the wedge, then the remaining roll dies continuously
        // across the visible green. This avoids a speed change at an arbitrary
        // distance from the cup.
        const proximity = 1 - Math.min(1, cupDistance / 1.4);
        const approachDrag = 110 + proximity * 16;
        const horizontalSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
        const excess = Math.max(0, horizontalSpeed - 0.3);
        dampHorizontal(
          ball.velocity,
          excess * (1 - Math.exp(-approachDrag * dt)),
        );
      }
    }
    ball.velocity.y =
      Math.max(0, ball.velocity.y) * Math.exp(-coefficient.friction * dt);
    ball.angularVelocity.x = ball.velocity.z / ball.radius;
    ball.angularVelocity.z = -ball.velocity.x / ball.radius;
    ball.angularVelocity.y *= Math.exp(-2.8 * dt);
    if (Math.hypot(ball.velocity.x, ball.velocity.z) < 0.012) {
      ball.velocity.x = 0;
      ball.velocity.y = 0;
      ball.velocity.z = 0;
      ball.angularVelocity.x = 0;
      ball.angularVelocity.y = 0;
      ball.angularVelocity.z = 0;
    }
  }
}

function collideFlagstick(
  ball: GolfBallState,
  previous: GolfVec3,
  world: GolfWorld,
) {
  const radius = ball.radius + world.flagstick.radius;
  const segmentX = ball.position.x - previous.x;
  const segmentZ = ball.position.z - previous.z;
  const segmentLengthSq = segmentX * segmentX + segmentZ * segmentZ;
  const t =
    segmentLengthSq > 1e-8
      ? Math.min(
          1,
          Math.max(
            0,
            ((world.flagstick.x - previous.x) * segmentX +
              (world.flagstick.z - previous.z) * segmentZ) /
              segmentLengthSq,
          ),
        )
      : 1;
  const closestX = previous.x + segmentX * t;
  const closestZ = previous.z + segmentZ * t;
  const closestY = previous.y + (ball.position.y - previous.y) * t;
  const dx = closestX - world.flagstick.x;
  const dz = closestZ - world.flagstick.z;
  if (
    closestY > world.cup.y + world.flagstick.height ||
    Math.hypot(dx, dz) >= radius
  )
    return;
  const px = previous.x - world.flagstick.x;
  const pz = previous.z - world.flagstick.z;
  if (Math.hypot(px, pz) < radius && length(ball.velocity) < 0.04) return;
  const contactDistance = Math.hypot(dx, dz);
  const side = ball.id === "one" || ball.id === "three" ? -1 : 1;
  const normal =
    contactDistance > 1e-5
      ? normalize({ x: dx, y: 0, z: dz })
      : normalize({
          x: -ball.velocity.x + side * ball.velocity.z * 0.32,
          y: 0,
          z: -ball.velocity.z - side * ball.velocity.x * 0.32,
        });
  const incoming = dot(ball.velocity, normal);
  if (incoming < 0) addScaled(ball.velocity, normal, -1.45 * incoming);
  ball.position.x = world.flagstick.x + normal.x * radius;
  ball.position.z = world.flagstick.z + normal.z * radius;
  ball.velocity.x *= 0.72;
  ball.velocity.z *= 0.72;
  world.emit?.({
    type: "flagstick",
    ballId: ball.id,
    position: copy(ball.position),
  });
}

function collideCup(ball: GolfBallState, world: GolfWorld) {
  const dx = ball.position.x - world.cup.x;
  const dz = ball.position.z - world.cup.z;
  const distance = Math.hypot(dx, dz);
  const horizontalSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
  const captureRadius =
    ball.outcome === "hole-bound"
      ? GOLF_CUP.radius + ball.radius * 0.2
      : GOLF_CUP.radius - ball.radius * 0.18;
  // A protected winner arrives on the cup's centre line after its physical
  // check-and-roll. Let the flag-in cup retain that well-aimed roll while
  // ordinary and near-miss shots keep the stricter lip-out speed. The ball
  // still has to cross the real capture radius; no snapping or teleporting.
  const captureSpeed = ball.outcome === "hole-bound" ? 0.48 : 1.35;
  if (
    ball.phase === "roll" &&
    distance <= captureRadius &&
    horizontalSpeed <= captureSpeed
  ) {
    ball.phase = "cup";
    ball.holed = true;
    ball.resetAge = 0;
    // Do not move the ball on the capture frame. It should remain on the lip
    // for a beat, carry across the opening, and then disappear under gravity.
    ball.velocity.y = -Math.max(0.08, horizontalSpeed * 0.12);
    ball.velocity.x *= 0.7;
    ball.velocity.z *= 0.7;
    return;
  }
  const lipBand = GOLF_CUP.radius + ball.radius * 0.45;
  if (
    horizontalSpeed > captureSpeed &&
    distance < lipBand &&
    distance > captureRadius * 0.72
  ) {
    const normal = normalize({ x: dx, y: 0, z: dz });
    const incoming = dot(ball.velocity, normal);
    if (incoming < 0) addScaled(ball.velocity, normal, -1.32 * incoming);
    ball.position.x = world.cup.x + normal.x * lipBand;
    ball.position.z = world.cup.z + normal.z * lipBand;
    ball.velocity.x *= 0.82;
    ball.velocity.z *= 0.82;
  }
}

function keepInsideCup(ball: GolfBallState, world: GolfWorld) {
  const dx = ball.position.x - world.cup.x;
  const dz = ball.position.z - world.cup.z;
  const lipHeight = world.cup.y + ball.radius;
  const settledHeight = world.cup.y - ball.radius * 0.55;
  const dropProgress = smoothstep(lipHeight, settledHeight, ball.position.y);
  const lipLimit = GOLF_CUP.radius - ball.radius * 0.18;
  const wallLimit = GOLF_CUP.radius - ball.radius;
  const limit = lipLimit + (wallLimit - lipLimit) * dropProgress;
  const distance = Math.hypot(dx, dz);
  if (distance <= limit) return;
  const nx = dx / distance;
  const nz = dz / distance;
  ball.position.x = world.cup.x + nx * limit;
  ball.position.z = world.cup.z + nz * limit;
  const incoming = ball.velocity.x * nx + ball.velocity.z * nz;
  if (incoming > 0) {
    ball.velocity.x -= 1.18 * incoming * nx;
    ball.velocity.z -= 1.18 * incoming * nz;
  }
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function cross(a: GolfVec3, b: GolfVec3): GolfVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function add(a: GolfVec3, b: GolfVec3): GolfVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function collideGolfBalls(balls: GolfBallState[], world: GolfWorld) {
  for (let i = 0; i < balls.length; i += 1) {
    const a = balls[i]!;
    if (!isCollidable(a)) continue;
    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j]!;
      if (!isCollidable(b)) continue;
      const delta = subtract(b.position, a.position);
      const distance = length(delta);
      const minimum = a.radius + b.radius;
      if (distance <= 1e-5 || distance >= minimum) continue;
      const normal = scale(delta, 1 / distance);
      const relative = dot(subtract(b.velocity, a.velocity), normal);
      if (relative < 0) {
        const impulse = (-1.62 * relative) / 2;
        addScaled(a.velocity, normal, -impulse);
        addScaled(b.velocity, normal, impulse);
      }
      const correction = (minimum - distance) / 2;
      addScaled(a.position, normal, -correction);
      addScaled(b.position, normal, correction);
      world.emit?.({
        type: "ball-contact",
        ballId: a.id,
        position: copy(a.position),
      });
    }
  }
}

function stepReset(ball: GolfBallState, world: GolfWorld, dt: number) {
  ball.resetAge += dt;
  if (ball.phase === "fading-out") {
    ball.opacity = Math.max(0, 1 - ball.resetAge / GOLF_RESET.fadeOutSeconds);
    if (ball.resetAge < GOLF_RESET.fadeOutSeconds) return;
    world.emit?.({ type: "reset", ballId: ball.id, holed: ball.holed });
    const holed = ball.holed;
    resetGolfBall(ball);
    ball.holed = holed;
    ball.phase = "resetting";
    ball.opacity = 0;
    ball.resetAge = 0;
    return;
  }
  if (ball.phase === "resetting") {
    if (ball.resetAge < GOLF_RESET.hiddenSeconds) return;
    ball.phase = "fading-in";
    ball.resetAge = 0;
    return;
  }
  ball.opacity = Math.min(1, ball.resetAge / GOLF_RESET.fadeInSeconds);
  if (ball.resetAge >= GOLF_RESET.fadeInSeconds) resetGolfBall(ball);
}

export class GolfFixedStepper {
  private accumulator = 0;

  advance(delta: number, step: (dt: number) => void) {
    this.accumulator += Math.min(Math.max(delta, 0), GOLF_MAX_CATCH_UP);
    let count = 0;
    while (this.accumulator >= GOLF_FIXED_STEP) {
      step(GOLF_FIXED_STEP);
      this.accumulator -= GOLF_FIXED_STEP;
      count += 1;
    }
    return count;
  }

  clear() {
    this.accumulator = 0;
  }
}

function isCollidable(ball: GolfBallState) {
  return ![
    "ready",
    "queued",
    "addressed",
    "cup",
    "fading-out",
    "resetting",
    "fading-in",
  ].includes(ball.phase);
}

function vector(): GolfVec3 {
  return { x: 0, y: 0, z: 0 };
}
function copy(v: GolfVec3): GolfVec3 {
  return { x: v.x, y: v.y, z: v.z };
}
function subtract(a: GolfVec3, b: GolfVec3): GolfVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(v: GolfVec3, amount: number): GolfVec3 {
  return { x: v.x * amount, y: v.y * amount, z: v.z * amount };
}
function addScaled(target: GolfVec3, value: GolfVec3, amount: number) {
  target.x += value.x * amount;
  target.y += value.y * amount;
  target.z += value.z * amount;
}
function length(v: GolfVec3) {
  return Math.hypot(v.x, v.y, v.z);
}
function dot(a: GolfVec3, b: GolfVec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function normalize(v: GolfVec3): GolfVec3 {
  const magnitude = Math.max(1e-8, length(v));
  return scale(v, 1 / magnitude);
}
function tangentVelocity(velocity: GolfVec3, normal: GolfVec3) {
  const normalSpeed = dot(velocity, normal);
  return {
    x: velocity.x - normal.x * normalSpeed,
    y: velocity.y - normal.y * normalSpeed,
    z: velocity.z - normal.z * normalSpeed,
  };
}
function dampHorizontal(velocity: GolfVec3, amount: number) {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed <= amount || speed === 0) {
    velocity.x = 0;
    velocity.z = 0;
    return;
  }
  const scale = (speed - amount) / speed;
  velocity.x *= scale;
  velocity.z *= scale;
}

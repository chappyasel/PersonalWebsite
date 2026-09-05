import { VISION_RIDE_BREATH } from "./visionRideBreath";
import { driveChaseDistanceScale } from "./visionRideDriving";
import {
  VISION_RIDE_PARALLAX,
  chaseAimX,
  swingPath,
} from "./visionRideParallax";
import { VISION_RIDE_ROAD_HALF_WIDTH } from "./visionRideTerrain";
import { VISION_RIDE_ZOOM } from "./visionRideZoom";

/**
 * Chase composition, pure so the framing can be asserted per orientation.
 *
 * The eye sits low, just above the car's roofline, and aims at the car's
 * mid-height so the horizon lands a little above the frame's middle. The
 * settled camera is on the road's centre line: sun, vanishing point and car
 * all share the viewport centre, and only the arrival approaches from the
 * left. Portrait keeps the same centre but pulls further back on a wider
 * field so the car reads as a distant chase rather than filling the width.
 */
export const VISION_RIDE_CAMERA = {
  carZ: -4.8,
  lookY: 0.96,
  /** Eye height. 1.65 m, up from 0.98 and then 1.35, so the road reads
   * top-down the way the reference's grid does and the camera sits clear
   * of the surface; the aim stays on the car, so raising the eye tilts the
   * view down without moving the car or the sun off centre. */
  eyeY: 1.65,
  /** Settled x. Zero on both orientations: the car, the sun and the grid's
   * vanishing point stack on the viewport centre line. */
  restX: 0,
  chaseZ: 2.2,
  fov: 56,
  portrait: {
    chaseZ: 5.7,
    fov: 72,
  },
  /** Apparent width of the car's rear in metres, measured off the pass-one
   * captures (the near bumper is closer than the nominal body). */
  carWidthMetres: 2.5,
  /** Body length in metres, decoded from the model: the body node scales a
   * normalised ±1 quantised mesh by 2.3985, centred on the car's anchor. */
  carLengthMetres: 4.8,
  /** Rear axle's distance behind the anchor, from the model's RL/RR wheel
   * nodes; the nearest ground contact the chase camera has to keep in frame. */
  carRearAxleMetres: 1.45,
  /** Wheel radius from the model's wheel nodes (their scale, 0.339 front and
   * 0.357 rear, is the decode of a unit sphere); the spin rate is road speed
   * over this. */
  wheelRadiusMetres: 0.35,
  /** Half-width of the body proper, mirrors excluded, from the model. The
   * lateral shift is capped so this much of the rear stays inside the frame;
   * a mirror tip leaving the edge is invisible, a fender is not. */
  carHalfWidthMetres: 1.02,
  /** Lowest point of the body mesh, decoded from the model. Taken at the
   * rear face when framing, which is conservative: the sills at mid-length
   * are the true low point and sit further from the eye. */
  carBottomMetres: 0.13,
  /** Top of the body at the rear face. The corner the lateral cap has to
   * keep inside the frame when the eye sits below the roofline and the
   * bumper tilt brings that corner nearer along the view axis. */
  carRoofMetres: 1.15,
  /** Degrees the car's lowest rear point is kept above the bottom edge of
   * the frame when the breath brings it close. */
  bottomClearanceDegrees: 2,
} as const;

/**
 * The opening shot. The eye starts low and tight on the car's left rear
 * wheel, looking across its flank, then pulls back and up along a curve
 * that swings out over the road while the aim turns down the road, so the
 * sun, the flanks and the grid arrive as the frame widens. A short hold on
 * the wheel covers the headset's switch-on aperture. Positions are world
 * metres; the car's rear wheels sit at x ±0.84, z −3.35 (anchor −4.8 plus
 * the model's 1.45 m rear axle) with a 0.36 m radius.
 */
export const VISION_RIDE_ARRIVAL = {
  /** Seconds the shot rests on the wheel before the pull begins. */
  holdSeconds: 0.5,
  /** Seconds the pull-back takes to settle into the chase. */
  pullSeconds: 5,
  /** Eye at the start: just outside and behind the left rear wheel, at
   * wheel-top height. */
  start: [-1.75, 0.55, -2.6],
  /** Where the eye looks at the start: across the rear-left quarter toward
   * the far front corner, so the body fills the frame and the sun waits
   * off the left edge. */
  startAim: [0.4, 0.7, -4.2],
  /** Quadratic Bezier control: out over the road and up, so the pull-back
   * arcs rather than reversing straight down the eye's line. */
  control: [-3.4, 2.6, 0.2],
  portrait: {
    start: [-1.6, 0.6, -2.4],
    startAim: [0.3, 0.7, -4.2],
    control: [-2.4, 2.6, 2.4],
  },
} as const;

export const VISION_RIDE_INTRO_SECONDS =
  VISION_RIDE_ARRIVAL.holdSeconds + VISION_RIDE_ARRIVAL.pullSeconds;

export type Vec3 = readonly [number, number, number];

export type ChaseFraming = Readonly<{
  carZ: number;
  lookY: number;
  eyeY: number;
  restX: number;
  arrival: Readonly<{ start: Vec3; startAim: Vec3; control: Vec3 }>;
  chaseZ: number;
  /** Settled distance from the eye to the car's rear face, the part of the
   * car the viewer watches grow. The breath's closure is a fraction of this,
   * so the rear swells by the same factor on every orientation. Measured to
   * the anchor instead, a 4.8 m car 4.6 m ahead doubled its rear at the
   * crest and clipped its bumper on the frame's bottom edge. */
  chaseDistance: number;
  fov: number;
}>;

export function chaseFraming(portrait: boolean): ChaseFraming {
  const cam = VISION_RIDE_CAMERA;
  const chaseZ = portrait ? cam.portrait.chaseZ : cam.chaseZ;
  return {
    carZ: cam.carZ,
    lookY: cam.lookY,
    eyeY: cam.eyeY,
    restX: cam.restX,
    arrival: portrait ? VISION_RIDE_ARRIVAL.portrait : VISION_RIDE_ARRIVAL,
    chaseZ,
    chaseDistance: chaseZ - (cam.carZ + cam.carLengthMetres / 2),
    fov: portrait ? cam.portrait.fov : cam.fov,
  };
}

function smoothstep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/** Pull-back progress in [0, 1] for seconds since the ride started: zero
 * through the hold, then an ease-in-out over the pull. */
export function arrivalProgress(elapsed: number) {
  const { holdSeconds, pullSeconds } = VISION_RIDE_ARRIVAL;
  return smoothstep((elapsed - holdSeconds) / pullSeconds);
}

/** Eye and look-at point along the opening shot at `progress`. At 1 it is
 * exactly the settled chase pose the live shift and breath build on. */
export function arrivalPose(framing: ChaseFraming, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const { start, startAim, control } = framing.arrival;
  const end: Vec3 = [framing.restX, framing.eyeY, framing.chaseZ];
  const endAim: Vec3 = [0, framing.lookY, framing.carZ];
  const bezier = (a: number, b: number, c: number) =>
    (1 - p) * (1 - p) * a + 2 * (1 - p) * p * b + p * p * c;
  const position: Vec3 = [
    bezier(start[0], control[0], end[0]),
    bezier(start[1], control[1], end[1]),
    bezier(start[2], control[2], end[2]),
  ];
  // The aim turns with its own ease so the sun sweeps in during the middle
  // of the pull rather than snapping at either end.
  const turn = smoothstep(p);
  const aim: Vec3 = [
    startAim[0] + (endAim[0] - startAim[0]) * turn,
    startAim[1] + (endAim[1] - startAim[1]) * turn,
    startAim[2] + (endAim[2] - startAim[2]) * turn,
  ];
  return { position, aim };
}

export type ChasePose = Readonly<{ position: Vec3; aim: Vec3 }>;

/**
 * The live chase pose for a depth (on-axis distance from the eye to the
 * car's rear face), a swing fraction and an eye height: the eye on the
 * swing path around the anchor, the aim sharing part of the lateral
 * offset, and the tilt that keeps the bumper above the bottom edge. The
 * world builds every cruising frame from this and the frame-fit cap
 * evaluates candidate swings through the same function, so what the cap
 * checks is exactly what gets rendered.
 */
export function chasePose(
  framing: ChaseFraming,
  input: { depth: number; swing: number; eyeY: number },
): ChasePose {
  const anchorDistance = input.depth + VISION_RIDE_CAMERA.carLengthMetres / 2;
  const path = swingPath(anchorDistance, input.swing);
  const cameraZ = framing.carZ + path.zRel;
  const aimX = chaseAimX(path.x, input.swing);
  return {
    position: [path.x, input.eyeY, cameraZ],
    aim: [
      aimX,
      chaseAimY(framing, input.eyeY, cameraZ, path.x, aimX),
      framing.carZ,
    ],
  };
}

/** Normalised device coordinates of a world point for a camera at `eye`
 * looking at `aim` with y up: the same basis three's lookAt builds. `z`
 * is the view depth, non-positive for points beside or behind the eye. */
export function projectPoint(
  eye: Vec3,
  aim: Vec3,
  fov: number,
  aspect: number,
  point: Vec3,
) {
  const fx = aim[0] - eye[0];
  const fy = aim[1] - eye[1];
  const fz = aim[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  const f = [fx / fl, fy / fl, fz / fl] as const;
  // right = forward x up, up' = right x forward.
  const rl = Math.hypot(f[2], f[0]) || 1;
  const r = [-f[2] / rl, 0, f[0] / rl] as const;
  const u = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ] as const;
  const dx = point[0] - eye[0];
  const dy = point[1] - eye[1];
  const dz = point[2] - eye[2];
  const z = dx * f[0] + dy * f[1] + dz * f[2];
  const tanHalf = Math.tan((fov * Math.PI) / 360);
  return {
    x: (dx * r[0] + dy * r[1] + dz * r[2]) / (z * tanHalf * aspect),
    y: (dx * u[0] + dy * u[1] + dz * u[2]) / (z * tanHalf),
    z,
  };
}

/** Fraction of the frame's half-extent the cap keeps every corner of the
 * body inside of. */
export const VISION_RIDE_SWING_FRAME_MARGIN = 0.03;

/** True when every corner of the car's body box (mirrors excluded, the
 * car displaced by `carX`) projects inside the frame with the margin. */
export function carFitsFrame(
  pose: ChasePose,
  fov: number,
  aspect: number,
  carX = 0,
) {
  const cam = VISION_RIDE_CAMERA;
  const limit = 1 - VISION_RIDE_SWING_FRAME_MARGIN;
  for (const sx of [-1, 1]) {
    for (const y of [cam.carBottomMetres, cam.carRoofMetres]) {
      for (const sz of [-1, 1]) {
        const ndc = projectPoint(pose.position, pose.aim, fov, aspect, [
          carX + sx * cam.carHalfWidthMetres,
          y,
          cam.carZ + (sz * cam.carLengthMetres) / 2,
        ]);
        if (!(ndc.z > 0)) return false;
        if (Math.abs(ndc.x) > limit || Math.abs(ndc.y) > limit) return false;
      }
    }
  }
  return true;
}

/**
 * Largest swing fraction, in `direction`, that keeps the whole body inside
 * the frame at this depth and eye height. Wide landscape frames hold the
 * full three-quarter view at the settle; narrow and portrait frames give
 * some of it up, most near the breath's crest, where the body is already
 * most of the width. Bisection over the pose the world renders, so the
 * cap is exact rather than a plan-distance estimate: the old estimate let
 * a fender corner past the edge by a percent once the wheel and the brake
 * stacked on the crest.
 */
export function swingLimit(
  framing: ChaseFraming,
  aspect: number,
  input: { depth: number; eyeY: number; carX?: number; direction?: number },
) {
  const direction =
    input.direction !== undefined && input.direction < 0 ? -1 : 1;
  const carX = input.carX ?? 0;
  const fits = (swing: number) =>
    carFitsFrame(
      chasePose(framing, { depth: input.depth, swing, eyeY: input.eyeY }),
      framing.fov,
      aspect,
      carX,
    );
  if (fits(direction)) return 1;
  if (!fits(0)) return 0;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 14; step += 1) {
    const mid = (low + high) / 2;
    if (fits(direction * mid)) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * Look-at height for the chase camera at a live eye position. The aim is
 * the car's mid-height, so the car holds the centre of the frame while the
 * breath grows it; only when the car's lowest near corner would fall past
 * the bottom edge does the camera tilt further down, by exactly enough to
 * keep it in frame with the clearance. Computed from the actual eye, so
 * the pointer's lift and the swing are covered as well as the breath.
 *
 * The limiting point is the rear bottom corner on the eye's side. On the
 * axis every point of that edge shares a screen row, so the rear face's
 * centre served; swung out, the edge runs oblique to the view and the near
 * corner projects lower than the centre by the cosine of its bearing off
 * the axis. With `T` the tangent of the bottom edge less clearance, `e`
 * the corner's depression from the eye and `phi` its bearing, the corner
 * sits on the edge when tan(e) = cos(phi) tan(pitch + atan T), so
 * pitch = atan(tan(e) / cos(phi)) - atan(T); the on-axis form is the
 * phi = 0 case.
 *
 * Holding the settled pitch instead (so the car came down the road and the
 * horizon stayed put) worked at a 1.5x swell but not at 2.25x: from 2 m
 * behind the bumper the car's rear spans 23 degrees of a 56 degree field
 * and has to be tilted after.
 */
export function chaseAimY(
  framing: ChaseFraming,
  eyeY: number,
  cameraZ: number,
  lateralX = 0,
  aimX = 0,
) {
  const cam = VISION_RIDE_CAMERA;
  const rearZ = framing.carZ + cam.carLengthMetres / 2;
  const cornerX = (lateralX < 0 ? -1 : 1) * cam.carHalfWidthMetres;
  const axisBearing = Math.atan2(aimX - lateralX, cameraZ - framing.carZ);
  const cornerBearing = Math.atan2(cornerX - lateralX, cameraZ - rearZ);
  const acrossAxis = Math.max(0.1, Math.cos(cornerBearing - axisBearing));
  const cornerDistance = Math.hypot(cornerX - lateralX, cameraZ - rearZ);
  const depression = Math.atan2(eyeY - cam.carBottomMetres, cornerDistance);
  const bottomEdge =
    (framing.fov * Math.PI) / 360 -
    (cam.bottomClearanceDegrees * Math.PI) / 180;
  const neededPitch = Math.atan(Math.tan(depression) / acrossAxis) - bottomEdge;
  const anchorDistance = Math.hypot(lateralX - aimX, cameraZ - framing.carZ);
  const framedAim = eyeY - Math.tan(neededPitch) * anchorDistance;
  return Math.min(framing.lookY, framedAim);
}

/**
 * Nearest the eye may sit to the car's rear face on a frame of this
 * aspect: the body's half-width, with 8 % to spare, has to fit inside the
 * horizontal half-field. Wide frames never bind. A phone's portrait frame
 * binds just past the breath's crest, where the wheel and the brake would
 * otherwise push the fenders out through the sides; the lateral cap in
 * `lateralReach` only limits the truck, not the depth.
 */
export function nearestChaseDepth(
  framing: ChaseFraming,
  aspect: number,
  carX = 0,
) {
  // A steered car sits off the centre line, so its near fender needs the
  // extra room; on a phone at the crest this is what backs the eye off.
  return (
    ((VISION_RIDE_CAMERA.carHalfWidthMetres + Math.abs(carX)) * 1.08) /
    Math.tan(horizontalHalfFovRadians(framing.fov, aspect))
  );
}

/**
 * Live on-axis distance from the eye to the car's rear face. The breath,
 * the wheel zoom and the pedal lean are all multipliers on the settled
 * distance, so each reads as the same fraction of the frame at every
 * orientation and wherever the others sit. The frame's own floor is
 * applied last. The swing's pull toward the car is not a depth input: it
 * lives on the swing path, which starts from this depth on the axis.
 */
export function chaseDepth(input: {
  framing: ChaseFraming;
  aspect: number;
  carScale: number;
  distanceScale: number;
  carX?: number;
}) {
  const live =
    (input.framing.chaseDistance / input.carScale) * input.distanceScale;
  return Math.max(
    nearestChaseDepth(input.framing, input.aspect, input.carX ?? 0),
    live,
  );
}

/** Camera z at the two ends of the on-axis depth travel for an
 * orientation: the crest of the breath with the brake down and the wheel
 * all the way in (no frame floor, so the widest frame's true nearest),
 * and the settled chase with the accelerator down and the wheel all the
 * way out. The swing pulls the eye further forward than `nearest` but
 * only once it is well off the axis; see `swingPath`. */
export function chaseZExtremes(framing: ChaseFraming) {
  const rearZ = framing.carZ + VISION_RIDE_CAMERA.carLengthMetres / 2;
  const crestScale = 1 + VISION_RIDE_BREATH.carGrowth;
  const nearestDepth =
    (framing.chaseDistance / crestScale) *
    (driveChaseDistanceScale(-1) / VISION_RIDE_ZOOM.reach);
  const farthestDepth =
    framing.chaseDistance * driveChaseDistanceScale(1) * VISION_RIDE_ZOOM.reach;
  return { nearest: rearZ + nearestDepth, farthest: rearZ + farthestDepth };
}

/** Fraction of the viewport width the car's rear spans at the settled
 * chase distance, for a viewport aspect (width / height). */
export function settledCarWidthFraction(aspect: number) {
  const framing = chaseFraming(aspect < 1);
  const distance = framing.chaseZ - framing.carZ;
  const halfHeight = distance * Math.tan((framing.fov * Math.PI) / 360);
  return VISION_RIDE_CAMERA.carWidthMetres / (2 * halfHeight * aspect);
}

/**
 * Grid pitch in metres. The reference uses broad, metre-scale cells across
 * the road and the mountain flanks. The former 0.5 m pitch matched one
 * bottom-edge measurement but doubled the row density through the rest of
 * the frame, making the whole world read as a miniature grid.
 */
export const VISION_RIDE_GRID_CELL_METRES = 1;

/**
 * Screen distance in pixels between adjacent longitudinal grid lines where
 * they meet the bottom edge of the frame. The bottom-edge ray hits the
 * floor at a straight-line range of eye / sin(pitch + fov/2); its depth
 * along the view axis is that times cos(fov/2), and a lateral metre there
 * projects to focal / depth pixels. Validated against a capture.
 */
export function bottomColumnSpacingPx(
  viewportWidth: number,
  viewportHeight: number,
  overrides: { cellMetres?: number; eyeY?: number } = {},
) {
  const portrait = viewportHeight > viewportWidth;
  const framing = chaseFraming(portrait);
  const eyeY = overrides.eyeY ?? framing.eyeY;
  const cell = overrides.cellMetres ?? VISION_RIDE_GRID_CELL_METRES;
  const halfFov = (framing.fov * Math.PI) / 360;
  const focalPx = viewportHeight / 2 / Math.tan(halfFov);
  const pitch = Math.atan2(eyeY - framing.lookY, framing.chaseZ - framing.carZ);
  const range = eyeY / Math.sin(pitch + halfFov);
  const viewDepth = range * Math.cos(halfFov);
  return (focalPx * cell) / viewDepth;
}

/**
 * Screen height in pixels of the grid cell that starts at the bottom edge
 * of the frame, for a viewport. The bottom edge meets the floor at
 * d0 = eye / tan(pitch + fov/2); the row one cell further projects
 * fov-scaled by the pitch. Overrides let a test compare framings.
 */
export function bottomRowSpacingPx(
  viewportWidth: number,
  viewportHeight: number,
  overrides: { cellMetres?: number; eyeY?: number } = {},
) {
  const portrait = viewportHeight > viewportWidth;
  const framing = chaseFraming(portrait);
  const eyeY = overrides.eyeY ?? framing.eyeY;
  const cell = overrides.cellMetres ?? VISION_RIDE_GRID_CELL_METRES;
  const halfFov = (framing.fov * Math.PI) / 360;
  const focalPx = viewportHeight / 2 / Math.tan(halfFov);
  const pitch = Math.atan2(eyeY - framing.lookY, framing.chaseZ - framing.carZ);
  const bottomDistance = eyeY / Math.tan(pitch + halfFov);
  const screenY = (distance: number) =>
    focalPx * Math.tan(Math.atan2(eyeY, distance) - pitch);
  return screenY(bottomDistance) - screenY(bottomDistance + cell);
}

/**
 * Ground coverage, derived from the framing rather than fixed. The portrait
 * chase sits 7.5 m behind the settle point and arrives from 8.9 m; a floor
 * whose near edge stopped at z=5 left the lower 40 % of that frame blank.
 */
export const VISION_RIDE_GRID_NEAR_MARGIN_METRES = 6;
/** Depth at which the floor has fully lifted into the horizon glow. */
export const VISION_RIDE_GRID_HORIZON_METRES = 190;

/** The z band the ride camera can occupy across both orientations: from
 * the crest of the breath with the pointer pulling, the brake down and the
 * wheel all the way in, to the settled chase with the accelerator down and
 * the wheel all the way out. The opening shot starts ahead of the settled
 * chase, beside the car. */
export function cameraZRange() {
  const extremes = [chaseFraming(false), chaseFraming(true)].map(
    chaseZExtremes,
  );
  return {
    max: Math.max(...extremes.map((range) => range.farthest)),
    min: Math.min(...extremes.map((range) => range.nearest)),
  };
}

export function horizontalHalfFovRadians(fov: number, aspect: number) {
  return Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
}

/** z of the nearest ground the bottom edge of the frame can see, from the
 * farthest-back camera (wheel out, accelerator down) with the pointer
 * holding the eye at its lowest. */
export function nearestVisibleGroundZ(portrait: boolean) {
  const framing = chaseFraming(portrait);
  const cameraZ = chaseZExtremes(framing).farthest;
  const down = Math.atan2(framing.eyeY - framing.lookY, cameraZ - framing.carZ);
  const eye = framing.eyeY - VISION_RIDE_PARALLAX.maxY;
  const bottomEdge = down + (framing.fov * Math.PI) / 360;
  return cameraZ - eye / Math.tan(bottomEdge);
}

/** z where the road edge, the foot of the flank, first enters the frame
 * from the farthest-back camera with the pointer at its lateral extreme. */
export function roadEdgeEntryZ(portrait: boolean, aspect: number) {
  const framing = chaseFraming(portrait);
  const lateral = VISION_RIDE_ROAD_HALF_WIDTH - VISION_RIDE_PARALLAX.wallX;
  return (
    chaseZExtremes(framing).farthest -
    lateral / Math.tan(horizontalHalfFovRadians(framing.fov, aspect))
  );
}

import { VISION_RIDE_CAMERA } from "./visionRideCamera";

export const VISION_RIDE_LIGHT_TRAIL = {
  particlesPerLamp: 56,
  lengthMetres: 2.8,
  pointSizeMetres: 0.15,
  /** Centers measured from the decoded body mesh, not the bumper bounds. */
  lampLocalX: 0.76,
  lampLocalY: 0.76,
  lampLocalZ: -2.11,
} as const;

export type LightTrailMotion = Readonly<{
  weaveRate: number;
  weaveAmount: number;
  bounceRate: number;
  bounceAmount: number;
  rollRate: number;
  rollAmount: number;
}>;

export function lightTrailRestAnchor(side: -1 | 1) {
  return {
    // `side` names the final world-space side after the car's half-turn.
    x: side * VISION_RIDE_LIGHT_TRAIL.lampLocalX,
    y: 0.035 + VISION_RIDE_LIGHT_TRAIL.lampLocalY,
    z: VISION_RIDE_CAMERA.carZ - VISION_RIDE_LIGHT_TRAIL.lampLocalZ,
  };
}

export function lightTrailCarPose(input: {
  time: number;
  motion: LightTrailMotion;
}) {
  return {
    x: Math.sin(input.time * input.motion.weaveRate) * input.motion.weaveAmount,
    y:
      0.035 +
      Math.sin(input.time * input.motion.bounceRate) *
        input.motion.bounceAmount,
    roll:
      Math.sin(input.time * input.motion.rollRate) * input.motion.rollAmount,
  };
}

export function lightTrailParticleDistance(input: {
  index: number;
  sideIndex: 0 | 1;
  travelDistanceMetres: number;
}) {
  const trail = VISION_RIDE_LIGHT_TRAIL;
  const spacing = trail.lengthMetres / trail.particlesPerLamp;
  const stagger = input.sideIndex * spacing * 0.43;
  const distance =
    input.index * spacing + stagger + Math.max(0, input.travelDistanceMetres);
  return distance % trail.lengthMetres;
}

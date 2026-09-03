import { VISION_RIDE_CAMERA } from "./visionRideCamera";

export const VISION_RIDE_LIGHT_TRAIL = {
  samplesPerLamp: 192,
  sampleIntervalSeconds: 1 / 60,
  baseExposureSeconds: 2.6,
  minimumSpeedStretch: 0.72,
  maximumSpeedStretch: 1.45,
  speedStretchPerOctave: 0.22,
  emitterHalfWidthMetres: 0.145,
  emitterHalfHeightMetres: 0.055,
  emitterEndBloomFraction: 0.22,
  verticalDropNdc: 0.24,
  maximumEmitterScale: 5.5,
  offscreenProgress: 0.78,
  offscreenOverscanNdc: 0.04,
  offscreenTailOverrunNdc: 0.08,
  headFadeFraction: 0.055,
  tailFadeStartFraction: 0.88,
  flowMetresForFullScale: 30,
  vanishingPointNdcY: 0.12,
  /** Decoded lamp centers, calibrated ten percent toward the centerline. */
  lampLocalX: 0.684,
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

export type LightRibbonSample = Readonly<{
  x: number;
  y: number;
  capturedAtSeconds: number;
  travelDistanceMetres: number;
}>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function smoothstep(value: number) {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

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

export function lightTrailSpeedStretch(speedMultiplier: number) {
  const trail = VISION_RIDE_LIGHT_TRAIL;
  const stretch =
    1 +
    Math.log2(Math.max(0.001, speedMultiplier)) * trail.speedStretchPerOctave;
  return Math.max(
    trail.minimumSpeedStretch,
    Math.min(trail.maximumSpeedStretch, stretch),
  );
}

export function lightRibbonExposureSeconds(speedMultiplier: number) {
  return (
    VISION_RIDE_LIGHT_TRAIL.baseExposureSeconds *
    Math.sqrt(lightTrailSpeedStretch(speedMultiplier))
  );
}

export function lightRibbonPresentation(input: {
  sample: LightRibbonSample;
  nowSeconds: number;
  travelDistanceMetres: number;
  speedMultiplier: number;
  vanishingPointNdcX: number;
  offscreenMarginNdc?: number;
}) {
  const trail = VISION_RIDE_LIGHT_TRAIL;
  const ageSeconds = Math.max(
    0,
    input.nowSeconds - input.sample.capturedAtSeconds,
  );
  const exposureSeconds = lightRibbonExposureSeconds(input.speedMultiplier);
  const progress = clamp01(ageSeconds / exposureSeconds);
  const head = smoothstep(progress / trail.headFadeFraction);
  const tail =
    1 -
    smoothstep(
      (progress - trail.tailFadeStartFraction) /
        (1 - trail.tailFadeStartFraction),
    );
  const travelled = Math.max(
    0,
    input.travelDistanceMetres - input.sample.travelDistanceMetres,
  );
  const verticalDrop =
    trail.verticalDropNdc * smoothstep(progress / 0.32);
  const offscreenMargin = Math.max(0, input.offscreenMarginNdc ?? 0);
  const offscreenY =
    -1 - trail.offscreenOverscanNdc - offscreenMargin;
  const sampleDeltaY = Math.min(
    -0.02,
    input.sample.y - trail.vanishingPointNdcY,
  );
  const exitScale = Math.max(
    1,
    (offscreenY + verticalDrop - trail.vanishingPointNdcY) / sampleDeltaY,
  );
  const exitFlowScale = exitScale - 1;
  const exitCurve = smoothstep(progress / trail.offscreenProgress);
  const overrun = smoothstep(
    (progress - trail.offscreenProgress) / (1 - trail.offscreenProgress),
  );
  const physicalNudge = Math.min(
    exitFlowScale * 0.06,
    (travelled / trail.flowMetresForFullScale) * 0.04,
  );
  const flowScale =
    exitFlowScale * (exitCurve + overrun * 0.1) + physicalNudge;
  const scale = 1 + flowScale;
  const projectedY =
    trail.vanishingPointNdcY +
    (input.sample.y - trail.vanishingPointNdcY) * scale -
    verticalDrop;
  const guaranteedY =
    progress >= trail.offscreenProgress
      ? Math.min(
          projectedY,
          offscreenY - overrun * trail.offscreenTailOverrunNdc,
        )
      : projectedY;
  return {
    x:
      input.vanishingPointNdcX +
      (input.sample.x - input.vanishingPointNdcX) * scale,
    y: guaranteedY,
    opacity: head * tail,
    progress,
    scale: Math.min(scale, trail.maximumEmitterScale),
  };
}

export function lightRibbonShouldRetainSample(input: {
  sample: LightRibbonSample;
  nowSeconds: number;
  speedMultiplier: number;
}) {
  return (
    input.nowSeconds - input.sample.capturedAtSeconds <=
    lightRibbonExposureSeconds(input.speedMultiplier)
  );
}

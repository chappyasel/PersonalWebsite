/**
 * Allocation-free bridge from Meadow's existing pointer/wind frame loop to
 * other ambient systems. Meadow remains the sole owner of pointer projection;
 * consumers only read this stable snapshot inside their own frame callbacks.
 */

export const MEADOW_DISTURBANCE_PULSES = 6;

export type MeadowDisturbancePulse = {
  x: number;
  z: number;
  radius: number;
  strength: number;
  startedAt: number;
};

export type MeadowDisturbanceSnapshot = {
  brushX: number;
  brushZ: number;
  brushRadius: number;
  brushStrength: number;
  directionX: number;
  directionZ: number;
  windAmplitude: number;
  impact: {
    x: number;
    y: number;
    z: number;
    directionX: number;
    directionZ: number;
    strength: number;
    revision: number;
  };
  pulses: MeadowDisturbancePulse[];
};

const snapshot: MeadowDisturbanceSnapshot = {
  brushX: 0,
  brushZ: 0,
  brushRadius: 0,
  brushStrength: 0,
  directionX: 0,
  directionZ: 0,
  windAmplitude: 0,
  impact: {
    x: 0,
    y: 0,
    z: 0,
    directionX: 0,
    directionZ: 0,
    strength: 0,
    revision: 0,
  },
  pulses: Array.from({ length: MEADOW_DISTURBANCE_PULSES }, () => ({
    x: 0,
    z: 0,
    radius: 0,
    strength: 0,
    startedAt: -1,
  })),
};

export function publishMeadowDisturbance(options: {
  brush: { x: number; y: number; z: number; w: number };
  direction: { x: number; y: number };
  windAmplitude: number;
  pulses: ReadonlyArray<{ x: number; y: number; z: number; w: number }>;
  pulseStarts: readonly number[];
}) {
  snapshot.brushX = options.brush.x;
  snapshot.brushZ = options.brush.y;
  snapshot.brushRadius = options.brush.z;
  snapshot.brushStrength = options.brush.w;
  snapshot.directionX = options.direction.x;
  snapshot.directionZ = options.direction.y;
  snapshot.windAmplitude = options.windAmplitude;
  for (let index = 0; index < snapshot.pulses.length; index += 1) {
    const source = options.pulses[index];
    const target = snapshot.pulses[index]!;
    target.x = source?.x ?? 0;
    target.z = source?.y ?? 0;
    target.radius = source?.z ?? 0;
    target.strength = source?.w ?? 0;
    target.startedAt = options.pulseStarts[index] ?? -1;
  }
}

export function getMeadowDisturbance() {
  return snapshot;
}

/** One-shot event emitted by the physics world's existing first-contact hook. */
export function publishMeadowImpact(options: {
  x: number;
  y: number;
  z: number;
  directionX: number;
  directionZ: number;
  strength: number;
}) {
  snapshot.impact.x = options.x;
  snapshot.impact.y = options.y;
  snapshot.impact.z = options.z;
  snapshot.impact.directionX = options.directionX;
  snapshot.impact.directionZ = options.directionZ;
  snapshot.impact.strength = options.strength;
  snapshot.impact.revision += 1;
}

export function resetMeadowDisturbance() {
  snapshot.brushStrength = 0;
  snapshot.windAmplitude = 0;
  snapshot.impact.strength = 0;
  for (const pulse of snapshot.pulses) {
    pulse.strength = 0;
    pulse.startedAt = -1;
  }
}

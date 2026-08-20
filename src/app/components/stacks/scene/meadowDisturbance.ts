/**
 * Allocation-free bridge from Meadow's existing pointer/wind frame loop to
 * other ambient systems. Meadow remains the sole owner of pointer projection;
 * consumers only read this stable snapshot inside their own frame callbacks.
 */

export const MEADOW_DISTURBANCE_PULSES = 6;
export const MEADOW_IMPACT_EVENTS = 8;

export type MeadowDisturbancePulse = {
  x: number;
  z: number;
  radius: number;
  strength: number;
  startedAt: number;
};

export type MeadowImpactEvent = {
  x: number;
  y: number;
  z: number;
  directionX: number;
  directionZ: number;
  strength: number;
  radiusScale: number;
  timeScale: number;
  revision: number;
};

export type MeadowDisturbanceSnapshot = {
  brushX: number;
  brushZ: number;
  brushRadius: number;
  brushStrength: number;
  directionX: number;
  directionZ: number;
  windAmplitude: number;
  /** Latest impact, retained for diagnostics and compatibility. Consumers
   * should traverse `impacts` so same-frame contacts cannot overwrite. */
  impact: MeadowImpactEvent;
  impacts: MeadowImpactEvent[];
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
    radiusScale: 1,
    timeScale: 1,
    revision: 0,
  },
  impacts: Array.from({ length: MEADOW_IMPACT_EVENTS }, () => ({
    x: 0,
    y: 0,
    z: 0,
    directionX: 0,
    directionZ: 0,
    strength: 0,
    radiusScale: 1,
    timeScale: 1,
    revision: 0,
  })),
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

/** Bounded event emitted by ground impacts and throttled grounded travel. */
export function publishMeadowImpact(options: {
  x: number;
  y: number;
  z: number;
  directionX: number;
  directionZ: number;
  strength: number;
  radiusScale?: number;
  timeScale?: number;
}) {
  const revision = snapshot.impact.revision + 1;
  const event = snapshot.impacts[(revision - 1) % snapshot.impacts.length]!;
  event.x = options.x;
  event.y = options.y;
  event.z = options.z;
  event.directionX = options.directionX;
  event.directionZ = options.directionZ;
  event.strength = options.strength;
  event.radiusScale = options.radiusScale ?? 1;
  event.timeScale = options.timeScale ?? 1;
  event.revision = revision;
  Object.assign(snapshot.impact, event);
}

/** Visits every retained impact newer than `afterRevision` without allocating.
 * If a stalled consumer falls behind the ring, it resumes at the oldest event
 * that still exists. */
export function visitMeadowImpactsSince(
  afterRevision: number,
  visit: (impact: MeadowImpactEvent) => void,
) {
  const latestRevision = snapshot.impact.revision;
  const firstRevision = Math.max(
    1,
    afterRevision + 1,
    latestRevision - snapshot.impacts.length + 1,
  );
  for (
    let revision = firstRevision;
    revision <= latestRevision;
    revision += 1
  ) {
    const impact = snapshot.impacts[(revision - 1) % snapshot.impacts.length]!;
    if (impact.revision === revision) visit(impact);
  }
  return latestRevision;
}

export function resetMeadowDisturbance() {
  snapshot.brushStrength = 0;
  snapshot.windAmplitude = 0;
  snapshot.impact.strength = 0;
  for (const impact of snapshot.impacts) impact.strength = 0;
  for (const pulse of snapshot.pulses) {
    pulse.strength = 0;
    pulse.startedAt = -1;
  }
}

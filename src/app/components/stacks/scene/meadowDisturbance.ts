/**
 * Allocation-free bridge from physical bodies and Meadow's pointer/wind loop
 * to ambient scene systems. Consumers read one stable snapshot in frame
 * callbacks and traverse the bounded physical-event ring without allocating.
 */

export const MEADOW_DISTURBANCE_PULSES = 6;
export const MEADOW_PHYSICAL_EVENTS = 8;
const MAX_MEADOW_PHYSICAL_STRENGTH = 2;

export type MeadowDisturbancePulse = {
  x: number;
  z: number;
  radius: number;
  strength: number;
  startedAt: number;
};

export type MeadowPhysicalEvent = {
  kind: "impact" | "trail";
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  y: number;
  directionX: number;
  directionZ: number;
  strength: number;
  radius: number;
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
  resetRevision: number;
  /** Latest event, retained for diagnostics. Consumers should traverse
   * `physicalEvents` so same-frame contacts cannot overwrite one another. */
  physicalEvent: MeadowPhysicalEvent;
  physicalEvents: MeadowPhysicalEvent[];
  pulses: MeadowDisturbancePulse[];
};

function emptyPhysicalEvent(): MeadowPhysicalEvent {
  return {
    kind: "impact",
    startX: 0,
    startZ: 0,
    endX: 0,
    endZ: 0,
    y: 0,
    directionX: 0,
    directionZ: 0,
    strength: 0,
    radius: 0,
    timeScale: 1,
    revision: 0,
  };
}

const snapshot: MeadowDisturbanceSnapshot = {
  brushX: 0,
  brushZ: 0,
  brushRadius: 0,
  brushStrength: 0,
  directionX: 0,
  directionZ: 0,
  windAmplitude: 0,
  resetRevision: 0,
  physicalEvent: emptyPhysicalEvent(),
  physicalEvents: Array.from(
    { length: MEADOW_PHYSICAL_EVENTS },
    emptyPhysicalEvent,
  ),
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

/** Publishes a bounded ground impact or throttled grounded-travel segment. */
export function publishMeadowPhysicalEvent(
  options: Omit<MeadowPhysicalEvent, "revision">,
) {
  const revision = snapshot.physicalEvent.revision + 1;
  const event =
    snapshot.physicalEvents[(revision - 1) % snapshot.physicalEvents.length]!;
  const directionLength = Math.hypot(options.directionX, options.directionZ);
  event.kind = options.kind;
  event.startX = options.startX;
  event.startZ = options.startZ;
  event.endX = options.endX;
  event.endZ = options.endZ;
  event.y = options.y;
  event.directionX =
    directionLength > 1e-5 ? options.directionX / directionLength : 0;
  event.directionZ =
    directionLength > 1e-5 ? options.directionZ / directionLength : 0;
  event.strength = Math.max(
    0,
    Math.min(MAX_MEADOW_PHYSICAL_STRENGTH, options.strength),
  );
  event.radius = Math.max(0, options.radius);
  event.timeScale = Math.max(0, options.timeScale);
  event.revision = revision;
  Object.assign(snapshot.physicalEvent, event);
}

/** Visits every retained event newer than `afterRevision` without allocating.
 * A stalled consumer resumes at the oldest event still present in the ring. */
export function visitMeadowPhysicalEventsSince(
  afterRevision: number,
  visit: (event: MeadowPhysicalEvent) => void,
) {
  const latestRevision = snapshot.physicalEvent.revision;
  const firstRevision = Math.max(
    1,
    afterRevision + 1,
    latestRevision - snapshot.physicalEvents.length + 1,
  );
  for (
    let revision = firstRevision;
    revision <= latestRevision;
    revision += 1
  ) {
    const event =
      snapshot.physicalEvents[(revision - 1) % snapshot.physicalEvents.length]!;
    if (event.revision === revision) visit(event);
  }
  return latestRevision;
}

export function resetMeadowDisturbance() {
  snapshot.brushStrength = 0;
  snapshot.windAmplitude = 0;
  snapshot.physicalEvent.strength = 0;
  snapshot.resetRevision += 1;
  for (const event of snapshot.physicalEvents) event.strength = 0;
  for (const pulse of snapshot.pulses) {
    pulse.strength = 0;
    pulse.startedAt = -1;
  }
}

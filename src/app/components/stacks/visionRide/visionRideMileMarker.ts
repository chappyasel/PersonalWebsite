export const VISION_RIDE_MILE_MARKER = {
  periodSeconds: 30,
  farZ: -72,
  nearZ: 7,
  heightMetres: 3.1,
  depthMetres: 0.44,
  shatterDistanceMetres: 6.4,
} as const;

export type MileMarkerPresentation = Readonly<{
  visible: boolean;
  number: number;
  z: number;
  progress: number;
}>;

/** One road-spanning checkpoint enters every 30 seconds and advances by the
 * actual integrated road distance, so throttle changes affect it naturally. */
export function mileMarkerPresentation(
  elapsed: number,
  distanceSinceCheckpoint: number,
  reducedMotion: boolean,
): MileMarkerPresentation {
  const marker = VISION_RIDE_MILE_MARKER;
  if (reducedMotion || elapsed < marker.periodSeconds)
    return { visible: false, number: 0, z: marker.farZ, progress: 0 };
  const number = Math.floor(elapsed / marker.periodSeconds);
  const distance = Math.max(0, distanceSinceCheckpoint);
  const span = marker.nearZ - marker.farZ;
  const z = marker.farZ + distance;
  return {
    visible: z <= marker.nearZ,
    number: number % 100,
    z,
    progress: Math.max(0, Math.min(1, distance / span)),
  };
}

export function checkpointShatterProgress(
  checkpointZ: number,
  impactZ: number,
) {
  return Math.max(
    0,
    Math.min(
      1,
      (checkpointZ - impactZ) / VISION_RIDE_MILE_MARKER.shatterDistanceMetres,
    ),
  );
}

const DIGIT_SEGMENTS = [
  "abcdef",
  "bc",
  "abdeg",
  "abcdg",
  "bcfg",
  "acdfg",
  "acdefg",
  "abc",
  "abcdefg",
  "abcdfg",
] as const;

export function mileMarkerDigitSegments(number: number) {
  const value = Math.max(0, Math.floor(number)) % 100;
  return String(value)
    .padStart(2, "0")
    .split("")
    .map((digit) => DIGIT_SEGMENTS[Number(digit)]!);
}

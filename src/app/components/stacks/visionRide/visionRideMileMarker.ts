export const VISION_RIDE_MILE_MARKER = {
  periodSeconds: 30,
  passSeconds: 6,
  nearZ: 7,
  shoulderOffsetMetres: 0.35,
} as const;

export type MileMarkerPresentation = Readonly<{
  visible: boolean;
  number: number;
  z: number;
}>;

/** One numbered marker enters from the profile's speed-matched distance and
 * passes the camera every 30 seconds. Nothing hangs beside the road between
 * passes. */
export function mileMarkerPresentation(
  elapsed: number,
  speedMetresPerSecond: number,
  reducedMotion: boolean,
): MileMarkerPresentation {
  const marker = VISION_RIDE_MILE_MARKER;
  if (reducedMotion || elapsed < marker.periodSeconds)
    return { visible: false, number: 0, z: marker.nearZ };
  const number = Math.floor(elapsed / marker.periodSeconds);
  const local = elapsed - number * marker.periodSeconds;
  const visible = local <= marker.passSeconds;
  return {
    visible,
    number: number % 100,
    z:
      marker.nearZ -
      speedMetresPerSecond *
        (marker.passSeconds - Math.min(local, marker.passSeconds)),
  };
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

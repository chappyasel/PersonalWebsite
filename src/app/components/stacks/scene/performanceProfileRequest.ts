export const PERFORMANCE_PROFILE_PARAM = "perf-profile";

export const PERFORMANCE_PROFILE_IDS = [
  "constrained",
  "unknown-device",
  "floor",
  "low-dpr",
  "no-composer",
  "light-boot",
  "no-meadow",
  "retina-stress",
] as const;

export type PerformanceProfileId = (typeof PERFORMANCE_PROFILE_IDS)[number];

export function isPerformanceProfileId(
  value: unknown,
): value is PerformanceProfileId {
  return (
    typeof value === "string" &&
    (PERFORMANCE_PROFILE_IDS as readonly string[]).includes(value)
  );
}

/** The valid profile ID named by the URL, or null. This small parser is safe
 * for the ordinary chrome to import without pulling in profile definitions. */
export function performanceProfileIdFromSearch(
  search: string | URLSearchParams,
): PerformanceProfileId | null {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const raw = params.get(PERFORMANCE_PROFILE_PARAM);
  return isPerformanceProfileId(raw) ? raw : null;
}

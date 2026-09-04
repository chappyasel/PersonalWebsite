// Named, reload-time workload profiles for reproducing a performance report
// on a machine that is not the one that reported it.
//
// A profile is a bundle of switches the scene already has: a forced quality
// preset, a manual render-scale ceiling, a freeze on Auto adaptation, and a
// few performance settings. Nothing here is new capability. The point is that
// one URL names one hypothesis, so two runs a week apart can be compared
// without reconstructing which six switches were on.
//
// Every profile is explicit and default-off. A visit without `perf-profile`
// sees production policy. A visit with it never reads or writes the learned
// quality profile, because a test run must not teach the owner's next
// ordinary visit anything.
//
// This module deliberately imports only types from the quality and
// performance modules. `devHooks` and the diagnostics runtime read it during
// the first script of the page, before any renderer exists.
import {
  PERFORMANCE_PROFILE_PARAM,
  type PerformanceProfileId,
  performanceProfileIdFromSearch,
} from "./performanceProfileRequest";
import type { SceneQualityMode } from "./quality";
import type { ScenePerformanceSettings } from "./scenePerformance";

export {
  PERFORMANCE_PROFILE_IDS,
  PERFORMANCE_PROFILE_PARAM,
  type PerformanceProfileId,
  isPerformanceProfileId,
  performanceProfileIdFromSearch,
} from "./performanceProfileRequest";

export type PerformanceProfile = Readonly<{
  id: PerformanceProfileId;
  /** Quality mode the canvas boots into. An explicit `?quality=` still wins. */
  quality: SceneQualityMode;
  /** Hold Auto's axes at their starting point so the profile's own change is
   * the only difference between two runs. Meaningless in a forced mode. */
  freezeAuto: boolean;
  /** Manual render-scale ceiling, or null to leave the pixel budget in
   * charge. The plan pins the resolution axis at the ceiling when one is set. */
  resolutionCeiling: number | null;
  /** Performance settings the profile seeds. Reload-time switches such as
   * `nopostfx` are merged on top, so an explicit switch still wins. */
  performance: Partial<ScenePerformanceSettings>;
}>;

const profile = (definition: PerformanceProfile) => Object.freeze(definition);

export const PERFORMANCE_PROFILES: Readonly<
  Record<PerformanceProfileId, PerformanceProfile>
> = Object.freeze({
  constrained: profile({
    id: "constrained",
    quality: "safety",
    freezeAuto: false,
    resolutionCeiling: 1,
    performance: {
      postprocessing: false,
      prewarmAllUnitVisuals: false,
      highResolutionPhotos: false,
      meadow: false,
    },
  }),
  "unknown-device": profile({
    id: "unknown-device",
    quality: "auto",
    freezeAuto: false,
    resolutionCeiling: null,
    performance: {},
  }),
  floor: profile({
    id: "floor",
    quality: "safety",
    freezeAuto: false,
    resolutionCeiling: null,
    performance: {},
  }),
  "low-dpr": profile({
    id: "low-dpr",
    quality: "auto",
    freezeAuto: true,
    resolutionCeiling: 1,
    performance: {},
  }),
  "no-composer": profile({
    id: "no-composer",
    quality: "auto",
    freezeAuto: true,
    resolutionCeiling: null,
    performance: { postprocessing: false },
  }),
  "light-boot": profile({
    id: "light-boot",
    quality: "auto",
    freezeAuto: false,
    resolutionCeiling: null,
    performance: { prewarmAllUnitVisuals: false, highResolutionPhotos: false },
  }),
  "no-meadow": profile({
    id: "no-meadow",
    quality: "auto",
    freezeAuto: false,
    resolutionCeiling: null,
    performance: { meadow: false },
  }),
  "retina-stress": profile({
    id: "retina-stress",
    quality: "showcase",
    freezeAuto: false,
    resolutionCeiling: 3,
    performance: {},
  }),
});

/** Every performance setting any profile touches. Switching profiles live
 * returns these to their defaults before applying the next profile, so one
 * profile's leftovers cannot masquerade as the next profile's result. */
export const PERFORMANCE_PROFILE_SETTING_KEYS: readonly (keyof ScenePerformanceSettings)[] =
  Object.freeze([
    "postprocessing",
    "prewarmAllUnitVisuals",
    "highResolutionPhotos",
    "meadow",
  ]);

/** The profile named by the URL, or null. An unknown name is ignored rather
 * than mapped to a default, because a typo must not silently change what a
 * report measured. */
export function performanceProfileFromSearch(
  search: string | URLSearchParams,
): PerformanceProfile | null {
  const id = performanceProfileIdFromSearch(search);
  return id === null ? null : PERFORMANCE_PROFILES[id];
}

/** Rewrite a page URL to carry one profile, or none. Every other query
 * parameter and the hash survive, so a report URL can gain a profile without
 * losing `perf-report` or `hud`. */
export function performanceProfileUrl(
  href: string,
  id: PerformanceProfileId | null,
): string {
  const url = new URL(href);
  if (id === null) url.searchParams.delete(PERFORMANCE_PROFILE_PARAM);
  else url.searchParams.set(PERFORMANCE_PROFILE_PARAM, id);
  return url.href;
}

let activeProfile: PerformanceProfileId | null = null;
const listeners = new Set<() => void>();

/** Which profile the scene is currently under. Seeded from the URL by the
 * diagnostics runtime and changed live by the Scene Diagnostics control. */
export const performanceProfileController = Object.freeze({
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): PerformanceProfileId | null {
    return activeProfile;
  },
  set(id: PerformanceProfileId | null) {
    if (activeProfile === id) return;
    activeProfile = id;
    for (const listener of listeners) listener();
  },
});

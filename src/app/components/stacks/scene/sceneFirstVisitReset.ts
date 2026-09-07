import { WARM_KEY } from "../boot/worldBootPolicy";

import {
  SCENE_ARRIVAL_SESSION_KEY,
  SCENE_FOCUS_SESSION_KEY,
  SCENE_QUALITY_STORAGE_PREFIX,
  SCENE_SOUND_STORAGE_KEY,
  SCENE_WEBGL_CAPABILITY_SESSION_KEY,
} from "./sceneVisitStorage";
import { SCREENSHOT_QUERY_KEYS } from "./screenshotMode";

type MutableStorage = Pick<Storage, "key" | "length" | "removeItem">;

const LOCAL_STORAGE_KEYS = new Set([WARM_KEY, SCENE_SOUND_STORAGE_KEY]);

const SESSION_STORAGE_KEYS = new Set([
  SCENE_ARRIVAL_SESSION_KEY,
  SCENE_WEBGL_CAPABILITY_SESSION_KEY,
  SCENE_FOCUS_SESSION_KEY,
]);

export const SCENE_QUERY_OVERRIDE_KEYS = [
  "debug",
  "hud",
  "harness",
  "quality",
  "perf-profile",
  "nopostfx",
  "nodof",
  "noaotransparency",
  "notiltshift",
  "nograde",
  "nomeadow",
  "grassDeformation",
  "hdPhotos",
  "og-capture",
  "og-resolution",
  "og-head-on",
  "og-fov",
  "og-look-y",
  "og-camera-y",
  "og-lens-center",
  ...SCREENSHOT_QUERY_KEYS,
] as const;

function clearMatchingKeys(
  storage: MutableStorage | null,
  shouldRemove: (key: string) => boolean,
) {
  if (!storage) return;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    ).filter((key): key is string => key !== null);
    for (const key of keys) {
      if (shouldRemove(key)) storage.removeItem(key);
    }
  } catch {
    // Storage access can be blocked even when the object itself is available.
    // Reset whatever is reachable and still allow the clean reload to proceed.
  }
}

/** Clear only state owned by the Stacks scene. Site-wide preferences such as
 * theme and font deliberately survive this reset. */
export function clearSceneFirstVisitStorage(
  localStorage: MutableStorage | null,
  sessionStorage: MutableStorage | null,
) {
  clearMatchingKeys(
    localStorage,
    (key) =>
      LOCAL_STORAGE_KEYS.has(key) ||
      key.startsWith(SCENE_QUALITY_STORAGE_PREFIX),
  );
  clearMatchingKeys(sessionStorage, (key) => SESSION_STORAGE_KEYS.has(key));
}

/** Remove every reload-time scene override while preserving unrelated query
 * parameters and the current hash. */
export function sceneFirstVisitUrl(href: string) {
  const url = new URL(href);
  for (const key of SCENE_QUERY_OVERRIDE_KEYS) url.searchParams.delete(key);
  return url.href;
}

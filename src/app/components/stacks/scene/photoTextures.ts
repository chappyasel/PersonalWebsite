import { type UnitSlug } from "../data";

/** Local scene photographs reveal from role-sized previews. Their canonical
 * masters replace those previews after the WebGL handoff, outside the boot
 * screen's critical path. */
export type ScenePhotoRole = "hero" | "feature" | "support";

export const SCENE_PHOTO_EDGE: Record<ScenePhotoRole, 256 | 512 | 1024> = {
  hero: 1024,
  feature: 512,
  support: 256,
};

const V8_PHOTO_RE = /^\/images\/stacks\/v8\/([^/]+)\.webp$/;

/** Diagnostic A/B switch. `?hdPhotos=0` keeps the scene on previews and must
 * guard both mounted texture loads and the distant background prefetch. */
export function sceneHdPhotosDisabled(search: string): boolean {
  return new URLSearchParams(search).get("hdPhotos") === "0";
}

export function scenePhotoUrl(
  url: string,
  role: ScenePhotoRole = "feature",
): string {
  const match = V8_PHOTO_RE.exec(url);
  if (!match || role === "hero") return url;
  return `/images/stacks/v8/${SCENE_PHOTO_EDGE[role]}/${match[1]}.webp`;
}

type PhotoManifestEntry = {
  name: string;
  role: Exclude<ScenePhotoRole, "hero">;
};

/**
 * The warming queue and the rendered props share this manifest. A new local
 * photograph therefore cannot preload a different preview URL than LitImage
 * renders before the world reveal.
 */
export const V8_PHOTOS_BY_UNIT: Record<
  UnitSlug,
  readonly PhotoManifestEntry[]
> = {
  about: [
    { name: "about-collective-group", role: "feature" },
    { name: "about-delicate-arch", role: "support" },
    { name: "about-family", role: "feature" },
    { name: "about-profile-full", role: "support" },
    { name: "about-speaking-candid", role: "feature" },
  ],
  books: [],
  training: [
    { name: "training-bench", role: "support" },
    { name: "training-deadlift", role: "support" },
    { name: "training-golf-flag", role: "feature" },
    { name: "training-golf-group", role: "feature" },
    { name: "training-gym-pose", role: "support" },
    { name: "training-stage-kneeling", role: "support" },
    { name: "training-stage-side", role: "support" },
    { name: "training-trophy-front", role: "support" },
    { name: "training-trophy-side", role: "support" },
  ],
  talks: [
    { name: "talk-ann-interview", role: "feature" },
    { name: "talk-consensus-phone", role: "feature" },
    { name: "talk-dc-policy", role: "feature" },
    { name: "talk-demo-night", role: "feature" },
    { name: "talk-panel", role: "feature" },
  ],
  projects: [
    { name: "projects-coding-couch", role: "feature" },
    { name: "projects-wwdc", role: "feature" },
  ],
  blog: [],
  systems: [
    { name: "systems-home-office", role: "feature" },
    { name: "systems-lake", role: "feature" },
    { name: "systems-lighthouse", role: "feature" },
    { name: "systems-sf-dusk", role: "feature" },
    { name: "systems-supplements", role: "feature" },
    { name: "systems-working-session", role: "feature" },
  ],
};

export function scenePhotoManifestUrl(entry: PhotoManifestEntry): string {
  return scenePhotoUrl(`/images/stacks/v8/${entry.name}.webp`, entry.role);
}

export function scenePhotoManifestMasterUrl(entry: PhotoManifestEntry): string {
  return `/images/stacks/v8/${entry.name}.webp`;
}

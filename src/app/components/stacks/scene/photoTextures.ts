import { type UnitSlug } from "../data";

/**
 * Local scene photographs have canonical masters in `/v8` and build-time
 * variants sized to the role they actually play in the room. Keeping the
 * choice URL-based means `useTexture` never decodes the 768–1024 px master
 * only to show it on a 50–150 physical-pixel prop.
 */
export type ScenePhotoRole = "hero" | "feature" | "support";

export const SCENE_PHOTO_EDGE: Record<ScenePhotoRole, 256 | 512 | 1024> = {
  hero: 1024,
  feature: 512,
  support: 256,
};

const V8_PHOTO_RE = /^\/images\/stacks\/v8\/([^/]+)\.webp$/;

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
 * photograph therefore cannot accidentally preload its full-size master
 * while LitImage renders a right-sized variant.
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

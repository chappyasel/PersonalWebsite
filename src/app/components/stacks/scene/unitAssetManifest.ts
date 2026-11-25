// Every model, texture, and SVG a shelf loads through a react-three loader,
// listed per shelf so all of them can start the moment the shelf mounts.
//
// Without this list a shelf's loads run as a chain: a shelf's contents sit in
// one Suspense boundary, and when the first model suspends, React stops
// rendering the rest of the boundary until that model resolves. The About
// shelf measured five links on production at a 4x CPU slowdown: models, then
// the prop atlases, then the globe map, then the role icons, then the AI
// Collective mark, each reopening the boot gate (docs/plans/room-boot-speed.md).
// Preloading the list puts every request in the first batch; each component
// then finds its load already in the cache.
//
// unitAssetManifest.test.ts reads the shelf sources and fails when a model
// literal or a known loader component has no entry here. Photos are not
// listed: Scene's preview warmer already starts those per shelf. Shelf
// modules that preload their own assets (FrozenBag, MioBottle, WavingGolfFlag,
// the Musings paper, sign, essay, and sticker) do so through preloadWithUnit.
//
// Three-free and data-only; unitAssetPreload.ts does the loading.
import type { UnitSlug } from "../data";

import { ABOUT_ROLES } from "./aboutRoleIcons";

export interface UnitAssets {
  /** GLBs loaded with `useGLTF(url, false)`. */
  readonly models: readonly string[];
  /** Single textures loaded with `useTexture(url)` or
   * `useLoader(TextureLoader, url)`; both share one cache entry. */
  readonly textures: readonly string[];
  /** Textures a call site loads as one array, `useTexture([a, b])`. The
   * cache keys on the whole array, so the preload must pass the same one. */
  readonly textureSets: readonly (readonly string[])[];
  /** SVGs loaded with `useLoader(SVGLoader, url)`. */
  readonly svgs: readonly string[];
}

/** ModelProp's two atlas pairs (ModelProp.tsx ATLAS_URLS, RECOLOR_URLS). A
 * shelf with any ModelProp needs one of them; both are about 1 KB, so every
 * such shelf preloads both. */
export const MODEL_PROP_ATLAS_SETS = [
  ["/models/atlas-light.png", "/models/atlas-dark.png"],
  ["/models/tiny-treats-light.png", "/models/tiny-treats-dark.png"],
] as const;

/** The globe's spin map pair (aboutTravel.ts ABOUT_GLOBE_MAP_URLS). */
const ABOUT_GLOBE_MAP_SET = [
  "/models/globe-map-light.webp",
  "/models/globe-map-dark.webp",
] as const;

const SUCCULENT = "/models/succulent-pot.glb";
const DESK_LAMP = "/models/desk-lamp.glb";

export const UNIT_ASSETS: Record<UnitSlug, UnitAssets> = {
  about: {
    models: [
      "/models/globe.glb",
      "/models/cactus.glb",
      "/models/potted-plant.glb",
      "/models/couch.glb",
      // Scene.tsx mounts the monstera with the About shelf.
      "/models/monstera.glb",
      "/models/vision-pro.glb",
      SUCCULENT,
      DESK_LAMP,
    ],
    textures: [
      ...ABOUT_ROLES.map((role) => role.artwork),
      "/images/stacks/tj-medallion.jpg",
    ],
    textureSets: [...MODEL_PROP_ATLAS_SETS, ABOUT_GLOBE_MAP_SET],
    svgs: ["/images/stacks/v8/ai-collective-mark.svg"],
  },
  books: { models: [], textures: [], textureSets: [], svgs: [] },
  training: {
    models: [
      "/models/barbell.glb",
      "/models/baseball.glb",
      "/models/basketball.glb",
      "/models/dumbbell.glb",
      "/models/golf-tee.glb",
      "/models/tennis-ball.glb",
    ],
    textures: [],
    textureSets: MODEL_PROP_ATLAS_SETS,
    svgs: [],
  },
  systems: {
    models: [
      "/models/alarm-clock.glb",
      "/models/grandfather-clock.glb",
      "/models/notebook.glb",
      "/models/sansevieria.glb",
    ],
    textures: [],
    textureSets: MODEL_PROP_ATLAS_SETS,
    svgs: [],
  },
  projects: {
    models: [
      "/models/arduino.glb",
      "/models/circuit-board.glb",
      "/models/mac.glb",
      "/models/phone.glb",
      "/models/potted-plant.glb",
      "/models/trophy.glb",
      "/models/yucca-plant.glb",
      DESK_LAMP,
    ],
    textures: [
      "/images/stacks/v8/512/projects-weightlifting-icon.webp",
      "/images/stacks/v8/512/projects-homework-icon.webp",
    ],
    textureSets: MODEL_PROP_ATLAS_SETS,
    svgs: [],
  },
  blog: {
    models: [
      "/models/cup-tea.glb",
      "/models/headphones.glb",
      "/models/kettle.glb",
      "/models/lighthouse.glb",
      "/models/mug.glb",
      "/models/open-book.glb",
      SUCCULENT,
      DESK_LAMP,
    ],
    textures: [],
    textureSets: MODEL_PROP_ATLAS_SETS,
    svgs: [],
  },
  talks: {
    models: [
      "/models/harmonica.glb",
      "/models/lamp-floor.glb",
      "/models/microphone.glb",
      "/models/pothos.glb",
      "/models/potted-plant.glb",
    ],
    textures: [],
    textureSets: MODEL_PROP_ATLAS_SETS,
    svgs: [],
  },
};

export const HOME_OG_OUTPUT = Object.freeze({ width: 1200, height: 630 });
// The card is screenshot mode's still, at night, with the large portrait kept
// (the owner's pick from a head-to-head, 2026-09-06): About alone on the
// meadow, the first three featured books, no couch and no seam monstera, the
// lawn lifted and uneven, and the render on Cinematic+. The portrait stays
// because a link preview has no profile picture beside it, unlike a social
// header. The quality is deliberately NOT pinned in the URL: an explicit
// `?quality=` would stop the mode landing on Cinematic+ (ScreenshotModeDriver).
export const HOME_OG_SCREENSHOT_PARAMS = Object.freeze({
  screenshot: "1",
  "screenshot-portrait": "1",
});
export const HOME_OG_DEVICE_SCALE_FACTOR = 4 / 3;
// Render the scene above the exported card's native density without forcing
// CI's software WebGL renderer through a 4800x2520 post-processing stack.
// The browser device scale still rasterizes the crop at 1200x630.
export const HOME_OG_RESOLUTION_CEILING = 2;
// Tighten only the exported card. The live room keeps its authored 33° lens.
export const HOME_OG_FOV = 30;
// Pitch down a fraction so the bridge rises without clipping the portrait.
export const HOME_OG_LOOK_Y = -0.105;
export const HOME_OG_CAMERA_Y = 0.4;

export const HOME_OG_VIEWPORT = Object.freeze({
  width: HOME_OG_OUTPUT.width,
  height: HOME_OG_OUTPUT.height,
});

// The live desktop camera leaves the right third open for its placard. Capture
// mode removes that UI, so crop the unused side around the focal shelf.
// Start slightly lower so the shelves land above the overlaid name.
export const HOME_OG_SCENE_CROP = Object.freeze({
  // Head-on capture puts the shelf on the camera's optical axis. Keep the
  // crop on that same axis so the exported card cannot reintroduce a shift.
  x: 150,
  y: 90,
  width: 900,
  // Chromium floors 472.5 CSS px at a 4:3 device scale to 629 physical px.
  // The extra half-pixel guarantees at least 630 rows before the exact resize.
  height: 473,
});

export const HOME_OG_LENS_CENTER =
  (HOME_OG_SCENE_CROP.x + HOME_OG_SCENE_CROP.width / 2) /
  HOME_OG_VIEWPORT.width;

/** One share card per room path. About is the homepage card and keeps its
 * historical file names; every other card lives under `og/<slug>`.
 *
 * Each card is screenshot mode's still of one shelf (`screenshot-unit`), at
 * night, through the homepage card's lens, crop, and settle loop. A card may
 * override the aim (`lookY`, `cameraY`) and lens (`fov`); the rest of the
 * capture is shared so the five cards read as one set.
 *
 * `path` is where the capture opens. The room routes open on their own shelf,
 * which saves the settle loop a travel. Musings' path is its essays page, so
 * its capture opens the room at the shelf's hash instead; the card itself is
 * served from `/musings`. */
export const ROOM_OG_CARDS = Object.freeze({
  about: Object.freeze({
    path: "/",
    image: "public/images/stacks/home-og-scene.jpg",
    manifest: "public/images/stacks/home-og-scene.inputs.json",
    screenshotParams: HOME_OG_SCREENSHOT_PARAMS,
    fov: HOME_OG_FOV,
    lookY: HOME_OG_LOOK_Y,
    cameraY: HOME_OG_CAMERA_Y,
  }),
  projects: Object.freeze({
    path: "/projects",
    image: "public/images/stacks/og/projects.jpg",
    manifest: "public/images/stacks/og/projects.inputs.json",
    screenshotParams: Object.freeze({
      screenshot: "1",
      "screenshot-unit": "4",
    }),
    fov: HOME_OG_FOV,
    lookY: HOME_OG_LOOK_Y,
    cameraY: HOME_OG_CAMERA_Y,
  }),
  musings: Object.freeze({
    path: "/#musings",
    image: "public/images/stacks/og/musings.jpg",
    manifest: "public/images/stacks/og/musings.inputs.json",
    screenshotParams: Object.freeze({
      screenshot: "1",
      "screenshot-unit": "5",
    }),
    fov: HOME_OG_FOV,
    lookY: HOME_OG_LOOK_Y,
    cameraY: HOME_OG_CAMERA_Y,
  }),
  talks: Object.freeze({
    path: "/talks",
    image: "public/images/stacks/og/talks.jpg",
    manifest: "public/images/stacks/og/talks.inputs.json",
    screenshotParams: Object.freeze({
      screenshot: "1",
      "screenshot-unit": "6",
    }),
    fov: HOME_OG_FOV,
    lookY: HOME_OG_LOOK_Y,
    cameraY: HOME_OG_CAMERA_Y,
  }),
  /** Golf stands between Books and Weightlifting with both shelves kept.
   * Its stop is the hitting bay at eye level, so on the shared aim the club
   * fills the left of the frame and the balls sit under the signature, and
   * og-look-y barely moves it (golf mode adds its own pitch). Stepping back
   * 3.5 units with the still's steepest tilt brings both shelves, the club,
   * the balls, and the flag on the green into the frame above the name. */
  golf: Object.freeze({
    path: "/golf",
    image: "public/images/stacks/og/golf.jpg",
    manifest: "public/images/stacks/og/golf.inputs.json",
    screenshotParams: Object.freeze({
      screenshot: "1",
      "screenshot-unit": "golf",
      "screenshot-dolly": "3.5",
      "screenshot-tilt": "8",
    }),
    fov: HOME_OG_FOV,
    lookY: HOME_OG_LOOK_Y,
    cameraY: HOME_OG_CAMERA_Y,
  }),
});

export const ROOM_OG_SLUGS = Object.freeze(
  /** @type {(keyof typeof ROOM_OG_CARDS)[]} */ (Object.keys(ROOM_OG_CARDS)),
);

/** Exit status of a `room-og-scene.mjs --verify` run whose render no longer
 * matches the committed card. Distinct from a crash (1) so the postbuild
 * check can tell "the card moved" from "the capture failed". */
export const ROOM_OG_RENDER_CHANGED_EXIT = 10;

/** @param {string} slug */
export function roomOgCard(slug) {
  const card = ROOM_OG_CARDS[/** @type {keyof typeof ROOM_OG_CARDS} */ (slug)];
  if (!card) {
    throw new Error(
      `Unknown room OG card "${slug}". Known cards: ${ROOM_OG_SLUGS.join(", ")}.`,
    );
  }
  return card;
}

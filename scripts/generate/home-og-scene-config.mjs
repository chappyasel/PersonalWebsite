export const HOME_OG_OUTPUT = Object.freeze({ width: 1200, height: 630 });
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

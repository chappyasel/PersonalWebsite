/** Scene-scale measurements and the two-point rest pose for Vision Pro.
 *
 * Apple's dimensional drawing gives the cover a 185.36 mm span (±92.68 mm).
 * Shelf props use the room's established 2.00 world-units-per-metre scale, so
 * the front cover is 0.37072 scene units wide. The full model is deeper than
 * that cover because it includes the light seal and Solo Knit Band. */
export const VISION_PRO_MODEL_URL = "/models/vision-pro.glb";
export const VISION_PRO_REAL_WIDTH_METRES = 0.18536;
export const SHELF_PROP_UNITS_PER_METRE = 2;
export const VISION_PRO_MODEL_WIDTH = 0.5168432805488756;
export const VISION_PRO_DISPLAY_WIDTH =
  VISION_PRO_REAL_WIDTH_METRES * SHELF_PROP_UNITS_PER_METRE;
export const VISION_PRO_MODEL_SCALE =
  VISION_PRO_DISPLAY_WIDTH / VISION_PRO_MODEL_WIDTH;

/** Exact elevation through the About rest camera after the authored rotation
 * below (the eye stands 1.1 units above this shelf, so the top shows). The
 * generated boot silhouette is tested against this pair, so a model, pose or
 * camera change cannot leave the loading screen on the old footprint. */
export const VISION_PRO_PROFILE = {
  width: 0.4176681675059897,
  height: 0.2453053002133383,
} as const;

/** The draft's yaw and small roll are retained. Its 8.2° forward pitch and
 * -0.0303 seat buried the band while the glass still floated. Solving the
 * model's lower hull gives a 2.085° pitch where the rear band and front
 * enclosure touch the same plane. The small negative seat lowers both contact
 * points the remaining 0.002374 scene units. */
export const VISION_PRO_POSE = {
  seat: -0.0023739920486534117,
  rotation: [-0.03638683497881125, -0.2898, -0.0411] as const,
  scale: VISION_PRO_MODEL_SCALE,
} as const;

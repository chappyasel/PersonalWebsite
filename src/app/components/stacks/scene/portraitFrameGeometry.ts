// The About portrait's physical form, in scene units. Pure so the boot
// composition (SSR) and the perch fixtures can share it with the live frame
// in objects.tsx without importing the 3D modules.
//
// Square, at the source's own 1:1, since 2026-08-23. It was 0.86 x 1.08 with
// a 1.35x zoom toward the face (audit §3-About disliked the source's blurry
// foreground hand), but that crop made the clicked print read as over-zoomed
// while it crossfaded into the full preview, and the owner prefers the whole
// photo. The frame keeps its width and loses height.
export const PORTRAIT_IMAGE = { width: 0.86, height: 0.86 } as const;
/** The mat and frame each add this much a side. */
export const PORTRAIT_MAT_INSET = 0.04;
export const PORTRAIT_FRAME_INSET = 0.08;
export const PORTRAIT_FRAME_RADIUS = 0.012;
export const PORTRAIT_FRAME_SIZE = {
  width: PORTRAIT_IMAGE.width + PORTRAIT_FRAME_INSET * 2,
  height: PORTRAIT_IMAGE.height + PORTRAIT_FRAME_INSET * 2,
} as const;
export const PORTRAIT_MAT_SIZE = {
  width: PORTRAIT_IMAGE.width + PORTRAIT_MAT_INSET * 2,
  height: PORTRAIT_IMAGE.height + PORTRAIT_MAT_INSET * 2,
} as const;
/** The frame group's pose inside its landmark: centred at half its height
 * so the bottom edge rests on the shelf, set back, and tilted a little. */
export const PORTRAIT_FRAME_POSE = {
  position: [0, PORTRAIT_FRAME_SIZE.height / 2, -0.08],
  rotation: [-0.06, 0.06, 0],
  frameDepth: 0.04,
} as const;

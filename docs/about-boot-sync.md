# About loading-scene synchronization

The loading vignette is the About shelf at its canonical rest pose. It is not
a separately authored illustration. This file records which module owns each
part of that pose and how a change reaches the SVG.

## Inventory

| Landmark              | Geometry and media                                    | Rest-pose source                                           | Loading projection                                                 | Drift guard                                                                       |
| --------------------- | ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Globe                 | `globe.glb`                                           | `ABOUT_MODEL_POSES.globe`                                  | Generated outline with uniform projection matrix                   | Asset and pose digests; generated-artifact check                                  |
| Succulent             | `succulent-pot.glb`                                   | `ABOUT_MODEL_POSES.succulent` and `ABOUT_TOP_LANDMARK_Z`   | Generated outline ordered by shared camera depth                   | Asset and pose digests; sway held at rest until reveal                            |
| Portrait              | Shared outer frame, mat, and image dimensions         | `ABOUT_PHOTO_POSES.portrait` and `PORTRAIT_FRAME_POSE`     | Three projected quads at their real depth planes                   | Both renderers call the same pure projection module                               |
| Family frame          | Shared desk-frame border, mat, and image geometry     | `ABOUT_PHOTO_POSES.family`                                 | Three projected quads at their real depth planes                   | Both renderers read the same geometry and pose constants                          |
| Cactus                | `cactus.glb`                                          | `ABOUT_MODEL_POSES.cactus` and `ABOUT_TOP_LANDMARK_Z`      | Generated outline ordered behind standing photos                   | Asset and pose digests; sway held at rest until reveal                            |
| Flat Collective print | Shared flat-print geometry                            | Live scene only                                            | Intentionally hidden because its front elevation is misleading     | Explicit `bootVisible: false` policy                                              |
| Profile frame         | Shared desk-frame border, mat, and image geometry     | `ABOUT_PHOTO_POSES.profile`                                | Three projected quads at their real depth planes                   | Both renderers read the same geometry and pose constants                          |
| Large plant           | `potted-plant.glb`                                    | `ABOUT_MODEL_POSES.large-plant` and `ABOUT_TOP_LANDMARK_Z` | Generated outline ordered behind standing photos                   | Asset and pose digests; sway held at rest until reveal                            |
| Desk lamp             | `desk-lamp.glb` plus recovered head                   | Shared root pose and `ABOUT_LAMP_HEAD_QUATERNION`          | Generated after applying the live head articulation                | Asset, root-pose, and head-quaternion digests                                     |
| AI Collective mark    | Shared billet and extrusion dimensions                | Shared root and mark yaws                                  | Front elevation includes both yaws and depth                       | Shared geometry and pose constants                                                |
| Coordination globe    | Shared analytic geometry and seeded graph             | Graph time zero                                            | Analytic SVG at time zero                                          | WebGL graph remains at time zero until reveal                                     |
| TJ medallion          | `TJ_MEDALLION_SOLIDS`                                 | `TJ_MEDALLION_POSE`                                        | Generated posed outline with analytic face detail                  | Geometry-spec digest and pose-tie tests                                           |
| Apple mark            | Shared outline, billet, extrusion dimensions          | Shared root and mark yaws                                  | Traced face and depth-aware billet projection                      | Shared geometry and pose constants                                                |
| Role Icons            | Shared billet proportions, offsets, yaws, and artwork | `ABOUT_ROLES`                                              | Depth-aware bodies with exact artwork faces                        | Both renderers read the same role records                                         |
| Reading books         | Shared book dimensions and three authored poses       | `readingStackPoses()`                                      | Orthographic rectangular boards and aspect-preserving image planes | Exact pose, left-forward paint order, inset, thickness, and cover URLs are tested |
| Ground dumbbell       | `dumbbell.glb`                                        | `ABOUT_MODEL_POSES.dumbbell`                               | Generated outline at the shared floor pose                         | Asset and complete-pose digest; both renderers share one pose                     |
| Shelf supports        | `SHELF_GEOMETRY.support` boxes                        | Shared X inset, Z depth, lower shelf, and ground planes    | Depth-projected uprights, feet, and lower cleats                   | Markup tests independently project every box corner                               |

## Change method

1. Change a rest pose in `aboutScenePose.ts`, not in JSX.
2. Run `pnpm generate:about-boot` after changing a GLB, its pose, or the lamp
   articulation.
3. Run `pnpm check:about-boot`. It reconstructs the projections and rejects a
   stale committed artifact.
4. Run the focused boot and geometry tests. They check generated digests,
   projected frame corners, book image insets, artwork URLs, and the canonical
   pre-reveal animation state.
5. Keep intentional omissions explicit in the composition. The reading covers
   are the one approved orthographic exception: their shared rest pose and
   inset remain canonical, but the loading SVG presents rectangular faces so
   tiny perspective distortion does not read as malformed cover art.

SVG images must use their real target-plane width and height before the affine
quad transform. A unit-square image viewport changes `preserveAspectRatio`
into square cropping, which is not the live scene's `object-fit: cover`
contract. Photos paint immediately over their vector fallback; they do not
begin at zero opacity and wait for a hydration-era load event.

Do not attach an SVG `clipPath` to boot raster images. That clipping path is
not needed because the image viewport already bounds `preserveAspectRatio`
painting, and it has erased otherwise valid photos in the transformed shelf
groups. The two small standing-frame previews use JPEG assets because this
transformed SVG path did not reliably paint their WebP versions.

The boot SVG uses an orthographic front elevation in scene units. The stage
module then aligns that elevation to the live shelf's center plane for the
current viewport. Depth still creates small viewport-dependent parallax in the
perspective WebGL camera; the shared stage alignment owns that limitation.

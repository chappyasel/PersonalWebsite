# Boot motion directions

The owner approved the seven shelf drawings, then paused production integration to explore the animation. Three agents independently considered graphic reveal, object choreography and camera movement. This is the resulting recommendation, not an implemented boot.

## Recommendation

Choose **Drawing becomes room**. Show the complete approved drawing, replace it with the same shelf in 3D while holding its position, then make one short camera move to the normal viewing position. The movement reveals the thickness of books, the separation of frames and their supports, and the surrounding room. That gives the illustration a purpose beyond filling loading time.

Keep the graphic reveal and object choreography as separate alternatives. Combining all three would turn a short arrival into several acts. The graphic agent also preferred the camera concept after reviewing it.

| Direction            | What the visitor sees                                                                                                                                                          | Why consider it                                                                    | Main risk                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Drawing becomes room | The finished illustration gains live materials and depth in place, then the camera settles into the room.                                                                      | Makes the relation between drawing and scene apparent; reveals the authored depth. | Requires a verified initial camera match and clean transfer to the normal camera controller. |
| The last adjustment  | Most of the collection appears together. A book row closes against its end; one or two frames make a tiny final adjustment. The whole shelf then moves into its live position. | Adds character through restraint and weight.                                       | Can become toy-like, and physical pivots require semantic metadata.                          |
| Ink to color         | A complete muted silhouette appears, then an invisible diagonal mask reveals the accepted colors, photographs and covers. The completed drawing then makes its placement move. | Draws attention to the identity of the objects and works on dense shelves.         | Can look like a scanner or presentation wipe; adds a distinct decorative beat.               |

## The preferred sequence

1. Paint the completed shelf illustration immediately, with the existing name and loading status. Keep its approved composition and palette.
2. Once the matching live frame is ready, crossfade from illustration to live materials over roughly 120 to 180 ms. Both views remain stationary and registered during this overlap.
3. Once the illustrated layer has disappeared, make one smoothly decelerating camera move over roughly 350 to 450 ms to the route's normal view. Let the real scene supply the parallax. Depending on the viewport, this can be an approach, pullback or lateral adjustment; it need not force the same zoom direction everywhere.
4. Release the camera to normal navigation at the same position and target. The name and wait copy have retired. The room's freestanding scenery appears with the live room in its real position.

The complete transition should fit in roughly 500 to 650 ms after readiness on an ordinary cold visit. These are motion-study targets, not a new minimum wait. Fast loads shorten the sequence, warm visits skip the opening when the room is already available, and slow loads hold the finished drawing. Preserve the existing reduced-motion flat-document policy and failure backstops.

Do not move the live camera beneath a still-visible static SVG. That creates double edges even if the two views matched at the start. Overlapping motion is valid only if both views follow the same projection throughout.

## The technical decision that comes first

The current four capture cases per shelf establish the look. They do not prove registration at arbitrary viewport sizes. A uniform CSS scale and translation cannot generally correct a perspective difference across objects at different depths.

The preferred route is to reconstruct each capture's camera, then map that projection into the displayed drawing rectangle. Start the live room from that camera before moving to the existing route camera. This needs a compact camera contract and measured proof. About's separately authored artwork needs its own compatibility check. Matching book selections, live clock hands and other changed content is part of this work, not just matching the outer shelf rectangle.

The simpler alternative keeps the live camera fixed and glides the illustration into the final scene projection, following the existing About design. Use it if the camera-led version cannot remain accurate, brief and interruptible.

Before production integration, prototype these two endings on Talks desktop and Weightlifting phone. Talks exposes depth and attachment errors through its five distinct mounts. Weightlifting exercises the revised phone framing. Check shelf endpoints and interior object landmarks at intermediate viewport sizes, with the proposed 3 CSS-pixel gate. A final two-camera crossfade is not evidence that this gate passed.

## Independent notes

- Graphic direction: `2026-09-12-boot-motion-graphic-ideation.md` in this directory.
- Spatial direction: `docs/reviews/boot-motion-spatial-ideation.md` in the `prototype/boot-render-masks` worktree.
- Object choreography: `docs/reviews/boot-motion-choreography-ideation.md` in the `prototype/boot-geometry` worktree.
- Worker paths and completion status: `boot-motion-ideation-run.json`.

No production source or approved illustration changed during this ideation round. No new visitor experience or Field Notes discovery was added.

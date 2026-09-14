# Scene interaction release

This release includes every pending change from the shared workspace.

The About globe now rotates through momentum, keeps a slow natural drift, and
uses gentler vertical movement with a smaller upward limit. Grabbing preserves
its visible angle. Marker picking reads the current model after rebuilds, and
the cursor distinguishes chapter links from dragging. Spherical markers attach
to the actual textured facets. Chapters have uniform orange markers at half
the visited-marker volume. Lived places use white houses at 1.2 times the
visited-marker volume.

The other changes reduce cursor follow on enlarged props, adjust camera orbit
limits, preserve overlay return transitions after the entrance, correct sphere
and static-box collision bounds, and reveal visible prop resets with a brief
fade and scale. The reset effect has a live diagnostics switch and uses only a
fade under reduced motion.

## Illustrated artwork reconciliation

The 24 approved drawings cover Books, Musings, Projects, Systems, Talks, and
Weightlifting. About uses its separate illustration, so changes to the globe
map markers do not change these captured drawings.

The watched source changes preserve the six shelves' rendered rest geometry:

- `Grabbable.tsx` forwards the pointer event and adds a neutral wrapper for
  reset reveals. That wrapper has identity position, rotation, and scale at
  rest. Temporary materials exist only during a reset.
- `PropApproach.tsx`, `propApproachState.ts`, and `macApproachState.ts` change
  selected-prop movement and remove unused cursor-follow exports. Shelf poses
  remain unchanged when no prop is selected.
- `eggs.tsx`, `globeBall.ts`, and `spinHandle.ts` change the About globe's
  movement, markers, and picking. The captured shelves do not contain it.
- `physics.ts` and `physicsColliders.ts` change collision shapes and recovery
  behavior, not visible mesh vertices or authored rest poses.
- `physicsDiagnostics.ts`, `pointerCameraTilt.ts`, and
  `interactionRegistry.ts` change runtime controls and interaction behavior.
  The saved drawing cameras and texture inputs remain unchanged.

The dependency receipt records this source review. Regeneration updates
fingerprint metadata while preserving the approved SVGs, raster details, and
capture inputs. It does not claim a fresh browser capture.

## Field Notes

`global-perspective` continues to count actual hand-driven rotation, including
coasting, while excluding natural drift. No new discovery was added. These
repairs do not reveal new content under quality-bar test 1; automatic prop
recovery has no meaningful qualifying action under test 2.

## Validation

`pnpm verify` passes after rebasing onto remote main at `d33d4376`: route type
generation, TypeScript, strict lint, 4,375 unit tests, 39 artwork tests, search
index freshness, and the meadow contract. The suite skips 21 tests. Geometry
tests cover map attachment, marker volumes, and picking after model replacement.
Physics tests include a carry using the real Training models.

The commit hook reports stale homepage social-preview capture metadata as an
advisory. The existing image is retained because refreshing it requires browser
capture, which the repository instructions prohibit without an explicit request.
No browser automation or production-data upload was performed for this review.

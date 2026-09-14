# Mobile loading and typography release

This release includes all pending changes from the shared workspace.

Saved shelf alignment could keep a ready renderer hidden until the 40-second
boot timeout. Stale registration evidence could also discard the renderer.
Alignment now has a 1200 ms budget once the scene and selected camera are ready.
Unavailable metadata, stale geometry, and missing saved mesh paths fall back
to the ordinary-camera fade after two fresh painted frames. World readiness
gates still apply, and the selected shelf remains selected.

The illustrated room displays "Loading 3D…" below the mobile navigation,
including before hydration. Mobile entry and illustrated header controls use
the live controls' 60% idle opacity. Other agents' changes apply serif type to
document metadata, search, keycaps, Field Notes, and canvas labels.

## Artwork reconciliation

The dependency lock changed for `PillOrganizer.tsx`, `objects.tsx`, and
`trainingTubs.tsx`. A deterministic comparison with the locked HEAD bytes
confirmed that every difference in those files is a canvas font substitution
from Arial or Helvetica to Georgia. Geometry, authored poses, cameras, and
registration identities are unchanged.

Live texture lettering changes. The approved 2D drawings retain their captured
lettering. The source-review receipt records this difference explicitly; it
does not claim identical textures or a fresh capture. Packaging updates the
dependency fingerprints while preserving approved SVGs and raster details.

## Field Notes

No discovery was added. Loading and typography changes have no meaningful
qualifying action under quality-bar test 2.

## Validation

The release checks pass after artwork reconciliation: route type generation,
TypeScript, strict lint, 4,505 unit tests, 39 artwork tests, search index
freshness, and the meadow contract. The unit suite skips 21 tests. All 26
generated output changes contain only source fingerprints. No browser
automation was used.

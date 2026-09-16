# Books and Coordination release

This release includes all pending work in the shared main branch: reread links
that replace navigation history, book cover motion and shadows, bookshelf
controls and text, card rounding, tag tooltips, and early author-property sync.
It also includes the Coordination globe's charge, burst fragments, and revised
shockwave responses for shelf props and the golf ball.

## Artwork source review

Four watched source files differ from the existing artwork dependency receipt.
Their recorded hashes match the parent commit, so the reviewed diff covers all
four changes since that receipt.

- `Grabbable.tsx` chooses launch velocity when a shockwave reaches a prop and
  adds a roll response. Its resting transforms and rendered geometry stay fixed.
- `GolfBallProp.tsx` opts into the roll response. The ball's mesh, resting
  position, and material stay fixed.
- `physics.ts` applies a launch through the center of mass, raises its speed
  limit, and supplies spin for balls. These paths run after a physical impulse.
- `sceneImpulse.ts` adds the launch-velocity calculation. It changes motion
  after a shockwave, with no change to resting geometry or materials.

The dependency receipt and generated metadata reflect this source review.
Approved artwork, detail images, capture inputs, and cameras retain their
existing values. This review does not claim a fresh capture.

## Field Notes

The existing Ripple Effect discovery follows the globe's completed charge and
shockwave release. The catalog describes the two-second charge. Book navigation
and hover polish add no separate discovery under quality-bar test 2, which
requires a meaningful qualifying action beyond operating a control.

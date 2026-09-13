# Complete the local room changes

This release includes every tracked local edit present in both working
checkouts when Chappy requested all remaining changes. The original checkout
had 14 modified files and the illustrated-room checkout had 16. Five files
contained identical blur-control changes; both checkouts also edited different
parts of `CONTEXT.md`. The combined change covers 24 unique source files.

## Included behavior

- Boot and live wordmarks share position and typography. The name crossfades
  in place, and light-mode navigation and title colors follow the artwork's
  dissolve duration.
- The loading notice stays mounted outside the retired illustration so its
  exit finishes over the live scene. Its timers stop when the exit starts.
- Camera-side grass connects to the main lawn through both side gaps using
  the same 3,200 tufts. Quality tiers retain coverage across the region.
- Free roam disables blur by default and exposes a live checkbox to restore
  it. Leaving free roam restores normal depth-of-field and tilt-shift behavior.
- Carried props use a vertical plane fixed at pickup. Wheel and pinch can
  pull them closer and return them to pickup depth. Collision sliding respects
  that plane, and held light props can push heavier neighbors with bounded
  speed. Released props retain their authored mass and gravity.
- Weightlifting sync runs daily at 09:00 UTC.
- The Book Notes skill marks newly created fill-in note skeletons as having
  notes. This changes creation guidance; it does not write existing book data.

The release preserves all changes already shipped in PR 64. Local source
snapshots record the two starting commits and every file checksum in
`/tmp/illustrated-completion-snapshots/inventory.json`.

The source checkouts record their complete local edits as `b4267485` and
`840a18de`. Both are clean after those checkpoints. This release applies their
combined changes to the production branch without replacing newer work.

## Artwork review

Four watched dependencies changed. `Grabbable` and `heldDepth` affect active
carrying. `physics` changes held collisions. Their changes preserve authored
rest poses, mass, and shelf geometry. `meadowField` changes background grass,
which the shelf-only captures exclude. The source-review receipt records
these differences and updates packaging fingerprints. Approved SVG and image
bytes remain unchanged.

Field Notes quality-bar test 2 excludes these corrections and diagnostics.
They add no deliberate visitor discovery. Existing discoveries retain their
semantic success conditions.

## Verification

Node 24 `pnpm verify` passes route types, TypeScript, strict ESLint, 4,285
application tests, 39 Node artwork tests, search freshness, and 382,342
meadow assertions. The application suite retains 21 existing skipped tests.
`pnpm check:room-artwork` passes 24 variants and 528 owner comparisons.
Formatting and `git diff --check` pass. No approved SVG or image bytes change.

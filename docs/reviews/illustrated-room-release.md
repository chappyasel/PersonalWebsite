# Illustrated room release

The approved illustrated room replaces the old flat homepage. It opens with
an empty shelf, assembles its objects, reveals the navigation and reading
panel, and hands off automatically to the ready 3D room. The same illustrated
presentation remains usable when WebGL is unavailable. The release includes
the approved plant foliage wind, sharper shelf artwork, corrected wide-screen
About framing and foot joints, and restored About golf balls and dumbbell.

## Integration with production

The release starts at illustrated-room commit `c2520d46` and incorporates main
through `5c79e27e`, including the approved insect landing worker, personality
sharing, canonical Musings articles, and lifting charts.

- Preserve the current Musings split: `/musings` is the article index;
  `/#musings` opens its illustrated room shelf. Article routes and RSS remain
  intact. Update the older canvas-free navigation assertion to this contract.
- Preserve all native diagnostics checkboxes, including the new landing worker.
- Keep both the Medium import command and artwork generation/check commands.
- Keep both branches' ignore rules for local captures and private source data.
- Repair Golf's initial import graph by reading the existing dependency-free
  ball radius from `golfBallGeometry`. No geometry or layout value changes.
- Run the image-quality suites with Node's test runner inside `pnpm verify`.
  Vitest excludes those files instead of reporting that they contain no suites.
  Allow the single complete artwork packaging test 30 seconds to decode and
  compare all 24 variants on shared CI machines.

## Artwork source review

The main merge changes four watched dependencies. `interactionRegistry`,
`links`, and `objects` change Musings destinations and internal/external
navigation. `scenePerformance` enables the already approved landing worker.
A fifth dependency, `golfLayout`, changes only its radius import. These changes
leave shelf geometry, poses, materials, and capture cameras intact. Reviewed
receipts record those differences. Packaging updates source fingerprints;
the approved SVG and image bytes remain unchanged.

The existing homepage OG freshness advisory remains separate from the code
gate. This release does not intentionally alter its rail-free capture camera.

Local work still in progress on entrance chrome, rendering diagnostics, and
meadow changes is outside this release. The development checkout remains
untouched. Verification and shipping use `/private/tmp/illustrated-room-release`.

Field Notes: the illustrated presentation and rendering corrections do not
add a deliberate visitor discovery, so quality-bar test 2 excludes them.

## Release verification

Node 24 with the frozen lockfile passes `pnpm verify`: Next route types,
TypeScript, strict ESLint, 4,272 Vitest tests, 39 Node artwork tests, search
index freshness, and the meadow boundary checks. The meadow check covers
948 settled/swing poses and 936 fast-fling poses with 251,302 assertions and
no failures. The application suite has 21 existing skipped tests.

`pnpm check:room-artwork` passes all 24 variants and 528 owner comparisons.
`pnpm check:about-boot` confirms the About drawing is current. The production
build will run through the Vercel preview before merging this release.

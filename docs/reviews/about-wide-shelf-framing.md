# About shelf framing and wood geometry

About now uses the same desktop rail/dock camera truck as the other shelves.
Its old scroll shift also interpolated the camera toward Books, which pushed
About under the navigation and changed its depth. Every About entry now rests
at semantic stop zero, including initial load, navigation, and return travel.
The parsing-time boot camera mirrors the same composition.

The About SVG now includes both plank end caps and only paints the cap that
faces the eye. Uprights and feet render their actual projected box faces.
The old bounding rectangles exaggerated support widths and lost the angle
between the top and bottom corners. Visible faces receive restrained shading.
The empty first-paint shelf updates the same points and visibility attributes
before hydration.

## Verification

- 159 tests passed across 10 files covering world layout, boot projection,
  stage serialization, first-paint wood, artwork framing, and depth of field.
- The new regression failed before the fix at 2048×844, 2560×1080, and
  3440×1440. About's projected left edge was at 4.8, -33.5, and 9.0 px,
  respectively, against a 214 px nav-clearance boundary.
- Tests cover both exposed cap directions and angled support faces.
- Node 24 typecheck and targeted ESLint passed.
- Headless 2048×844 and 3440×1440 checks passed for 2D rendering, automatic
  3D entry, and travel to Projects and back. The live shelf's left edge was
  419.2 and 871.6 px, respectively, with the nav ending at 178.5 px.
  Initial and returned horizontal origins differed by 0.067 and 0.063 px
  after pointer easing settled. No page errors occurred.
- Headless captures and measurements are local at `/tmp/wide-shelf-check/`.
- `pnpm check:about-boot` passed. `pnpm check:room-artwork` passed all 24
  variants and 528 owner comparisons.

## Artwork source review

The only changed capture dependency is `scene/worldLayout.ts`. Its diff changes
About's interactive desktop framing and removes the special scroll shift.
Unit geometry, poses, camera constants, and the rail-free capture composition
are unchanged. The dependency receipt records that review and the package's
metadata carries the new fingerprint. All generated SVG and image bytes remain
unchanged. About's original silhouette camera is explicit so changing live
viewport framing cannot silently retrace existing objects.

The compact mobile spacing and other shelves' framing are unchanged. On narrow
desktop windows where a full shelf cannot fit between the chrome, the existing
policy still favors clearance from the opaque content panel.

Other sessions' entrance, chrome, rendering-effect, and meadow edits remain
outside this commit. No OG recapture or deployment was performed.

Field Notes: excluded by quality-bar test 2. Correcting the layout does not add
a visitor discovery or a new authored action.

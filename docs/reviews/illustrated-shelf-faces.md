# Solid shelf faces

The frozen shelf drawing sorted faces by their average camera depth. A long
plank and its narrow end cap overlap in depth, so that order painted the cap's
inner wall over the plank top. The lower shelf looked hollow at its near end.

Packaging now paints both solid plank tops after the fittings. Every existing
polygon, color, stroke, camera and viewBox remains unchanged. This fixes all
six generated shelves in light/dark and desktop/phone variants. About already
paints solid top and front planes separately and does not use those end caps.
Book shading remains outside this change.

Verification:

- All 24 raster regressions pass. The tops have no interior wall shading,
  the silhouette stays fixed, and every non-shelf owner's markup is identical.
- Both planks' projected corners match the saved scene cameras within 0.05
  raster pixels across all 24 variants.
- The 41 artifact packaging and About perspective tests pass.
- Artifact verification passes all 24 variants and 528 owner comparisons.
- Repackaging from frozen inputs reproduces the same bytes.

The original source fingerprint and capture contracts remain unchanged. This
is a paint-order correction, not a new scene capture. No browser session or
runtime animation change was needed. Field Notes quality-bar test 2 excludes
this automatic visual correction.

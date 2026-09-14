# Shelf selection release

This release includes all pending changes from the shared main checkout at
Chappy's request. It combines selection and tooltip fixes, photo hover and
preview animation repairs, Systems document links, About copy and icon
presentation, and homepage structured data.

## Artwork source review

The 13 changed artwork dependencies preserve shelf mesh geometry and authored
rest transforms in the six captured shelves.

- `AuthoredProps`, `aboutRoleIcons`, `interactionRegistry`, `links`, `objects`,
  `TrustEssay`, and `UnitBlog` change label copy, action metadata, and navigation.
- `Grabbable` changes selection, press feedback, and hover picking. The new
  raycast-only group has no geometry. Its visual animation group retains the
  identity transform at rest.
- `reactionEngagement`, `ProjectArtifacts`, and `UnitTraining` change motion
  during hover or selection, with no change to the captured resting pose.
- `primitives` forwards per-spine destinations. `UnitSystems` assigns those
  destinations and changes the live document spines to subdued cloth colors.
  The row packing and dimensions are unchanged. The existing illustrated
  Systems snapshot retains its previous spine colors; this review does not
  claim matching material colors or a new capture.

About uses its separate illustration. Its role-icon artwork now fills the
existing silhouette, and the offline About silhouette check passes.

The source-review script records these differences and regenerates packaging
fingerprints. Approved SVGs, raster details, and capture inputs remain intact.
The existing homepage social-preview image also remains intact; its stale
source metadata is advisory under the repository's release workflow.

These changes clarify existing actions and repair presentation. They add no
Field Note under quality-bar test 2, which requires a meaningful discovery
rather than an interface step.

## Validation

The full code gate passed route generation, TypeScript, strict lint, 4,447
application tests, 39 Node artwork tests, search freshness, and 382,342 meadow
assertions. Its one failing application test was the stale artwork packaging
check. After the source review, all 33 tests in that suite pass, bringing the
application total to 4,448 passing tests with 21 existing skips. The separate
artwork check passes all 24 variants and 528 owner-mask comparisons. No browser
automation was used.

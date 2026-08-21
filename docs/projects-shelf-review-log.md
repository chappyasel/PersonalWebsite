# Projects shelf review log

This file records choices and compromises made while implementing
[`projects-shelf-spec.md`](./projects-shelf-spec.md).

## Work log

- [x] Located the 1024 px Weightlifting icon in the active Weightlifting app
      repository at
      `/Users/chappyasel/Desktop/Repos/WeightliftingApp/BenchTracker/BenchTracker/Supporting Files/Assets/Assets.xcassets/App Icons/AppIcon.appiconset/AppIcon-1024.png`.
- [x] Located the 1024 px Homework icon in the archived Homework app
      repository at
      `/Users/chappyasel/Desktop/Repos/0 Archive/Homework_iOS_OLD/Homework Assets/App Icon/Homework1024.png`.
- [x] Confirmed the existing Apple/WWDC photo is
      `projects-wwdc.webp`.
- [x] Imported the supplied Facebook photo from
      `/Users/chappyasel/Desktop/IMG_1221.JPG`. During final grading the source
      was no longer on the Desktop and was found at
      `/Users/chappyasel/.Trash/IMG_1221.JPG`; the prepared repository master
      remains a 1365 × 1024 WebP.
- [x] Confirmed Project photographs have no external destination to preserve.
- [x] Agreed that all six dice are separate movable objects.
- [x] Agreed that disturbed dice persist while visible and reset through the
      scene's existing off-screen behavior.
- [x] Copied and prepared the three source assets as WebP masters with 256 px
      and 512 px runtime variants.
- [x] Implemented the upper shelf objects and lower photo swap.
- [x] Added focused tests. Six test files currently pass with 24 tests.
- [x] Ran TypeScript, full lint, Prettier, `git diff --check`, and all 1,260
      unit tests.
- [x] Move Musings' compact plant to the right of the Apple/WWDC photo and
      re-justify the Projects row.
- [x] Put About's top-shelf succulent treatment in the vacated Musings spot.
- [x] Re-anchor the three Projects insect perches from the removed frame row
      onto the Weightlifting icon, top die, and Homework icon.
- [x] Increase the icon billet depth so the rounded-box bevel has a positive
      extrusion depth, and cover that invariant with a focused test.
- [x] Replace the top-row proxy widths with the rendered lamp, GLB, and framed
      photo envelopes, then derive all six centers from equal spacing.
- [x] Keep the Projects notebook and move only its insect perch to the upper
      Apple/WWDC frame's rotated top edge.
- [x] Move the notebook backward to the lower plank's depth center so its front
      edge no longer hangs over the shelf.
- [x] Re-run the focused and full checks for the expanded scope.
- [x] Record Claude Code's grade and resolve its findings.
- [x] Rebuild the Books shelf's filler volumes as low-poly books with separate
      boards, spines, and recessed page blocks.
- [x] Give packed books height-derived depth and separate the featured and
      packed ranks without worsening lower-shelf support.
- [x] Update featured-book insect perches and focused tests to use the same row
      depth constants as the renderer.
- [x] Trace the desk-lamp overlay artifact to the shade glow shell's
      `depthTest={false}`, not to the spotlight or its shadow settings.
- [x] Remove the ineffective 512 px practical-light shadow-map experiment and
      its diagnostics control.
- [x] Replace the approximate shade shell with an additive copy of the exact
      GLB shade surface, clipped against the opaque scene depth.
- [x] Restore the original amber, bulb-weighted shade ramp on that exact
      surface after the first grayscale implementation made the shade look
      gray under post-processing.
- [x] Turn the About lamp head a sliver toward the camera so its glowing mouth
      remains visible instead of collapsing to a rim.
- [x] Open the About lamp mouth one further step and turn the TJ and Apple
      metal faces modestly toward its spill.
- [x] Enlarge the four lower About awards by 20%, move the lamp left and the
      reading fan right, and re-space the row inside the plank.

## Judgement calls

- The Project Icons retain full-color faces instead of becoming monochrome
  metal. Their bodies and edge treatment supply the physical metal finish.
- Every die will own the Liar's Dice destination. A visitor should not have to
  remember which die is the link after scattering the stack.
- The existing lamp rig is reused. A second lighting implementation would add
  shader and light cost without improving the result.
- The lamp uses the worktree's articulated-head contract. Its shade, bulb,
  spotlight, spill, and moth cone rotate together toward the midpoint of the
  two Project Icons.
- "The same succulents" is treated as reuse of About's existing single
  `succulent-pot.glb` treatment: model, scale, recolor mode, and restrained
  sway. Musings keeps its own interaction key and shelf position.
- The Projects row is re-justified from measured visible envelopes. Each
  neighboring pair and both plank edges receive the same nominal gap.
- Desk-frame width now shares the same dependency-free border constant as the
  renderer, so layout tests cannot silently omit the frame around an image.
- "Give the featured books a little more space" is treated as front-to-back
  clearance. The supplied side view shows the featured covers colliding
  visually with the packed rank; the horizontal layout already enforces a
  measured gap between neighboring featured covers.
- On the top plank, the packed rank moves to −0.04 and the featured rank to
  0.15. On the shallower lower plank, the pair moves back to −0.22 and −0.02.
  This preserves the same visible rank separation while keeping the complete
  featured books and their risers behind the plank's 0.22 front edge.
- Packed-book depth is proportional to height, with small deterministic
  variation and a soft ceiling below 0.34 scene units. This keeps short books
  from reading as blocks without flattening tall books to one shared depth.
- The low-detail featured-cover path keeps the full book shell and omits only
  the jacket image. Distance no longer turns a book back into a cuboid.
- Spotlight shadows cannot repair a material that explicitly ignores the
  depth buffer. The shadow-map experiment added cost without touching the
  failing pixels, so it was removed rather than retained as a quality option.
- The shade glow uses `EqualDepth` on the lamp's exact shade triangles. The
  opaque shade must already own the pixel before the additive pass can draw;
  any nearer shelf or prop therefore blocks it without a shadow map, stencil,
  or additional render pass.
- The warm ramp is a shared 4 × 128 data texture mapped along the measured
  mouth-to-vent axis. Texture coordinates preserve the bulb peak across the
  long faces of the low-poly shade, where endpoint vertex colors could only
  produce a flat, weak interpolation.
- The About lamp's task target moves 0.176 scene units toward the camera while
  retaining the AIC–Coordination midpoint in x. At the wide authored camera,
  the mouth presents roughly a 22% ellipse and the target remains inside the
  lower plank footprint.
- TJ and Apple yaw −0.28 and −0.34 radians respectively. Both remain legible
  from the camera while turning farther toward the lamp at the left; Apple
  takes the stronger angle because it sits farther from the source.
- AIC, Coordination, TJ, and Apple each scale by exactly 1.2 from their prior
  authored size. Their internal visible gaps tighten from 0.07 to 0.05; the
  lamp moves 0.04 left and the reading fan 0.05 right, leaving the complete row
  inside the lower plank rather than allowing the larger objects to overlap.

## Shortcuts and known issues

- The desk lamp's two zero-radius point-light fills can produce subpixel HDR
  specular highlights on its faceted arm and nearby shelf edges. Dark-profile
  bloom enlarges those highlights into the reported shimmering dots. This is
  separate from the shade-depth fix: the exact-surface glow touches neither
  the arm nor the shelf. The issue is diagnosed but not changed yet.
- The scene's first carry may use its authored fallback if the optional physics
  chunk has not finished loading. In that narrow case, moving a supporting die
  does not wake its neighbors. Hover prewarms the solver, and later carries use
  six independent rigid bodies.
- Project instructions rule out browser-based inspection for this task. Source
  geometry, asset inspection, layout calculations, and automated tests replace
  an in-browser visual pass.
- An intermediate full run had five `BootScreen.test.tsx` failures while
  concurrent About work omitted `collective-frame`. At the final local
  verification snapshot, all 171 test files and all 1,260 tests passed.
- During Claude's regrade, concurrent About edits added two new failures in
  `aboutCoordinationLayout.test.ts` and `UnitAbout.interactions.test.ts`.
  Claude verified both were written during its run and do not exercise the
  Projects or Musings shelf work.
- Claude Code's first grade was B. It found the invalid rounded-box extrusion,
  stale frame perches, proxy top-row envelopes, and one unformatted test. All
  four findings were corrected before the final grading pass.
- Claude Code's final grade was PASS, A-, with no remaining blockers.
- The Books follow-up adds three shared boxes per packed volume compared with
  the previous single mesh. All four parts reuse one module-level geometry;
  materials remain per-volume so the existing palette variation survives.
- No browser visual check was run. Repository instructions prohibit browser
  automation unless explicitly requested, so this pass uses source geometry,
  transform tests, TypeScript, and lint.
- The edited bookshelf files pass lint. The repository-wide lint command still
  reports nine errors in concurrent changes to `Grabbable.tsx` and
  `swayMotion.test.ts`; neither file is part of this follow-up, so they were
  recorded rather than modified.
- The final full test run reached 1,305 tests. The 19 focused Books tests pass;
  two unrelated source-contract tests in
  `coordinationGlobe.presentation.test.ts` fail against concurrent globe work.
- The first systematic light-cone fix was a false lead: enabling 512 px shadow
  maps on the desk and floor spotlights did not change the reported artifact.
  All code, settings, and diagnostics UI for that experiment were removed.
- The depth-clipped replacement keeps the same single overlay draw per desk
  lamp as the old shell and shares one 512-byte ramp texture. It adds no shadow
  maps, render targets, post-processing pass, or per-frame geometry work.
- Repository instructions still prohibit an automated browser pass. The
  supplied screenshots established both the depth failure and the grayscale
  regression; focused geometry/material contracts, lint, and TypeScript cover
  the implementation.
- The latest lamp-angle pass has 41 focused tests and targeted lint green. A
  repository-wide type check is currently blocked by concurrent test-fixture
  drift in `qualityAxes.test.ts` (`efficient` versus `balanced`) and
  `qualityPersistence.test.ts` (stale `validation` property); none imports the
  About composition or authored props changed here.

## Ambiguities

- "Twice as big" is interpreted as roughly twice the 0.15-unit height of
  About's Apple mark, not twice its area or volume.
- The requested left-to-right order governs the authored wide composition.
  The scene currently uses the same objects in its narrow composition, with
  camera framing rather than a second Project-specific layout.
- "Small plant from the Musings shelf" is interpreted as the lower-shelf
  `potted-plant.glb`, the only plant in that unit.

## Next review

- A/B the desk lamp with its real lights off and then with bloom skipped. The
  first should remove the bright cores; the second should leave small steady
  reflections without the enlarged shimmer. Prefer softening the lamp's local
  spill over lowering global bloom, which would flatten every practical.
- Inspect whether the lamp's specular response remains readable in both themes.
- Check whether pulling a lower die wakes and topples the dice above it once
  the optional physics module is warm.
- Check icon and die touch targets against the narrow camera framing.
- Decide whether to move the enlarged lower Facebook frame or trophy after a
  visual review; their x projections overlap, but their depth envelopes do not.
- Inspect the Books shelf from its normal camera and the supplied oblique angle
  to confirm the cream page recess remains visible without looking striped.
- Recheck the desk lamp from the reported shelf-obstruction angle: the shade
  should remain amber while every nearer opaque object clips it cleanly.

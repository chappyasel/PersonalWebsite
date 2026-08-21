# Projects shelf rebuild

## Goal

Replace the upper Projects shelf's screenshot cards with physical objects that
represent the projects at a glance. Reuse the scene's existing material,
lighting, interaction, and reset rules.

## Acceptance checklist

- [x] Remove the three framed project cards from the upper shelf.
- [x] Arrange the upper shelf from left to right as lamp, Weightlifting icon,
      dice pyramid, Homework icon, Apple/WWDC photo, and the compact plant
      moved from Musings.
- [x] Justify that six-object row with consistent gaps and balanced outer
      margins, while keeping every measured footprint on the plank.
- [x] Build each Project Icon from its original app artwork on a thick,
      rounded, beveled body.
- [x] Keep the original icon colors. Add polished metal edges, clearcoat, and
      the same hover and click shimmer used by About's desk metals.
- [x] Make each icon roughly twice the height of About's 15 cm Apple mark.
- [x] Keep the Weightlifting icon linked to its App Store page.
- [x] Keep the Homework icon movable and unlinked.
- [x] Build the Liar's Dice object from six separate movable dice in a 3-2-1
      pyramid. Clicking any die opens `/liarsdice`.
- [x] Let the pyramid collapse and remain disturbed while Projects is visible.
      Existing off-screen reset behavior restores the authored arrangement.
- [x] Reuse the interactive desk lamp and aim it across the Project Icons.
- [x] Move the Apple/WWDC photo to the upper shelf.
- [x] Replace the compact plant's former position on the Musings lower shelf
      with the same succulent model, treatment, and scale used on About's
      upper shelf.
- [x] Put `IMG_1221.JPG`, the Facebook photo, in the former lower-shelf
      Apple/WWDC frame position without stretching or cropping it incorrectly.
- [x] Preserve the coding-couch photo and the other lower-shelf objects.
- [x] Keep the lower-shelf notebook, but remove it from the insect perch
      catalog.
- [x] Replace the notebook's former perch with one on the rotated top edge of
      the upper Apple/WWDC portrait frame.
- [x] Keep all new Identity Props available in the narrow presentation.
- [x] Add focused tests for structure, destinations, independent dice, and
      the photo swap.
- [x] Pass formatting, linting, TypeScript, and focused tests.
- [x] Re-run formatting, linting, TypeScript, focused tests, and the full test
      suite after the plant swap.

## Constraints

- Do not use browser automation for this task.
- Do not alter the production quality policy.
- Do not add a separate lighting or post-processing path. Use the existing
  `EggLamp`, `LampGlow`, and `useMetalShimmer` behavior.
- Do not edit project metadata or the flat Projects section.
- Do not overwrite unrelated worktree changes.

## Bookshelf follow-up

- [x] Keep the restored Projects notebook in place.
- [x] Replace solid filler-book cuboids with low-poly books made from colored
      cover boards, a colored spine, and a recessed cream page block.
- [x] Apply that construction to upright spines, leaning books, horizontal
      stacks, featured-book risers, and the untextured featured-cover LOD.
- [x] Derive packed-book depth from height and clamp it to the shelf's usable
      depth range.
- [x] Separate the featured ranks from the packed rows without pushing the
      featured books beyond the shallower lower plank.
- [x] Move featured-book insect perches with their rendered row depths.
- [x] Add focused tests for proportions, physical construction, featured-rank
      clearance, and perch alignment.

## About shelf follow-up

- [x] Keep the desk-lamp shade glow behind normal scene depth without adding
      shadow maps or another render pass.
- [x] Preserve the warm bulb-weighted glow on the exact shade surface.
- [x] Turn the About lamp far enough toward the camera to expose a restrained
      mouth ellipse while keeping its task target on the lower plank.
- [x] Rotate the TJ and Apple metal faces modestly toward the lamp.
- [x] Enlarge AIC, Coordination, TJ, and Apple by exactly 20% from their prior
      authored sizes.
- [x] Move the lamp left and reading fan right, keep every lower object within
      the plank, and retain positive visible gaps through the award row.
- [x] Keep the generated About entrance silhouette synchronized with the live
      composition.

## Grading notes

Claude Code should grade the implementation against every unchecked item above,
then inspect interaction wiring, texture disposal, material ownership, support
geometry, and likely shelf collisions. A passing test that only searches source
text does not excuse a broken component contract.

# Site feedback — 2026-08-15

Implementation checklist for the August 15 visual, interaction, and physics pass.

## Meadow and scene

- [x] Cap and smooth wind so grass never spasms during gusts.
- [x] Render the satellite as a visible streak instead of a dot.
- [x] Improve the DC skyline silhouettes, monuments, and buildings.
- [x] Add larger, draggable golf tees beside the golf balls.
- [x] Add a waving royal-purple Reginald target flag, face it toward the camera, slim its pole, remove the finial, and anchor the cloth at the pole top.
- [x] Let the distant golf flag inherit dark-mode atmosphere so it does not look self-lit.
- [x] Make golf balls click-to-launch, keep them visible, and let them bounce and roll over the visible meadow canopy.
- [x] Increase near-field grass coverage and eliminate obvious bald spots.
- [x] Repair basketball collision, bounce, spin, and launch behavior.
- [x] Give every loose object in Musings drag/gravity behavior.
- [x] Fill the floor-clock dial aperture so no gap appears above the face.

## About, books, and links

- [x] Rotate the first-shelf books farther so thick books do not intersect.
- [x] Give the three first-shelf books separate hover lanes so hover motion cannot make them intersect.
- [x] Restore hover tooltips for About and featured Book Notes shelf books.
- [x] Make About-shelf books about 10% larger without widening the stack.
- [x] Make featured books smaller and more consistent in size.
- [x] Link the AI Collective mark to <https://aicollective.com/>.
- [x] Link the TJ mark to <https://tjhsst.fcps.edu/>.
- [x] Keep the main portrait on LinkedIn and link only the small top-right About headshot to Instagram.
- [x] Use “Open LinkedIn” and “Open Instagram” for photo affordances.
- [x] Link only the Weightlifting board photos to Boys With Gains; keep the two lower-shelf photos inert.
- [x] Remove Facebook from About Me and order Instagram/GitHub before Medium.
- [x] Scale Book Notes books and subjects on hover instead of translating them upward.
- [x] Show only five recently read books when Book Notes is single-column.

## Panels, charts, and desktop polish

- [x] Remove the desktop panel's bottom overflow gradient.
- [x] Move the Show/Hide details tooltip closer to its control.
- [x] Make Portal Labels fade out, reopen reliably, and crossfade in place instead of jumping between objects.
- [x] Use the shared tooltip treatment for weightlifting and books bar charts.
- [x] Use the shared tooltip treatment for workout history.
- [x] Make shared and year-bar tooltips tap-accessible above the mobile sheet.
- [x] Make desktop cards substantially more translucent without introducing a double overlay.

## Mobile navigation and sheet

- [x] Keep the mobile section rail beneath an expanded sheet; use horizontal sheet swipes to change sections while expanded.
- [x] Remove the unexpected blue focus ring on the mobile sheet.
- [x] Support left/right swipes on the sheet to move between sections.
- [x] Make the sheet and collapsed pill mutually exclusive in every transition.
- [x] Make the mobile nav underline fluid and polish desktop/mobile selection motion.
- [x] Remove mobile light-mode shadows from the title, nav items, and theme toggle.

## Verification

- [x] Run targeted and full automated checks.
- [x] Verify representative desktop and mobile flows in-browser.
- [x] Run a Claude Code review of the completed diff and resolve valid findings.

# The Stacks v8 — refinement and completeness spec

## Problem Statement

The new Stacks homepage has the right experiential direction, but it still reads as a work in progress. The personal photography is not the intended set, several units feel sparse or unbalanced, shelf and prop proportions are inconsistent, some skyline and lighting details break the illusion, physics coverage is inconsistent, and the placard/navigation experience lacks the same degree of finish on desktop and mobile. The large number of interdependent visual requests also makes it easy for an individual detail to be changed without being verified in every theme, viewport, and interaction state.

## Solution

Refine the Stacks as one coherent room rather than a collection of isolated fixes. Replace the personal imagery with the owner-curated photo library, rebalance every unit around narrower and taller-spaced shelves, improve prop density and physical consistency, rebuild the light sky and landmark details, and give every interactive object a common physical/hover vocabulary. Unify placard, card, navigation, and mobile-sheet styling and motion, then adversarially audit every requested item across desktop and mobile, light and dark themes, all seven units, and the secret seated view.

## User Stories

1. As a visitor, I want the homepage to use Chappy's current curated photography, so that the room feels personal and intentional.
2. As a visitor, I want the main Chappy portrait retained in About, so that the opening unit still has a clear human anchor.
3. As a visitor, I want non-book photos replaced by selections from the curated photo library, so that stale placeholder imagery is removed.
4. As a visitor, I want displayed photos to preserve their source aspect ratios, so that people and scenes are not awkwardly cropped.
5. As a visitor, I want the many weightlifting photos presented compactly, so that I can see the breadth without the shelf becoming a wall of frames.
6. As a desktop visitor, I want the left rail to sit directly over the world without a background glow, so that it feels integrated rather than pasted on.
7. As a mobile visitor, I want the top rail to sit directly over the world without a background glow, so that the scene remains visually clean.
8. As a visitor, I want the large potted plant to sit between About and Book Notes, so that it bridges the opening units and balances the composition.
9. As a visitor, I want the chair moved farther left and angled toward me, so that it looks inviting and is easier to recognize.
10. As a visitor, I want enough leftward camera travel to see and select the full chair, so that the secret seated interaction is discoverable.
11. As a light-theme visitor, I want a soft, inviting, realistic morning sky, so that the scene no longer appears muddy brown and faint blue.
12. As a visitor entering the seated view, I want the camera path to clear the chair at a natural height, so that the transition does not clip through upholstery.
13. As a visitor triggering Golden Gate fireworks, I want the particles to fall more slowly after exploding, so that the effect feels graceful rather than rushed.
14. As a visitor looking at the About globe, I want it to rotate a little faster by default, so that the prop feels alive.
15. As a visitor, I want the AI Collective logo beside the Apple logo, so that the About unit represents both major parts of Chappy's work.
16. As a visitor, I want a dumbbell and additional plants in About, so that the opening shelf reflects Chappy's interests and feels balanced.
17. As a visitor, I want the eight featured books spread organically across the Book Notes shelves, so that they feel curated rather than gridded.
18. As a visitor hovering an interactive content card, I want it to expand slightly in place, so that the feedback is clear without moving the layout upward.
19. As a visitor hovering an interactive content card, I want a slower spring-like response, so that the interface feels tactile and deliberate.
20. As a visitor hovering an interactive content card, I want its shadow to remain fully visible, so that container clipping does not expose the implementation.
21. As a visitor hovering Book Notes content, I want the section title to remain stationary, so that only the actual interactive surface responds.
22. As a visitor viewing Weightlifting, I want summary stats above the graphic, so that its content hierarchy matches Book Notes.
23. As a visitor viewing Weightlifting, I want the redundant subtitle and Recent Activity label removed, so that the section stays concise.
24. As a visitor, I want the barbell stored behind or below the shelves, so that it reads as equipment rather than shelf decor.
25. As a visitor, I want shelf-level dumbbells or similar compact equipment to replace the barbell's compositional role, so that the unit remains full.
26. As a visitor, I want substantially more vertical clearance between shelf levels, so that props have room to breathe.
27. As a visitor, I want each shelf narrowed by roughly twenty percent, so that units are more elegant and fit smaller viewports better.
28. As a visitor, I want the shelf geometry to remain coherent across all seven units, so that the room reads as one designed system.
29. As a visitor, I want the golf club and ball at believable relative scales, so that the scene does not look toy-like by accident.
30. As a visitor, I want exactly three drink cans grouped together in black/red, white/orange, and black/green, so that they represent Chappy's favorite drinks instead of appearing randomly.
31. As a visitor, I want more books and foliage filling unused shelf space, so that no unit feels unfinished.
32. As a light-theme visitor, I want the sun correctly occluded by buildings, so that it cannot be seen through solid architecture.
33. As a light-theme visitor, I want the lighting to progress subtly across the traverse, so that scrolling feels like morning advancing.
34. As a visitor, I want peripheral lens blur to begin farther from the center, so that the scene remains cinematic without feeling claustrophobic.
35. As a visitor, I want Salesforce Tower's crown to taper and terminate like the real building, so that the landmark is recognizable.
36. As a visitor, I want the Salesforce crown free of false red dots and protrusions, so that it does not resemble a generic antenna tower.
37. As a light-theme visitor, I want the Salesforce crown to remain visible against the sky, so that the skyline keeps its defining silhouette.
38. As a visitor, I want every reasonable loose prop to share the same grab-and-settle behavior, so that physics is a consistent world rule.
39. As a visitor, I want draggable props to collide with shelves and neighboring props regardless of group nesting, so that objects do not clip through one another.
40. As a visitor, I want the floor lamp's pool of light to have natural falloff and shape, so that it does not resemble a flat artificial ellipse.
41. As a visitor, I want the microphone to lie naturally on the lower Talks shelf, so that it reads as a real object at rest.
42. As a visitor, I want the Consensus badge prop removed, so that unexplained conference clutter does not distract from the shelf.
43. As a visitor, I want the Chappy Asel name placard prop removed, so that redundant branding does not take up shelf space.
44. As a visitor, I want removed props replaced with foliage where useful, so that the resulting composition remains full.
45. As a visitor, I want the classic Mac model and face restored, so that the prop is charming rather than broken.
46. As a visitor, I want the Mac screen to read as an emissive digital display with subtle interaction, so that it feels distinct from a printed picture.
47. As a visitor, I want project imagery aligned to its top edge, so that important content near the top of each screenshot remains visible.
48. As a visitor, I want the Musings lower light moved above the shelf and made brighter, so that it illuminates rather than glows from an implausible location.
49. As a visitor, I want the clock tower to show one coherent face and one set of hands, so that duplicate geometry is removed.
50. As a visitor, I want the clock face to move with the tower during its rocking interaction, so that the prop remains physically connected.
51. As a visitor, I want uniform internal padding across every placard card, so that Featured Talks and other sections share the same rhythm.
52. As a desktop visitor, I want placard titles roughly twenty-five percent larger, so that the section hierarchy matches the scale of the room.
53. As a light-theme visitor, I want desktop placard titles closer to black, so that they are crisp and legible.
54. As a visitor, I want section icons sized in proportion to their titles, so that headings feel like one unit.
55. As a seated visitor viewing Washington, I want cherry trees in the secret view, so that the scene feels specific to DC.
56. As a seated light-theme visitor, I want the DC palette to be natural and inviting, so that the secret view does not inherit muddy colors.
57. As a visitor on a medium-width device, I want the mobile layout to activate sooner, so that a desktop placard does not cover most of the 3D scene.
58. As a mobile visitor, I want bold outlined navigation icons rather than filled icons, so that the rail remains consistent with the desktop visual language.
59. As a mobile visitor, I want a single sliding active pill in the top rail, so that selection state moves smoothly instead of creating seven independent marks.
60. As a mobile visitor, I want tapping the collapsed sheet's slide bar to expand it, so that the affordance behaves as expected.
61. As a mobile visitor, I want expanded sheet top padding to match its side padding, so that content is evenly framed.
62. As a mobile visitor, I want the active section icon beside the sheet title, so that the sheet preserves the unit identity.
63. As a mobile visitor, I want the sheet background to be substantially more translucent, so that the room remains visible beneath it.
64. As a visitor, I want cards and sheets to use more generous corner radii, so that the design feels softer and more cohesive.
65. As a mobile visitor, I want a subtler sheet shadow, so that the sheet does not look detached from the world.
66. As a mobile visitor moving between units, I want the sheet/chip transition to animate fluidly in every detent, so that state changes never pop.
67. As a mobile visitor, I want the collapsed chip itself to animate between units, so that even the smallest state has intentional motion.
68. As an iPhone Safari visitor, I want the page background and viewport handling to eliminate white browser-edge bars, so that the immersive scene reaches every safe viewport edge.
69. As a motion-sensitive visitor, I want all new motion to respect reduced-motion preferences, so that polish does not reduce accessibility.
70. As a keyboard visitor, I want every DOM control to retain clear focus feedback and semantic activation, so that the refinements do not regress access.
71. As a returning visitor on a fast display, I want animations to have consistent duration independent of refresh rate, so that 120 Hz hardware does not make them twice as fast.
72. As the site owner, I want every requested change tied to a specific verification result, so that no item is declared complete from code comments or assumption.

### Iteration feedback — 11:44pm review

- [x] 73. Extend grab-and-settle behavior beyond the current eleven props to nearly every reasonable loose shelf object, with an explicit inventory and exclusions.
- [x] 74. Show the covers of the three most recent currently-reading books on About's three-book stack.
- [x] 75. Rebuild the AI Collective mark from `/Users/chappyasel/Desktop/Logo Orange.svg` as a metallic object that visually matches the Apple logo.
- [x] 76. Rotate the About chair roughly twenty degrees farther counter-clockwise toward the globe.
- [x] 77. Give the light-theme seated DC view an inviting blue sky rather than the current muddy neutral palette.
- [x] 78. Restore the beautiful desk-lamp presence from the earlier composition and bring the other practical lamps up to the same or greater luminous intensity.
- [x] 79. Rebuild the three grouped cans as recognizable low-poly Diet Dr Pepper, Sunkist Zero Sugar, and Mountain Dew Zero Sugar designs using verified product references.
- [x] 80. Increase the golf-ball scale again, add two or three more balls, move the cans to the lower shelf, and compose the golf photos nearer the golf club.
- [x] 81. Restore the protein-supplement prop to Weightlifting.
- [x] 82. Narrow the Salesforce Tower crown's top radius by another twenty percent while preserving its corrected taper and flat crown.
- [x] 83. Reduce the mobile sheet's outer corner radius from the current oversized treatment.
- [x] 84. Remove the redundant second Book Notes title inside the mobile sheet.
- [x] 85. Make expanded mobile sheets content-fit up to a viewport-safe maximum height instead of always filling all available height.
- [x] 86. Increase the mobile sheet's scene translucency again while preserving readable contrast.
- [x] 87. Increase every physical scene photo by roughly twenty percent and recompose surrounding props to prevent overlap.
- [x] 88. Replace the current desktop/mobile section swap with a subtle directional transition that follows left/right traverse direction.
- [x] 89. Slightly reduce mobile sheet card radii as well as the sheet's outer radius.
- [x] 90. Recolor the chair slate blue and add restrained fabric-like surface variation.
- [x] 91. Move the seated-view cherry blossoms to the far side of the water rather than framing the camera up close.
- [x] 92. Make seated camera movement slower and smoother while allowing a slightly larger total look range.
- [x] 93. Add clearly visible top padding to the expanded mobile sheet, matching the horizontal inset.
- [x] 94. Correct the blue-tinted inter-unit plant so its leaves remain naturally green in light mode.
- [x] 95. Restore the visible alarm clock in Systems and ensure no replacement photo occludes it.
- [x] 96. Correct mobile sheet typography so the section title is visually dominant over all inner subtitles.

### Iteration feedback — 6:16am review

- [x] 97. Reduce the About left-travel lead so the far-left stop shows roughly two thirds of the chair rather than the entire chair with excess empty travel.
- [x] 98. Return the Apple and metallic AI Collective mark to the lamp's illuminated area and preserve their paired composition.
- [x] 99. Put About's larger plant on the top shelf, its smaller plant on the lower shelf, and lay the lower books horizontally with a restrained hover rotation.
- [x] 100. Give the in-world book-detail view an intentional enter/exit transition and show a breadcrumb when the visitor is not already on the dedicated Books site.
- [x] 101. Recompose the Book Notes face-out cover and neighboring photograph so their hover transforms never intersect.
- [x] 102. Give the metallic AI Collective mark a shimmer response consistent with the Apple.
- [x] 103. Extend drag-and-settle to nearly every physically loose plant, image, and book that does not already own a conflicting interaction, and update the explicit inventory/exclusions.
- [x] 104. Remove all cherry trees from the seated DC vista and its preload/attribution path if no longer used elsewhere.
- [x] 105. Add a subtle black-and-white silhouette of Chappy's childhood home on the left side of the seated DC vista, preserving its yellow front door and using `/Users/chappyasel/Desktop/640x480.jpg` as the visual reference. Reopened after the 3:30pm visual pass: siding/roof values, bluish windows, and the front-door silhouette still do not match the supplied house.
- [x] 106. Add restrained atmospheric clouds and distant birds to the seated DC vista in a way that preserves legibility and dark-theme mood.
- [x] 107. Re-seat the Weightlifting golf club so no part intersects the shelf.
- [x] 108. Make the golf club draggable while preserving a distinct tap interaction that performs a controlled full swing and launches a nearby ball a convincingly long distance; disable the authored swing if it cannot remain within a believable arc. The broken swing was disabled and ordinary drag retained.
- [x] 109. Restyle the protein tub as a subtle low-poly Nutricost Chocolate PB Whey Protein Isolate container using `/Users/chappyasel/Desktop/71scKsdOPQL._AC_SL1500_.jpg` as reference.
- [x] 110. Correct the floating Weightlifting plant so its pot visibly rests on its shelf.
- [x] 111. Move the floor lamp into the inter-unit space between Featured Talks and Projects and make its practical light approximately twice as intense as the desk lamp without clipping or bleaching the scene.
- [x] 112. Move the loaded barbell into the ground/inter-unit space approximately halfway between Weightlifting and Featured Talks.
- [x] 113. Eliminate the brief full-sheet flash or bottom-control jump when About or Featured Talks transitions into or out of the fully collapsed mobile pill. Reopened after the 3:30pm mobile pass.
- [x] 114. Add a Book Notes secret-room easter egg: pulling one designated shelf book forward triggers a coherent whole-scene transformation with an equally intentional return path.
- [x] 115. Seat the Talks microphone on a shelf with believable contact and no camera-side floating; move it to the top shelf if that produces the clearest grounded composition. Reopened after the 3:30pm pass.
- [x] 116. Move the trailing Projects plant into Featured Talks and recompose Talks frames/props around it without crowding.
- [x] 117. Make the classic Mac's eyes blink occasionally and follow the pointer subtly, with reduced-motion and non-creepy accessibility fallbacks.
- [x] 118. Separate the Projects trophy/photo arrangement and remove trophy navigation. The later physics review rejected autonomous rotation; the cup is static and retains only a restrained hover reflection plus ordinary drag.
- [x] 119. Restore a moderate amount of edge tilt-shift blur, halfway between the original stronger treatment and the current reduced treatment.
- [x] 120. Redesign the grandfather-clock dial so it is visually distinct from the red twin-bell alarm clock while retaining its single coherent moving face.
- [x] 121. Replace the passive loading wait with a quiet, intentional loading choreography or first-load reveal that feels designed, offers visual activity, and respects reduced motion.
- [x] 122. Add a dark-theme moon with a scroll-driven rise-and-set arc analogous to the light-theme sun, correctly occluded by skyline silhouettes and supported by a restrained halo.
- [x] 123. Aim the About shelf lamp toward the metallic Apple/AIC pair, strengthen the Apple shimmer, and reuse that same material-aware shimmer on the AIC mark.
- [x] 124. Add the requested Poly Pizza succulents (`y3zjCa6BeR`) to an appropriate shelf with source attribution, grounded placement, and theme-aware visual QA.
- [x] 125. Add the requested Poly Pizza floor prop (`uKRTMhxfiu`) between two shelving bays with source attribution, correct scale/contact, and collision-safe placement.
- [x] 126. Move the About family portrait currently on the lower shelf to the top shelf and rebalance both shelf compositions without introducing overlap or a dead lower-shelf gap.

### Iteration feedback — mobile and secret-view regression pass

- [x] 127. Move the seated DC childhood-home silhouette farther left, reduce it to roughly two thirds of its current size, shrink its garage/right-side volume, and preserve a clear gap from the Washington Monument in every seated look position.
- [x] 128. Make every visible Book Notes book independently tactile: all eight data-backed covers open only their exact details modal on tap and carry without opening on drag; decorative spines and stacks respond without fake destinations; and hover motion never intersects a neighbor. The unstable secret-room path and shimmer were explicitly disabled under Story 137.
- [x] 129. Increase the mobile scene's visual scale modestly and raise its effective render sharpness so the world feels closer and resolves at native-looking quality without regressing sheet coverage, performance, desktop framing, or reduced-data behavior.
- [x] 130. Replace the shallow popping Book Notes secret insert with a staged, reversible whole-bay transformation into a deep, richly dressed hidden library whose geometry, materials, lighting, camera response, and enter/exit choreography match the detail and polish of the main scene, with no full-bay color veil, rectangle, or masking card visible at rest or during the reveal.

### Iteration feedback — dark lighting and About shelf composition

- [x] 131. Make the inter-unit floor lamp read as an almost blinding practical source, with a much brighter aperture and believable bloom/spill that remains controlled in light mode and does not clip nearby photography or UI.
- [x] 132. Raise the foreground illumination of shelves and props across dark mode so objects remain readable without washing out the navy sky, moon, skyline silhouettes, or warm practical-light contrast.
- [x] 133. Superseded by the final simplification: remove the two older flat books from About's lower shelf and display only the current book, upright on its complete bottom edge with its cover square to the camera. Its rest and carried rotations are identical because it is already fully viewer-facing. Restore the Apple and AI Collective metal mark to their original authored positions; the small plant remains grounded with positive clearance before the lower photo.

### Iteration feedback — 3:30pm workstream wrap-up

- [x] 134. Move the About couch farther from the camera and reduce far-left traverse travel by a compensating amount without sacrificing the intended chair/couch discoverability.
- [x] 135. Recompose the former secret green spine as a normal tactile decorative volume on the right side of the row in place of a placeholder, with no featured-cover overlap.
- [x] 136. Eliminate the `Maximum call stack size exceeded` failure when selecting a book, with an automated regression that exercises the real navigation/scroll synchronization path.
- [x] 137. Remove the Book Notes pan hitch and intermittent black-frame/black-box flash; the secret feature is cleanly disabled without breaking ordinary books, navigation, or scrolling.
- [x] 138. Replace the smooth Weightlifting golf spheres with convincing low-poly dimpled golf balls using shared recessed geometry plus a spherical staggered dimple height field.
- [x] 139. Rotate the loaded barbell forty-five degrees on the opposite diagonal requested in the 4:20pm visual correction, move it slightly behind the Weightlifting shelf, and remove the two stray rear weights.
- [x] 140. Remove navigation/click destinations from the three branded drink cans while preserving their tactile grab behavior.
- [x] 141. Rotate and reseat the Featured Talks potted plant so no leaf, stem, or pot clips through the shelf.
- [x] 142. Restore pointer activation for the inter-unit floor lamp so visitors can switch its practical light on and off without conflicting with traverse gestures.
- [x] 143. Re-ground the Musings tripod light so all three feet make believable shelf contact and the fixture no longer appears to float.
- [x] 144. Make the Systems alarm clock and loose books draggable wherever they do not own a conflicting mechanism, and document any intentional exclusion with live interaction evidence.
- [x] 145. Tighten the mobile sheet's title band, increase the title/icon scale, vertically align the close control, and retain a 44px dismiss target without reintroducing detent reflow.
- [x] 146. Replace the explicit loader with a branded entrance: “Chappy Asel,” three shelf rows whose books arrive on a constant load-independent cadence, a composition fade-in, and the approved two-panel room reveal; keep warm and reduced-motion paths deterministic.
- [x] 147. Keep the Projects trophy physically static with no navigation while retaining drag and a restrained hover reflection.
- [x] 148. Turn every carried photo frame and visual book cover square to the live camera, then restore its exact authored shelf pose on release.
- [x] 149. Make a featured-cover tap exclusively open its book-note modal; consume the synthetic scene click so no packed spine or unit destination behind it also navigates.
- [x] 150. Preserve the current About book's real sampled jacket-border color, and extend the same server-side perimeter sampling to every featured Book Notes volume. Use each per-id sample for that book's physical boards, back, bevel, and riser instead of the shared light/dark `palette.cover`; retain the deterministic id color only as the time-boxed remote-fetch fallback. Near-black chromatic samples keep their hue but are desaturated before being lifted to scene-readable lightness, so *Life 3.0* reads charcoal-plum rather than neon purple. Verified against all eight live featured samples in desktop light and dark renders.
- [x] 151. Replace the continuously translated mobile rail underline with seven stationary crossfaded underlines, eliminating iOS Safari's intermittent stale-raster pill trail while preserving one unambiguous active section.
- [x] 152. Restore content-sized expanded mobile sheets so short sections do not leave a viewport of dead white space; correct peek-height changes in a pre-paint layout effect so section swaps cannot move the visible grabber/title band.
- [x] 153. Remove the mobile sheet's bottom content fade completely, normalize shared card padding to 24px on every side, and disable native image/link dragging inside the sheet without changing tap navigation.
- [x] 154. Make Book Notes stats use Weightlifting's exact responsive sizing and visibility contract: two stats below 640px and all four from `sm` upward, including wide mobile sheets.
- [x] 155. Let a world gesture that begins outside an expanded mobile sheet collapse the sheet and continue through to scene travel instead of silently swallowing the interaction.
- [x] 156. Extend the sheet's glass surface below its measured content box so resisted upward overdrag never exposes the page background beneath it.
- [x] 157. Make the inter-unit loaded barbell a 60kg floor-physics Grabbable, preserving its Weightlifting tap destination while drag-versus-tap arbitration prevents accidental navigation during a carry.
- [x] 158. Darken and blur the Featured Talks play control, remove the misleading lower white thumbnail fade, and retain a clear white play glyph in both themes.
- [x] 159. Make Stacks-opened book modals reproduce the standalone detail breadcrumb exactly (`Chappy's Book Notes / [books] N books`) and route both breadcrumb and expand actions to the absolute Books host, including local subdomain development.
- [x] 160. Replace the shared content-swapping mobile sheet with seven resident per-section sheets that independently translate and fade like the desktop panels. Each card owns its title, body, measurement, and scroll state, eliminating the observer-frame height race rather than compensating for it after paint.
- [x] 161. Treat every press outside an expanded mobile sheet as a collapse request; section-rail presses additionally complete their requested navigation in the same interaction instead of being discarded while the panel is open.
- [x] 162. Remove repeated shared-section titles from resident mobile cards, including before async bodies settle, and make the complete title band toggle expanded/peek detents while preserving the X as a separate dismiss-to-pill control.
- [x] 163. Keep the mobile sheet detent global while its seven resident cards retain independent content and measurement: dismissing one section keeps subsequent sections in the pill pose, exactly one active-section pill owns every frame, and an expanded sheet optically and interactively covers the mobile rail. Book Notes renders one title, and Featured Talks uses a circular, centred play control.
- [x] 164. Restore Retina scene clarity without forcing native 3x rendering: render at up to 2x DPR and keep the sustained-performance fallback at 1.5x instead of degrading to visibly pixelated 1x. On a 390×844 3x probe this raises the steady framebuffer from 390×844 to 585×1266 and the initial framebuffer to 780×1688.
- [x] 165. Preserve antialiasing through every performance rung: create the base WebGL context with hardware MSAA even on desktop, so unmounting the SMAA post-processing composer cannot leave shelf silhouettes with no edge smoothing. Verified WebGL reports `antialias: true`, one sample buffer, and 4 samples.
- [x] 166. Reframe phone portrait about twenty percent tighter (38.5° → 32.5° FOV) and remove the double-counted peek-sheet offset. The neutral composition now applies the measured midpoint—one quarter of peek height upward—so shelf contents read larger while the feet sit close to, not behind or far above, the sheet.
- [x] 167. Make atmospheric dust subtly legible in light mode with the same particle field: each mote gets a saturated amber core plus a broader translucent gold halo, reading as sparse fireflies against the pale sky while dark mode retains its brighter cream bokeh.

#### Iteration verification additions

- Capture the exact far-left About stop at 1200 and 1440 pixels and measure the visible chair fraction before accepting story 97.
- Test every newly draggable class with real pointer input, including tap-versus-drag arbitration for the golf club and secret book.
- Record the before/trigger/mid/settled/return phases of the Book Notes secret-room animation and verify navigation, scrolling, physics, and reduced motion recover afterward.
- Trace the mobile sheet opacity, height, display state, and chip identity frame-by-frame for About and Featured Talks collapsing to the pill; any full-sheet reappearance is a failure.
- Validate the childhood-home silhouette, clouds, birds, and removed cherry trees in both seated themes and at multiple aspect ratios.
- Capture lamp exposure in light and dark themes and verify the brighter inter-unit lamp does not blow out photos, cards, or the skyline.
- Compare About's single current book in desktop light, desktop dark, and 390-pixel mobile captures: verify its complete bottom edge is grounded, its cover is square to the camera, and its sampled physical-board color follows the jacket border. Exercise tap and drag, proving a carry opens no detail before exact settle.
- Run a cold-load frame trace with cached and uncached assets, plus reduced motion, so loading polish is evaluated as choreography rather than a still screenshot.
- Capture the dark sky at the left, middle, and right traverse stops to verify the moon's arc, skyline occlusion, and lack of a visible compositing seam.
- Capture the About lamp/metal vignette in both themes and compare Apple/AIC shimmer timing, direction, and highlight intensity.
- Capture both new Poly Pizza props in light and dark; verify exact attribution, grounded contact, no shelf/inter-unit overlap, and drag behavior where the loose-object contract applies.
- Compare the revised childhood-home silhouette against `/Users/chappyasel/Desktop/640x480.jpg` over multiple visual rounds, and measure its screen-space gap from the Washington Monument at seated left, center, and right look limits.
- Exercise the Book Notes shelf/secret entrance with real mouse and touch input from both the obvious shelf affordance and designated pull book; record rejected short pulls, opening, settled, return, unit departure, and reduced-motion recovery.
- Capture the mobile world before and after at representative 390, 430, and 768 pixel viewports; record camera framing, renderer backing-store dimensions, effective DPR, and performance/data-saving caps.
- Record the secret library at closed, hint, early reveal, midpoint, fully open, early close, and fully restored phases; verify no geometry appears at full opacity before its authored phase, no camera/light jump occurs, no blue/fog-colored full-bay veil or rectangular mask appears in either theme, and the detailed room remains within its lazy-load/performance budget.
- Capture the floor lamp and every dark unit before/after with exposure histograms; require a deliberately hot aperture and stronger local spill while retaining detail in nearby props, photographs, sky, and placards.
- Capture About's lower shelf in both themes at rest, each book hovered, and each book held; verify support contact, increasing authored angle, independent transforms, cover-facing carry pose, exact-detail tap, and plant/photo clearance.

## Implementation Decisions

- Keep the existing seven-unit traverse and its current unit order.
- Use the repository's existing world-debug bridge as the single highest test seam. Browser-visible behavior is authoritative; node transforms and world bounds provide evidence for placement, collision, scale, and camera claims.
- Treat the owner-provided website photo directory as the source set. Copy selected images into neutral public filenames and generate web-sized derivatives without modifying the originals.
- Preserve source aspect ratio in scene frames. Crop only when an explicitly constrained surface requires it, and prefer `contain` for personal photos.
- Keep Book Notes image-free except for live book covers supplied by book data.
- Use a compact, layered photo-board or contact-strip treatment for dense Weightlifting photography rather than expanding the entire unit footprint.
- Standardize the shelf footprint through shared geometry constants rather than retuning seven unrelated call sites. Increase inter-level clearance and reduce shelf width as one system-level change.
- Recompose units after the shelf-system change; do not assume existing prop coordinates remain valid.
- Keep the main About portrait, move the large plant to the About/Books boundary, and use smaller foliage to fill secondary negative space.
- Keep the seated secret view and existing travel metaphor, but raise the approach path and re-measure it against the final chair bounds.
- Extend the existing shared interaction/physics wrappers to all appropriate loose props. Static architecture, shelf planks, wired lighting, and background scenery remain non-grabbable.
- Resolve collision worlds from world-space support planes and nested descendants so physics behavior does not depend on JSX grouping depth.
- Replace translational card hover with in-place scale, shadow, and spring timing. Mirror the exact transform on split backdrop plates so glass and content stay registered.
- Standardize placard card padding, title scale/color, icon scale, corner radius, and shadow tokens across sections.
- Move the Weightlifting stats ahead of the heatmap and remove redundant labels without changing the data source.
- Activate the mobile navigation/sheet layout at a wider breakpoint selected through visual measurement, and use that same breakpoint for camera, placard, and rail behavior.
- Render one moving active indicator for both desktop and mobile rails. Mobile retains outlined Phosphor icons and hides text labels in the compact state.
- Preserve the existing three mobile sheet detents, but make the grabber tappable, keep the sheet glass highly translucent, and animate sheet/chip content changes with one coherent transition system.
- Apply safe-area and dynamic-viewport handling at the document/world root so Safari's top and bottom chrome never reveal a white page background.
- Rebuild the light sky palette and traverse progression together. The sun must participate in skyline occlusion instead of being composited over buildings.
- Match Salesforce Tower's real crown silhouette: a gently tapered, flat-topped illuminated glass volume without antenna-like protrusions or decorative red beacons.
- Slow the post-burst gravity curve for Golden Gate fireworks without changing their behind-bridge depth relationship.
- Replace the floor-lamp light decal with a layered physically plausible solution using a real spot/area contribution plus a soft, broken-up ground contact glow.
- Remove the Consensus badge and name placard from placement, preload lists, manifests, and built output if they are model-backed assets.
- Restore the Macintosh from a licensed low-poly asset and treat the screen as a separate emissive surface capable of subtle pointer response.
- Keep third-party model additions license-compatible, record attribution, compress textures, and stay within the established lazy-loaded model budget unless the owner approves an increase.
- Make damped new and touched animations delta-time based so their feel does not change on 120 Hz displays.

## Testing Decisions

- Good tests assert externally observable behavior: rendered appearance, reachable controls, camera movement, world-space placement, collision outcomes, content hierarchy, safe-area coverage, and motion timing. They do not treat a source comment or component name as proof.
- The primary seam is the complete homepage in World mode, driven with the existing browser harness and world-debug API. Use real CDP mouse/touch/pointer input for React Three Fiber clicks and mobile drags; synthetic DOM clicks are insufficient evidence.
- Capture all seven units at representative desktop, medium, and mobile widths in light and dark themes. Compare the composition and check for clipping, sparse shelves, collisions, incorrect image crops, and placard inconsistency.
- Exercise every reachable hover/click/grab target, including chair entry, clock face/tower, Macintosh, globe, lamps, photo links, bridge fireworks, and Salesforce crown.
- Measure shelf bounds and level separation from world-space nodes, then test representative prop support and collision at multiple nesting depths.
- Measure the seated camera path over time and confirm it remains above/outside the final chair bounds throughout the approach.
- Probe mobile sheet tap, pointer drag, touch drag, detent snapping, native drag suppression, section transitions, and browser back at widths on both sides of the new breakpoint.
- Inspect screenshots at iPhone portrait dimensions with dynamic viewport and safe-area emulation, then verify the root background under simulated browser chrome.
- Run the existing model payload, sky, floater, cover, physics, sheet, and traverse harnesses where applicable. Extend the floater analysis so featured covers are not left unresolved.
- Run TypeScript, ESLint, targeted tests, and route/model budget checks. Do not use a production build as the first-line test for this branch; first verify the development bundle mounts because template-literal CSS errors can bypass TypeScript.
- Respect reduced-motion in an explicit browser pass and verify keyboard focus for all DOM controls.

## Out of Scope

- Changing the book database schema, Notion mapping, Featured selection rules, or read-only Postgres mirror.
- Reordering, renaming, adding, or removing the seven core units.
- Replacing the World/Flat dual-mode architecture.
- Inventing social-post destinations for photos whose source URLs are not present in repository metadata.
- Rebuilding unrelated books, weightlifting, talks, projects, or musings destination pages.
- Shipping unlicensed models or depending on a runtime third-party model CDN.

## Further Notes

- Personal photos must use neutral repository filenames and no embedded credentials or private metadata.
- Existing uncommitted work in `CLAUDE.md`, `AGENTS.md`, `.agents/`, the books cron route, and YouTube sync is owned by another session and must remain untouched.
- The current branch was green at the v7 handoff, but several scene-spacing and photo items were never adversarially exercised; all v8 work starts from fresh measurements.
- The owner has explicitly requested exhaustive tracking and multi-agent audits. Completion requires a final requirement-by-requirement report with evidence or an honest named blocker.

## Interaction Inventory

The final World-mode registry contains 79 draggable instances:

- About (11): Apple, AI Collective mark, dumbbell, four loose photos, three plants, and one current-reading book.
- Book Notes (8): all featured face-out covers. A tap opens the exact book note; a carry does not.
- Weightlifting (20): basketball, three branded cans, loaded barbell, two dumbbells, four golf balls, golf club, kettlebell, two photos, three books, plant, and protein tub. The implausible tap swing/launch is disabled; the club remains draggable.
- Featured Talks (11): five photos, microphone, three books, and two plants.
- Projects (10): trophy, three project frames, two photos, three books, and the inter-unit Yucca.
- Musings (2): mug and headphones.
- Systems (17): six personal-photo frames, three pile books, six manual-row volumes, alarm clock, and sansevieria.

Intentional exclusions are shelves and legs; the seated chair/couch; fixed lamp rigs; the main portrait and mounted Training board/pins; the display-stand globe; the routine board, Macintosh, and other dedicated mechanisms; and packed background book rows/bookends outside the Systems manual row. These are structural, wired, mounted, or already own a more specific interaction, so wrapping them would steal or nest pointer behavior rather than make the world more consistent.

## Antagonistic Review Record

Three independent Claude Code Opus/high-effort reviewers audited spec coverage, live runtime/accessibility behavior, and engineering/performance. Their second-pass findings directly produced the featured-cover tap repair, floor-plane collision-world repair, golf-ball hull repair, first-visit placard deferral, route-unmount cleanup, phone wordmark contrast treatment, mobile heading-level correction, named scroll region, cached-geometry ownership fix, project top focus, exact dock-width skyline composition, and shared shelf-bound derivations. Post-fix browser and solver evidence is recorded in the final handoff rather than treating source comments as proof.

The August 11 wrap-up repeated the same three-angle review against the final working tree. Evidence-backed findings produced the removal of the always-running secret camera/placard subscriptions, a green ordinary-book interaction audit with secret shimmer disabled, shelf-level Systems book shadows, a truthful trophy grab cursor, retirement of entrance animations/compositor promotion after reveal, and restoration of the close button's 44px target. The reviewer-requested `+π/4` barbell reversal was intentionally rejected because the owner's latest screenshot explicitly requested the opposite of that already-seen orientation; the authored `-π/4` result is covered by the post-correction visual capture. Remaining dormant secret-room source is unmounted, and its standalone renderer is no longer imported on the pan path; deleting that source is tracked as cleanup debt rather than a release blocker.

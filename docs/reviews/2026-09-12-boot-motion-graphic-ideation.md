# Boot illustration motion study

I recommend a two-impression reveal. The shelf briefly appears as a single flat ink silhouette. One oblique edge then uncovers the approved artwork, so books become particular books and rectangles become photographs. Everything stays in its final illustrated position. The pleasure comes from recognizing the collection as its details arrive.

This suits the saved Books, Systems and About images. Their broad silhouettes read quickly; their covers, photographs and small labels reward the second look. The generated SVGs contain filled owner groups and raster details. This proposal uses that construction directly. It does not imply that somebody drew these objects with a pen.

## What the viewer sees

These timings describe a cold visit whose room becomes ready during the opening. They are targets for a motion study, not a new minimum loading duration.

1. At first paint, the background, name and complete shelf silhouette are present. The silhouette uses one muted ink color chosen separately for each theme. Preserve all holes and the gaps between objects. No blur, displaced outlines, registration marks or paper texture. The two planks make the drawing recognizable immediately.
2. Around 80 ms, the accepted artwork begins replacing the ink. An invisible, slightly tilted clipping edge travels downward across the shelf over roughly 400 ms. Its angle lets one corner of a cover arrive before the other. The artwork never moves inside this reveal. There is no visible line or glow at the edge, and the background remains untouched.
3. Around 480 ms, the last lower-shelf details arrive. The effect stops. Leave approximately 80 ms for the completed picture to register if the room is still preparing. The name remains steady throughout; animating individual letters would compete with the collection.
4. When the room is ready, the complete illustrated shelf begins the requested zoom and vertical travel into its live position. Aim for 500 to 600 ms. Remove the ink layer before this begins. The room takes over only at a verified matching pose, with at most a short opacity overlap. The broad graphic reveal should make this final spatial movement feel like a change of medium.

On Books, the second impression reveals actual jackets rather than a parade of individual spines. On Systems, the lower row of bottles and bags arrives as a connected composition. Its 40 owners do not require 40 animation cues. About keeps its original `BootScreenArtwork`, including the live reading covers. Apply the same whole-artwork mask around it. Its globe, large portrait and lower shelf provide enough variety without individual special effects. Small shelf plants participate normally. Freestanding scenery stays absent.

## Loading behavior

Fast readiness should interrupt the decorative reveal. If the room is ready after 100 ms, complete the matte sweep over the next 100 to 140 ms while beginning placement. Do not hold the room until 560 ms or add a reading pause. The existing code already favors readiness over a full reveal and waits for the placement glide; retain that policy.

For a slow load, finish the drawing once and leave it still. Keep the existing loading status visible and let it report real state. Repeating the impression would make the shelf look like a progress indicator. Do not add moving clocks or rotating globes to occupy the wait.

On a warm return, start with the finished drawing only if a boot overlay is needed. Skip the impression. If the route can show its ready room immediately, omit the overlay. Preserve the existing reduced-motion policy, which defaults to the flat document. A static illustrated handoff applies only to an explicit 3D opt-in or a separately approved future policy change.

## A worthwhile variant

Reveal the two shelf rows in opposite directions. The upper row uncovers left to right in about 300 ms; the lower row starts 100 ms later and uncovers right to left. Keep the monochrome first impression and a single timing curve per row. This makes the shelf's horizontal structure more prominent and gives Books a reading rhythm.

I prefer the whole-artwork version. Opposing rows can resemble a presentation transition, especially on About's larger portrait. The variant deserves a short comparison, not seven bespoke sequences.

## Asset needs and handoff limits

The main reveal needs a silhouette derived from the existing visible geometry and image alpha, plus one SVG clipping mask. Generate the ink shape ahead of time; avoid a runtime blur or color filter. Preserve transparent gaps and thin details such as Talks' hanging wires. The row variant additionally needs explicit row masks, since the single shelf owner spans both planks. Neither needs authored strokes, depth sorting or new illustrations.

Exact placement remains separate work. The prototype has not proven the proposed three-pixel match to the live scene. Translation and uniform scale cannot correct a camera or perspective mismatch across objects at different depths. Each shelf needs a compatible final capture pose and live camera, with correspondences checked at shelf corners and recognizable object corners across viewport sizes. Matching the shelf's outer box alone is insufficient.

The main risk is looking like a scanner. Keep the edge invisible, the pass brief and the original palette intact. Grain, ink splashes, sound effects or deliberate color misregistration would turn a restrained opening into a printmaking costume. Prototype this concept as described before adding any of them.

After comparing concepts, I favor the matching-pose dissolve into a live camera move. Keep this graphic reveal as a separate alternative. Stacking both would prolong fast loads and create too many distinct acts.

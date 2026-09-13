The shared generator now produces complete Weightlifting and Books loading
illustrations. The comparison is at
[room boot comparison](http://localhost:3330/admin/room-boot-comparison?unit=books&theme=light&view=desktop),
with Projects and the existing About drawing as references. It has light/dark,
desktop/phone and Replay controls. The default browser received the preview URL
through macOS `open`; the server received its SVG and image requests. Browser
extension control timed out, so visual verification used the actual comparison
page in isolated Chromium and saved full-page images.

This is enough evidence to keep the shared rendering approach. Books is the
stronger phone composition. Weightlifting fits its long floor barbell, but that
reduces the shelf to about 226 pixels wide versus about 335 for Books. Its dark
weights have weak contrast and lose plate detail. Small labels become texture.
Those are remaining visual tradeoffs for owner feedback, not approval to ship.

One capture implementation and one packaging implementation serve all three
units. The profiles select semantic owners and drawing treatments. Transforms
still come from the mounted scene. Weightlifting has 33 drawing owners. Books
has 13, including two packed rows, eight featured assemblies, two bookends and
the furniture. Each packed row contains 124 physical meshes, so it does not
require one artwork part per spine.

The generalization exposed concrete gaps in the Projects prototype:

| Change                       | Reason                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit ownership audit     | Unknown physical meshes now fail capture instead of disappearing silently.                                                                                            |
| Mounted parent ordering      | The pinboard initially painted over two photos and one card. Parent-before-descendant ordering restores all seven attachments without moving them.                    |
| Procedural group identities  | Books rows, the training board, Golf groups and contact-shadow pools needed names beyond interaction owners.                                                          |
| Recorded lighting exclusions | The Projects regression found two unnamed lamp glow meshes outside its physical lamp owner. The existing lighting wrapper now has an explicit identity and exclusion. |
| Weightlifting phone framing  | Its floor barbell clipped at the shared 0.52 projection factor. A profile value of 0.34 keeps it inside the opening frame. Books retains 0.52.                        |

Adjacent Golf scenery and floor tees are excluded from Weightlifting; its shelf
tees remain included. Under-shelf lighting, contact shadows and non-rendering
hit targets are recorded exclusions. The new units required no separate texture
renderer or copied object positions. Existing Projects treatments for the Mac,
lamp, Apple mark, trophy and circuit boards remain existing exceptions.

The Books data probe changed the incoming in-memory featured selection before
the existing live layout ran. Removing one cover moved 11 surviving named
objects and changed physical coverage from 304 meshes to 300. Empty featured
selection retained both packed rows, both bookends and the shelf, with 259
physical meshes. Restoring the input restored 304 meshes and the named
unit-local transforms within 0.000001. No database or Notion writes occurred.

With one fixed camera, the changed fixture differed in 337,934 reference-image
channels. The restored reference differed in zero channels. This does not prove
packaged byte identity: baseline and restored artwork payloads differ by three
bytes. It proves that the live data path can recompose and restore the captured
scene.

| Artwork       | Light desktop | Dark desktop | Light phone | Dark phone |
| ------------- | ------------: | -----------: | ----------: | ---------: |
| Weightlifting |      65,570 B |     62,051 B |    20,038 B |   19,395 B |
| Books         |      47,740 B |     47,978 B |    22,635 B |   22,526 B |

These sizes include the gzipped selected SVG and its image files. They exclude
HTML, RSC, application JavaScript and the About comparison import. They are not
production transfer measurements.

All eight new-unit comparison cases passed at 1440 by 900 or 390 by 844. Checks
cover the requested unit/theme, decoded images, visible artwork, bounds,
overflow, zero canvases, page errors, Replay completion and reduced motion.
The independent reviewers and coordinator inspected the saved full previews.
Projects also passed a new light-desktop capture and preview through the shared
generator, retaining all 21 owners and 15 image details at 59,650 bytes. Its
other comparison cases remain the earlier reference artifacts. All 68 earlier
Projects files, the original plan and About's source match their saved hashes.
TypeScript, targeted ESLint, seven capture/profile tests, two painter-order
tests and the nine-case artifact audit passed. The root comparison also passed
its TypeScript, ESLint and formatting checks.

Development capture sometimes stalled before camera convergence or during
navigation. Failed attempts remain in the evidence. Disabling Chromium
background throttling preceded a successful retry, but does not establish the
cause. No readiness threshold was relaxed. A production generation job still
needs bounded retries, useful failure diagnostics and atomic artifact writes.

My next step would be one real Projects boot handoff, with measured registration
through the actual desktop and phone cameras. Keep the shared capture engine
and per-unit treatment profiles. Prove image readiness, view offsets, stage
travel and stale callbacks before expanding to the remaining shelves. This
opening-stage prototype does not establish a 3-pixel production match.

Books also needs an explicit freshness policy before shipping. I would derive
runtime book rows from shared pure layout data, using the same selection as the
live room. If Books stays baked, bind its artwork to the data snapshot and use
a neutral presentation when the snapshot is stale. A source-only hash cannot
detect a changed featured selection.

Workspace identities and preservation hashes are in
[room-boot-generalization-run.json](room-boot-generalization-run.json). The
builder's `docs/reviews/room-boot-evidence/` contains captures, fixture assertions,
full previews and runtime checks. Its `room-boot-generalization-RESULT.md` and
the reviewer tree's `room-boot-generalization-review.md` and
`room-boot-generalization-second-review.md` contain their handoffs.

No production boot integration, build, merge or deployment was performed. No
Field Note was added: this development preview has no qualifying visitor action
and fails achievement quality-bar test 2.

Owner feedback accepted the Projects, Weightlifting and Books appearance and
identified a broken About comparison. The preview's animation reset also
cleared About's placement transforms, piling its 14 shelf landmarks into the
center. Removing the placement selector from that reset restored the original
composition. A browser check reproduced all 14 lost transforms before the fix;
both themes at desktop and phone sizes then passed placement, visibility and
bounds checks. About's artwork source did not change.

The second prototype is ready for visual review at
[Projects boot preview](http://127.0.0.1:3322/admin/projects-boot-prototype?viewport=desktop).
It has desktop and phone views, light and dark themes, Replay, and a toggle to
the current About artwork. Two fresh sessions used the existing worktrees. The
builder owned the implementation; the reviewer independently inspected the
source and final images.

The complete Projects composition is a better design test than the earlier
six-object specimen. It contains 21 drawing parts, including the lamp, six dice,
app icons, three photographs, Apple mark, trophy, phone, boards, Mac, both plants
and furniture. Mounted scene transforms determine placement. Projected furniture
faces, traced shapes and image details share About's drawing treatment. The
review led to restoring a dropped lamp, muting the circuit board and giving the
trophy broader tonal regions.

The reviewer recommends this version for owner review with no remaining visual
blockers. I agree it is ready to judge as a complete loading illustration. Dark
phone foliage has low contrast, and faces and circuitry necessarily lose detail
at that size. This recommendation is not owner approval.

| Selected artwork | Gzipped SVG plus images |
| ---------------- | ----------------------: |
| Light desktop    |            59,768 bytes |
| Dark desktop     |            61,795 bytes |
| Light phone      |            30,922 bytes |
| Dark phone       |            31,343 bytes |

These are generated artwork sizes, not measured visitor boot transfers. The
development comparison includes all four SVGs and imports About for reference.
Production chunk selection and HTML/RSC costs remain unmeasured.

The builder's Chromium checks cover 1440 by 900 and 390 by 844 in both themes.
All four show 21 parts, visible artwork, no horizontal overflow and no page
errors. Replay completes; reduced motion starts no drawing animations.
TypeScript, targeted ESLint and five existing capture tests passed. I inspected
the actual desktop and phone images and independently checked the live pane's
theme controls, About reference, 21 dark-phone parts, all 15 referenced images
loading from the correct case, and zero canvases. The Superset pane started
Replay but its animation timeline stayed at zero, so the completion claim rests
on the builder's Chromium check. The live console showed an unused CSS preload
warning and no error in the inspected output.

My implementation proposal remains a mixed drawing pipeline. Keep transforms in
the live scene, let Three resolve textures and coverage, and author an explicit
treatment for each part. Project furniture faces separately. The complete
composition should be the visual gate before expanding to other units.

The next engineering gate is a real Projects boot handoff. This prototype uses
an expanded phone opening camera to keep the floor plant visible. It does not
prove a 3-pixel match to the production camera, responsive transfer from one
canonical drawing, stage travel, route selection or production loading timing.
Those checks must precede a six-shelf rollout. No production boot integration,
merge, build or deployment was performed.

Exact workspace and terminal identities are in
[projects-boot-design-run.json](projects-boot-design-run.json). The builder's
worktree contains `docs/reviews/projects-boot-design-RESULT.md`; the reviewer
worktree contains `docs/reviews/projects-boot-design-review.md`. Final PNGs and
the runtime matrix are in the builder's `docs/reviews/projects-boot-evidence/`.
Both sessions and the earlier prototypes remain available.

No Field Note was added. This development-only preview adds no qualifying
visitor action and fails achievement quality-bar test 2.

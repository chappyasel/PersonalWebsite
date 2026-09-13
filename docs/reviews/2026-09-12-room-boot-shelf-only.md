# Shelf-only boot drawings

The owner accepted the Projects, Weightlifting and Books drawings, then asked to restore About's missing covers, remove background props and finish the remaining shelves. This round extends the comparison to Systems, Musings and Talks.

## Composition

Keep the shelf, objects on its planks, and objects attached to it. Keep small shelf plants. Remove freestanding scenery.

- Projects excludes its floor yucca and retains its small shelf plant.
- Weightlifting excludes the floor barbell. Its shelf dumbbells, balls and tees remain.
- Systems excludes the grandfather clock and retains its shelf alarm clock and sansevieria.
- Talks excludes the floor lamp. All five photographs retain their authored mounts, including the suspended board's wires.
- Musings retains the lighthouse, sand tray and Vineyard souvenirs because they sit on the shelf. The lighthouse's beam is an effect, excluded separately from the physical model.
- Books has no additional physical exclusions.
- About's comparison hides its floor dumbbell and two floor golf balls. Its shelf plants remain.

The live 3D room keeps its scenery. These exclusions apply to the proposed opening drawings.

## About covers

The comparison rendered `BootScreenArtwork` without its reading props. That selected three placeholder IDs with no cover URLs. The preview now queries the existing book mirror and passes the homepage's selected books, cover URLs, thicknesses and sampled jacket colors.

`homepageReadingBooks.ts` contains the selection and mapping functions moved unchanged from `src/app/page.tsx`. Both pages use them. Abandoned books remain filtered before selection, and no database or Notion writes were made.

Browser checks confirmed three decoded 256-pixel covers in light and dark themes at desktop and phone sizes. All 14 shelf-object placement transforms remain intact, the three floor props are hidden, and there is no horizontal overflow. The original About artwork source remains unchanged.

## Prototype organization

The builder continues in `prototype/boot-render-masks`; the independent reviewer continues in `prototype/boot-geometry`. The coordinator records their paths and task status in `room-boot-shelf-run.json`.

New generated files live in the builder's `public/room-boot-shelf-prototype/{unit}/{case}`. Evidence lives in `docs/reviews/room-boot-shelf-evidence`. Previous output sets are preserved. The development comparison reads only the new set and offers all seven shelves, theme and viewport controls, and replay for generated drawings.

The preview remains development-only. This round does not implement production route selection or the transition into 3D. It does not establish the proposed 3-pixel registration gate.

Systems exposed a necessary distinction in the generator's readiness check. Its retained alarm clock moves every second, so its phone capture could not meet a 1.2-second pose-stability check. The Systems profile now declares that clock-hand rotation as continuous motion. Readiness ignores only the declared rotation in private matrices, while capture freezes and retains the actual live hand position. Runtime evidence confirms a changed hand angle alongside an unchanged readiness signature. Camera thresholds and the stability duration are unchanged.

No Field Notes discovery is added. This development-only preview provides no visitor action that passes quality-bar test 2, "The qualifying action has meaning beyond incrementing a counter."

## Verification

All 28 browser cases passed, seven shelves in light and dark at 1440 × 900 and 390 × 844. Checks cover image decoding, owner counts, drawing and control bounds, absence of page errors and canvas elements, replay, and reduced motion. About has three real covers and no visible floor props. Replay applies to the six generated units; About remains a static reference.

The independent reviewer inspected all 24 generated artwork images and the saved browser views. No required visual correction remains. Small labels become texture at phone size, and the dark weights remain low contrast, consistent with the accepted treatment.

| Unit          | Reveal owners | Light desktop bytes | Dark desktop bytes | Light phone bytes | Dark phone bytes |
| ------------- | ------------: | ------------------: | -----------------: | ----------------: | ---------------: |
| Projects      |            20 |              36,311 |             36,824 |            18,856 |           18,740 |
| Weightlifting |            32 |              60,782 |             58,262 |            28,420 |           27,466 |
| Books         |            13 |              47,745 |             47,989 |            22,635 |           22,528 |
| Systems       |            40 |              56,809 |             56,935 |            29,645 |           29,524 |
| Musings       |            17 |              34,146 |             34,242 |            17,030 |           17,140 |
| Talks         |            16 |              55,385 |             55,053 |            25,773 |           25,329 |

Bytes are gzipped SVG plus referenced image files, not initial page transfer. Ten existing cases were repackaged from saved owner masks, with source hashes and unchanged cameras recorded. The other 14 were captured from the mounted scene. Three reused Projects cases predate the exhaustive physical-mesh audit; their manifests declare that limit. Books' four repackaged images have zero differing decoded channels from the prior set.

Root and builder TypeScript and targeted lint checks passed. Nine capture/profile tests and two ordering tests passed. Asset verification passed all 24 cases using the repository's Node 24 runtime. An initial run used Node 25 and produced a different gzip byte count; its failure log is retained alongside the successful Node 24 run. All 308 previous output files, the original About source, and the owner's plan remain unchanged.

Browser results and images are in `room-boot-shelf-ui-evidence/`, with all 28 cases in `checks.json`. Shared-engine checks and asset provenance are in the builder's `room-boot-shelf-evidence/`. The completed comparison was opened through macOS in the regular browser at <http://localhost:3330/admin/room-boot-comparison?unit=systems&theme=light&view=desktop>.

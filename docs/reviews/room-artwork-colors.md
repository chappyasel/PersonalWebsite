# Match illustrated shelf colors to the finished room

The non-About artwork used unlit MeshBasicMaterial captures with tone mapping disabled. Books therefore entered as pale gray and muted green, then became darker and warmer when the live renderer appeared. This change calibrates the six generated shelves against the mounted room's finished EffectComposer output. About and the boot animation are unchanged.

All 24 variants use the same existing outlines, paint order, camera contracts, image dimensions and alpha. Flat fills take their colors from visible interiors of the finished scene. Opaque detail images use bounded, monotone RGB curves at their existing resolution. Corrected images are encoded as lossless WebP to avoid another round of texture quantization. Gradients retain their geometry and receive corrected stop colors.

The references include the actual room lights, environment, photograph mask, lens, tone mapping and grade. The headless capture waits for the live room, freezes it, restores all nine plant bindings, validates owner identity and rest transforms, and uses the saved full camera. It renders the mounted composer directly. A second pass labels live owners while retaining the original vertex shaders, including grass geometry. Color samples require agreement between that pass and the SVG's last-painted element, with a two-pixel interior margin.

Alternating eight-pixel tiles separate fitting and validation. Validation renders the actual corrected SVG, including its encoded detail images. It rejects individual changes that increase held-out error. This caught two trophy faces on the Projects phone variants, whose original colors were retained.

The complete translucent shaker detail images retain their original bytes. Their displayed RGB includes the background, so direct correction would blend that background twice. Unsampled tiny vector faces can inherit a measured correction for the same pigment on the same owner. The result remains an illustration; individual local shadows, bloom and depth blur are not painted into the images.

The comparison images show previous artwork, corrected artwork, then the finished room:

- [Books, light desktop](room-artwork-color-evidence/books-light-desktop.png)
- [Books, dark phone viewport](room-artwork-color-evidence/books-dark-phone.png)

The references use balanced quality and the shipped grade. Phone references use a portrait viewport with the contract's two-times pixel grid. They do not claim to reproduce every device's adaptive quality setting. The committed capture provenance includes the effect settings and settled quality plan. Renderer exposure is controlled by the locked StacksCanvas source; the capture tool now also records that value explicitly for subsequent captures.

The original 241-source geometry fingerprint is unchanged. A separate display receipt locks 31 lighting, rendering, dependency and generator files. It hashes the calibration and frozen reference inputs without needing a browser. `pnpm check:room-artwork`, and therefore `verify:artifacts`, now includes this check. Updating the receipt requires a source review or new capture; ordinary packaging is not a recapture.

Verification:

- 24 variants and 783,791 held-out pixels. Mean RGB error fell from 39.72 to 10.57 on the 0–255 channel scale. Books improved by 80–85% across its four variants.
- 379 corrected detail images retain exact dimensions and decoded alpha. Their visible RGB matches the pointwise correction exactly. All SVG geometry and paint order reconstruct the original source hash.
- The checker rejects the uncorrected baseline, with Books light desktop remaining at error 50.49 instead of the corrected 9.13.
- All 528 existing owner-mask comparisons retain the three-CSS-pixel alignment gate.
- Frozen repackaging remains byte-identical across 558 output/input files. The new calibration and reference hashes are checked separately.
- 167 focused illustration/generator tests, four color-transfer tests, typecheck, targeted ESLint and formatting passed.
- Seven headless entrance checks passed: Books at desktop and phone sizes, plus five cold automatic entries across the existing viewport cases.
- `pnpm exec next build` passed. The standard prebuild fetch requires a GCS credential in the shell; the local build reused the existing ignored Dad search index. The existing broad Dad content trace warnings remain.

The lossless color pass increases the combined six-shelf compressed artwork from roughly 960 to 2,418 KiB in light desktop and 709 to 1,738 KiB in light phone. All six illustrated stops currently mount, so these totals describe the row rather than only the selected shelf. The largest individual variant is 602 KiB. There is no added frame work in the live 3D renderer.

To reproduce the frozen artwork, run `node scripts/room-artwork-quality/repackage.mjs`, then `pnpm generate:room-artwork` and `pnpm check:room-artwork`. For fresh references, use the isolated headless capture scripts against a running app, starting from the unchanged quality output. Review the per-case comparisons and rejected fits before applying or freezing new calibration inputs.

Field Notes is excluded by quality-bar test 2. This is automatic presentation, with no meaningful qualifying visitor action.

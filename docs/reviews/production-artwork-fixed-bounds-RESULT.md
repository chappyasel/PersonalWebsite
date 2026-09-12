# Fixed expected shelf coordinates

All 96 bounds probes across 24 registration cases now carry top-level, read-only `capturedCoordinates`. The four mesh-local points are `[-1.32, 0.035, -0.425]`, `[1.32, 0.035, -0.425]`, `[-1.32, 0.035, 0.425]` and `[1.32, 0.035, 0.425]`. Point probes retain their existing independent `sample.coordinates`.

Root must project `probe.capturedCoordinates` for a bounds probe's expected pixel. It must sample the mounted bounding box separately for the actual pixel. Missing captured coordinates must fail registration rather than fall back to mounted geometry. The live same-type resize/registration test remains root-owned.

Each case includes `boundsProbeProvenance` with archive revision `e0becc7d4c4ff87595683ccf85191ee76ff04595`, source paths and SHA-256 hashes. At that revision, `SHELF_PLANKS` starts with the top plank, using width 2.64, thickness 0.07 and depth 0.85. `RegisteredShelfPlank` passes these dimensions to `RoundedBox` with radius 0.012 and smoothness 4. `RoundedBox` forwards them to the centered `roundedBoxGeometry` constructor.

Exact archived copies of `shelfGeometry.ts` and `roundedBoxGeometry.ts` are committed under the input directory's `captured-source/` folder. They are generator/test inputs, never client imports. Their hashes join the source dependency lock. The archived constructor's epsilon and Float32 storage produce actual x/y bounds about 0.000005 scene units beyond the nominal half-dimensions. The offline constructor test verifies a maximum difference below 0.000006; these nominal bounds points are not beveled surface vertices.

The focused tests verify all 96 input and generated points, provenance hashes and agreement with the archived constructor. A second test widens the same geometry type by 20% and confirms that the current bound moves more than 0.26 scene units while the captured point remains unchanged. Both tests and targeted lint pass. TypeScript passes with the isolated tree's explicit Next image declarations. The artifact check passes under Node 24.19.0 and decodes all 483 details.

All SVG, WebP and PNG files are unchanged. All 24 camera matrices, unit transforms, owner identities, Books data digests and pre-existing probe fields are unchanged. Only fixed coordinates, provenance and generated metadata fingerprints/sizes changed. Registration JSON totals 917,323 bytes. No browser session or capture was started; root retains the slot.

Normal generation reads the committed fixed coordinates. Any future metadata recovery/import must retain them; the focused test rejects their omission. No generator engine, recovery script, scene source, UI or original About artwork changed in this follow-up.

# Production illustration artwork

All six approved shelf illustrations now have self-contained light/dark desktop/phone SVGs under `public/images/stacks/boot/`. Only image href values changed: the original WebP/PNG bytes are embedded as data URLs. All 532 approved shelf files in the archive remain unchanged. Original About source is untouched. Implementation stays on `feat/illustrated-room-artwork`, based on `7483645`; the archive checkpoint is `e0becc7d4c4ff87595683ccf85191ee76ff04595`.

Import `RoomArtworkImage`, `getRoomArtwork`, `serializeRoomBooksArtworkIdentity` and types from `src/app/components/stacks/illustration/artwork/`. The component renders an SSR-compatible picture/img, with native media selection and no client hooks, WebGL, artwork imports or registration fetch. Example:

```tsx
<RoomArtworkImage unitIndex={6} theme="system" viewport="responsive" alt="Talks shelf" />
```

Indices are Books 1, Weightlifting 2, Systems 3, Projects 4, Musings 5 and Talks 6. Explicit themes are light/dark; explicit viewports are desktop/phone. About 0 and fractional destinations return null from lookup; root keeps `BootScreenArtwork` for About. Root/A own layout, content, scene promotion and the explicit usable 3D entry when exact registration fails.

`getRoomArtwork(index, theme, viewport)` supplies src, viewBox, drawingWidth in captured shelf pixels, source revision/fingerprint, camera/raster matrices, full unit transform and registrationSrc. The generated catalog is about 24 KB. Runtime registration metadata is a separate per-case JSON containing all owner paths, structural geometry/pose hashes and nine shelf/interior probes. Matrix arrays are column-major. Unit transforms come from the saved world-pose signature times the inverse saved shelf-local matrix, with six-decimal source precision. No origin/yaw assumption or capture renderer enters the client.

All 24 cases now have complete registration metadata. The three legacy Projects gaps were recovered on archive 3322 under their exact approved camera matrices. Every retained mask matched its original source pixels exactly: 0 px residual for dark-desktop, light-phone and dark-phone. The comparison used symmetric maximum Manhattan distance as a conservative Euclidean bound, at a 500 px desktop shelf cap or 92% phone viewport width, against a 3 CSS px tolerance. Phone browser viewport was 390 by 844; output raster was 780 by 1688. No approved SVG was regenerated from the new render.

Books current mounted data is now associated with the approved snapshot. The light-desktop retained masks matched exactly, and all 13 owner color buffers had zero changed channels, including the covers and both packed rows. The other three Books cases have exactly the same saved owner pose hashes. SHA-256 of UTF-8 `serializeRoomBooksArtworkIdentity(data)` must equal `capturedDataSha256` before claiming this data identity:

`56d8b48a2065491894ec97743dfa0805ea05d150e25f8aa01f03fd67b39155b3`

The helper includes featured identity/cover/length fields, sampled colors and packed spine metadata. It excludes notes, ratings and unrelated About reading selection. A changed selection, count, dimensions, title, cover URL or color invalidates the digest. Runtime still needs decoded textures and mounted pose/geometry checks; remote image bytes could change behind an unchanged URL.

Every exact captured mesh path is in `owners[].paths` and each probe names its path. The additional semantic wrapper names are listed in [the checks file](production-illustrated-artwork-checks.json). Root reported two resolver aliases: `room-sway` to `render-mask-prototype-sway`, and `room-boot:lamp-body:egg:lamp:4` to `projects-boot-lamp`. Keep captured parent ownership for attached pinboard content. Systems includes the recorded live clock-hand phase where available; do not replace it with an arbitrary stopped clock and claim identity.

Geometry identity hashes cover saved mesh path, node name and geometry type. Pose hashes cover all recorded unit-local matrices rounded to six decimals. The old captures did not save vertex buffers; these are not vertex-buffer hashes. Source dependency locks plus live geometry/probe checks remain necessary. Interior probes use recorded mesh coordinate origins; shelf probes use top-plank bounds corners. The bounds depend on compatible geometry, not independently saved vertices.

About's usable analytic contracts are `aboutBootRestCamera`, `aboutBootSilhouetteCameraSignature`, `aboutBootStageForViewport` and `aboutBootStageLayout`. They expose eye/aim/unitYaw and placement around SVG origin 150/108 in a 300 by 230 drawing. The stage maps 100 SVG units per scene unit. The globe's silhouette is orthographic. No all-mesh saved raster/registration manifest exists for About; retain its original artwork and let root validate its analytic adapter.

The generator is reproducible from committed `scripts/generate/room-artwork-inputs/`, with no archive/raw files or browser required. It verifies 239 production source/asset dependencies, all approved input hashes, owner/viewBox preservation, exact embedded bytes and decoding of 483 unique image details. It rejects stale source and unexpected output files. `generate:room-artwork` and `check:room-artwork` are wired into package.json; `verify:artifacts` includes the check. The source fingerprint is a reviewed packaging baseline, not a claim of fresh production capture. Capture revision and recovery evidence remain separate.

For root's reviewed naming-only edits, run this from the combined integration tree with Node 24.19.0. The command records the review and regenerates fingerprints; it rejects any changed dependency absent from the explicit list. Add another file only after reviewing its change.

```sh
/Users/chappyasel/.nvm/versions/node/v24.19.0/bin/node scripts/generate/review-room-artwork-source.mjs \
  --reason="Reviewed identity-only wrappers; geometry and poses unchanged" \
  src/app/components/stacks/scene/staticWorld.tsx \
  src/app/components/stacks/scene/eggs.tsx \
  src/app/components/stacks/scene/units/UnitBooks.tsx \
  src/app/components/stacks/scene/units/UnitTalks.tsx \
  src/app/components/stacks/scene/units/UnitBlog.tsx \
  src/app/components/stacks/scene/units/UnitSystems.tsx \
  src/app/components/stacks/scene/units/UnitTraining.tsx
/Users/chappyasel/.nvm/versions/node/v24.19.0/bin/node scripts/generate/room-artwork.mjs --check
```

Add `--dry-run` to preview the review receipt. This records the caller's source review; it does not prove semantic equivalence. Approved drawing inputs cannot change through this command. Commit the resulting input manifest/catalog/registration fingerprint updates with root's integration.

Browser slot is free. The recovery used one serial four-case run plus a Books-only color verification, with no archive source changes or unrelated screenshots. All matched masks were exact. This proves compatibility with saved source pixels, not normal-effects performance or the production SceneHandoff. Root owns those checks. Software Chromium and diagnostic no-composer mode were used; no production performance claim is made.

Node 24.19.0 generation is idempotent. Five targeted tests pass, including stale-source rejection, exact detail embedding, SSR selection and the recovered Books digest. Targeted lint and TypeScript pass; TypeScript explicitly includes `next/image-types/global` because this isolated tree has no generated Next image declaration. No build, database write, deployment or push was performed. No Field Note was added: rendering the existing shelf is automatic and has no meaningful qualifying discovery action, failing quality-bar test 2.

Exact resource sizes are below. Registration is lazy; the page selects one SVG. Total SVG bytes are 1,636,199, or 873,824 gzipped. Registration JSON totals 877,843 bytes across all 24 cases.

| Unit | Case | SVG bytes | Gzip bytes | Registration bytes |
| --- | --- | ---: | ---: | ---: |
| books | light-desktop | 70550 | 48143 | 74850 |
| books | dark-desktop | 70887 | 48475 | 75124 |
| books | light-phone | 36215 | 22830 | 75033 |
| books | dark-phone | 36069 | 22723 | 75033 |
| projects | light-desktop | 83875 | 38131 | 25826 |
| projects | dark-desktop | 85117 | 38775 | 26370 |
| projects | light-phone | 48716 | 19404 | 26277 |
| projects | dark-phone | 48516 | 19284 | 26275 |
| systems | light-desktop | 111956 | 56691 | 42588 |
| systems | dark-desktop | 111479 | 56766 | 42597 |
| systems | light-phone | 65985 | 29107 | 42666 |
| systems | dark-phone | 65316 | 28947 | 42667 |
| weightlifting | light-desktop | 88127 | 60364 | 30348 |
| weightlifting | dark-desktop | 84791 | 57876 | 30327 |
| weightlifting | light-phone | 44822 | 27661 | 30259 |
| weightlifting | dark-phone | 43542 | 26740 | 30254 |
| musings | light-desktop | 66228 | 35199 | 24176 |
| musings | dark-desktop | 66291 | 35315 | 24172 |
| musings | light-phone | 36203 | 17375 | 24082 |
| musings | dark-phone | 35860 | 17459 | 24080 |
| talks | light-desktop | 110975 | 57093 | 21256 |
| talks | dark-desktop | 111723 | 56711 | 21230 |
| talks | light-phone | 56380 | 26581 | 21177 |
| talks | dark-phone | 56576 | 26174 | 21176 |

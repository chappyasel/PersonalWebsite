# Reproducing the artwork quality pass

Use Node 24.19.0 and the repository dependencies. Normal verification is browser-free:

```sh
node scripts/generate/room-artwork.mjs --check
node scripts/room-artwork-quality/check-repackage.mjs
node --test scripts/room-artwork-quality/*.test.mjs
```

`check:room-artwork`, already in `verify:artifacts`, verifies the frozen quality input checksums, corrected alpha provenance, crops, owner inventory and image dimensions before checking generated outputs. `check-repackage.mjs` compares every active input SVG/detail, immutable camera contract, manifest, frozen specification and receipt before and after another full packaging pass.

Frozen source masks and colour captures live in `scripts/generate/room-artwork-inputs/quality`. Prepared detail WebPs retain 2x desktop or 3x phone density, with three declared 4x exceptions in `capture-specs.json`. These are final encodings of fresh 4x renders. Full 4x detail PNGs remain in the preserved raw evidence, outside the production input set.

The immutable `approved` templates supply the original palette, owner paint order, shelf polygons and previous artwork hash. Quality packaging never reads its own generated SVG as a template. Camera, owner, probe, Books and clock contracts remain the original files.

A fresh capture requires a separately authorized headless slot and an ordinary development server. It does not require the old prototype worktree:

```sh
node scripts/room-artwork-quality/capture.mjs projects light-desktop --base http://localhost:3338 --out /tmp/new-room-captures
node scripts/room-artwork-quality/package.mjs projects light-desktop --input /tmp/new-room-captures
node scripts/room-artwork-quality/freeze-inputs.mjs /tmp/new-room-captures
node scripts/generate/room-artwork.mjs
```

The capture rejects stale source dependencies, changed owner poses/identities and changed Books selection. It uses the saved camera and full unit transform, restores plant rest buffers, applies captured clock rotations, and renders only the approved owners. It is not a new exhaustive scene inventory. The disposable capture page is the only place that changes the renderer or animation state.

`derive-specs.mjs` records the one-time extraction of crop/treatment flags from archived raw evidence. Its archive argument is only needed to repeat that historical extraction. Normal capture and packaging use the committed specifications.

Raw readback must be unpremultiplied before Canvas ImageData. Direct packaging rejects old captures without the exact corrected provenance and matching contract hash. Do not repair or relabel old premultiplied PNGs as fresh corrected captures.

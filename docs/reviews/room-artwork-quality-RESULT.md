# Room artwork quality result

Integrated on `feat/illustrated-room`. See the [integration checkpoint](room-artwork-quality-integration.md) for production build and combined boot verification.

All six non-About shelves now use fresh 4x masks and colour captures, fitted contours, and sharper embedded details in all 24 theme/viewport cases. Root accepted the final desktop, phone and dark-detail review. The independent fresh-mask comparison passes all 528 rendered owners, with a maximum conservative Manhattan residual of 2.885 CSS px against the 3 px gate.

The recovery branch is `feat/room-artwork-quality-recovery`, based on `27c0155`. Commit `48da322` preserves the recovered capture utilities and approved templates. Commit `d10cb35` contains the final artwork, frozen inputs, validation utilities and evidence. This report is the final documentation commit.

## Rendering and provenance

The new headless captures use the actual mounted scene at revision `27c0155`, with the saved camera, full unit transform and approved owner contract. Capture restores plant rest buffers and the recorded Systems clock phase, and checks Books selection and owner pose/geometry identity. It renders the selected approved inventory; it does not claim a fresh exhaustive inventory of new scene objects. Original registration provenance remains intact. Quality receipts separately identify the fresh capture revision.

The contour fitter preserves straight corners and fits organic spans at 0.25 original-pixel tolerance. The original shelf polygon blocks, palette templates and owner order remain frozen. Tiny interior colour islands merge into adjacent regions without changing owner alpha. This removes pot-base quantization noise. All four Projects trophies explicitly use the facet treatment, including a regression test for the previously missing phone and dark-desktop flags.

WebGL readback explicitly unpremultiplies RGB before Canvas ImageData. The earlier incorrect captures were superseded by corrected renders. Both direct packaging and batch selection require the exact corrected-alpha marker and matching frozen contract hashes. The translucent shaker crops include their complete low-alpha shells; expanded lighthouse crops retain the railing and finial.

Detail exports use WebP quality 92 at 2x desktop and 3x phone. Three declared 4x exceptions retain the lighthouse in both Musings desktop cases and the navy shaker in Weightlifting dark-desktop. The approved DPR2 comparison reduced WWDC detail from 39,470 to 14,158 bytes and Mac detail from 29,744 to 12,758 bytes without losing useful displayed detail.

## Evidence and checks

- [Projects desktop comparison](room-artwork-quality-evidence/projects-desktop-before-after.png), [Talks desktop comparison](room-artwork-quality-evidence/talks-desktop-before-after.png), and [Projects phone comparison](room-artwork-quality-evidence/projects-phone-before-after.png) show the final output against the original at display scale and detail scale.
- [Detail density comparison](room-artwork-quality-evidence/detail-density-comparison.json) records 2x/4x bytes; adjacent crop PNGs show the comparison.
- [Fresh owner-mask checks](room-artwork-quality-evidence/live-outline-checks.json) pass all 528 owners. Root independently confirmed all 24 placement, camera, registration, Books, clock and paint-order invariants. The old composite-alpha comparison still flags newly resolved shaker text and lighthouse geometry. Those differences have fresh-mask support; the old low-resolution bitmap is not treated as geometric ground truth.
- [Native SVG checks](room-artwork-quality-evidence/native-svg-image-checks.json) confirm all 24 self-contained SVGs decode in Chromium img elements with zero page errors. Offline comparison converts embedded WebP to pixel-identical PNG in memory because librsvg otherwise omits those images.
- [Frozen-input checks](room-artwork-quality-evidence/frozen-input-checks.json) verify all cases, checksums, corrected readback provenance, crops and image dimensions. [Repackage evidence](room-artwork-quality-evidence/repackage-idempotence.json) proves the same frozen inputs package byte-identically across 558 files, including receipts.

Node 24.19.0 validation passed:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js scripts/room-artwork-quality/*.mjs scripts/generate/room-artwork.mjs scripts/generate/room-artwork-books.test.ts scripts/generate/room-artwork-clock.test.ts
node node_modules/prettier/bin/prettier.cjs --check scripts/room-artwork-quality/*.mjs scripts/generate/room-artwork.mjs scripts/generate/room-artwork-books.test.ts scripts/generate/room-artwork-clock.test.ts
node --test scripts/room-artwork-quality/*.test.mjs
pnpm exec vitest run scripts/generate/room-artwork.test.ts scripts/generate/room-artwork-books.test.ts scripts/generate/room-artwork-clock.test.ts scripts/generate/room-artwork-bounds.test.ts
node scripts/generate/room-artwork.mjs --check
node scripts/room-artwork-quality/check-repackage.mjs
```

The focused utility suite passes 15 tests; the four generator suites pass 56. Normal `check:room-artwork`, already part of `verify:artifacts`, now reaches quality-input verification without a browser. It checks 241 source dependencies and 484 unique decoded details. No production build was run here. Root owns the build and combined entrance checks, and is adding the reusable `check-live-masks.mjs` command in integration.

## Payload

Exact gzip bytes, original → final:

| Unit          |    Light desktop |     Dark desktop |      Light phone |       Dark phone |
| ------------- | ---------------: | ---------------: | ---------------: | ---------------: |
| projects      | 38,131 → 101,393 | 38,775 → 102,245 |  19,404 → 73,699 |  19,284 → 73,913 |
| books         | 48,143 → 167,172 | 48,475 → 167,675 | 22,830 → 129,338 | 22,723 → 128,730 |
| systems       | 56,691 → 180,198 | 56,766 → 178,163 | 29,107 → 132,033 | 28,947 → 132,244 |
| weightlifting | 60,364 → 233,096 | 57,876 → 219,426 | 27,661 → 175,878 | 26,740 → 171,595 |
| musings       | 35,199 → 128,698 | 35,315 → 129,466 |  17,375 → 96,239 |  17,459 → 96,714 |
| talks         | 57,093 → 172,732 | 56,711 → 172,718 | 26,581 → 119,271 | 26,174 → 118,787 |

Across all 24 variants, the total is 873,824 → 3,401,423 gzip bytes. Full SVG bytes total 4,843,364. Individual final variants are approximately 72–228 KiB gzip. This is a deliberate quality/payload tradeoff after reducing detail density from the initial 4x exports.

`IllustratedRoom.tsx` maps all `UNITS` to `IllustrationStage`, and `RoomArtworkImage` has no lazy loading. The browser selects one theme/viewport variant per shelf, while the traversable row mounts all shelves. It does not load only the selected shelf per visit. The six generated shelves together have these gzip totals for one theme/layout:

| Theme/layout  | Gzip bytes |    KiB |
| ------------- | ---------: | -----: |
| Light desktop |    983,289 | 960.24 |
| Dark desktop  |    969,693 | 946.97 |
| Light phone   |    726,458 | 709.43 |
| Dark phone    |    721,983 | 705.06 |

These totals exclude About and other page resources. They are artifact gzip measurements, not measured network transfer totals. Runtime loading behavior is unchanged.

## Preservation and handoff

There are no `src/` changes. About, all 24 shelf-only SVGs, camera matrices, owner/probe contracts, Books identity and clock identity remain unchanged. Registration files update only the artwork hash. The original detail inputs remain available to reconstruct the approved historical snapshots. Unreferenced experimental detail WebPs were pruned before commit.

The committed frozen masks, colour PNGs and prepared details make packaging reproducible from a clean checkout. Capture specs include original palette/template hashes, crop/treatment flags and their one-time archive derivation provenance. Normal recapture accepts configurable `--base` and `--out` and does not depend on the deleted worktree or a /tmp baseline. See [reproduction commands](room-artwork-quality-README.md).

Large raw browser captures, full 4x detail PNGs and redundant comparison boards remain outside Git under `/tmp/room-artwork-quality-*`, preserved separately by root. Compact final evidence and required frozen inputs are committed. The commit hook's pre-existing homepageOG freshness advisory remains for root; no unrelated OG capture was made.

Cherry-pick the recovery branch commits in order, beginning with `48da322`, then run the integration checks. Do not regenerate source receipts to bypass changed dependencies. This is an automatic presentation improvement and fails Field Notes quality-bar test 2; no discovery ID was added.

BROWSER_SLOT_FREE. Headless sessions are closed and the owned 3338 server is stopped. No push, deploy, database writes or runtime integration occurred in this worktree.

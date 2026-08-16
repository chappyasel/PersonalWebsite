# Homepage pre-launch review ledger

Date: 2026-08-16
Target: social launch on 2026-08-17

## Scope

Implement the approved source-level homepage pre-launch work that does not
require visual signoff: the five recommended launch items and the five listed
safe follow-ups. Visual tuning, product-visible fallback design, and unrelated
refactors remain deferred.

## Task list

- [x] Harden malformed Google Books URL handling.
- [x] Clean the remaining raw homepage placard cover URL.
- [x] Use one eligibility decision for 3D mount and preload.
- [x] Reset route-owned world mode on opt-out and unmount.
- [x] Reset meadow readiness for each new world mount.
- [x] Disable the hidden flat page's OGL renderer while world mode owns the UI.
- [x] Preserve browser pinch/Ctrl-wheel zoom.
- [x] Make global world keyboard navigation respect handled events and controls.
- [x] Stop modal-wide Enter shortcuts from hijacking focused controls.
- [x] Make direct `#book-…` modal deep links close back to the homepage.
- [x] Change the bare `H` shortcut to `Alt+H`.
- [x] Give icon-only contact links explicit accessible names.
- [x] Complete homepage canonical/OpenGraph/Twitter identity metadata.
- [x] Align sitemap and robots declarations with the canonical `www` host.
- [x] Enforce the existing route bundle budget after production builds.
- [x] Add or update regression tests for every behavior with a practical seam.
- [x] Run targeted and full verification.

## Decisions and judgment calls

- “Do all that” is interpreted as the five pre-launch recommendations plus the
  five explicitly enumerated safe follow-ups. Items previously marked deferred
  remain deferred because they need visual or product judgment.
- The existing PostHog loading path will not be changed. `ModalHost` warms the
  modal chunk on idle; that chunk imports `BookDetailContent`, which imports the
  analytics module. The earlier suggestion to add a second global bootstrap was
  rejected as duplicate initialization work.
- The generated OpenGraph image itself will not be changed. Its live hashed URL
  returns successfully at 1200×630; this batch only completes identity and
  canonical metadata around it.
- Browser automation and screenshots are intentionally excluded by repository
  instruction. Verification will use unit/source tests, lint, types, build, and
  route-budget checks.
- The cover change should deploy on 2026-08-16 so the new Next image-optimizer
  keys have time to warm before launch traffic.
- The hidden flat fallback remains fully mounted and crawlable; only its OGL
  renderer is disabled while world mode owns the UI. Demotion to flat mode
  re-enables the animated background without changing its static gradient.
- Direct book hashes now replace the landing entry with the same pathname and
  query but no hash, then push the book hash as a site-owned entry. This keeps
  the shared modal's existing `history.back()` close contract without sending a
  direct visitor back to an unrelated external page.
- Modal Enter behavior is centralized in a pure target guard shared by the
  homepage capture listener and the books modal bubble listener. Interactive
  descendants own Enter; non-interactive dialog copy retains the shortcut.
- Homepage-specific metadata lives in a small client-free module rather than
  the root layout. Putting canonical `/` in the root layout would incorrectly
  canonicalize descendant routes that do not override `alternates`.
- The build budget is enforced with npm's `postbuild` lifecycle so Vercel and
  local `npm run build` executions cannot silently skip the existing checker.

## Shortcuts and compromises

- The placard cover call site has no narrow component-test seam; its behavior
  is locked through the shared URL helper tests and will also be covered by
  full type/lint/build verification.
- No browser or screenshot pass was performed. This follows the repository's
  explicit browser-automation rule; none of these changes intentionally alters
  layout, spacing, color, typography, or animation design.
- The homepage remains close to its current JavaScript budget: 236.0 KB gzip of
  250 KB. The guard now fails future builds, but this batch does not attempt a
  larger bundle split immediately before launch.

## Issues and ambiguities

- A production build runs a repository `prebuild` step that fetches private Dad
  content. In both verification builds, the required content was already
  present, so the step skipped its fetch. No credential values were read or
  printed, and the worktree contained no unexpected generated changes.
- The correct modal Enter behavior is “open the full book only when focus is not
  on an interactive descendant.” A shared target guard now keeps the homepage
  and books modal aligned.
- ESLint reports one existing warning outside this batch:
  `src/app/weightlifting/opengraph-image.tsx` declares but does not use
  `wlExercises`. There are no lint errors.
- No deployment was performed. The changes are verified locally and still need
  the repository's normal review/deploy path before the 2026-08-17 launch.

## Deferred next steps

- Design a data-independent semantic fallback for a hung or rejected homepage
  data request.
- Review heading hierarchy across reused flat-page sections with awareness of
  the standalone section routes.
- Decide whether to link the existing web manifest after reconciling its fixed
  white theme color with the site’s dark theme.
- Consider serving a pre-rendered social JPEG only if a real sharing client
  rejects the current PNG; do not optimize speculatively.
- Reduce or split the homepage client bundle before it reaches the enforced
  250 KB ceiling; the current build has about 14 KB of gzip headroom.

## NEW IDEAS

- Add a source-level launch preflight command that runs typecheck, unit tests,
  production build, and route budgets as one deterministic check.
- Consolidate route-owned transient state (`mode`, meadow readiness, and future
  gates) behind one `resetStacksRouteState()` boundary so SPA cleanup cannot
  omit a newly added state field.
- Add a lightweight host-consistency regression that checks homepage metadata,
  root sitemap, and `robots.txt` all agree on the canonical origin.
- Emit a warning before the hard bundle limit—at 90% or 95%—so the launch route
  does not first surface bundle growth as a failed production build.
- Completed during this batch: add metadata and sitemap regression tests so
  canonical/social identity and the root host cannot silently drift.

## Verification record

- `npx vitest run src/lib/books/coverUtils.test.ts src/app/components/stacks/scene/bookCoverTexture.test.ts`
  — 2 files, 4 tests passed.
- `npx vitest run src/app/components/stacks/webglProbe.test.ts src/app/components/stacks/loading.test.ts src/app/pagePresentation.test.ts`
  — 3 files, 9 tests passed.
- Targeted lifecycle/page ESLint — passed after replacing the WebGL context
  fallback expression with nullish coalescing.
- `npx vitest run src/app/books/components/modalKeyboard.test.ts src/app/components/stacks/modal/bookModalSync.test.ts src/app/components/stacks/input/ScrollBridges.test.ts src/app/components/stacks/dom/focusMode.test.ts`
  — 4 files, 14 tests passed.
- Targeted interaction/accessibility ESLint — passed.
- `npx vitest run src/app/homeMetadata.test.ts src/app/sitemap.test.ts src/app/pagePresentation.test.ts`
  — 3 files, 5 tests passed.
- Targeted metadata/sitemap ESLint — passed.
- Final `npm test` after formatting — 65 files, 297 tests passed.
- Final `npx tsc --noEmit` after formatting — passed.
- Final `npm run lint` after formatting — passed with zero errors and the one
  pre-existing Weightlifting OpenGraph warning recorded above.
- Final `npm run build` after formatting — Next.js 16.1.6 compiled successfully
  and generated all 355 static pages.
- The new automatic `postbuild` budget gate ran as part of that build and
  passed: homepage 236.0/250 KB gzip; books 252.6/350 KB gzip.
- Generated production output contains the homepage canonical URL plus
  `og:url`, `og:type`, `og:site_name`, `og:locale`, `twitter:site`, and
  `twitter:creator`; the generated root sitemap uses the `www` origin.
- `git diff --check` — passed. Final status review found only the intended
  source, test, configuration, and review-ledger changes.

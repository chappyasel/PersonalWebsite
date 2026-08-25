# Website improvements: combined review

## Scope

This branch combines the five low-risk website projects and the toolchain
alignment requested on 2026-08-21. Work began from `main` at `3055138`. Each
project was implemented and documented in an isolated Superset worktree, then
reviewed on standards and requested behavior before integration.

No browser automation was used. No production service, PostHog project,
database, Vercel deployment, or `main` branch was changed.

## Process used

1. Pin the shared base and give each agent one bounded ownership area.
2. Require each agent to record evidence, shortcuts, issues, ambiguities,
   judgement calls, tests, manual checks, edge cases, and rollback notes.
3. Review each branch on two axes: repository standards and requested behavior.
4. Send actionable findings back for amendments and re-review the amendments.
5. Integrate the amended commits on `site-improvements-review`, resolving
   overlaps by ownership rather than selecting whole conflict sides.
6. Run focused cross-project contracts, then the repository verification gate,
   artifact freshness check, source-read inventory, and final two-axis review.

## Integrated projects

### 1. Green baseline

- `pnpm verify` is the deterministic code gate: route type generation, TypeScript,
  zero-warning ESLint, unit tests, and the meadow geometry check.
- Generated homepage media is a separate `pnpm verify:artifacts` gate, so a
  browser-backed capture cannot make ordinary code verification nondeterministic.
- The TJ medallion runtime and boot trace now share geometry and pose policy;
  unrelated comments no longer invalidate the silhouette contract.
- Thin, fast physics bodies use a bounded four-substep path that closes the
  reproduced Musings paper tunnelling case.
- The OG cache warmer reads the production Vercel deployment it actually
  depends on. An explicit deployment failure skips warming with a warning;
  absence of a deployment or terminal status still fails after 20 minutes.

Review ledger: [green baseline](./2026-08-21-green-baseline.md).

### 2. Typed visitor journey analytics

- A closed event catalog covers delivery mode, boot outcome, section arrival,
  Portals, contact methods, deep pages, and the existing Book Notes events.
- Analytics initializes lazily behind a bounded 100-event FIFO with safe retry
  and delivery-aware once keys.
- URL properties are sanitized; anonymous person profiles and PostHog automatic
  capture features are disabled.
- The boot machine owns the one eligibility decision and exposes the bounded
  flat-delivery reason. Analytics consumes that view instead of re-probing.
- Boot duration begins at the parse-time handshake on the first document load;
  that clock is consumed once so an SPA re-entry starts a fresh duration.
- World and flat section arrival share document-lifecycle dedupe keys.

Review ledger: [journey analytics](./2026-08-21-journey-analytics.md).

### 3. Behavior-first test contracts

- Replaced brittle source-text assertions around postprocessing, free roam,
  backdrop composition, placard surfaces, and diagnostics readouts with pure or
  rendered behavior contracts.
- Kept a small, explicit source-level wiring contract only where the repository
  lacks a DOM or r3f harness.
- Added `pnpm report:test-source-reads`, a deterministic heuristic inventory.
  Its counts are lower bounds, not semantic proof.
- On integration, free-roam entry remains edge-triggered while the debug enable
  toggle remains reload-reset; only the camera pose is persisted.

Review ledgers: [test contracts](./2026-08-21-test-contracts.md) and
[source-read inventory](./test-source-reading-inventory.md).

### 4. Scene Diagnostics registry

- One 50-control registry now owns IDs, sections, labels, allowed values,
  defaults, reset behavior, cost metadata, and the exact optimization preset.
- Five formerly query-only render switches are live: composer, side tilt shift,
  color grade, meadow, and authored high-resolution photo details.
- The registry inventory stays behind the lazy Diagnostics chunk; the canvas
  imports only the small runtime seed.
- Default-off expensive paths retain zero allocation, sampling, and per-frame
  work when disabled.
- Integration review fixed two lifecycle seams: meadow off-to-on readiness now
  resets through the generation-scoped boot machine, and released photo detail
  leases become synchronously unselectable before disposal.

Review ledger: [diagnostics registry](./2026-08-21-diagnostics-registry.md).

### 5. Homepage boot state machine

- Capability, warm/cold selection, four reveal gates, deadlines, failure,
  cleanup, and document-handshake projection now live in one pure state machine.
- Every mounted-world signal is stamped with a generation, preventing a dying
  canvas from demoting a later SPA visit.
- The pre-paint timeout hands its result to hydration, and route exit clears the
  document attributes and vignette state.
- The duplicate `mode` field was removed from the scene store. Dev hooks and
  analytics read the boot machine's view.

Review ledger: [boot state](./2026-08-21-boot-state.md).

### Toolchain alignment

- Node 24 is authoritative in `package.json`; `.nvmrc` mirrors it and CI checks
  the invariant.
- Next and `eslint-config-next` are exactly aligned. ESLint uses one flat,
  type-aware policy with zero warnings.
- `.mjs` utilities receive non-type-checked recommended rules instead of
  crashing typed-rule initialization outside the TypeScript project.
- Dependabot groups compatible patch updates while keeping routine minor and
  major upgrades manual and security updates eligible.
- Vite is exact; environment and TanStack Query upgrades have focused smoke
  coverage.
- pnpm `10.34.5` is exact in repository metadata and CI. The pnpm workspace
  config preserves the dependency-family overrides and install-script policy.

Review ledger: [toolchain alignment](./2026-08-21-toolchain-alignment.md).

## Integration findings and resolutions

- Diagnostics and test contracts disagreed about persisting free-roam
  enablement. Repository policy wins: the debug toggle resets on reload, while
  the extracted shortcut/fog/entry behavior tests remain.
- The test branch's TJ artifact advice was wrong in isolation. Regenerating
  would have blessed a false contract; the combined branch uses the shared
  medallion geometry correction instead.
- Diagnostics still called meadow readiness functions removed by the boot
  refactor. The combined runtime now sends scoped `meadowPending` and
  `meadowReady` events to the boot machine.
- The DoF contract used an obsolete local query variable after live controls
  landed. It now reads `skipDepthOfField` from the live performance settings.
- A disposed high-resolution texture could remain selected across off-to-on.
  Cleanup now clears only the exact released lease record and preserves a
  newer lease even when it shares the same URL and cached texture.
- Analytics originally owned a second eligibility probe and duplicate boot
  state. The combined implementation derives delivery and failure facts from
  the boot machine and reads the scene store only for settled section arrival.
- Shipping review moved homepage OG freshness out of `prebuild` and into a
  repository-managed pre-commit hook. The checker reads the Git index, so an
  unstaged edit cannot invalidate or falsely bless a partial commit. CI retains
  the same gate for hook bypasses.

## Shortcuts and constraints

- No interactive browser, WebGL, screenshot, or visual-regression run was
  performed because repository instructions prohibit it unless explicitly
  requested.
- No production build or route-budget run was performed without the populated
  database and deployment credentials it requires.
- The homepage OG artifact uses an index-aware local commit hook and the
  existing CI check. Its headless-Chromium regeneration remains explicit so
  the resulting binary can be reviewed before commit.
- `report:test-source-reads` is regex-based and includes documented manual
  corrections. It is useful as a trend line, not an AST inventory.

## Owner decisions and review flags

1. **PostHog policy:** this branch disables automatic pageviews/pageleaves,
   autocapture, dead/rage clicks, heatmaps, performance capture, and session
   recording, and changes person profiles to `identified_only`. Confirm that no
   current dashboard depends on those automatic events.
2. **Homepage OG:** review the regenerated card whenever the local commit gate
   reports stale visual inputs; regeneration deliberately does not rewrite a
   binary during `git commit`.
3. **Dependency owners:** review the pre-1.0 `@t3-oss/env-nextjs` update and the
   TanStack Query/persistence versions even though lint, types, and smoke tests
   pass.
4. **Visual/runtime pass:** perform the manual checks below before merging,
   especially SPA re-entry, context loss, diagnostics off-to-on, and the flat
   analytics wrapper at narrow widths.

## How to review and test

Use Node 24 from the repository before every command:

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm verify:artifacts
pnpm report:test-source-reads
git diff --check main...site-improvements-review
```

Expected result: `pnpm verify` and `git diff --check` pass. The artifact gate is
expected to report only the stale homepage OG capture until it is regenerated
under an authorized browser-backed workflow.

Pre-migration combined verification on this branch, retained as historical
evidence:

- `yarn verify`: passed route type generation, TypeScript, zero-warning ESLint,
  206 Vitest files / 1,808 tests, and 115,942 meadow assertions.
- `yarn verify:artifacts`: failed only for the known stale homepage OG image or
  source fingerprint.
- `yarn report:test-source-reads`: passed; 52 test files read files, 44 read
  source text, 1,058 assertions were counted heuristically, and 7 generated
  artifact checks remain.

Manual checks, in priority order:

1. Cold load, warm reload, reduced motion, Save-Data, and WebGL unavailable.
   Confirm the world/flat choice, boot vignette, and document remain usable.
2. Navigate `/` → `/books` → `/` several times, including quickly. Confirm a
   fresh boot each time and no stale overscroll lock or old-canvas failure.
3. Force `WEBGL_lose_context` after reveal. Confirm the flat page returns and a
   later homepage visit boots normally.
4. Open Scene Diagnostics with `H` or `?debug=1`. Toggle composer, side tilt
   shift, color grade, meadow, high-resolution photos, and DoF. For meadow and
   photos, test off → on twice; previews must remain visible and the boot gate
   must not reveal before new meadow buffers report ready.
5. Enter free roam with `F` and `Shift+F`, toggle fog, leave, and reload. The
   enable toggle must reset; the optional camera pose may persist. Opening or
   changing the mobile sheet must not create repeated history dismissals.
6. Throw the Musings paper stack down hard, then throw the golf ball, a book,
   and the medallion. The paper should stay on the shelf and other props should
   not feel sticky or slow.
7. Compare the About medallion with `main`; the render should be visually
   unchanged.
8. Against a non-production analytics sink, verify one bounded delivery event,
   cold/warm boot duration, fallback causes, section dedupe in both modes, Portal
   and contact events, deep-page events, and URL query/fragment removal.
9. In a credentialed environment run `pnpm build`, then `pnpm check:budgets`
   and the Playwright performance safety harness.
10. Inspect the next Vercel deploy's Node version and the first Dependabot PR.

## Potential issues and edge cases

- Four physics substeps add bounded solver work only for bodies thinner than
  `0.03` moving faster than `1 u/s`, but the browser performance harness is the
  final check for device impact.
- Debug-query seeds apply once at module initialization. Client-side query
  mutation without reload intentionally does nothing; panel controls remain live.
- A high-resolution photo re-enable intentionally refetches after the last
  lease was released and disposed.
- The flat analytics wrapper adds a full-width element around each tracked
  section; verify narrow and wide document layouts.
- Document-lifecycle dedupe suppresses repeat visits to the same section or deep
  page during one SPA document. Repeatable action events remain repeatable.
- The analytics queue drops newest events after 100 queued failures to preserve
  the beginning of the journey and bound memory.
- Node 25 is intentionally rejected; contributors must select Node 24.
- The medallion scene scale changes by one floating-point ULP through the shared
  signed pose value. It should not be visible.

## Rollback

The projects remain separable by their integration commits. Revert the newest
project or integration-fix commit first; do not regenerate artifacts or reset
the worktree. For the package-manager amendment, restore the pre-migration
`package.json` and `yarn.lock` together, remove `pnpm-lock.yaml` and
`pnpm-workspace.yaml`, then revert the command and CI changes as one unit.

## pnpm 10 migration amendment, 2026-08-22

The combined branch now uses pnpm `10.34.5` under Node `24.x`. This was the
current `latest-10` release during the migration, it supports Node 24, and pnpm
10 is the newest major in Vercel's documented supported range. pnpm 11 was not
used.

The lockfile migration started with `pnpm import` against the resolved Yarn
tree, then pnpm generated the final `pnpm-lock.yaml` under Node `v24.19.0`.
`pnpm-workspace.yaml` carries the former resolution invariants as exact
overrides. It permits install scripts only for `esbuild` and `sharp`; the inert
`core-js` and `es5-ext` notification postinstalls are explicitly disabled.

Two pnpm layout issues required judgement. Vite attached an incompatible
transitive esbuild peer, so exact `esbuild@0.27.7` is now a direct development
dependency within Vite's declared range. pnpm also exposed three imports that
the old flat install had supplied through transitive hoisting. The already
resolved versions of `three-stdlib`, `meshoptimizer`, and
`google-auth-library` are now declared directly. No existing application
dependency changed version for either fix.
The manifest also pins `@radix-ui/react-slot@1.2.4`, `zod@4.3.6`, and
`postcss@8.4.47` to stop the new lockfile from advancing those existing ranges.

No browser, production build, route-budget check, deployment, or Vercel setting
change was made during the pnpm migration. Older review and research records
retain their Yarn commands because those commands describe work that happened
before this amendment.

Final verification used Node `v24.19.0` and pnpm `10.34.5`:

- A from-empty `node_modules` `pnpm install --frozen-lockfile` passed and ran
  only the approved esbuild and sharp install scripts.
- `pnpm verify` passed type generation, TypeScript, zero-warning ESLint, 206
  Vitest files with 1,808 tests, and 115,942 meadow assertions.
- Before the shipping amendment, `pnpm verify:artifacts` failed only for the
  already-known stale homepage OG image or source fingerprint. Its help text
  prints the pnpm regeneration command.
- The package-manager drift check passed for Node 24 and pnpm `10.34.5`.
- `pnpm start -p 3111` reached Next on port 3111, then stopped at the expected
  missing-local-environment validation. Coordinator review corrected an earlier
  command that forwarded a literal `--` to Next.
- All 86 pre-existing direct dependencies match their earlier locked versions.
- Diff whitespace checks passed for the committed branch delta, the working
  changes, their combined delta from `main`, and both new pnpm files.
- The active-reference search found no package-manager Yarn command. Historical
  ledgers and research records keep their original command evidence.

The required owner action is to set `ENABLE_EXPERIMENTAL_COREPACK=1` in Vercel
for Production, Preview, and Development, and to leave the Install Command
unset. The next deployment should show Node 24 and pnpm `10.34.5` in its logs.

### Superset workspace bootstrap follow-up, 2026-08-22

The first manual `yarn dev` attempt exposed two local setup gaps rather than a
corrupt manifest. Homebrew Yarn 1 rendered the valid `pnpm@10.34.5` field as the
misleading string `yarn@pnpm@10.34.5`; Yarn is no longer a supported entry
point. The worktree also inherited Node 25 and lacked ignored environment files.

`.superset/setup.sh` now selects Node 24 through nvm, enables Corepack, verifies
pnpm `10.34.5`, copies missing `.env`, `.env.local`, and
`.env.development.local` files from the `main` worktree without printing their
contents, and performs a frozen install. `.superset/run.sh` selects Node 24 again
before `pnpm dev`. Copying only missing files preserves workspace overrides;
credential rotation requires a new workspace or a deliberate local refresh.

A disposable Superset workspace verified the actual lifecycle from an empty
dependency tree: setup installed 1,002 packages, reported Node `v24.19.0` and
pnpm `10.34.5`, and the run wrapper reached Next's ready state on port 3001. The
workspace and temporary verification branch were deleted afterward. The
combined workspace is running on port 3000, and its homepage returned HTTP 200.

That request also exposed an unresolved pnpm runtime warning: Sharp dependencies
loaded libvips builds `1.0.4` and `1.2.4` in the same process. It did not block
the response, but package alignment should be reviewed before declaring the
runtime warning-free. Two later Next image-optimizer requests for OpenLibrary
covers returned HTTP 500 after upstream TLS failures with `wrong version
number`; that network path also remains unresolved.

### Book notes empty-state follow-up, 2026-08-22

The book detail modal hid the no-notes message, even when `hasNotes` was false.
Its reading notice also claimed that partial notes existed without checking that
flag. The data was already correct; no Notion mapping, database schema, or sync
change was needed.

The modal and full page now use one intentional empty state whenever `hasNotes`
is false. It says "I'm reading this one without taking notes!" for a current
book and "I read this one without taking notes!" for a completed book. The
empty state has no secondary `Book notes` label. The separate partial-notes
notice appears only when notes exist.

Book cards now treat reading progress, reread count, and note availability as
independent facts. Children of Time therefore shows both `Reading` and
`No Notes`; the latter uses a neutral treatment rather than the previous red
error-like badge. Extra-small cards still suppress all overlays, but the normal
books grid renders only S, M, and L cards.

Server-rendered regression tests cover both detail presentations, current and
completed empty-state copy, the current-book-with-notes case, and stacked card
badges. `vitest.config.ts` resolves the repository's TypeScript path aliases so
the tests import the real components rather than duplicate test-only versions.

The structural fix passed the full gate under Node `v24.19.0` and pnpm
`10.34.5`. After the copy clarification, both focused component files passed
their five tests. An intermediate full run passed type generation,
zero-warning ESLint, 208 Vitest files with 1,815 tests, and 115,942 meadow
assertions. A concurrent OG composition edit briefly interrupted the separate
TypeScript step; its missing prop was fixed before the final shipping gate.

### Local OG gate and refreshed card, 2026-08-22

Homepage OG freshness now blocks commits locally without running a browser in
the hook. `pnpm install` configures `.githooks/pre-commit` unless the developer
already owns `core.hooksPath`; CI remains the fallback for bypassed hooks. The
checker reads image, manifest, and visual inputs from the Git index, so a file
with both staged and unstaged changes is evaluated as the commit Git will
actually create. A temporary-repository regression test covers clean, stale,
and partial-staging states.

The stale card was regenerated explicitly from a credentialed local production
build. Visual review found the About lamp's live camera-reveal pose too
camera-facing for the head-on social card. Capture mode now aims the same
measured shade and complete light rig lower and farther right across the two
coordination marks. It also strengthens the already-mounted aperture halo,
source sprite, emissive shade, and real spotlight; the visitor-facing pose,
allocations, and per-frame path are unchanged. The refreshed 1200×630 JPEG was
inspected at native resolution.

The first regeneration also exposed a flaky Playwright assertion: it asked a
locator for an intentionally hidden placard to become actionable before reading
its computed visibility. The generator now reads that hidden element directly
from the DOM. Its capture contract and production-backed regeneration pass.

Final shipping verification under Node `v24.19.0` and pnpm `10.34.5` passed:

- `pnpm verify`: 208 Vitest files, 1,815 tests, zero-warning ESLint,
  TypeScript, and 115,942 meadow assertions.
- `pnpm verify:artifacts`: the regenerated image matches all 415 visual input
  files in the working-tree snapshot.
- `pnpm check:budgets`: homepage 257.5 KB gzip against 275 KB; books 253.3 KB
  against 350 KB.

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

- `yarn verify` is the deterministic code gate: route type generation, TypeScript,
  zero-warning ESLint, unit tests, and the meadow geometry check.
- Generated homepage media is a separate `yarn verify:artifacts` gate, so a
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
  Doors, contact methods, deep pages, and the existing Book Notes events.
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
- Added `yarn report:test-source-reads`, a deterministic heuristic inventory.
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

## Shortcuts and constraints

- No interactive browser, WebGL, screenshot, or visual-regression run was
  performed because repository instructions prohibit it unless explicitly
  requested.
- No production build or route-budget run was performed without the populated
  database and deployment credentials it requires.
- The homepage OG artifact was not regenerated. Its capture path uses headless
  Chromium and production-backed data, so it requires explicit browser-test
  authorization and the right environment.
- `report:test-source-reads` is regex-based and includes documented manual
  corrections. It is useful as a trend line, not an AST inventory.

## Owner decisions and review flags

1. **PostHog policy:** this branch disables automatic pageviews/pageleaves,
   autocapture, dead/rage clicks, heatmaps, performance capture, and session
   recording, and changes person profiles to `identified_only`. Confirm that no
   current dashboard depends on those automatic events.
2. **Homepage OG:** decide whether to authorize a production-backed browser
   capture to refresh the stale artifact.
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
yarn install --frozen-lockfile
yarn verify
yarn verify:artifacts
yarn report:test-source-reads
git diff --check main...site-improvements-review
```

Expected result: `yarn verify` and `git diff --check` pass. The artifact gate is
expected to report only the stale homepage OG capture until it is regenerated
under an authorized browser-backed workflow.

Combined verification on this branch:

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
   cold/warm boot duration, fallback causes, section dedupe in both modes, Door
   and contact events, deep-page events, and URL query/fragment removal.
9. In a credentialed environment run `yarn build`, then `yarn check:budgets`
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
the worktree. Restore `package.json` and `yarn.lock` together if rolling back
toolchain changes.

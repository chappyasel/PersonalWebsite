# Toolchain alignment ledger

Date: 2026-08-21

## Objective and scope

Align local development, CI, and Vercel on Node 24; pair Next.js with its supported lint integration; remove peer warnings with bounded changes; and add low-noise dependency update automation. Keep Yarn 1 and avoid unrelated framework or product dependency migrations.

The task may change runtime declarations, lint configuration, packages needed to resolve demonstrated peer mismatches, focused compatibility tests, the lockfile, update automation, active version references, and this ledger. It does not redesign green-baseline workflows beyond Node version references and the clean-checkout type-generation prerequisite.

## Baseline evidence

Facts recorded before implementation:

- The worktree started clean on branch `site-toolchain-alignment`.
- The local runtime was Node `v24.19.0` with Yarn `1.22.22`.
- `package.json` declared Node `24.x`; `.node-version` and `.nvmrc` each contained `24`; both Node-using CI jobs contained `node-version: 24`; README required Node 22 or newer.
- `@types/node` was `^20.14.10`.
- `next` was `^16.1.6`, while `eslint-config-next` was 15 and the repository used legacy `.eslintrc.cjs` configuration.
- `yarn install --frozen-lockfile --non-interactive` passed in 27.19 seconds. Yarn reported six peer warnings: two missing `@types/three` peers through `@react-three/drei`, two Zod 3 mismatches from `@t3-oss/env-nextjs@0.10.1`, a React Query mismatch from `@tanstack/react-query-persist-client@5.90.18`, and a missing Vite peer for `vitest@4.1.10`.
- The install also emitted Node's `[DEP0169]` warning from Yarn 1's use of `url.parse()`.
- A fresh Superset worktree did not contain the ignored, generated `next-env.d.ts`. The first lint and type runs therefore reported eight static-image import errors. A rerun after `public/images/about/profile.jpg` was confirmed present produced the same result. This separated the transient materialization suspicion from the actual cause.
- `SKIP_ENV_VALIDATION=1 yarn next typegen` generated the ignored Next type files without secrets. Lint then passed with one existing unused-variable warning, and TypeScript passed.
- Unit tests returned 1,531 passes and 6 existing failures across 1,537 tests. The failing presentation, geometry, physics, and generated-asset assertions are outside this task.
- `yarn outdated --json` found 63 direct dependencies with newer versions before implementation.

## Implementation summary

- Kept `package.json#engines.node` at `24.x` as the CI and Vercel authority. Restored `.nvmrc` with `24` for local version selection, removed `.node-version`, and added `scripts/check-node-version.mjs`. Both Node-using workflows run the invariant after `setup-node`. This deliberately keeps two representations for tool compatibility, with an automated drift check.
- Updated README to require Node 24.x and Yarn 1.x. `packageManager: yarn@1.22.22` remains installation metadata; CI does not enable Corepack, so the exact Yarn patch is not claimed as enforced.
- Pinned `next` and `eslint-config-next` to `16.1.6`. Replaced `.eslintrc.cjs` with `eslint.config.mjs` and migrated only the configuration needed for Next 16 flat config.
- Preserved the prior typed-lint policy. Type-aware TypeScript ESLint presets now cover all JS and TS files matched by the repository tsconfig, including scripts. `@typescript-eslint/no-unnecessary-type-assertion` remains enabled. The complete `typescript-eslint` package family is pinned to `8.52.0` to retain the compatible behavior that the old policy used.
- Added an explicit non-type-checked override for `.mjs` utilities. They remain under ESLint's syntax and recommended rules, while typed rules stay limited to files included by `tsconfig.json`; without the override, invoking ESLint on an `.mjs` file crashed while loading typed rules.
- Kept the newly introduced Next React Compiler rules off because enabling them requires product-code changes. This exception does not include `no-unnecessary-type-assertion`.
- Removed obsolete `.eslintrc.cjs` from `tsconfig.json#include`. `eslint.config.mjs` is not intended to be part of the TypeScript program; ESLint loads and validates it directly.
- Updated `@types/node` to 24.13.3, added `@types/three`, updated `@t3-oss/env-nextjs` to 0.13.11 for the existing Zod 4 line, and added a focused environment-adapter smoke test.
- Pinned direct Vite and its Yarn resolution exactly to the already resolved compatible `8.1.4`.
- Aligned the TanStack persistence family without widening it: `@tanstack/react-query` and `@tanstack/query-core` are 5.90.16, while the persistence packages are 5.90.18. A focused save-and-restore smoke test covers the integration.
- Regenerated `yarn.lock` with Yarn 1.22.22. The final frozen install reports no peer warnings.
- Added weekly Dependabot groups for patch-only Next, development-toolchain, and production updates. Routine minor and major version updates remain manual. Migration-heavy families are excluded from groups and use explicit version-update filters; Dependabot security updates remain eligible.

## Shortcuts taken

- `yarn build` was not run because its prebuild needs `GCS_SERVICE_ACCOUNT_KEY` to fetch private content. `SKIP_ENV_VALIDATION=1 yarn next build` was run instead. Compilation and the build TypeScript phase passed, then page-data collection failed because the local `chappyasel` Postgres database does not exist.
- No other shortcuts were taken. Browser automation was not used. Product code and unrelated dependencies were not changed. The requested frozen install, type generation, lint, script lint, types, focused tests, unit suite, and secret-free build/config checks were run.

## Issues discovered but not fixed

Facts:

- Clean worktrees need `SKIP_ENV_VALIDATION=1 yarn next typegen` before standalone lint or TypeScript checks. `next-env.d.ts` is intentionally ignored and was not committed. Green-baseline and toolchain owners still need to decide whether setup or verification owns this prerequisite.
- Unit tests retain the same six baseline failures. Final totals are 1,533 passing and 6 failing because this task adds two passing focused tests.
- Lint retains one existing warning: `LIFT_LAMBDA` is unused in `src/app/components/stacks/scene/reactionArchetype.test.ts`.
- Yarn 1 emits `[DEP0169]` under Node 24 because it calls deprecated `url.parse()`. No functional Yarn 1 blocker was found.
- ESLint 9.39.5 prints an end-of-support notice during a resolving install. ESLint 10.9.0 was tried, but plugins bundled by `eslint-config-next@16.1.6` reject ESLint 10 in their peer ranges. The final ESLint 9 tree has no peer warnings.
- Next 16's added React Compiler rules produced 130 errors and 13 warnings in existing application code when enabled. Adoption is a separate product-code migration.
- The first TanStack smoke-test type check exposed two physical `QueryClient` types with incompatible private members. Pinning `@tanstack/react-query` and `@tanstack/query-core` to 5.90.16, the minimum accepted line used by the 5.90.18 persistence client, removed the duplicate core and made the smoke test and full type check pass.
- A complete local build requires private dad-content credentials and a populated Postgres database. The secret-free build compiled and passed TypeScript, then failed for `/books/[bookId]` with Postgres error `3D000`.

Hypotheses:

- The unchanged six test names and assertions indicate that the failures are unrelated to this change. This comparison is strong evidence, not proof that every execution path is unaffected.

### Deferred update inventory

This is the complete final `yarn outdated --json` snapshot: 76 rows, including direct and resolution entries. Every row is deferred. Dependabot will propose only eligible patch updates; routine minors, majors, and named migration-heavy families require manual review.

| Package                                  |       Current |        Wanted |   Latest | Type                   |
| ---------------------------------------- | ------------: | ------------: | -------: | ---------------------- |
| `@ai-sdk/openai`                         |        3.0.53 |        3.0.99 |   4.0.45 | dependencies           |
| `@auth/drizzle-adapter`                  |         1.4.2 |        1.11.3 |   1.11.3 | dependencies           |
| `@aws-sdk/client-s3`                     |       3.995.0 |      3.1116.0 | 3.1116.0 | dependencies           |
| `@notionhq/client`                       |         5.6.0 |        5.26.0 |   5.26.0 | dependencies           |
| `@playwright/test`                       |        1.60.0 |        1.60.0 |   1.62.1 | devDependencies        |
| `@radix-ui/react-accordion`              |        1.2.12 |        1.2.20 |   1.2.20 | dependencies           |
| `@radix-ui/react-checkbox`               |         1.3.3 |        1.3.11 |   1.3.11 | dependencies           |
| `@radix-ui/react-dialog`                 |        1.1.15 |        1.1.23 |   1.1.23 | dependencies           |
| `@radix-ui/react-popover`                |        1.1.19 |        1.1.23 |   1.1.23 | dependencies           |
| `@radix-ui/react-select`                 |         2.2.6 |         2.3.7 |    2.3.7 | dependencies           |
| `@radix-ui/react-separator`              |         1.1.8 |        1.1.15 |   1.1.15 | dependencies           |
| `@radix-ui/react-slot`                   |         1.2.4 |         1.3.3 |    1.3.3 | dependencies           |
| `@radix-ui/react-switch`                 |         1.2.6 |         1.3.7 |    1.3.7 | dependencies           |
| `@radix-ui/react-tooltip`                |         1.2.8 |        1.2.16 |   1.2.16 | dependencies           |
| `@tailwindcss/typography`                |        0.5.19 |        0.5.20 |   0.5.20 | devDependencies        |
| `@tanstack/query-core`                   |       5.90.16 |       5.90.16 |  5.101.4 | resolutionDependencies |
| `@tanstack/query-sync-storage-persister` |       5.90.18 |       5.90.18 |  5.101.4 | dependencies           |
| `@tanstack/react-query`                  |       5.90.16 |       5.90.16 |  5.101.4 | dependencies           |
| `@tanstack/react-query-persist-client`   |       5.90.18 |       5.90.18 |  5.101.4 | dependencies           |
| `@trivago/prettier-plugin-sort-imports`  |         4.3.0 |         4.3.0 |    6.0.2 | devDependencies        |
| `@trpc/client`                           | 11.0.0-rc.502 |       11.18.0 |  11.18.0 | dependencies           |
| `@trpc/react-query`                      | 11.0.0-rc.502 |       11.18.0 |  11.18.0 | dependencies           |
| `@trpc/server`                           | 11.0.0-rc.502 |       11.18.0 |  11.18.0 | dependencies           |
| `@types/node`                            |       24.13.3 |       24.13.3 |   26.2.0 | devDependencies        |
| `@types/react`                           |        19.2.7 |       19.2.18 |  19.2.18 | devDependencies        |
| `@types/react-dom`                       |        19.2.3 |        19.2.4 |   19.2.4 | devDependencies        |
| `@typescript-eslint/eslint-plugin`       |        8.52.0 |        8.52.0 |   8.67.0 | resolutionDependencies |
| `@typescript-eslint/parser`              |        8.52.0 |        8.52.0 |   8.67.0 | resolutionDependencies |
| `@typescript-eslint/project-service`     |        8.52.0 |        8.52.0 |   8.67.0 | resolutionDependencies |
| `@typescript-eslint/scope-manager`       |        8.52.0 |        8.52.0 |   8.67.0 | resolutionDependencies |
| `@typescript-eslint/tsconfig-utils`      |        8.52.0 |        8.52.0 |   8.67.0 | resolutionDependencies |
| `@typescript-eslint/type-utils`          |        8.52.0 |        8.52.0 |   8.67.0 | resolutionDependencies |
| `@typescript-eslint/types`               |        8.52.0 |        8.52.0 |   8.67.0 | resolutionDependencies |
| `@typescript-eslint/typescript-estree`   |        8.52.0 |        8.52.0 |   8.67.0 | resolutionDependencies |
| `@typescript-eslint/utils`               |        8.52.0 |        8.52.0 |   8.67.0 | resolutionDependencies |
| `@typescript-eslint/visitor-keys`        |        8.52.0 |        8.52.0 |   8.67.0 | resolutionDependencies |
| `ai`                                     |       6.0.162 |       6.0.264 |   7.0.76 | dependencies           |
| `dotenv`                                 |        17.2.3 |        17.4.2 |   17.4.2 | devDependencies        |
| `drizzle-kit`                            |        0.21.4 |        0.21.4 |  0.31.10 | devDependencies        |
| `drizzle-orm`                            |       0.30.10 |       0.30.10 |   0.45.2 | dependencies           |
| `eslint`                                 |        9.39.5 |        9.39.5 |   10.9.0 | devDependencies        |
| `eslint-config-next`                     |        16.1.6 |        16.1.6 |   16.3.2 | devDependencies        |
| `framer-motion`                          |       12.24.7 |       12.43.0 |   13.1.1 | dependencies           |
| `geist`                                  |         1.3.1 |         1.7.2 |    1.7.2 | dependencies           |
| `googleapis`                             |       171.4.0 |       171.4.0 |  176.0.0 | devDependencies        |
| `lucide-react`                           |       0.575.0 |       0.575.0 |   1.33.0 | dependencies           |
| `next`                                   |        16.1.6 |        16.1.6 |   16.3.2 | dependencies           |
| `next-auth`                              | 5.0.0-beta.30 | 5.0.0-beta.32 |  4.24.15 | dependencies           |
| `nuqs`                                   |         2.8.6 |        2.10.0 |   2.10.0 | dependencies           |
| `p-queue`                                |         9.0.1 |         9.3.3 |    9.3.3 | dependencies           |
| `playwright`                             |        1.60.0 |        1.62.1 |   1.62.1 | devDependencies        |
| `postcss`                                |        8.4.47 |        8.5.26 |   8.5.26 | devDependencies        |
| `postgres`                               |         3.4.4 |         3.4.9 |    3.4.9 | dependencies           |
| `posthog-js`                             |       1.215.1 |      1.418.10 | 1.418.10 | dependencies           |
| `prettier`                               |         3.3.3 |         3.9.6 |    3.9.6 | devDependencies        |
| `prettier-plugin-tailwindcss`            |         0.6.6 |        0.6.14 |    0.8.1 | devDependencies        |
| `react`                                  |        19.2.4 |        19.2.8 |   19.2.8 | dependencies           |
| `react-dom`                              |        19.2.4 |        19.2.8 |   19.2.8 | dependencies           |
| `react-virtuoso`                         |        4.18.1 |       4.18.12 |  4.18.12 | dependencies           |
| `recharts`                               |        2.15.4 |        2.15.4 |   3.10.1 | dependencies           |
| `satori`                                 |        0.19.2 |        0.19.3 |   0.33.3 | devDependencies        |
| `sharp`                                  |        0.33.5 |        0.33.5 |   0.35.3 | dependencies           |
| `superjson`                              |         2.2.1 |         2.2.6 |    2.2.6 | dependencies           |
| `tailwind-merge`                         |         3.4.0 |         3.6.0 |    3.6.0 | dependencies           |
| `tailwindcss`                            |        3.4.11 |        3.4.19 |    4.3.3 | devDependencies        |
| `tailwindcss-intersect`                  |         2.1.0 |         2.2.0 |    2.2.0 | devDependencies        |
| `tailwindcss-motion`                     |         1.0.1 |         1.1.1 |    1.1.1 | devDependencies        |
| `tsx`                                    |        4.19.1 |       4.23.12 |  4.23.12 | devDependencies        |
| `typescript`                             |         5.6.2 |         5.9.3 |    7.0.2 | devDependencies        |
| `typescript-eslint`                      |        8.52.0 |        8.52.0 |   8.67.0 | resolutionDependencies |
| `typescript-eslint`                      |        8.52.0 |        8.52.0 |   8.67.0 | devDependencies        |
| `vite`                                   |         8.1.4 |         8.1.4 |    8.2.2 | resolutionDependencies |
| `vite`                                   |         8.1.4 |         8.1.4 |    8.2.2 | devDependencies        |
| `vitest`                                 |        4.1.10 |        4.1.11 |   4.1.11 | devDependencies        |
| `zod`                                    |         4.3.6 |         4.4.3 |    4.4.3 | dependencies           |
| `zustand`                                |        5.0.14 |        5.0.15 |   5.0.15 | dependencies           |

## Ambiguities

- "One declared Node 24 source" could mean one literal everywhere or one authority plus a local selector. The amended design treats `package.json` as the authority and `.nvmrc` as a checked mirror because local NVM selection needs a version file.
- "Yarn 1.22.22" could mean package metadata or exact executable enforcement. The repository does not enable Corepack where CI invokes Yarn, so documentation now promises Yarn 1.x and does not overstate exact enforcement.
- "Compatible supported line" conflicts with the newest ESLint release. Next 16.1.6 and its lint config accept ESLint 9; bundled plugins reject ESLint 10 peer ranges. The compatible final tree uses ESLint 9 and records its support notice.
- The clean-checkout owner for `next typegen` remains undecided between setup and verification. This task documents the prerequisite but does not redesign green-baseline workflows.

## Judgement calls and rationale

- Kept two Node representations, not two authorities. `package.json` drives CI and hosting; `.nvmrc` serves local NVM users; the cheap invariant fails CI if their majors differ.
- Pinned Next and its lint config to exact 16.1.6. Moving both to 16.3.2 would add a framework update unrelated to alignment.
- Pinned `typescript-eslint` at 8.52.0 because it preserves the prior typed preset behavior while allowing the repository-wide assertion rule to remain enabled. Broadly disabling the rule would have weakened policy.
- Applied type-aware lint to all covered JS and TS files instead of only `src`. This matches the old global typed-lint behavior and ensures `fix:last` targets scripts consistently. The direct `scripts/stacks-meadow-check.ts` lint verifies that path.
- Pinned Vite exactly to 8.1.4 because it was already the compatible resolved version. A multi-major direct range was too broad for an alignment task.
- Chose patch-only Dependabot groups. Routine minors and majors are manual, while explicit `version-update:*` ignore filters avoid suppressing eligible security updates.
- Added bounded smoke tests for the two riskier owner-review upgrades: environment loading through env-nextjs/Zod and TanStack persistence round-tripping.
- Kept Yarn 1 because no concrete blocker remains after dependency alignment.

Official references checked during implementation:

- `actions/setup-node@v4` documents `package.json` as a supported `node-version-file` and reads `engines.node`: https://github.com/actions/setup-node/blob/v4/docs/advanced-usage.md#node-version-file
- Vercel documents `package.json#engines.node` as its Node version override: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Next 16 documents flat config and direct ESLint CLI use: https://nextjs.org/docs/app/api-reference/config/eslint
- GitHub documents Dependabot grouping and version-update ignore filters: https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/optimizing-pr-creation-version-updates

## Files changed

- `.eslintrc.cjs`: removed the legacy ESLint configuration.
- `.github/dependabot.yml`: added patch-only weekly groups and security-safe version-update filters.
- `.github/workflows/refresh-home-og.yml` and `.github/workflows/stacks-safety-budget.yml`: read Node from `package.json` and verify the local mirror.
- `.node-version`: removed the duplicate local selector.
- `CLAUDE.md`, `README.md`, and `books-frontend-questions.md`: corrected active toolchain references.
- `docs/reviews/2026-08-21-toolchain-alignment.md`: records the work and review amendment.
- `eslint.config.mjs`: migrates to Next 16 flat config with global type-aware lint.
- `package.json` and `yarn.lock`: align packages, exact compatibility pins, scripts, and resolved tree.
- `scripts/check-node-version.mjs`: checks `.nvmrc` against the package engine.
- `tests/toolchain-compatibility.test.ts`: adds env-nextjs/Zod and React Query persistence smoke tests.
- `tsconfig.json`: removes the obsolete legacy ESLint include.

Integration conflict notes:

- `package.json` is likely to conflict with concurrent dependency or verification-script work. Preserve exact Next/lint pairing, Node 24 types, TanStack and Vite pins, TypeScript ESLint policy pin, and the Node invariant script when resolving.
- Workflow changes overlap green-baseline work only at Node setup and the invariant. Keep `node-version-file: package.json` and the check; do not reintroduce literal workflow versions.
- Green-baseline checks must generate Next types before standalone lint and TypeScript in a clean checkout.

## Automated checks

Baseline:

- `node --version`: passed, `v24.19.0`.
- `yarn --version`: passed, `1.22.22`.
- `yarn install --frozen-lockfile --non-interactive`: passed in 27.19 seconds with six peer warnings and one Yarn/Node deprecation warning.
- First `yarn lint` and `yarn tsc --noEmit`: each failed with eight static-image errors because ignored `next-env.d.ts` was absent.
- Reruns after the profile image was confirmed present: reproduced those failures, disproving the materialization-race hypothesis.
- `SKIP_ENV_VALIDATION=1 yarn next typegen`: passed; lint then passed with one existing warning and TypeScript passed.
- `yarn test`: 1,531 passed and 6 failed across 195 files.

Final:

- `yarn check:node-version`: passed, `Node version declarations agree on 24`.
- `yarn install --frozen-lockfile --non-interactive`: passed with the lockfile up to date and no peer warnings. Yarn still emitted `[DEP0169]`.
- `SKIP_ENV_VALIDATION=1 yarn next typegen`: passed in 0.41 seconds.
- `yarn lint`: passed in 15.64 seconds with the same one existing warning.
- `yarn eslint scripts/stacks-meadow-check.ts`: passed in 5.24 seconds. This directly verifies typed lint outside `src`.
- `yarn tsc --noEmit`: passed in 3.71 seconds.
- `yarn vitest run tests/toolchain-compatibility.test.ts`: 2 passed in 124 ms.
- `yarn test`: 1,533 passed and 6 failed across 196 files in 6.55 seconds. The same six baseline tests failed.
- `SKIP_ENV_VALIDATION=1 yarn next build`: compiled in 3.7 seconds and passed its TypeScript phase; page-data collection then failed for `/books/[bookId]` because Postgres returned `3D000`, database `chappyasel` does not exist.
- ESLint printed config for `scripts/stacks-meadow-check.ts`: `@typescript-eslint/no-unnecessary-type-assertion` was enabled at severity 2.
- Dependabot YAML parse and semantic checks: passed; the three groups are patch-only and every ignore uses explicit version-update filters.
- Package invariants: passed for Node `24.x`, Next/lint `16.1.6`, TypeScript ESLint `8.52.0`, React Query core `5.90.16`, and Vite `8.1.4`.
- Workflow Node-source check: passed; both Node-using workflows read `package.json` and run the drift invariant.
- `git diff --check`: passed.
- `yarn outdated --json`: returned its expected exit code 1 and listed the 76 deferred rows above.

## Manual review steps

1. Confirm the next Vercel deployment reports Node 24.x.
2. Review the first Dependabot run. Confirm Next and `eslint-config-next` share one patch-only pull request, other groups are patch-only, routine minors and majors stay manual, and security updates remain eligible.
3. In a fresh checkout, run `yarn install --frozen-lockfile`, `SKIP_ENV_VALIDATION=1 yarn next typegen`, `yarn lint`, `yarn eslint scripts/stacks-meadow-check.ts`, and `yarn tsc --noEmit` in that order.
4. Run `yarn build` where `GCS_SERVICE_ACCOUNT_KEY` and the populated database are available.
5. Have the environment and data-fetching owners review the env-nextjs and TanStack Query changes despite the focused smoke coverage.

## Potential regressions and edge cases

- `.nvmrc` and `package.json` can drift outside CI; the invariant catches drift when run locally or in either Node-using workflow.
- Editor ESLint integrations must support flat config. Older integrations that only read `.eslintrc.cjs` will stop showing diagnostics.
- Type-aware lint now covers scripts and other TS/JS files in the tsconfig. New violations outside `src` are intentional policy enforcement, not a disabled ruleset.
- Pinning TypeScript ESLint 8.52.0 defers fixes and features from later 8.x releases. Review an isolated upgrade before loosening the pin.
- `@t3-oss/env-nextjs` moves from 0.10.1 to 0.13.11. It is a pre-1.0 package, so owner review remains appropriate even though environment loading, lint, types, and build compilation pass.
- React Query moves from the prior resolved 5.56.2 line to 5.90.16, while persistence packages use 5.90.18. The peer range, one physical query core, type check, and persistence smoke pass, but data-fetching owners should still inspect behavior.
- Exact Vite 8.1.4 avoids a multi-major declaration but requires an explicit reviewed update for future patches.
- Exact Next and lint versions prevent accidental drift but require Dependabot or manual edits for every patch.
- Disabling only newly introduced React Compiler rules postpones checks that may reveal real React correctness or performance issues.
- The Node invariant currently parses only a major-only engine such as `24.x`. A future range syntax change must update the checker.

## Rollback notes

- Revert this amended commit to restore the prior package tree, legacy lint config, duplicate Node version files, workflows, and update policy.
- If rolling back dependencies only, restore `package.json` and `yarn.lock` together, then run the frozen install.
- If rolling back lint only, restore `.eslintrc.cjs`, ESLint 8, `eslint-config-next` 15, and direct `@typescript-eslint` packages as one unit.
- If removing the Node invariant, also decide which of `package.json` or `.nvmrc` remains authoritative and update workflow and README references together.
- If reverting either env-nextjs or TanStack packages, remove or adapt the matching focused smoke test in the same rollback.

## Recommended next steps

1. Assign `next typegen` to clean-worktree setup or the green verification workflow before lint and TypeScript.
2. Fix the six existing unit failures and one lint warning in their owning feature work.
3. Run the full build with private content credentials and the database available.
4. Review env-nextjs and TanStack Query behavior in their owning flows.
5. Move to ESLint 10 and a newer TypeScript ESLint line only after the Next lint plugin set supports them and the preserved policy passes.
6. Adopt React Compiler rules as a separate migration with product-code fixes and focused tests.
7. Review Dependabot patch pull requests, then schedule minors and migration-heavy families individually from the deferred inventory.

## pnpm 10 migration amendment, 2026-08-22

This amendment supersedes the original decision to keep Yarn 1. The earlier
Yarn commands and results above remain unchanged because they are evidence from
the original toolchain review.

### Outcome

The repository now pins pnpm `10.34.5` in `packageManager` and
`engines.pnpm`. On 2026-08-22, `10.34.5` was the current `latest-10` release.
Its package metadata supports Node `>=18.12`, which includes the repository's
Node 24 runtime. Vercel documents pnpm majors 6 through 10 as supported, so pnpm
11 is deliberately excluded.

`pnpm-lock.yaml` replaces `yarn.lock`. The lock was imported and finalized with
pnpm `10.34.5` under Node `v24.19.0`. `pnpm-workspace.yaml` keeps every former
resolution as an exact override, which makes the compatibility policy visible
without nesting package-manager settings inside `package.json`.
The migration also pins `@radix-ui/react-slot@1.2.4`, `zod@4.3.6`, and
`postcss@8.4.47` at their prior lockfile versions so pnpm import cannot bundle
unrelated range updates.

Package scripts now use pnpm for nested calls and direct local binaries in
place of `npx`. CI installs exact pnpm `10.34.5` with
`pnpm/action-setup@v4`, restores the pnpm cache through `setup-node`, installs
with `--frozen-lockfile`, and runs `pnpm verify`. Superset startup, current
developer and agent guidance, Playwright server startup, generator invocations,
and runtime help text use pnpm.

Superset workspaces now run `.superset/setup.sh` on creation. It selects the
`.nvmrc` runtime, enables Corepack, verifies the exact pnpm pin, copies missing
ignored environment files from the checked-out `main` worktree without printing
their contents, and performs a frozen install. `.superset/run.sh` repeats the
Node selection before starting development so setup-shell state does not need to
persist into the run terminal.

### Shortcuts and constraints

- No browser automation or visual inspection was run.
- No production build or route-budget check was run because the existing build
  path needs private content credentials and a populated database.
- No Vercel dashboard or other external service was changed.
- The stale homepage OG artifact was checked but not regenerated.
- Historical review, research, and worklog commands were not mechanically
  relabeled. Doing so would falsify which package manager produced those
  recorded results.

### Issues found

- pnpm initially attached Drizzle's esbuild `0.19.12` to Vite `8.1.4`, outside
  Vite's optional peer range. Exact `esbuild@0.27.7` is now a direct development
  dependency, and `pnpm list` confirms that Vite resolves that peer.
- pnpm's isolated layout exposed undeclared imports that Yarn's flat hoisting
  had masked. The repository imports `three-stdlib` at runtime,
  `meshoptimizer` in tests, and `google-auth-library` in a script. Their
  previously resolved versions, `2.36.1`, `1.1.1`, and `10.6.2`, are now direct
  declarations.
- pnpm 10 blocks dependency build scripts unless the repository records a
  policy. `esbuild` and `sharp` are allowed because their native tooling checks
  are required. `core-js` and `es5-ext` are denied because their postinstalls
  only emit optional project-support notices and do not prepare runtime files.
- Coordinator review caught two commands that retained an unnecessary argument
  separator. pnpm forwarded that separator to Next and the book-length script.
  Playwright now uses `pnpm start -p 3111`, and the documented book-length
  example uses `pnpm add-book-lengths --limit 5`.
- The old Superset config had no setup command. A new worktree therefore
  inherited the host's Node 25 and had no ignored environment files. `pnpm dev`
  reached Next but stopped during environment validation. The setup and run
  wrappers now select Node 24 and provision the missing local files.
- A live homepage request emitted a macOS loader warning because Sharp packages
  loaded libvips builds `1.0.4` and `1.2.4` in the same process. The route still
  returned HTTP 200. Dependency alignment is outside the setup-script change and
  remains an explicit pnpm follow-up rather than an asserted clean runtime.
- While the server remained live, two Next image-optimizer requests for
  OpenLibrary covers returned HTTP 500 because the upstream fetch failed TLS
  validation with `wrong version number`. This is separate from workspace
  bootstrap and remains unresolved.

### Ambiguities and judgement calls

- Lockfile version 9 can be produced by pnpm 9 or 10, so the lockfile alone does
  not enforce the exact major and patch. The exact `packageManager` and
  `engines.pnpm` fields handle repository drift. CI also installs the version
  explicitly. Vercel needs Corepack enabled to honor the exact pin.
- Direct declarations for the three hoisted imports and Vite's esbuild peer add
  package manifest entries, but they do not introduce new code to the resolved
  tree except esbuild `0.27.7`, which Vite requires. Leaving them transitive
  would make verification depend on accidental hoisting.
- The build-script allowlist uses package names rather than resolved versions so
  every exact or transitive esbuild and sharp copy can perform its package-owned
  install check after a lockfile update. It does not allow arbitrary scripts.
- Environment files are copied only when missing. This preserves deliberate
  workspace-specific overrides, but later credential rotation does not rewrite
  an existing workspace. Creating a new workspace picks up the current files.
- Setup locates the environment source through the worktree checked out on
  `refs/heads/main`, rather than a user-specific absolute path. It fails with a
  direct error if that worktree or nvm is unavailable.

### Files changed by this amendment

- Package manager and lock policy: `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, and removal of `yarn.lock`.
- CI and workspace startup: `.github/workflows/stacks-safety-budget.yml`,
  `.superset/config.json`, `.superset/setup.sh`, and `.superset/run.sh`.
- Current guidance and command policy: `README.md`, `CLAUDE.md`, `.gitignore`,
  `.claude/agents/backend-engineer.md`, `.claude/agents/database-engineer.md`,
  and `.claude/commands/ship.md`.
- Tooling commands and help text: `playwright.config.ts`,
  `scripts/add-book-lengths.ts`, `scripts/backfill-book-flags.ts`,
  `scripts/check-home-og-freshness.mjs`, `scripts/check-node-version.mjs`,
  `scripts/generate/home-og-local.mjs`, `scripts/stacks-meadow-check.ts`,
  `scripts/stacks-perch-check.ts`, the four active Takeout scripts, and
  `scripts/verify.mjs`.
- Current command references: `docs/insect-perch-inventory.md`,
  `docs/youtube-scoring-rollout.md`, two scene ADRs, and three scene source or
  test comments.
- Review records: this ledger and `2026-08-21-site-improvements.md`.

### Verification

All package-manager commands below ran with Node `v24.19.0` and pnpm
`10.34.5`:

- `pnpm install --frozen-lockfile` from an empty `node_modules`: passed with
  1,001 packages and only the allowed esbuild and sharp install scripts.
- `pnpm check:node-version`: passed; Node declarations agree on 24 and pnpm
  declarations agree on `10.34.5`.
- `pnpm verify`: passed `next typegen`, TypeScript, zero-warning ESLint, 206
  Vitest files with 1,808 tests, and 115,942 meadow assertions.
- `pnpm verify:artifacts`: failed only for the known stale homepage OG image or
  source fingerprint.
- `git diff --check main...HEAD`, `git diff --check`, and `git diff --check
main`: passed. Separate no-index checks cover the two new untracked pnpm
  files.
- `pnpm start -p 3111`: reached Next on port 3111 and stopped at the expected
  missing-local-environment validation, confirming that pnpm forwarded the port
  option correctly.
- Direct `.superset/setup.sh` execution in the combined worktree: passed, copied
  `.env`, `.env.local`, and `.env.development.local` by name, selected Node
  `v24.19.0` and pnpm `10.34.5`, and completed the frozen install.
- A disposable Superset workspace created from the complete working-tree
  snapshot: setup passed from an empty dependency tree with 1,002 packages, and
  `.superset/run.sh` reached Next's ready state on port 3001. The disposable
  workspace and its temporary verification branch were then deleted.
- The combined workspace's `.superset/run.sh` reached Next's ready state on port 3000. A homepage request returned HTTP 200; the request took 30 seconds and
  produced the duplicate-libvips warning recorded above.
- The active-reference `rg` audit found no package-manager Yarn command. The
  remaining nonhistorical matches are dependency engine metadata in
  `pnpm-lock.yaml` and a cloth-texture variable named `yarn` in `ModelProp.tsx`.
- A direct-dependency comparison confirmed that all 86 pre-existing direct
  dependencies keep their prior Yarn-locked versions.
- The scoped Prettier check still reports 14 changed files whose HEAD contents
  also fail the same check. Those pre-existing formatting differences were not
  rewritten as part of the migration.

### Rollback

Restore the pre-amendment `package.json` and `yarn.lock` together. Remove
`pnpm-lock.yaml` and `pnpm-workspace.yaml`, then revert CI, Superset, scripts,
and active documentation to the earlier commands in the same rollback. Remove
the four direct declarations added for pnpm's isolated layout only when Yarn's
lockfile and node_modules layout are restored.

### Next steps

1. An owner must set `ENABLE_EXPERIMENTAL_COREPACK=1` for Vercel Production,
   Preview, and Development. Leave the project Install Command unset.
2. Inspect the next Vercel build log and confirm Node 24 and pnpm `10.34.5`
   before merging or promoting the deployment.
3. Review the first Dependabot pnpm lockfile update for override and build-script
   policy preservation.
4. Refresh the homepage OG artifact only in the authorized browser-backed,
   credentialed workflow already recorded by the combined review.
5. Align the Sharp/libvips dependency family and repeat the live homepage
   request before treating the pnpm runtime as warning-free.
6. Reproduce the OpenLibrary image-proxy TLS failures outside Next, then inspect
   local proxy configuration and Node 24 fetch behavior before changing image
   handling.

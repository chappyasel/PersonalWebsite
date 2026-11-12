# Slice 3 report: plan editing and set points

Branch `weight-log-plan-editing`, cut from `5fe9e9f6` (the head of PR #144), pushed to origin. Draft PR: https://github.com/chappyasel/PersonalWebsite/pull/146, based on `worktree-agent-a772e01a4518be175`. Its `Closes #139` line is on its own so you can edit it.

## Commits

- `599704d2` Plan Weight Log phase starts, rate changes, and end moves. Pure planners and the invariant checker, with tests.
- `15f04506` Add plan and set point mutations to the Weight Log router.
- `d5c5dbdb` Add plan and set point controls to /weight-log/edit, and the docs.
- `a8b79278` Name the latest weighed-in week when a shorter plan is refused.
- `2d9d1051` Keep the start form's result through the refetch. Opening the form resets its start Monday, and the confirmation copy is plainer.
- `69b5495d` Merge the cutover branch at `0635835b` (fix-c).
- `bd65cab2` Merge the cutover branch at `71e83947`, which carries main with #141, #142 and #143. Someone else made this commit in the slice worktree at 15:32, without a Co-Authored-By line. It merged cleanly, and I kept it. Head of the branch.

ParaDev page: https://app.superset.sh/page/weight-log-slice-3-ui-check-vzmvxu (`just_me`, version 1). Its source is `.slice3-check/ui-check-3/` in the slice worktree, which is gitignored. I did not open it in the sidebar, so it won't move your panes.

## What changed

1. **Planners** (`src/lib/weight-log/plan-edits.ts`, new). Three pure functions take the plan as it stands (phases, planned weeks, and the set of weeks with weigh-ins) and return a `PlanEdit`: weeks to delete, phases to delete, phase ends to set, a new phase, and weeks to write. They throw `PlanEditError` with a plain message and a code of `BAD_REQUEST`, `NOT_FOUND`, or `CONFLICT`.
   - `planStartPhase` validates Mondays, order, and a plan of at most 156 weeks. It refuses a start before the current phase's start, and refuses with `CONFLICT` when the page's current phase is no longer the latest one. Each new week gets target = original target = start + i × rate. Every planned week on or after the new start, in any phase, is replaced by the new plan or deleted if it falls past the new plan's last week (review finding 5). Weigh-ins are never touched. If a week with weigh-ins on or after the start would fall past the new plan's end, the start is refused: "The plan has to run through the week of X, which has weigh-ins." The current phase ends the Sunday before the start (decision 9). A start on the current phase's own Monday replaces that phase.
   - `planRateChange` sets one week's lb/wk by moving its target to the previous week's target plus the rate, and shifts every later target in that phase by the same amount (decision 11). Original targets do not change (decision 12).
   - `planEndMove` moves the running phase's last week. A later end adds weeks at the last rate with no original target (decision 12). An earlier end deletes weeks from the end, and **refuses** if any removed week has weigh-ins, naming the latest such week: "The week of X has weigh-ins, so the plan can't end before it." Only the running phase's end can move.
   - `planViolations` lists every broken rule in a plan: non-Monday starts, bad ends, a running phase before another phase, overlapping phases, a week planned twice, a week with no phase, and a week outside its phase. Tests run it after every edit.
2. **Router** (`src/server/api/routers/weightLog.ts`). New procedures, all on `ownerProcedure`: `startPhase`, `changeRate`, `moveEnd`, `setPoints` (query), and `saveSetPoints`. Inputs are checked with zod first: Mondays, phase ids, targets rounded to 0.1 lb, rates within ±10 lb/wk rounded to 0.01. Each plan mutation runs in one transaction. It takes a transaction-scoped advisory lock, reads phases, planned weeks, and weigh-in dates, runs the planner, and writes in a fixed order: deletes, phase ends, the new phase, then an upsert of the weeks. `saveSetPoints` replaces the whole list (at most 10) in one transaction. `phases` also returns `runningId`.
3. **Editor** (`src/app/weight-log/edit/PlanEditor.tsx`, new; rendered by `WeightLogEditor.tsx` under Weeks). Two collapsible sections in the editor's existing style.
   - **Plan** shows the running phase's name and length, then three forms. Weekly rate: pick a week, type lb/wk, and a line says how far later targets move. Length: type a week count, and a line says how many weeks it adds at which rate, or removes, and the new end. Start a phase: kind, start Monday, starting target, lb/wk, and weeks, with a preview of the new phase's name and end. The first tap on Start shows what happens to the current phase. A second, red "Start phase" button writes it. Changing any field drops the confirmation.
   - **Set points** shows one input per set point with a remove button, Add (up to 10), Save set points, and Cancel.
   - Server refusals show their message. Validation errors from zod show a short fallback instead of the raw dump.
4. **Merge of fix-c.** The conflicts were import lists and the editor test's `useUtils` mock. Fix-c's behavior is kept: drafts clear only when they match what was sent, and weigh-in saves and deletes invalidate both `week` and `weekTable`. Plan edits invalidate `phases` and `weekTable`, which hold the targets and phases. They don't invalidate `week`, because that query reads only weigh-ins, which a plan edit never writes. Set point saves invalidate `setPoints`. One fix-c test queried `getByRole("status")` across the whole page and now found my Plan section's status line too. I scoped it to the weigh-in form.
5. **Docs** (`docs/weight-log.md`). The owner page section now describes plan editing, starting a phase, original targets, set points, and where the math lives.

## Verified, and how

- `plan-edits.test.ts`, 22 tests on invented numbers. They cover rate math and its composition, rates on ended phases, extending and shortening, refusals (including the named latest weighed-in week), starts that trim, move (finding 5), and replace, a retroactive start, `CONFLICT` on a stale page, and an empty log. A seeded random run applies 1,000 edits, each kind more than 50 times, and checks after every one that `planViolations` is empty, that original targets stay put while a week stays in its phase, and that added weeks have no original target.
- `weightLog.plan.test.ts`, 9 tests against drizzle's proxy driver with a recording database. They pin the exact statement sequence of a start inside one transaction with the lock, check that nothing writes to `weight_log_weigh_ins`, check the parameters of each write, check rollback on refusal, check that a non-Monday start is refused before any query runs, and cover set point reads, replaces, clears, and bad input.
- `PlanEditor.test.tsx`, 9 tests in jsdom. They cover the rate preview and call, a server refusal shown as written, a zod dump hidden, length previews and limits, the start confirmation and its payload, the "Started" line surviving the refetch, the confirmation dropping on a change, and set point editing and clearing.
- After the merge, the weight-log, router, and import suites pass: 31 files, 202 tests, 1 skipped.
- `heavy -- pnpm verify` at `bd65cab2`: typegen, tsc, eslint, artwork, search index, and meadow pass. Vitest passed 6,375 tests and failed 1: `tests/superset-setup.test.ts` timed out at 5 s under load and passes on its own (6/6). The `/meet` tests pass now that main's fix is in. At `69b5495d` the gate had also failed on my gitignored `.slice3-check/live-check.test.ts`. It failed before any database call, and I renamed it to `live-check.ts.off` so vitest skips it.
- **Live check** on a Neon child branch of `weight-log-import-test` that I created, with the host checked before every command (never `ep-winter-base-akkl2xak` or `ep-proud-union-akswp9yx`). I called the real router with real SQL:
  - A rate change shifted all 37 later weeks by the same amount, left their original targets alone, and left earlier weeks alone. Then I restored it.
  - Extending by 3 weeks added weeks at the last rate with no original target. Shortening back removed them. Shortening past a weighed-in week was refused and named Nov 2, 2026.
  - A retroactive start on a Monday that has weigh-ins (2026-11-02) ended the old phase on 2026-11-01. That week moved into the new phase with original target equal to target, and the old phase kept no rows on or after the start.
  - Two starts at once: one succeeded and one got `CONFLICT`.
  - Set points saved, changed, and restored.
  - After every step, `planViolations` was empty, SQL found no overlapping phases and no week outside its phase, and a fingerprint of `weight_log_weigh_ins` was unchanged.
  - Each mutation took about 1.5 s from here (us-west-2).
- **UI check**: `next dev` on port 3013 against a fresh child branch with a synthetic `OWNER_EMAIL` and a temporary user and session row. Headless Chromium at 390 and 1280 px, light and dark. I also started a phase through the page. None of the 16 screenshots has sideways scroll. They are on the ParaDev page above.
- **Cleanup**: the dev server is stopped, the child branch `weight-log-slice3-check` is deleted (with its temporary user and session rows), and the scratchpad files holding its URL and the session token are deleted.

## Shortcuts

- The router tests use drizzle's proxy driver, so they check the SQL text and parameters but never run it. The live check above is what ran it against Postgres. There's no committed test that runs against a real database.
- The live check script and the screenshot script live in the gitignored `.slice3-check/` folder and are not committed. Each UI run that starts a phase needs a fresh child branch.

## Issues

- A non-Monday date sent straight to the API fails zod, so the page would show the fallback "didn't save" text instead of "Pick a Monday." The page only offers Mondays, so the owner can't reach this.
- The console shows "Select is changing from uncontrolled to controlled" from the existing Weeks phase picker in `WeightLogEditor.tsx` (`value={shownPhaseId ?? undefined}`). It predates this slice, and I didn't change it.
- The rate field shows 2 decimals. A week whose rate is not a whole hundredth, such as 0.3333 from imported targets, shows rounded, and saving it unchanged is disabled, so nothing moves by accident. Typing the shown value back writes the rounded rate.
- The dev server logs `ERR_UNSAFE_PORT` console errors because I pointed PostHog at a dead local port. Nothing in the app is wrong.

## Ambiguities

- Decision 9 says a start deletes the current phase's later planned weeks "that have no weigh-ins." Finding 5 says weeks with weigh-ins on or after the start move into the new phase. I followed finding 5: every planned week on or after the start becomes a week of the new plan, and the weigh-in exception only matters for weeks before the start, which are never touched.
- The brief allowed removing weeks to either refuse or stop at weighed-in weeks. I chose refuse, and the message names the latest weighed-in week so the owner knows the shortest allowed length.

## Judgment calls

- Shortening a plan past a week with weigh-ins is refused, not cut short at that week. Owner to confirm.
- A week that moves into a new phase takes the new plan's target as both its target and its original target, even if the old phase had another original target. Owner to confirm.
- A start on the current phase's own Monday replaces that phase, and the confirmation says so. Owner to confirm.
- A new plan must run through every week with weigh-ins on or after its start. Otherwise the start is refused. Owner to confirm.
- Only the running phase's end can move. An ended phase's end moves only by starting a phase. Owner to confirm.
- The API allows rate changes on ended phases, since their targets are still shown and compared, but the page only offers the running phase's weeks. Owner to confirm.
- A phase's starting target has no direct edit. It is set when the phase starts, and later weeks move through their rates. Owner to confirm.
- Set points save as one whole list of at most 10, in the order shown. Owner to confirm.
- The start picker offers Mondays from the later of the current phase's start and 12 weeks back, through 26 weeks ahead. The default is next Monday. Owner to confirm.
- Targets are stored to 6 decimals so rate shifts don't drift, and rates are entered to 2 decimals. Starting targets and set points round to 0.1 lb. Owner to confirm.
- Concurrent edits are serialized with one advisory lock, and a start also checks that the page's current phase is still current. Owner to confirm.

## Next steps

- The owner reviews the ParaDev page and the judgment calls above.
- Deep review (Codex, then a fresh Claude reviewer), since this slice writes to the database.
- Retarget the PR at `main` once PR #144 merges, and decide whether it closes #139.
- If the owner wants a direct starting-target edit or a way to move an ended phase's end, add them as planners with the same invariant tests.

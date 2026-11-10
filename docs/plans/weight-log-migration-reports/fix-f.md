# Fix-f report: Codex findings on slice 3 (plan editing)

Branch `weight-log-plan-editing` in `/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/slice3-plan-editing`, draft PR #146. I did not retarget the PR.

## Commits

- `3c21940a` Take the plan lock before the import locks any table (finding 5).
- `b609bed6` Check set points and targets after rounding them (finding 6).
- `7c8b06fe` Refuse plan and set point edits made from a page that is out of date (findings 1, 2, 3, and 4).
- `303a1f87` Describe stale-edit refusals and the import's plan lock in the Weight Log doc.
- `4f49a68c` Don't call our own phase start another tab's change. This fixes a regression in `7c8b06fe` that I caught while reviewing it.
- `040e6bc1` Merge `origin/main` (`44c9112d`, the #144 squash). Every file that conflicted was add/add, and main's tree is identical to the cutover head `71e83947` that this branch had already merged, so each conflict resolved to this branch's side. Against main, the PR now changes only the 12 slice 3 files.

## What changed

1. **Plan revision (findings 1 and 2, server side).** `planRevision` in `src/lib/weight-log/plan-edits.ts` hashes every phase (id, kind, start, end) and every planned week (week, phase, target, original target) into a 16-hex-digit string. It ignores row order and weigh-ins. `weightLog.phases` and `weightLog.weekTable` return it, each computed from the same rows that built its response. `startPhase`, `changeRate`, and `moveEnd` now require `revision`. `editPlan` compares it with the plan it reads under the advisory lock and refuses with `CONFLICT`: "The plan changed since this page loaded it. Check it and try again." `changeRate` also takes `phaseId`, and `planRateChange` refuses with the same message when the week now belongs to another phase.
2. **Start confirmation (finding 2, page side).** The confirmation records the current phase id and revision it showed. If a refetch changes either, the red "Start phase" button goes away and the status line reads "The plan changed while you were confirming. Check the details and tap Start again." The next tap shows the new phase's confirmation. The mutation sends the recorded id and revision, so the server check covers this case too. After a successful start, the form drops its confirmation right away and waits for the refetch (`4f49a68c`). Before that fix, our own new revision briefly showed the "plan changed" line.
3. **Rate form fallback (finding 3).** The selected week is now a choice that can lapse. When the chosen week is gone, the form falls back to the first week on or after this week, or else the last week. A typed rate belongs to the week it was typed for and is dropped when that week goes. A one-week plan that grows now shows the controls.
4. **Set points (finding 4).** `saveSetPoints` takes `PLAN_LOCK`, reads the list, and refuses with `CONFLICT` unless it equals `previous`, the list the page's draft started from: "The set points changed since this page loaded them. Cancel to see them, then edit again." The draft keeps its base list across refetches.
5. **Import (finding 5).** A real import runs `pg_advisory_xact_lock(PLAN_LOCK)` before `LOCK TABLE weight_log_weigh_ins IN EXCLUSIVE MODE`. `PLAN_LOCK` now lives in `plan-edits.ts`, and the router and importer share it. `--dry-run` is still read-only and takes no lock. Fix-c's test still checks that the table lock comes before the weigh-in read and delete. Its position assertion moved from 0 to 1, and a new test pins the advisory lock at position 0.
6. **Rounding (finding 6).** `tenthsOfAPound(max)` rounds and then checks `positive().max(max)`. Set points, starting targets, and weigh-in pounds all use it, so 0.01 and 0.04 are refused.
7. **Refusals refetch.** A `CONFLICT` from any plan form invalidates `phases` and `weekTable`. From the set points form, it invalidates `setPoints`.
8. **Docs.** `docs/weight-log.md` covers the stale-edit refusals, the confirmation lapsing, the rate form fallback, the set point check, the rounding order, and the import's plan lock.

## Verified, and how

- **Tests written first.** I wrote every new test before the fix and ran it red on the unfixed code:
  - `plan-edits.test.ts`: an in-memory reproduction of finding 1 that expects `CONFLICT`, plus two `planRevision` tests (order and weigh-ins don't count, and each field changes the hash).
  - `weightLog.plan.test.ts`: a rate change on a week now in another phase, all three plan edits refused against an older revision with nothing written, `phases`/`weekTable` returning the revision the edits check, set points saved under the lock with the expected statement order, a stale set point save refused with nothing written, and 0.01 / 0.04 refused.
  - `import-database.test.ts`: the plan lock comes first, and the dry run takes no advisory lock.
  - `PlanEditor.test.tsx` (jsdom, refetches driven with `rerender`): a `CONFLICT` refetches; a one-week plan that grows shows the week picker; shrinking past the chosen week falls back and drops the draft; an armed confirmation lapses when another tab starts a phase on that Monday, and the next confirmation sends the new id and revision; it also lapses on a revision change alone; set point `CONFLICT`; a draft keeps its base list through a refetch; and our own start never shows the "plan changed" line (red without `4f49a68c`'s guard, green with it).
  - All numbers are invented.
- **Real locking on a Neon child branch.** I created a child of `weight-log-import-test` with the command in the brief (branch id only in the output) and kept the URL in a mode-600 scratchpad file. The script refused any host other than the child's endpoint, any `-pooler` host, and both forbidden endpoints, and it printed only dates, counts, codes, and booleans. The script is the gitignored `.fixf-check/live.ts.off` in the slice worktree. Each run got a fresh child, because the finding 5 check replaces the data.
  - Before the fix:
    - **Finding 1.** Another connection held the plan lock while a start on 2026-09-07 and a stale rate save for 2026-09-14 queued behind it. Both succeeded, and the new phase's week no longer matched its original target. The stale save had moved the new phase's targets.
    - **Finding 4.** In 5 rounds of two concurrent set point saves, every round hit `duplicate key value violates unique constraint "weight_log_set_points_pkey"`.
    - **Finding 5.** The holder took the plan lock and the running phase's row, then the import started. The import took the weigh-in EXCLUSIVE lock and waited on the holder's transaction. The holder's planned-week write then failed with `40P01` (deadlock detected).
  - After the fix, on a fresh child:
    - **Finding 1.** The start succeeded. The stale rate save got `CONFLICT` and the new phase's targets were intact. `planViolations` was empty.
    - **Finding 4.** 0 primary key collisions. 7 saves and 3 conflicts across 5 rounds. In two rounds, the first save wrote the list that was already stored, so the second save's base still matched and it saved too. That is the intended behavior.
    - **Finding 5.** The import waited on the advisory lock and held no lock on `weight_log_weigh_ins`. The holder's week write succeeded, it committed, and then the import completed.
  - Both child branches are deleted, along with the scratchpad files that held their URL and the logs.
- **Gate.** `heavy -- pnpm verify` before the merge (at `303a1f87` plus the uncommitted landing change) passed typegen, tsc, vitest (721 files, 6,391 tests), artwork, search index, and meadow. ESLint failed on one `no-empty-function` in my uncommitted test, which I fixed before `4f49a68c`. The result of the final run on the merged head `040e6bc1` is below.

Filled in by the lead: `heavy -- pnpm verify` on `040e6bc1` passed every step (typegen, tsc, eslint, vitest with 721 files and 6,391 tests, artwork, search index, meadow), exit 0 on Portable after 2m18s.

## Shortcuts

- I did not split commit `7c8b06fe` by finding. The API now requires `revision` and `phaseId`, and the page has to send them in the same commit for the branch to type-check. I split out findings 5 and 6 by staging partial files.
- The live-check script is not committed. It sits gitignored in the slice worktree as `live.ts.off`, so vitest skips it.
- I did not rerun the 390 px and 1280 px screenshots. The only visible changes are one new status line in Start a phase, which wraps like the existing status lines, and the rate form showing where it used to show a sentence.

## Issues

- The revision covers the whole plan, not one phase. An edit to any phase in another tab makes every open draft stale, and its next save is refused once and then refetched. With one owner this is rare. It is the safe direction: a refusal never writes.
- `loadWeekRecords` reads phases and planned weeks on separate connections. If an edit lands between the two reads, the page gets a revision for a mix that matches no stored state, and the next edit gets one `CONFLICT` and a refetch. It can never accept a stale edit, because the revision describes exactly the rows the page shows.
- After the set point `CONFLICT`, the owner has to tap Cancel to load the other tab's list. Their typed edits are lost at that point.

## Ambiguities

- The brief allowed "a plan revision (or an equivalent fingerprint of the phase's rows)." I chose a whole-plan revision plus the phase id. A per-phase fingerprint would not have caught finding 2's case, where B's phase is new.
- For finding 4, the "revision" is the list itself (`previous`), compared exactly. A separate revision string would have changed the `setPoints` output that other code reads.

## Judgment calls

- Weigh-ins are left out of the revision, so recording a weigh-in never makes an open plan draft stale. The server still re-reads weigh-ins under the lock for its refusals. Owner to confirm.
- A stale plan edit is refused and refetched, not merged or retried. The owner sees the new plan and saves again. Owner to confirm.
- When the rate form's week goes, it falls back to the first week on or after this week, or else the last, and drops the typed rate instead of carrying it over. Owner to confirm.
- The lapsed-confirmation copy is "The plan changed while you were confirming. Check the details and tap Start again." The set point refusal tells the owner to Cancel. Owner to confirm both.
- Weigh-in pounds also validate after rounding. Before, 0.01 reached the table's check and failed as a server error. That is outside the finding's set points scope, but it was the same helper. Owner to confirm.
- Set point saves share `PLAN_LOCK` with plan edits instead of taking a lock of their own, so the import's one advisory lock covers both. Owner to confirm.

## Next steps

- The lead retargets #146 at `main`.
- A fresh Claude reviewer, per the build wave, since this slice writes to the database.
- If the owner wants typed set points to survive a `CONFLICT`, add a "Use theirs and keep mine" path that rebases the draft onto the new list.

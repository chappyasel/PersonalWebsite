1. **P1: Stale edits can modify a different phase.** [weightLog.ts:301](/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/slice3-plan-editing/src/server/api/routers/weightLog.ts:301). Tab A edits a week in phase A; tab B starts phase B and takes ownership of that Monday. A’s rate save silently changes B’s targets because the payload identifies only `weekStart`. Same-phase length changes also lack stale-write detection. **Fix:** capture a plan revision with each draft and compare it under the advisory lock; include the expected phase ID.

2. **P1: Refetch can retarget an armed destructive confirmation.** [PlanEditor.tsx:525](/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/slice3-plan-editing/src/app/weight-log/edit/PlanEditor.tsx:525). While A is confirming a phase start, B starts another phase on that Monday. A’s background refetch updates `current`, preserves `confirming`, and submits B’s ID. The server accepts replacement of B’s phase and original targets. **Fix:** bind confirmation to the captured phase ID/revision and payload; invalidate it when those change.

3. **P2: Rate controls disappear after valid length changes.** [PlanEditor.tsx:251](/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/slice3-plan-editing/src/app/weight-log/edit/PlanEditor.tsx:251). Extending an initially one-week plan leaves the selection empty. Shortening past the selected week leaves it invalid. Both hide the selector despite editable weeks existing. **Fix:** select a valid fallback when rows change and clear the displaced draft.

4. **P2: Concurrent set-point saves can fail on the primary key.** [weightLog.ts:340](/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/slice3-plan-editing/src/server/api/routers/weightLog.ts:340). Two replacement transactions can delete against the old list, then collide inserting the same positions. Transaction wrapping alone does not serialize this operation. **Fix:** acquire a shared advisory lock before deletion and check a captured revision.

5. **P2: Import and phase start can deadlock.** [import-database.ts:102](/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/slice3-plan-editing/scripts/weight-log/import-database.ts:102), [weightLog.ts:117](/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/slice3-plan-editing/src/server/api/routers/weightLog.ts:117). Import can hold planned-week row locks while phase start holds the old phase row lock. Each then waits for the other’s rows. The importer’s weigh-in lock permits the editor’s reads. **Fix:** acquire the shared plan advisory lock before the importer’s table lock.

6. **P3: Rounding bypasses positive set-point validation.** [weightLog.ts:62](/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/slice3-plan-editing/src/server/api/routers/weightLog.ts:62). A direct API request with `0.01` passes positivity, rounds to zero, and persists through `saveSetPoints`. **Fix:** validate positivity after rounding.

Checked the requested ranges and merge resolution. Sound findings:

- Every reviewed procedure uses `ownerProcedure`; editor data access uses `api.weightLog.*`.
- Plan writes never modify weigh-ins. Refusals occur before writes; transaction failures roll back.
- Ordinary planner operations preserve phase boundaries, shift later targets consistently, preserve existing originals, and give extensions no original target.
- Monday, duration, rate, target, NaN, and infinity checks hold apart from the rounding issue above.

The randomized test uses sequential state; the SQL proxy cannot exercise locking or database constraints. UI tests miss the affected refetch transitions. Synthetic in-memory checks reproduced finding 1 while `planViolations` still returned no violations.

No files changed, database/network operations performed, or browser checks run.
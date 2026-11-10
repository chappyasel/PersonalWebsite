# Fix C: Codex findings on the cutover PR (#144)

Worktree `/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/agent-a772e01a4518be175`, branch `worktree-agent-a772e01a4518be175`, which is PR #144's head. Started at `5fe9e9f6`, pushed to `b16764ab`.

## Commits

1. `4ab4bed5` Lock out weigh-in saves while the import replaces the tables (finding 1)
2. `900d2c9e` Keep a draft typed on another date when a save or delete lands (finding 3)
3. `642de50c` Read the editor's week grid by calendar week, not by phase (finding 2)
4. `b16764ab` List import-database.ts among the cutover scripts to delete

## Finding 1: the import's check and delete could lose a save

Confirmed. `checkExisting()` read the weigh-ins in a READ COMMITTED transaction with no lock, so a save committed between that read and `--replace`'s delete was deleted and the workbook value restored.

The change:

- The transaction moved out of `scripts/weight-log/import.ts` into `scripts/weight-log/import-database.ts` (`writeImport(db, plan, options)`), so a test can see the order of statements. `import.ts` keeps argument parsing, the host check, and the output.
- A real run's first statement is `LOCK TABLE weight_log_weigh_ins IN EXCLUSIVE MODE`. EXCLUSIVE blocks INSERT, UPDATE, and DELETE from other sessions and allows SELECT, so the public page keeps reading. The lock lasts until commit, so the check, the delete, and the inserts all run with no write in between. A save from `/weight-log/edit` during the import waits, then lands on top of the imported rows.
- The dry run is unchanged: a read-only transaction with no lock. Postgres refuses EXCLUSIVE inside a read-only transaction, and the dry run deletes nothing, so it has nothing to protect.
- `docs/weight-log.md` ("Importing the workbook") and the header comment in `import.ts` say so.

Verified:

- `scripts/weight-log/import-database.test.ts` (synthetic plan, recording proxy database) failed before the lock line existed (`expected -1 to be +0`) and passes now. It checks that the lock is statement 0, before the weigh-in read and the delete, and that the dry run is `{ accessMode: "read only" }` with no lock and no writes.
- Live race on a Neon child branch `weight-log-fixc-check` (parent `weight-log-import-test`, host `ep-mute-boat-akiapjbo`, checked before each command). The script emptied the child's Weight Log tables, seeded two invented weigh-ins through `writeImport`, then ran `--replace` with a second connection saving an invented correction just before the first delete, while the import waited 2 seconds. It ran the pre-fix function (a scratch copy with only the lock line removed) and then the fixed one:
  - Without the lock, the save committed before the delete, and afterwards the date held the workbook value. The save was lost.
  - With the lock, the save had not settled when the delete ran. It landed about 4 seconds in, after the import committed, and the date held the owner's value.
  - The dry run against the same branch passed in its read-only transaction.
- The child branch is deleted (`neonctl branches list` no longer shows it).

## Finding 2: a weigh-in before the first phase could not be removed

Confirmed. The grid fetched its week through `weekTable` for the phase that held it. A date before the first phase had no phase, so the query stayed disabled, the field showed empty, and no Delete appeared. The weekly table puts that week under `"unassigned"`, which the picker cannot select.

I took the reviewer's route: a new `weightLog.week` query on `ownerProcedure` reads the seven days of one calendar week by date (`date >= Monday and date <= Sunday`) and returns `weights` and `excludedDays` in the shape the grid already used. It refuses a day that is not a Monday. The grid uses it for every week, and a save or delete invalidates both `week` and `weekTable`.

I chose it over refusing early dates because refusing only stops new pre-phase entries. A weigh-in already outside every phase would stay unreachable. That covers any such row the import brings in, and any row a later change to phase dates orphans. The calendar query makes every saved weigh-in reachable by typing its date, and it touches neither the import nor the phase rules. It costs one query per week moved. Before, the grid shared the table's cached phase query when both showed the same phase.

Verified:

- New router tests: the query returns a pre-phase week's days and excluded flag, with the exact SQL and the Monday-to-Sunday parameters, and it refuses a Wednesday without querying. Both failed first: the procedure did not exist.
- New editor test: typing a date before the first phase shows its weigh-in, offers Replace and Delete, and the Delete sends that date. It failed first (`expected '' to be '99.5'`).
- The editor test's `weekTable` mock now behaves as React Query does: it returns no data while disabled or for an unknown phase. The old mock returned every row for any input, which is why the existing tests missed this.
- `weightLogOwnerOnly.test.ts` and `ownerDataBoundary.test.ts` pass with the new procedure. On the running dev server, `weightLog.week` answers a signed-out request with 401, and `/weight-log/edit` returns 200.
- `docs/weight-log.md` ("Owner page") describes the calendar-week grid.

## Finding 3: a late completion erased the next date's draft

Confirmed and reproduced in tests first. Saving date A, moving to B, and typing B's weight lost B's input when A's request finished, because the completion ran `setDraft(null)`. A delete had the same problem, and its completion also closed a Delete confirmation the owner had opened on B.

The change, in `WeightLogEditor.tsx`:

- The hook-level `onSuccess` handlers only refetch. Each `mutate` call carries the draft it sent, and its own `onSuccess` clears the draft only if that draft object is still the current one (`setDraft(current => current === sent ? null : current)`). React Query awaits the hook-level handler before it calls the per-call one (`@tanstack/query-core` `Mutation.execute`), so the saved value still replaces the draft with no blank frame.
- The confirmation state is now the date being confirmed, not a boolean, and a delete's completion closes only its own date's confirmation.

I kept editing and navigation enabled while a request runs. The other option, disabling them, would take focus out of the field mid-entry on a phone for every save.

Verified: three editor tests settle a request by hand after the owner moves on. Save then type on another date keeps the typed value. Delete then type and open Delete on another date keeps both. A save on the date still shown clears the draft and shows the saved value with "Saved ... for Jan 9." The first two failed before the fix (`expected '100.0' to be '99.6'` and `expected '100.4' to be '99.0'`). All synthetic.

## Gate

`heavy -- pnpm verify` ran on Portable: typegen, tsc, and eslint passed. Vitest ran 717 files and 6332 tests with 4 failures, all in `src/app/meet/MeetBooking.test.tsx`, the known failure fixed on another PR. Verify stops after vitest, so I ran `heavy -- pnpm check:meadow` separately, and it reported 0 failures.

## Shortcuts

- The live race exercised `writeImport`, the function `import.ts` calls, with an invented plan. It did not run the full script, which needs a workbook export and the history file. The red run used a scratch copy of the function with the lock line removed, not the old commit.
- I did not drive the editor in a browser. The dev server needs an owner sign-in. The editor changes are covered by unit tests only.

## Issues

- `neonctl branches create` printed the child branch's connection string, password included, into my tool output. The branch is deleted, so that credential no longer works. A future check should pipe that command's output through a filter.
- `src/app/weight-log/edit/ownerDataBoundary.test.ts` fails `prettier --check` at the PR's head, before my commits. ESLint passes, so the gate is green. I left it alone.
- The worktree has an untracked `.slice-2b-report.md` from an earlier agent. I left it.

## Ambiguities

- After a save or delete finishes, its status line ("Saved 99.8 lb for Jan 9.") still appears even if the owner has moved to another date. It names its date, so I kept it. The delete's status now appears after the refetch instead of before it.
- The Previous week arrow still stops at the first phase's week. A pre-phase week is reached by typing the date, then its weigh-in shows and can be deleted. The weekly table still has no view of `"unassigned"` weeks.

## Judgment calls

- Owner to confirm: the import locks only `weight_log_weigh_ins`, the one table the site writes. A future writer to another Weight Log table during an import would not be blocked.
- Owner to confirm: a save during the import waits, typically a few seconds, rather than failing. The import is meant to run before anyone saves on cutover day.
- Owner to confirm: the dry run takes no lock, so it reports the database as it was when it read it.
- Owner to confirm: finding 2 is fixed with a calendar-week query, not by refusing dates before the first phase. The server still accepts dates back to 2000-01-01.
- Owner to confirm: during a pending request the editor stays editable, and each request clears only its own draft.

## Next steps

- Devin and the deep review should look at `scripts/weight-log/import-database.ts` (new file, writes to the database) and the new `weightLog.week` procedure.
- `docs/weight-log.md` "Cutover day" step 6 now lists `import-database.ts` among the scripts to delete after cutover.

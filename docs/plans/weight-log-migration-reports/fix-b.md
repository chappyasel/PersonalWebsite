# Fix B report: cutover tooling (PR #144)

Worktree `/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/agent-a772e01a4518be175`, branch `worktree-agent-a772e01a4518be175`, pushed to origin (tip `92eee4fc`, which also carries builder A's commits and A's merge).

## Commits

- `affb2932` Check Weight Log parity against the workbook, and guard --replace. Covers `parity.ts`, `parity-check.ts`, `parity-check.test.ts`, `import.ts`, `import-plan.ts`, and `import-plan.test.ts`.
- `a2d7c798` Write the Weight Log cutover-day runbook. Covers `docs/weight-log.md` and the new `scripts/weight-log/pending-migrations.ts`, and fixes a singular/plural slip in the import's messages.

## What changed

1. Parity (finding 2). `compareParity({ workbook, snapshot, records })` runs a single comparison routine twice. Against the workbook export it requires exact equality for weigh-ins, exclusions, all 26 scan fields (the 4 base fields plus the 22 added columns), set points, targets, original targets, and weekly averages, and every difference goes in `unexpected`. Against the old snapshot (base scan fields only) the differences go in a new `snapshot` list, which `parity.ts` prints under "Differences from the old snapshot (informational, never fail)". The recollection and strength readings are still compared against the snapshot, and a difference there still fails, because the workbook export doesn't carry them. Trimmed weeks and derived names come from the workbook comparison. `removedOtherKind` takes the union of both runs, because only the snapshot can still hold `other` (the import refuses it). `parity.ts` now passes `--exclude-sheet` through to `import_workbook.py`. Counts are renamed to `keptWorkbookWeeks` and `workbookWeeks`.
2. Runbook (findings 2 and 6). `docs/weight-log.md` has a new "Cutover day" subsection with six steps:
   - a shell preamble that unsets `DATABASE_URL` and sets `WEIGHT_WORKBOOK` and `ENC` to the main checkout's `data/weight-log` path
   - the journal check
   - `pnpm db:migrate:prod`
   - the import as a dry run, then the real run, with `--expect-host` and the absolute `.enc` paths
   - parity, with the line it must end on
   - "never revert once the site holds an entry; roll forward or Neon PITR"
   - deleting the cutover scripts in a follow-up PR

   The section on importing the workbook now describes the new parity and guard behavior.
3. The `--replace` guard (finding 3). `findSiteEntries(existing, plan.weighIns)` returns the dates of database weigh-ins that the export lacks or records with different pounds. `replaceRefusal` produces a message that starts with "Refusing to replace:" and names the count and up to 20 dates, never pounds. `--discard-site-entries` overrides the refusal. I also added `--dry-run`, which runs the existence check and the guard in a read-only transaction and prints what a real run would import.
4. The journal check. `pending-migrations.ts` reads `MAX(created_at)` from `drizzle.__drizzle_migrations` in a read-only transaction, compares it with the journal's `when` values the way drizzle does, prints the host and the pending tags, and exits 1 unless only `0023_weight_log` is pending.

## Verified, and how

- Unit tests with synthetic data: `vitest run scripts/weight-log` passes 16 tests in 2 files. New parity cases:
  - a cutover-morning workbook with an extra weigh-in passes, and only the snapshot section lists it
  - a database missing a weigh-in that the workbook holds fails
  - a snapshot phase with `other` is listed as intended

  New guard cases:
  - an identical rerun is allowed
  - a rerun that adds readings the workbook gained is allowed
  - site-entered and corrected dates are refused, and the message has no decimals
  - `--discard-site-entries` lets the run through, and a long date list is shortened
- `pnpm typecheck` and `eslint --max-warnings 0 scripts/weight-log/` pass. Prettier is clean on every file I touched.
- Real data on the Neon branch. The host was checked before every command (`ep-proud-union-akswp9yx`), and the shell's `DATABASE_URL` takes precedence over `--env-file=.env` (confirmed by printing the host).
  - New parity, read-only, against the iCloud workbook and the main checkout's `snapshot.enc`:
    - Counts: weighIns 1627, excludedWeighIns 1, phases 20, plannedWeeks 463, keptWorkbookWeeks 463, workbookWeeks 484, scans 10, setPoints 2, strengthReadings 917.
    - Intended: 23 trimmed lines (2 shortened ends and 21 weeks), 20 derived names, 0 `other`, 22 added scan columns.
    - Informational snapshot section: 0 differences.
    - Unexpected: 0. Exit 0.
    - The branch therefore holds no test weigh-ins from the owner right now; any would have appeared as "only in the database".
  - Guard, all runs with `--dry-run`, so in read-only transactions:
    1. Without `--replace`: refused because the tables already hold data. Exit 1.
    2. `--replace` with the real export: passed, and it reported it would import 1627 weigh-ins. Exit 0.
    3. `--replace` with the export piped through a scratch filter that blanks its newest weigh-in: refused, naming 1 weigh-in (2026-11-04). Exit 1.
    4. The same with `--discard-site-entries`: passed. Exit 0.
  - Checksum before and after the dry runs, read-only: row counts (1627 / 20 / 463 / 2 / 10 / 1 / 917), an md5 over every weigh-in's date, pounds, excluded, and updated_at (`c876b080…`), and an md5 over phases (`ab6c82e2…`). Both were identical. Nothing was written to the branch.
- Production, read-only: `pending-migrations.ts` printed "Latest applied: 0022_book_note_chunk_search" and "Pending: 0023_weight_log", exit 0. That was a single SELECT in a read-only transaction. Run against the Neon branch, it correctly reports "Pending: none" and exits 1.
- `heavy -- pnpm verify`: next typegen, eslint, artwork, search index, and meadow pass. tsc and vitest fail, and none of the failures are in my files:
  - tsc: `src/app/weight-log/edit/WeightLogEditor.test.tsx` (A's file, `.value`/`.max` on `HTMLElement`, lines 110-153).
  - vitest: `MeetBooking.test.tsx` failed 5 tests, the known date issue (one more than the 4 expected, likely load). `BookLink.test.tsx` and `sceneAudio.test.ts` failed 1 each, and both pass when rerun alone, so they were load timeouts.

## Shortcuts

- The guard has no integration test against a real Postgres. The pure functions are unit-tested, and the wiring was exercised on the Neon branch through `--dry-run` only. The non-dry path (delete, then insert) runs the same `checkExisting` before deleting, but no run took that path.
- `pending-migrations.ts` has no unit test. It was run against both databases instead.

## Issues

- A's in-flight `WeightLogEditor.test.tsx` breaks `tsc` in `pnpm verify` (see above). I did not touch it.
- My push sent the branch as it stood, so it included A's commits `63ee71c0`, `04e89aa4`, `3592e567` and A's merge `92eee4fc`, all of which A had already committed.

## Ambiguities

- The guard counts only weigh-ins the database has and the export lacks or records differently, as specified. A weigh-in deleted on the site (in the export, missing from the database) is not caught, and `--replace` would bring it back. Catching it would also block legitimate reruns after the workbook gains readings, so I left it out.
- The guard ignores `excluded`. The editor never changes it, so it cannot mark a site edit.

## Judgment calls

- I added `--dry-run` to `import.ts`. The brief allowed a dry path "if the import has one", and it had none. A read-only transaction lets Postgres itself reject any write, which made proving the guard on the branch safe. The runbook now has a dry run before the real import. Owner to confirm the extra step.
- I added `scripts/weight-log/pending-migrations.ts` so the journal check is one exact command rather than a hand comparison of `created_at` with `_journal.json`. It is on the runbook's deletion list.
- The runbook doesn't commit production's host or endpoint ID. Step 3 tells the operator to set `HOST` to the host step 1 printed, so `--expect-host` is still named by hand rather than derived from `.env`.
- The deletion list keeps `import_workbook.py`, because `scripts/generate-training-scene-figures.py` still uses it for the DEXA image. The 2a report's list didn't name it either way.
- The historical context comparison still fails the check, using the snapshot as its source, as the brief said.

## Next steps

- On cutover day, follow `docs/weight-log.md` → "Cutover day". Today, production shows only 0023 pending.
- After cutover passes, open the follow-up PR that deletes `import.ts`, `import-plan.ts`, `parity.ts`, `parity-check.ts`, `pending-migrations.ts`, `sources.ts`, and their tests. Also delete the main checkout's `data/weight-log`, the S3 object, and the Neon branch.
- Builder A or the lead: fix the `WeightLogEditor.test.tsx` type errors before the final verify.

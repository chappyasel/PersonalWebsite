# Slice 2 (cutover, PR #144): fresh Claude review

Reviewed `git diff origin/main...HEAD` at `9e5dceda` in
`.claude/worktrees/agent-a772e01a4518be175`. I skipped the slice 1 files except
where the new code calls them. I made no edits and wrote nothing to any
database. I read the Neon branch `weight-log-import-test`
(`ep-proud-union-akswp9yx`) inside `BEGIN READ ONLY`, and the workbook's `BF%`
sheet for labels and cell positions only. No measurements are quoted below.

Summary: nothing loses or misattributes the owner's data during the import as
the branch stands. Two medium findings matter on and after cutover day. The
editor's "today" goes stale overnight, which can overwrite yesterday's
weigh-in. The parity check compares against a snapshot that will be older than
the workbook on cutover morning. The rest are low.

## Medium

### 1. The editor's "today" never advances, so a tab left open overnight saves over yesterday

`src/app/weight-log/edit/WeightLogEditor.tsx:139` computes `today` once, with
`useState(localToday)[0]`. Nothing recomputes it on focus, `visibilitychange`,
or `pageshow`. It drives the default date (`:140`), the date input's
`max={today}` (`:240`), `choose()`'s clamp (`:209`), the disabled future days
(`:362`), and the "Next week" limit (`:346`).

Failure scenario: the owner saves Monday's weigh-in on the phone and leaves the
tab. iOS Safari keeps the page alive and restores it Tuesday morning without a
reload. The form still holds Monday's date, and Monday's pounds are prefilled
because `existing` is set. The owner types Tuesday's reading and taps Save.
`upsertWeighIn` replaces Monday's row (decision 7). Monday's reading is gone
and Tuesday has none. The owner cannot correct it in the form either: the date
input's `max` and `choose()` both stop at Monday, so Tuesday cannot be picked
until a reload. React Query refetches the tables on focus, but `today` stays
stale. Neon point-in-time restore (decision 13) is the only way to recover the
lost value, and only if someone notices.

Fix: recompute `today` in a `visibilitychange`/`pageshow`/`focus` listener
(for example, a `useSyncExternalStore` that reads `localToday()`). When the
date changes and the form is still on the old "today" with no draft, move the
form to the new today. Also, when Save would replace an existing weigh-in,
change the button to "Replace" or show the old value next to it. Decision 7
allows replacing, but the owner should see that it is happening.

### 2. On cutover morning, parity will compare against a snapshot older than the workbook

`scripts/weight-log/parity.ts:36` reads `snapshot.enc`.
`parity-check.ts:58-81` and `:153-164` then require every weigh-in and weekly
average to match it exactly. The snapshot changes only when the Hermes job
uploads. `~/.hermes/workspace/state/weight-log/last-upload.json` is dated Nov 4
11:01, and so are the workbook (Nov 4 10:30) and the main checkout's
`data/weight-log/snapshot.enc`, so they match today. Plan step 1 has the owner
weigh in and enter it in the workbook, then import right away. If the import
runs before Hermes uploads again, the database holds a reading the snapshot
lacks. Parity then prints `Weigh-in <today>: only in the database` and
`Week <monday> ...: weekly average differs`, and exits 1. Nobody can refresh
the snapshot from the PR branch, because `store.ts` is deleted there. The 2a
report's step 3 mentions that "extra lines can appear". In practice the
operator then accepts unexpected differences by eye, which is the opposite of
decision 26's "exact equality".

The committed runbook has gaps as well. `docs/weight-log.md:42-61` leaves out
the `pnpm db:migrate:prod` step and the journal check. It also passes
`data/weight-log/*.enc` as relative paths, and new workspaces no longer have
those files now that `.superset/setup.sh` doesn't restore them. Both failures
are safe: the import runs in one transaction and prints its generic "Nothing
was written". The correct steps exist only in the uncommitted 2a report.

Fix (either one):
- Before the import, run the Hermes job once by hand from the main checkout
  after the weigh-in. The main checkout is still on `main`, so it still has
  `store.ts`. Then confirm `last-upload.json` is newer than the workbook's
  mtime.
- Better: `parity.ts` already runs `import_workbook.py` on the same workbook.
  Compare weigh-ins, exclusions, targets, original targets, and weekly averages
  against that export, which is exactly what the import read. Keep the snapshot
  only for the historical context and as a second, informational comparison.

Separately, copy the 2a report's cutover steps into `docs/weight-log.md`: the
migrate step, the journal check, and absolute paths to the main checkout's
`.enc` files.

## Low

### 3. `--replace` after cutover would erase every weigh-in entered on the site

`scripts/weight-log/import.ts:87-94` deletes every `weight_log_` table when
`--replace` is passed. Until someone deletes the cutover scripts (2a report,
step 5), a rerun such as "the import looked off, run it again" with `--replace`
against production silently drops site entries. The workbook no longer has
them (decision 27). The `--expect-host` guard does not help, because the
operator would name production on purpose.

Fix: refuse `--replace` when the database holds a weigh-in date that the
workbook export lacks, or when any `updated_at` is later than the first
import. Or delete `import.ts`, `parity*.ts`, and `sources.ts` in a follow-up
PR as soon as cutover passes, and put that deletion on the cutover checklist.

### 4. The public payload now carries the exact time of the owner's last save

`src/lib/weight-log/records.ts:107-120` sets `importedAt` and
`sourceModifiedAt` to the latest weigh-in `updated_at`, with a full ISO
timestamp. `WeightLogDashboard` is a client component, so the whole DTO is
serialized into the public `/weight-log` RSC payload. The public
`weightlifting.getBodyweightPareto` query returns the same value as
`bodyweightImportedAt` (`src/lib/weightlifting/pareto/analysis.ts:230`). Before,
that value was the Hermes import time. Now it is the minute the owner saved a
weigh-in, usually right after weighing in. That is a small new fact about the
owner's routine on a public page.

The header also uses `importedAt.slice(0, 10)`
(`WeightLogDashboard.tsx:740`), the UTC date. A save after 4 or 5 pm Pacific
shows tomorrow's date as "Updated".

Fix: emit the latest change as a calendar date in the owner's zone, or as
`max(date)` of the weigh-ins. Neither consumer uses the time of day.

### 5. The schema gives slice 3 one planned row per Monday and doesn't guard phase overlap

`weight_log_planned_weeks` is keyed by `week_start` alone
(`src/server/db/schema.ts:464`). Nothing in SQL stops two phases from
overlapping, or a planned week from sitting outside its phase's dates (the 2a
report says the same). The migration rejects none of slice 3's legitimate
writes. Starting a phase gives the old phase a Sunday end, which passes
`weights_check`. Changing a week's lb/wk only updates `target`. Moving an end
changes rows or a Sunday `end_date`.

One trap for slice 3: decision 9 keeps old-phase weeks "that have weigh-ins".
A new phase that starts on a Monday the owner has already weighed in on would
leave that week's row in the old phase. The new phase's first week would then
hit the primary key, and the old row would sit after its phase's new end.

Fix (slice 3): when a phase starts, move any of the old phase's rows on or
after the new start into the new phase. Treat the weigh-in exception as
applying only to weeks before the new start. Consider a test that asserts no
planned week lies outside its phase.

### 6. Reverting the PR after cutover is not a rollback

After the first site entry, reverting #144 brings back the S3 reader. The
public chart would then show the Nov 4 snapshot without the site's entries,
and the Hermes job is disabled, so nothing would refresh it. This is fine as
long as everyone knows it. Add one line to the cutover steps: once the site
has an entry, roll forward, or restore Neon. Don't revert.

### 7. The trimmed-week count differs from decision 9's number

Decision 9 says the Jan '26 cut "loses its 19 empty planned weeks". The import
trims 20 from that phase and 1 from Feb '19 - Jul '19, and shortens two phase
ends. The build review lists this as a wrong fact in the plan, and the rule
itself is applied as written. The plan says a slice that cannot follow a
decision stops and asks, so confirm the owner has seen the 21 before cutover.

## Checked and found sound

- Import rules (`scripts/weight-log/import-plan.ts`). It fails closed on a
  duplicate date, a non-Monday week or phase, `other`, a duplicate start, a
  dropped week that holds a weigh-in, and a weigh-in without a kept week.
  Everything is written in one transaction. The Neon branch has 1627 weigh-ins
  (1 excluded), 20 phases (1 running), 463 planned weeks, 10 scans, and 917
  strength readings. It has 0 planned weeks outside their phase and 0
  weigh-ins without a planned week. Phases run back to back, and no weigh-in
  or target has more than one decimal place, so the editor's `toFixed(1)`
  prefill and the server's rounding cannot alter an imported value by being
  saved again.
- New scan columns. The parity check compares the database with the same
  importer's output, so it cannot catch a mapping error. I checked the mapping
  against the workbook by label instead. The `BF%` total-body rows are 3-12
  (10 scans), with `E2` = "BMC". Column N holds the conditions note in 7 rows,
  matching the branch's 7. The regional panel's header is row 17, with dates
  in C17:F17, which matches the branch's 4 scans with regional values. Its
  column A/B labels (Arms, Legs, Trunk, Android, Gynoid, BMD, Other, and
  Fat/Lean/BMC/T-Score/Z-Score/A/G/Visceral) map one to one onto
  `REGIONAL_ROWS`. The unrecognized-row guard fails closed.
- DTO parity for consumers. `buildWeightLog` keeps the `WeightLog` shape.
  Empty days count as included in `averageDays`, which changes no trimmed mean
  and keeps `.min(1)` satisfied. `chart.ts`, the dashboard, `analysis.ts`, and
  `refresh-pareto.ts` read only fields that still exist. The only use of
  `"other"` left is the gray "Unassigned" fallback.
- `updated_at` on upsert. drizzle-orm 0.30.10's `buildUpdateSet` adds
  `$onUpdate` columns to `onConflictDoUpdate`, as `weightLog.test.ts:93-94`
  asserts. The upsert's `set` leaves `excluded` alone.
- Migration. Each CHECK matches `schema.ts`, and the Neon branch records 0023
  as the newest migration, after 0022 (`1790966768369`). Production must be
  checked the same way before migrating (2a report, step 1).
- Access. All four procedures use `ownerProcedure`. The guard test
  (`weightLogOwnerOnly.test.ts`) checks middleware identity at any router
  depth and catches misspelled router keys. `/weight-log/:path*` sends
  `private, no-store`. Mutations need the `SameSite=Lax` session cookie and a
  JSON body, so a cross-site form cannot send one. The prerender guard covers
  `/weight-log/` subpaths.
- Removed code. Outside the plan and ADR, nothing in the repo references
  `restore:weight-log`, `store.ts`, `restore*.ts`, `encryption.ts`, or
  `pareto.enc`. That covers package.json, `.superset`, `next.config.js`,
  `.github`, and the tests. `.gitignore` and `.vercelignore` still exclude
  `/data/weight-log`, so the leftover `.enc` files in the main checkout stay
  out of Git and deploys. The Hermes script calls `restore.ts` and `store.ts`
  from the main checkout, but it skips when the workbook bytes are unchanged,
  so after cutover it fails only if the workbook changes before the job is
  disabled.

# Cutover report: apple-health and sleep-debt read the database (steps 5 and 6)

apple-health's `weight_log` now comes from the site's Postgres database through a new read-only role. One live run on 2026-11-09 matched the previous `health.db` rows on every weigh-in, phase, week, and target. The only differences are the intended ones and two derived columns, explained below. `analyze_sleep_debt.py` now reads `health.db`'s `weight_log`, and its weight and phase context is identical to what the workbook gave it.

No secrets or measurements appear here. Every comparison below was made by counts, dates, and per-column equality.

## Commits

- apple-health, `~/Desktop/Agents/apple-health`, branch `main`, local only and not pushed. `031484a` "Read the Weight Log from the site's database instead of the spreadsheet". It sits on top of the other slice's unpushed `816b7fa`.
  - It adds `scripts/health_import/sidecar_weight_log.py` and deletes `sidecar_xlsx.py`. It changes `__main__.py`, `health_sync.py`, `paths.py`, `__init__.py`, `derive_daily.py` (a docstring), `schema.py` and `views.py` (comments), `tests/test_sidecars.py`, `docs/schema.md`, `docs/decisions.md`, and `README.md`.
  - `paths.py` and `README.md` also hold other sessions' uncommitted edits. The commit contains HEAD plus my hunks only, staged with `git hash-object` and `git update-index`. Those sessions' edits are still uncommitted in the working tree, unchanged. Afterwards `git diff` on both files shows only their lines. The two deleted `.shortcut` files and every other session's file are untouched.
- `analysis/sleep-debt/analyze_sleep_debt.py` is gitignored (`.gitignore:22`, `analysis/sleep-debt/`), so there is nothing to commit. I edited it in place. The pre-change copy is at `/private/tmp/claude-501/-Users-chappyasel--paradev-worktrees-PersonalWebsite-think-finally-ready-fully-15fb8de6/04e2a620-f240-4c91-a2d4-5a69b50e7bf7/scratchpad/analyze_sleep_debt.orig.py`. It holds code only, no data.
- Nothing in PersonalWebsite, the lead's worktrees, or `~/.hermes` changed. I read PersonalWebsite through `git fetch` and `git show origin/main:...` only.

## Which repository runs the sync

`~/Desktop/Agents/apple-health`. The LaunchAgent plist runs `/opt/homebrew/bin/python3.11 /Users/chappyasel/Desktop/Agents/apple-health/scripts/health_sync.py`. The home repository at `/Users/chappyasel` has no commits on `main` ("your current branch 'main' does not have any commits yet"), so the plan's location was stale.

## The role

- `weight_log_reader` on the production database `neondb` (endpoint `ep-winter-base-akkl2xak`). Before creating it I listed the roles: `cloud_admin, neon_service, neon_superuser, neondb_owner`. There was no earlier or half-created role.
- I created it through the owner connection with psql. The URL came from `.env` and went into `PG*` environment variables, never onto a command line or into output. The SQL went over stdin, in one transaction:
  - `CREATE ROLE ... LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD ...`. The script falls back to `ALTER ROLE` when the role already exists.
  - `ALTER ROLE weight_log_reader SET default_transaction_read_only = on`.
  - `GRANT CONNECT ON DATABASE neondb`, `GRANT USAGE ON SCHEMA public`.
  - `GRANT SELECT` on exactly the seven existing tables: `weight_log_body_fat_recollections`, `_phases`, `_planned_weeks`, `_scans`, `_set_points`, `_strength_history`, `_weigh_ins`.
- The password is 24 random bytes as hex, from Python's `secrets.token_hex(24)`. That is the same output as `openssl rand -hex 24`. It was never printed.
- `~/.config/personal-website/weight-log-readonly-url` is mode 600 and its directory is mode 700. The file was written with umask 077. It uses the owner URL's pooler host, database, and query string (`sslmode`, `channel_binding`).
- The existing default privileges grant only to `neon_superuser`, and the new role is not a member of it. No table in `public` has a `PUBLIC` grant.

## Verified, and how

1. **The role is read-only and scoped.** I connected as the role and ran each probe in its own transaction, then rolled it back:
   - `SELECT count(*)` on `weight_log_weigh_ins` and `weight_log_scans` succeeds. `current_user` is `weight_log_reader`, and `default_transaction_read_only` is `on`.
   - `SELECT` on `users` and `accounts` fails with "permission denied for table".
   - With `SET TRANSACTION READ WRITE` forced, so that read-only mode can't hide a privilege, these fail with "permission denied":
     - `INSERT` into `users`
     - `INSERT` and `UPDATE` on `weight_log_weigh_ins`
     - `CREATE TABLE` (refused on schema `public`)
   - Without that override, the same writes fail with "cannot execute ... in a read-only transaction".
   - The same `users` refusal comes back through the HTTPS endpoint the pipeline uses (HTTP 400, code 42501).
2. **Transport.** The pipeline has no pip dependencies, so I used Neon's `https://<pooler host>/sql` endpoint via `urllib`. It works from both `/usr/bin/python3` 3.9.6 and the LaunchAgent's `/opt/homebrew/bin/python3.11`, and a read takes about 0.4 s. The query is one statement that returns weigh-ins, phases, and planned weeks as one JSON document, so a read is one snapshot.
3. **Phase names.** `phase_name()` ports `src/lib/weight-log/phases.ts`. The end of a running phase is the Sunday of its last planned week, as in `records.ts`. Phase assignment and the weekly average port `records.ts`, `week-table.ts`, and `chart.ts` `trimmedMean`.
4. **Tests.**
   - 14 new tests in `tests/test_sidecars.py` cover:
     - row building: trimmed mean, excluded reading, gap week, a week past the plan, a running phase's name, a weigh-in before every phase
     - idempotence, and a deletion propagating
     - the empty and shrink guards
     - an unknown phase kind
     - the missing URL file, and a URL file other users can read
     - the request shape against a fake `urlopen`
     - that an error message never carries the URL
     - `carry_forward`
   - Results:
     - Full working tree: 279 tests pass on `/usr/bin/python3` (2 skipped, as before).
     - The committed tree alone, exported with `git checkout-index` so other sessions' uncommitted files are absent: 195 pass (5 skipped).
     - The sidecar suite on python3.11: 38 pass.
   - `pyflakes` reports only `__main__.py`'s unused `import sys`, which was there before this change.
   - `privacy_audit.py` passes.
5. **Live run.** Steps, in order:
   1. Backed up the `weight_log` table and `daily`'s weight columns to `data/backups/weight_log-pre-postgres-20261109.db` (mode 600). It holds 1,624 rows, and I checked its copy by hash.
   2. Took a full `health_sync.py backup`, which wrote `data/backups/health-20261109-193409.db` and passed `integrity_check`.
   3. Ran `health_sync.py --dry-run weight-log`. It read 1,627 weigh-ins and rolled back.
   4. Ran `health_sync.py weight-log`. It wrote 1,627 weigh-ins across 20 phases and 342 weeks, then rebuilt `daily` (4,413 dates in 8 s). Exit 0.
   5. Ran `health_import validate`: 0 errors, and 1 warning (`rings_stale`) that was there before and is unrelated.
6. **`daily` after the run.** Compared with the full backup, `daily` has the same 4,413 dates. Only `weight_lb`, `weight_lb_is_interpolated`, and `weight_phase` changed, and only on 2026-11-02, 11-03, and 11-04, the three new weigh-ins. No other column changed on any date.
7. **sleep-debt.** I loaded the old workbook loader from the saved copy and ran it on the frozen workbook under python3.11, which has openpyxl. I ran the new loader on `health.db`. Results:
   - 1,627 entries on both sides, with no duplicate dates.
   - 20 phase ranges on both sides, with identical bounds and phases.
   - Over all 4,413 days, `weight_lb` and `weight_phase` are equal on every day, and the computed debt is equal on every day.
   - `--self-test` passes on both interpreters.
   - I did not regenerate `output/`. The model is deprecated and refuses to run without `--exploratory`.

## Comparison: `health.db` `weight_log`, before and after

Before: 1,624 rows, 2018-09-27 to 2026-11-01, from the last XML rebuild. After: 1,627 rows, 2018-09-27 to 2026-11-04.

| Column | Result on the 1,624 shared dates |
|---|---|
| `local_date` | No rows lost. 3 rows added: 2026-11-02, 11-03, 11-04 |
| `weight_lb` | Equal on all 1,624 |
| `phase` | Equal on all 1,624 (`maintenance` maps to `Maintain`) |
| `week_of` | Equal on all 1,624 |
| `week_target_lb` | Equal on all 1,624, nulls included |
| `week_avg_lb` | 1,621 equal within 1e-9 (781 bit-for-bit, 840 differing only in float noise). 3 newly filled, explained below |
| `period_sheet` | Changed on purpose: tab name to derived phase name (decision 28). The mapping is one to one, 20 to 20 |
| `week_delta_lb` | Different definition, explained below |

These differences were expected:

- **2026-11-02 to 11-04.** These weigh-ins were in the workbook when the import ran, after `health.db`'s last rebuild on Nov 1. No site entries for Nov 5 onward exist yet: the database's latest weigh-in is 2026-11-04.
- **`period_sheet`.** Each old tab name maps to exactly one derived name, for example `Aug '26 - Mar '27` to `Bulk Aug '26 - Aug '27`. In 4 of the 20, the end month differs from the tab title, because the site uses the phase's actual end:
  - `Sep '18 - Jan '19` becomes `Bulk Sep '18 - Feb '19`
  - `Jul '19 - Jan '20` becomes `Bulk Jul '19 - Feb '20`
  - `Nov '24 - Feb '25` becomes `Bulk Nov '24 - Mar '25`
  - `Aug '26 - Mar '27` becomes `Bulk Aug '26 - Aug '27`, a running phase that ends with its last planned week
- **Excluded weigh-in (2021-12-19).** It is in both tables with its weight, and the old and new weekly averages agree on its week. The site's exclusion matches the workbook's. `weight_log` has no `excluded` column, so the flag itself isn't mirrored. See Judgment calls.
- **The 21 trimmed planned weeks.** They change nothing here: no weigh-in fell in them, and every target matches.

Two more differences, neither of them a data error:

- **`week_avg_lb`, 3 rows in weeks 2024-11-11 and 2024-12-30.** The workbook's average cell was blank for these two weeks, so the old column was null. The new column holds the trimmed mean of the week's weigh-ins, as the site's weekly table shows it. These are the only rows where an average appears that didn't before.
- **`week_delta_lb`.** The old column was the workbook's "+ / -" text, rounded to 0.1, from each tab's own formulas. The new column follows the site's weekly table: this week's average minus the previous calendar week's, across phase boundaries, unrounded, and null when the previous week has no weigh-ins.
  - By row: 87 are bit-for-bit equal, and 1,261 are equal after rounding the new value to 0.1. 163 rows have an old value and a null new one: the previous calendar week had no weigh-ins, and the workbook compared with an earlier week. 42 rows have a null old value and a new one: the first week of a tab, which the workbook left blank.
  - By week: the site's definition reproduces 274 of 341 weeks after rounding. I tested three other definitions (previous week with data, the same within a phase, and the previous calendar week within a phase). None reproduces the workbook (287, 292, and 278 of 341), so the workbook's formulas weren't uniform.
  - Nothing reads `week_delta_lb`. I searched `~/Desktop/Agents` for the column names: only the schema, the docs, and the tests mention it. The weigh-ins, averages, and targets it derives from all match, so I treated this as a definition change, not a data mismatch, and did not stop.

## Shortcuts

- I did not run a full XML rebuild. It parses 5.3 M records and swaps `health.db`, and the brief asked for a sync, not a reconciliation. The rebuild path (`_run_sidecars`, which calls the new sidecar, and the fallback to the previous build's rows) is covered by unit tests only. The live run exercised `health_sync.py weight-log`, which uses the same `ingest_weight_log`.
- The hourly LaunchAgent `import` does not refresh `weight_log`. It didn't read the workbook either: the old reader ran only on rebuild. Between rebuilds, `health_sync.py weight-log` is a manual command.
- I did not regenerate the sleep-debt outputs. I compared the loaders and their effect on every day instead.

## Issues

- `CLAUDE.md` in apple-health still says, under Data safety, "No `/tmp`, no scratch dirs, no HTTP, no external service." That sentence is about writing health data out, which this change doesn't do. But an agent could read it as banning the new HTTPS read and undo it. Another session has uncommitted edits to `CLAUDE.md`, so I left it. README's privacy table, `docs/decisions.md`, and the module docstring now describe the read. **Owner to confirm** whether `CLAUDE.md` should name the read as a third exception.
- `analysis/sleep-debt/` is gitignored, so the step 6 change has no history. Its sibling `audit_personal_model.py` still writes `"weight_source": "canonical workbook mirrored in weight_log table"` into its output metadata. That label is now out of date. I didn't change it, because it was outside the brief.
- README's stats table still says "1,568 weigh-ins, 2018-09-27 to 2026-07-28". It is a dated snapshot of the whole warehouse, and I left it alone.
- New `weight_log_` tables added to the site later won't be readable by the role until someone grants them.

## Ambiguities

- The brief and the plan say `sidecar_xlsx.py` should be "replaced". I deleted it and its tests instead of keeping the reader for the frozen workbook. The workbook stays on disk, and the parity check in PersonalWebsite has its own reader (`scripts/weight-log/import_workbook.py`).
- "Run the sync once" could also mean an XML rebuild. I added and ran `health_sync.py weight-log`, which refreshes `weight_log` and rebuilds `daily` in one transaction under the import lock.

## Judgment calls (each one: Owner to confirm)

1. **Transport: Neon's HTTPS SQL endpoint via `urllib`, not `psql` or a hand-written wire-protocol client.** It keeps the pipeline standard-library only. The cost is that it's Neon-specific: moving the database off Neon means replacing `fetch_records()`. This is recorded in `docs/decisions.md`. **Owner to confirm.**
2. **The role can `SELECT` all seven `weight_log_` tables**, as the brief says, though apple-health reads only three (weigh-ins, phases, planned weeks). Narrowing it to those three is one `REVOKE`. **Owner to confirm.**
3. **`default_transaction_read_only = on` and `NOINHERIT` on the role**, beyond the grants the brief asked for. **Owner to confirm.**
4. **`week_delta_lb` follows the site's definition and is unrounded**, so it no longer reproduces the workbook's column (details above). The alternative was to keep matching the workbook's 0.1 rounding. **Owner to confirm.**
5. **Excluded weigh-ins keep their row and weight** in `weight_log`, which matches the old reader, and drop out of `week_avg_lb` only. The flag isn't stored, because the brief said to fill the same columns. **Owner to confirm.**
6. **A weigh-in in a week with no plan takes the latest phase that covers its date and no target**, as the site's DTO does. A weigh-in before every phase gets a null phase and name. None exist today. **Owner to confirm.**
7. **Guards.** A read that returns no weigh-ins, or would drop more than 10% of the existing rows, changes nothing and raises. A rebuild that ends with an empty `weight_log` copies the previous build's rows. This covers a database that can't be reached, a missing URL file, and an unavailable module. **Owner to confirm** the 10% threshold.
8. **The URL file must be mode 600.** The reader refuses a file that its group or other users can read. **Owner to confirm.**

## Next steps

- Decide whether the hourly `import` should also run the `weight-log` refresh, so site weigh-ins reach `health.db` within an hour. The cost is a network call in the LaunchAgent, which must not fail the snapshot import.
- Push apple-health `main` (`816b7fa` and `031484a`) when the owner says to.
- Decide on the `CLAUDE.md` wording (see Issues).
- Run `health_sync.py weight-log` after the next site weigh-ins and confirm that Nov 5 onward appears. The next XML `reconcile-xml` will exercise the rebuild path live.
- To rotate the password, rerun the role script's `ALTER ROLE ... PASSWORD` branch and rewrite the URL file. The script is at `/private/tmp/claude-501/-Users-chappyasel--paradev-worktrees-PersonalWebsite-think-finally-ready-fully-15fb8de6/04e2a620-f240-4c91-a2d4-5a69b50e7bf7/scratchpad/create_role.py`. It prints no secrets.

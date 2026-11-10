# Weight Log migration plan

Status: planned on November 9, 2026. Not started. The build review lives at
[`weight-log-migration-build-review.md`](./weight-log-migration-build-review.md),
created when Phase 2 starts.

## Outcome

The site becomes the only place Chappy records his weight. Today the Weight Log
spreadsheet (`iCloud Drive/Spreadsheets/Weight Log.xlsx`) is the source of truth.
A daily Hermes job imports it, encrypts it, and uploads it to S3, and
`/weight-log` decrypts that snapshot on each request. After this work:

- Weigh-ins, phases, plans, set points, and scans live in Postgres tables.
- `/weight-log/edit` is an owner-only page for daily entry, corrections, plan
  editing, set points, and a weekly table.
- Owner access is Google sign-in for one address.
- `~/Desktop/Agents/apple-health` and the sleep-debt analysis read the database.
- Weigh-ins are copied one way into Apple Health every morning.

Shared terms are in [`src/lib/weight-log/CONTEXT.md`](../../src/lib/weight-log/CONTEXT.md).
The storage decision is
[Weight Log ADR 0001](../../src/lib/weight-log/docs/adr/0001-store-the-weight-log-in-postgres.md).
The current pipeline and analysis rules are in [`docs/weight-log.md`](../weight-log.md).

## Owner decisions

Every item here is Chappy's decision from the November 9, 2026 grill. A slice
that cannot follow one stops and asks.

### Scope

1. Do not migrate SizeStream, Fit3D (scans, tape measurements, BMR, Shape,
   T/L Vol, ratios), the FFMI sheet, the Feb '22 scenario block (Straight Line,
   Best/Mid/Worst Case), the hidden `Sheet1`, or day notes. Fit3D does not appear
   on the site.
2. Drop the Bull/Bear and "est bf%" columns. The site's DEXA-based body-fat
   estimate replaces them.
3. Leave the workbook where it is, untouched. It is the archive. Do not move,
   rename, or lock it.
4. Import DEXA scans with every column the workbook has: weight, lean mass, fat
   mass, BMC, reported body-fat %, the regional panel (arms, legs, trunk,
   android, gynoid: fat, lean, BMC), BMD, T-score, Z-score, A/G ratio, visceral
   fat, and the conditions note (time, fasting, caffeine, time since workout).
   The regional panel exists for 4 of 10 scans, so those fields are optional.

### Data model

5. Store the data in ordinary Postgres tables (ADR 0001). Remove the S3 snapshot,
   `data/weight-log/snapshot.enc`, `history-context.enc`, `pnpm
restore:weight-log`, and the `.superset/setup.sh` restore step.
6. Move the historical context (the dated body-fat recollection and the strength
   summaries now in `history-context.enc`) into the database.
7. A date has at most one weigh-in. Weigh-ins are independent of phases and
   belong to whichever phase covers their date. Entering a weight for a date
   that has one replaces it.
8. Phases start on a Monday, cover whole weeks, never overlap, and have one of
   three kinds: bulk, cut, maintenance. Remove `other`.
9. Starting a phase ends the current one the day before and deletes the current
   phase's planned weeks after that date that have no weigh-ins. Apply this on
   import: the Jan '26 cut ends on Sunday, March 15, 2026, and loses its 19
   empty planned weeks.
10. The site builds each phase's name from its kind and dates, for example
    "Bulk Aug '26 - Aug '27". A running phase uses its plan's last week as the
    end. Typed titles go away.
11. Store a target per week. Edit the plan through each week's lb/wk: changing
    one week's rate shifts every later target by the same amount. Moving the
    end date adds weeks at the last rate or removes weeks from the end.
12. A week's original target is set when its phase begins and never changes.
    A week added later has no original target.
13. No audit table. Neon point-in-time restore covers mistakes.
14. Import the one existing excluded weigh-in. Do not build an exclude control
    in version 1.

### Access

15. Google sign-in through NextAuth for `chappyasel@gmail.com` only. The
    `signIn` callback rejects every other account and requires Google's
    `email_verified`. The address comes from `OWNER_EMAIL`, never a committed
    constant.
16. Rename `protectedProcedure` to `ownerProcedure`. `youtube.triggerSync`
    becomes usable by the owner.
17. The Google OAuth client is an External app left in Testing mode with only
    the owner as a test user. Register redirects for production and
    `localhost:3000` only. Vercel previews do not support sign-in.
18. Keep NextAuth's default sessions (30 days, extended on use).
19. The only sign-in button is on `/weight-log/edit`, shown when signed out.
    No login link anywhere else.
20. Dad's Journal and YouTube keep their shared password and cookie (ADR 0003).

### Owner page

21. The owner page is `/weight-log/edit`. The public `/weight-log` chart does not
    change and never loads owner-only data.
22. Entry defaults to today in the phone's time zone, editable, in pounds to one
    decimal place.
23. Weekly table columns: weekly average, change from last week, target, gap to
    target, lb/wk, original target, gap to original target. Show the current
    phase first, with a picker for older phases.
24. Set points are editable in version 1.

### Cutover and outside systems

25. Import once, prove the database matches, and cut over completely. No period
    of running both.
26. The import test requires exact equality for every weigh-in, exclusion, scan
    value, set point, target, and original target in the weeks kept, and lists
    each intended difference by name: the 19 trimmed weeks, the derived phase
    names, the removed `other` kind, and the added scan columns.
27. Cutover day: import right after the owner's morning weigh-in, merge the
    cutover PR the same day, disable the Hermes job, and stop entering in the
    workbook. No catch-up import later. A weight entered in the workbook after
    the import is re-entered by hand.
28. `apple-health` reads the database through a new read-only Postgres role that
    can only `SELECT` the weight-log tables. Its connection string lives at
    `~/.config/personal-website/weight-log-readonly-url`, mode 600. It fills the
    same `weight_log` columns, with `maintenance` mapped to `Maintain` and
    `period_sheet` holding the derived phase name.
29. `analysis/sleep-debt/analyze_sleep_debt.py` reads `health.db`'s `weight_log`
    instead of the workbook.
30. Disable the Hermes job `Weight Log Refresh` (`7bd64831c4b3`) on cutover day
    by following `~/.hermes/docs/dual-hermes-operations.md`. Remove the job and
    `~/.hermes/scripts/cron/weight_log_refresh.py` after a week of clean entries
    on the site.
31. The `apple-health` and sleep-debt changes ship on cutover day, run once
    against the database, and match the current `health.db` `weight_log` rows
    apart from the intended differences.

### Apple Health

32. Copy weigh-ins one way into Apple Health. The existing 08:00 `Health Daily
Sync` Shortcut gains a step that asks the site for recent weigh-ins and logs
    a Weight sample for each date that has no Shortcuts sample yet. Corrections
    on the site do not reach Health; the owner fixes those by hand.
33. Replace the old weights in Health. The owner turns off Weight write access
    for Withings, MyFitnessPal, and Wyze, then deletes all Weight samples in the
    Health app (Weight only, not the other Withings types). A one-time "Weight
    Backfill" Shortcut then writes every weigh-in from the site, one year per
    run, in the foreground. Samples are timed 07:00 local on their date. Then
    the 08:00 mirror takes over.
34. The 52 days that only Health has (29 MyFitnessPal days before 2018-09-27 and
    23 scattered later) are not imported. They remain in the 2026-09-04 export
    at `~/Desktop/Agents/apple-health/export/export.xml` and in `health.db`.
35. The site's read endpoint for the Shortcut uses its own read-only token.

### Delivery

36. Four PRs, in this order: Google sign-in; cutover; plan editing and set
    points; Apple Health mirror. Slice 5, the Log Weight Shortcut, adds a
    fifth (decision 38).
37. Each PR merges only when the owner says so. Never push to `main`; a push to
    `main` deploys production.

### Log Weight Shortcut

Chappy's decisions from November 10, 2026, accepting the recommendations in
[`shortcut-api-research.md`](./weight-log-migration-reports/shortcut-api-research.md).

38. A second way to write weigh-ins besides Google sign-in: a Log Weight
    Shortcut on the owner's iPhone with its own `WEIGHT_LOG_ENTRY_TOKEN`,
    separate from the mirror's (decision 35). The token can write a weigh-in
    only for a date that is today or yesterday in some real time zone,
    which runs from yesterday in UTC−12 to today in UTC+14. Today and
    yesterday on the phone always fit, wherever the owner is. The lead
    changed this on November 10, 2026, and the owner has yet to confirm it.
    It first read "the server's UTC date or one day either side", which
    refused Pacific time's yesterday after 4 or 5 PM and accepted its
    tomorrow. The token can never delete, and it cannot touch
    phases, plans, or set points. It reads only the week card, for a date in
    the same window. The variable is optional, and without it both routes
    refuse everything. Revoke by rotating it in Vercel.
39. When the date already has a weigh-in, the Shortcut asks Replace or Cancel
    and shows both values. Decision 7 still holds: Replace replaces, and the
    `excluded` flag stays.
40. The Shortcut shows the week as a notification with the card image, not
    Quick Look, so it runs from the Action button, Control Center, or a widget
    without opening the Shortcuts app.
41. The card's first version: the week's seven days, the average so far,
    the target, the gap to target, and the change from last week. No
    sparkline. Replaced November 10, 2026, at the owner's ask: the card is
    now a snapshot of the editor's Weeks table, its header and two rows (last
    week and this week) with the editor's fills and today's red ring. It
    leaves out Orig and its Gap so its text stays as large as it can at a
    notification's width.
42. The Shortcut does not write to Apple Health. The 08:00 mirror copies the
    weigh-in (decision 32).
43. The owner builds the Shortcut by hand from a written recipe in
    `apple-health/shortcut/RUNBOOK-iphone.md`. `build_shortcut.py` does not
    generate it.

### Deferred

- An exclude-from-average control.
- The weekly table's range columns (above and below the average).
- The Agg phase summary and yearly weight percentiles.
- A scan entry form, and exporting scans for the analysis repo's DEXA PNG
  renderer. Build both before the owner's next DEXA scan. Until then the
  renderer keeps reading the frozen workbook, which still holds all 10 scans.

## Facts the plan relies on

Checked on November 9, 2026. A slice re-checks any fact it builds on.

- The workbook has 20 phase tabs (Sep '18 to the current bulk), `Agg`, `BF%`,
  `FFMI`, and a hidden empty `Sheet1`. The importer reads 20 phases, 484 weeks,
  10 scans, and 2 set points.
- No two phases record different weights for the same date. 21 weeks appear in
  two phases, all because of empty planned tails: one in 2019, and the Jan '26
  cut's tail overlapping the next two phases.
- After the tail is trimmed, phases run back to back with no gaps, and every
  phase starts on a Monday.
- 378 weeks have a target different from the original target. 185 weeks have no
  original target. One week excludes a weigh-in from its average.
- `auth.ts` configures NextAuth v5 with the Drizzle adapter and an empty
  `providers` list. The `users`, `accounts`, `sessions`, and
  `verification_tokens` tables exist.
- The database is Neon (us-west-2). Migrations live in `src/server/db/migrations`.
- `getWeightLog()` (`src/lib/weight-log/data.ts`) has four callers:
  `src/app/weight-log/page.tsx`, `src/server/queries/weightliftingPareto.ts`,
  `scripts/weightlifting/refresh-pareto.ts`, and tests. Strength at Bodyweight
  caches for five minutes.
- `apple-health` mirrors the workbook hourly via the `com.chappyasel.apple-health-sync`
  launch agent (`scripts/health_import/sidecar_xlsx.py`, `paths.py:85`). Its
  views prefer `weight_log` over HealthKit weight for any date
  (`scripts/health_import/views.py:164`).
- Health has had no regular Weight source since Withings stopped on 2025-08-15.
  Wyze wrote 11 days in May 2025. Shortcuts wrote 106 samples in 2020 and 2021.
- The `Health Daily Sync` Shortcut is generated by
  `apple-health/shortcut/build_shortcut.py`, signed, and installed by AirDrop
  (`apple-health/shortcut/RUNBOOK-iphone.md`). macOS cannot write HealthKit.
- Shortcuts cannot delete Health samples.

## Slices

Every PR gets Devin's automatic review, and the lead answers each finding before
merge. Every slice here **waits** for the deep review before it lands: slice 1
controls access, slice 2 migrates data and changes outside systems, slice 3
rewrites stored plans, slice 4 writes to Apple Health, and slice 5 adds a token
that writes weigh-ins.

Run order: slices 1 and 2a in parallel. Slice 2b starts after slice 1 lands, on
top of 2a. Slices 3 and 4 start after slice 2 lands and can run in parallel.
Slice 5 starts after slices 3 and 4 land.

### Slice 1: Google sign-in and `ownerProcedure` (PR 1, #137)

**Changes**

- First, write a wizard with the `wizard` skill for the owner's part:
  - Create the Google Cloud project and OAuth consent screen (External, Testing
    mode, owner as the only test user).
  - Create the web OAuth client with production and `localhost:3000` redirect
    URIs.
  - Set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `OWNER_EMAIL` in Vercel and
    in local env files.
    Give the owner the wizard before writing code, so setup runs during the build.
- Add the Google provider to `auth.ts`. Add a `signIn` callback that allows only
  `OWNER_EMAIL` with `email_verified`.
- Add the three variables to `src/env.js`.
- Rename `protectedProcedure` to `ownerProcedure` in `src/server/api/trpc.ts`
  and its callers. `ownerProcedure` also checks the session email against
  `OWNER_EMAIL`, as a second check.
- Slice 0 rule: add a test that fails when any `weightLog.*` mutation, or any
  `weightLog.*` query that returns owner-only data, uses a procedure other
  than `ownerProcedure`. Follow `src/server/api/routers/youtube.test.ts`. The
  router does not exist yet, so the test must pass on an empty router and then
  guard slices 2 to 4.
- A minimal `/weight-log/edit` page: signed out, it shows only the Google
  sign-in button. Signed in, it shows a placeholder. It checks the session on
  the server before rendering anything (ADR 0003).

**Read first:** `auth.ts`, `src/server/auth.ts`, `src/server/api/trpc.ts`,
`src/env.js`, `docs/adr/0003-private-areas-check-access-where-data-is-read.md`,
`src/server/api/routers/youtube.ts` (`triggerSync`), `next.config.js` (the
`/weight-log/:path*` headers already cover the new page).

**Tests:**

- The `signIn` callback allows only the owner and rejects unverified email.
- `ownerProcedure` rejects anonymous and non-owner sessions.
- The procedure-guard test.
- `/weight-log/edit` renders no owner content without a session.

**Checks:** `pnpm verify`. A local sign-in with the real Google client once the
owner finishes the wizard.

**Done when** the owner can sign in at `/weight-log/edit` on production and any
other Google account is refused.

### Slice 2: storage, import, loader, entry, weekly table (PR 2, the cutover, #138)

Built in two steps on one branch. Merged as one PR on cutover day.

#### 2a: tables, import, loader (parallel with slice 1)

**Changes**

- Add tables to `src/server/db/schema.ts`. Use a `weight_log_` prefix, since
  `wl_` already means weightlifting.
  - Weigh-ins: a unique date, pounds, and an excluded flag.
  - Phases: kind, start, and end. No name column.
  - Planned weeks: phase, week start, target, and original target.
  - Set points.
  - Scans, with the columns in decision 4.
  - Historical context.
    Generate the migration with `pnpm db:generate`. Read the generated SQL before
    applying it. Production's migration journal has drifted before; see
    `~/.claude/projects/-Users-chappyasel-Desktop-Repos-PersonalWebsite/memory/gotcha_drizzle_vector_journal_drift.md`.
- An import command that takes the existing `import_workbook.py` output on
  stdin, plus the decrypted `history-context.enc`. It applies decisions 8 to 10,
  and writes in one transaction. It refuses to run against a database that
  already holds weigh-ins unless given an explicit replace flag. It never
  prints measurements.
- Extend `import_workbook.py` to emit the extra scan columns and the conditions
  note from `BF%`. Keep its existing checks.
- Rewrite `getWeightLog()` to build the same `WeightLog` DTO from the tables.
  Phase labels become derived names, and `kind` loses `other`. Keep the DTO
  shape otherwise, so the dashboard, Strength at Bodyweight, and
  `refresh-pareto.ts` stay unchanged. Add the new scan fields to the DTO only
  where something reads them.
- The parity test from decision 26. It runs against the imported database and
  the current snapshot, in a script the lead runs, not in `pnpm verify`, since
  it needs real data. Commit only synthetic fixtures.
- Remove the S3 read path, the encryption module, `scripts/weight-log/store.ts`,
  `restore.ts`, `restore-local.ts` and their tests, the `restore:weight-log`
  script, the `.superset/setup.sh` restore step, and the `data/weight-log`
  trace exclusion in `next.config.js`.
- Keep the prerender check in `scripts/check-weight-log-boundary.mjs`. Drop its
  checks for snapshot files.
- Point `refresh-pareto.ts --workbook` at the database.
- Rewrite `docs/weight-log.md`'s setup, refresh, automatic refresh, and access
  sections for the database. Keep the analysis sections.

**Read first:**

- `src/lib/weight-log/schema.ts`, `data.ts`, `chart.ts`, `presentation.ts`
- `scripts/weight-log/import_workbook.py` and `test_import_workbook.py`
- `scripts/weight-log/store.ts`
- `docs/weight-log.md`
- `src/server/db/schema.ts` (the `wl_` tables as a pattern)
- `docs/weightlifting-pareto.md`

**Tests:**

- Unit tests with synthetic data for the import rules (tail trim, derived names,
  one weigh-in per date) and for the DTO builder.
- The existing `src/lib/weight-log` and `src/app/weight-log` suites still pass.
- `test_import_workbook.py` covers the new scan columns.

**Checks:**

- `pnpm verify`.
- Run the import against a Neon branch, not the production branch, and run the
  parity script there. Report the named differences and nothing else.

#### 2b: entry and weekly table (after slice 1 lands)

**Changes**

- A `weightLog` tRPC router with:
  - `upsertWeighIn` (date, pounds)
  - `deleteWeighIn`
  - `weekTable` (by phase)
  - `phases` (for the picker)
    All on `ownerProcedure`.
- The `/weight-log/edit` page, built phone-first:
  - A "today" entry field at the top. The date defaults to the device's local
    date and can be changed.
  - A week grid for corrections.
  - The weekly table from decision 23, with a phase picker.
- Use shadcn components and the site's existing weight-log presentation helpers.
  Use Tooltip, never `title=`. Add no decorative metadata.
- The public page stays `force-dynamic` with no shared cache, so an entry shows
  up there on the next request.

**Read first:** `src/app/weight-log/WeightLogDashboard.tsx` (formatting
helpers), `src/lib/weight-log/presentation.ts`, and `AGENTS.md` (UI components
section). On phones, use no sheets or modals below 640 px wide.

**Tests:**

- Router tests for upsert replacing a same-date weigh-in, delete, and the
  week table math (trimmed average, deltas, gaps), using synthetic data.
- A page test that nothing renders without the owner session.

**Checks:**

- `pnpm verify`.
- A UI check on the worker Mac at phone width and desktop width, shown to the
  owner on a ParaDev page.

#### Cutover day (after the owner approves PR 2)

These steps happen in order, on one day, with the owner:

1. The owner weighs in and enters it in the workbook as usual.
2. Run the import against the production database. Run the parity script.
3. Merge PR 2. Confirm the production deploy contains the merge, then open
   `/weight-log` and `/weight-log/edit`.
4. Disable the Hermes job per decision 30.
5. `apple-health`:
   - Create the read-only role with `SELECT` on the `weight_log_` tables only,
     and write the connection string file.
   - Replace `sidecar_xlsx.py`'s ingest with a Postgres read that fills the
     same `weight_log` columns.
   - Update `paths.py`, `docs/schema.md`, and the README line about the
     spreadsheet.
   - Run the sync once and compare against the previous `health.db` rows.
     This is the home Git repository at `/Users/chappyasel`, on `main`. Commit
     only these files.
6. Point `analyze_sleep_debt.py` at `health.db`'s `weight_log`.
7. Tell the owner to stop using the workbook.
8. One week later, remove the Hermes job and its script.

**Done when** the owner's next morning weigh-in goes through `/weight-log/edit`,
shows on the public chart and in `health.db`, and the Hermes job is disabled.

### Slice 3: plan editing and set points (PR 3, #139)

**Changes**

- Router mutations on `ownerProcedure`:
  - Start a phase (kind, start Monday, starting target, lb/wk, end week). This
    ends the current phase per decision 9 and sets original targets from the
    new plan.
  - Change one week's lb/wk, shifting every later target (decision 11).
  - Move a phase's end (add weeks at the last rate, or remove weeks from the
    end).
  - Edit set points.
- Controls on `/weight-log/edit` for each.

**Read first:** slice 2's router and tables, `src/lib/weight-log/chart.ts`
(how future targets render).

**Tests:**

- Carry-forward math.
- Original targets never change after creation, and added weeks have none.
- Starting a phase trims the old tail and leaves weigh-ins untouched.
- Phases never overlap.

**Checks:** `pnpm verify`. A UI check on the worker Mac.

**Done when** the owner can start a phase, change a week's rate, and move the
end date, and the public chart shows the new plan.

### Slice 4: Apple Health mirror (PR 4, #140)

**Changes**

- A read endpoint for the Shortcut, under `src/app/api/` as a third-party
  integration route (`CLAUDE.md` allows REST here).
  - It requires `Authorization: Bearer` with a new `WEIGHT_LOG_MIRROR_TOKEN`
    and returns weigh-ins (date and pounds) for a date range.
  - It sends `Cache-Control: private, no-store` and never accepts writes.
- `apple-health/shortcut/build_shortcut.py`:
  - Add the mirror step to `Health Daily Sync`. It fetches the last 14 days,
    finds Weight samples from Shortcuts in that range, and logs a sample at
    07:00 local for each date that has none.
  - Add a separate `Weight Backfill` Shortcut that takes a year and does the
    same for that year.
  - Store the token the way the existing Shortcut stores its settings. Check
    `NOTES.md` first.
- Update `RUNBOOK-iphone.md` with the owner's steps, in order:
  1. Turn off Weight write access for Withings, MyFitnessPal, and Wyze.
  2. Delete all Weight samples (Browse > Body Measurements > Weight > Show All
     Data > Edit > Delete All).
  3. AirDrop both Shortcuts.
  4. Run the backfill once per year from 2018 to 2026, in the foreground.
  5. Confirm the 08:00 automation still has Run Immediately on.

**Read first:** `apple-health/shortcut/NOTES.md`, `build_shortcut.py`,
`RUNBOOK-iphone.md`, `apple-health/README.md` (daily path), and slice 2's tables.

**Tests:**

- The endpoint rejects a missing or wrong token and returns only the requested
  range.
- `build_shortcut.py` produces the expected actions. Follow the repo's existing
  shortcut tests, if any.

**Checks:**

- `pnpm verify`.
- Build the Shortcuts on the Mac. The owner installs and runs them; macOS cannot
  test Health actions.

**Done when** Health's Weight chart shows one sample per weigh-in from
2018-09-27 on, from Shortcuts only, and a new weigh-in on the site reaches
Health by the next 08:00 run.

### Slice 5: Log Weight Shortcut (PR 5)

Decisions 38 to 43. The design and the reasons behind it are in
[`shortcut-api-research.md`](./weight-log-migration-reports/shortcut-api-research.md).

**Changes**

- `src/lib/weight-log/bearer.ts`: `isBearerAuthorized`, moved from the
  mirror. The mirror route calls it.
- `src/lib/weight-log/weigh-ins.ts`: `saveWeighIn(db, { date, pounds,
  replace })` in one transaction under the shared plan lock, answering
  `saved`, `exists`, `replaced`, or `unchanged` with the previous pounds.
  `weightLog.upsertWeighIn` calls it with `replace: true`. The file also holds
  the Shortcut's date window and the request parsing.
- `src/lib/weight-log/week-summary.ts`: the week's row, colors, and count of
  weigh-ins, and the notification line.
- `POST /api/weight-log/weigh-in` and `GET /api/weight-log/week-card`, both
  on `WEIGHT_LOG_ENTRY_TOKEN`, with the card drawn by `next/og`.
- `WEIGHT_LOG_ENTRY_TOKEN` in `src/env.js` and `.env.example`, optional.
- "Entry from a Shortcut" in `docs/weight-log.md`, with token rotation.
- A "Log Weight" recipe in `apple-health/shortcut/RUNBOOK-iphone.md`.

**Tests:**

- `routes.guard.test.ts` lists every route under `src/app/api/weight-log/`
  with its token, and checks that each exported method refuses no token, a
  wrong token, and the other route's token before touching the database.
- `saveWeighIn`'s four outcomes, the lock, and `excluded` kept on a replace.
- The POST's date window, pounds as number or string, rounding, 503, 405, and
  no-store headers on every response.
- The week summary's trimmed average, a change across a phase boundary, a
  week with no target, and the summary line.
- The card through the real satori renderer for an empty week, one weigh-in,
  a full week, an excluded day, and a week with no target.

**Checks:** `pnpm verify`. `pnpm dev` against a Neon child branch with
invented weigh-ins, the POST through every outcome with `curl`, and the card's
PNGs on a ParaDev page.

**Done when** the owner runs Log Weight on the iPhone, the weigh-in appears on
`/weight-log/edit` and the public chart, a second run the same day asks before
replacing, and the notification shows the week card.

## Owner steps

- Slice 1: run the Google Console wizard and set the three Vercel variables.
- Slice 2: approve PR 2, be available on cutover day for the morning weigh-in,
  and stop using the workbook.
- Slice 4: set `WEIGHT_LOG_MIRROR_TOKEN` in Vercel. Then, on the iPhone:
  1. Change the Health permissions.
  2. Delete Weight samples.
  3. Install both Shortcuts by AirDrop.
  4. Run the backfill year by year.
- Slice 5: set `WEIGHT_LOG_ENTRY_TOKEN` in Vercel Production and redeploy.
  Then build Log Weight on the iPhone from the runbook and run it once.
- Every PR: say when to merge.

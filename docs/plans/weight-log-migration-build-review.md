# Weight Log migration build review

Build review for [`weight-log-migration.md`](./weight-log-migration.md).
Phase 2 started on November 9, 2026. The lead works in the
`weight-log-migration-15fb8de6` worktree. Full slice reports are in
[`weight-log-migration-reports/`](./weight-log-migration-reports/).

## Where it stands

Updated November 12. Every Weight Log PR has landed: #141 to #144 and #146 to
#154. The plan's slices are all live, and the session that ran the wave closed
on this date.

**Live on production (`www.chappyasel.com`):**

- `/weight-log` reads Postgres. The workbook was retired on Nov 4 and stays in
  iCloud as the archive.
- `/weight-log/edit` (Google sign-in, `OWNER_EMAIL`): the Weeks table is the
  editor. Days, targets, and lbs/w are edited in their cells, with Plan and Set
  points on their own pages. Headers read "+/-" and "lbs/w", and rates display
  to one decimal while storage keeps six. Each row is labelled with its week
  number beside the month over the day, without a year.
- Log Weight Shortcut: `POST /api/weight-log/weigh-in` saves, and
  `GET /api/weight-log/week-card` draws the portrait notification card (three
  weeks of days, then five weeks back to three ahead). Both use
  `WEIGHT_LOG_ENTRY_TOKEN`, which is set in Vercel Production.
  `GET /api/weight-log/weigh-in?date=` (#154) answers the last counted weigh-in
  before that date, but no Shortcut calls it since the prompt moved to a local
  cache. Removing it is optional.
- `/api/weight-log/mirror` (#147) answers 503 because
  `WEIGHT_LOG_MIRROR_TOKEN` isn't set. The Health mirror isn't running yet.

**apple-health** (`~/Desktop/Agents/apple-health`, local commits, not
pushed): the generated Log Weight Shortcut, last built from `84e31f0`, is at
`shortcut/private/Log Weight.shortcut`. It is signed with the entry token, so it
must not be shared. Its prompt reads `apple-health-sync/log-weight-last.txt` in
the Shortcuts iCloud folder and writes the file after each save. The read step
hasn't run on a device yet.

**Owner's next steps:**

- Reinstall Log Weight from `shortcut/private/` and run it twice. The first
  prompt is empty, and the second should open at once with the last weight. If
  the first run stops before the prompt, the missing-file read needs a fix
  (`reports/shortcut-placeholder.md`, Cache).
- Confirm the card fits the expanded notification with three weeks ahead.
- To start the Health mirror: set `WEIGHT_LOG_MIRROR_TOKEN` in Vercel, then
  run the iPhone runbook W0 to W9 (apple-health `shortcut/`).
- Say whether to push apple-health `main`.
- Decide whether the hourly `health.db` refresh should add site weigh-ins.
- Go through each "Owner to confirm" in this file and in the reports. Open ones
  include the any-timezone entry window, "cycle" (listed in `CONTEXT.md` as a
  word to avoid), 21 vs 19 trimmed weeks, and the one-decimal and half-rounding
  rules in `reports/week-card-portrait.md`.

**Next session (lead), whenever it picks this up:**

- A close-out PR that deletes the cutover scripts. Also remove the main
  checkout's `data/weight-log`, the S3 object, and the Neon branch
  `weight-log-import-test` (`ep-proud-union-akswp9yx`). Guard the branch id
  before any delete, because `neonctl branches get ""` returns production.
- From around Nov 16, after a week of clean entries, remove the Hermes job and
  `weight_log_refresh.py`.
- `/api/og/section` font tracing follow-up (see slice 5's notes).
- Plan decisions 44 and 45 were 38 and 39 on this branch. Slice 5 took 38 to
  43 on main first, so they were renumbered when this branch was rebased.

## Lead notes

- Production serves `https://www.chappyasel.com`. The apex 308s to `www`.
  Local `.env` sets `NEXTAUTH_URL` to the apex, and Vercel's value is encrypted.
  The wizard registers redirect URIs for both hosts and `localhost:3000`.
- `.env` and `.env.development.local` both resolve `DATABASE_URL` to the Neon
  production branch. Slice 2a imports into a separate Neon branch of project
  `dark-truth-49514399` (Personal Website, us-west-2).
- The wizard sets the Google variables in Vercel Production only, per decision
  17. Preview builds must still pass without them.
- `protectedProcedure` callers today: `youtube.triggerSync`,
  `books.triggerSync`, `weightlifting`, and `post`. All become `ownerProcedure`.

- Outside finding from the slice 1 builder: `src/app/meet/MeetBooking.test.tsx`
  read the real clock and failed 4 tests on `main` from November 9 (the fixture's
  Nov 10 rendered as "Tomorrow"). The lead pinned the clock in PR #142
  (branch `meet-test-clock`, worktree `.../PersonalWebsite/meet-test-clock`).
  It changes tests only. It waits for the owner's merge; until then `pnpm verify`
  is red on every branch.

## Slice 1: Google sign-in and `ownerProcedure` (#137)

PR #141, branch `worktree-agent-a0776e97748b772af`, head `963e99d1`. The full
builder report is `weight-log-migration-reports/slice-1.md`.

### Shortcuts

- No `pnpm build`. The variables are optional in `src/env.js`, so a build
  without them can't fail validation.
- The page test renders static markup with mocked server actions, not a real
  form post.

### Issues

- Every local sign-in writes `users`, `accounts`, and `sessions` rows to the
  production database, because local `DATABASE_URL` is production.
- Local sign-in works only on port 3000 (`NEXTAUTH_URL`).
- Codex deep review (`/private/tmp/.../scratchpad/codex-slice1-review.md`)
  found three problems, each needing auth rows that already exist: a legacy
  session for a matching user skips the verification check; signing in over a
  stranger's session links Google to the stranger; an existing owner user row
  with no Google link throws `OAuthAccountNotLinked`. The lead checked
  production on November 9: `users`, `accounts`, `sessions`, and
  `verification_tokens` all have 0 rows, and Google sign-in for the owner is
  the only way to create one. Not fixed; none of them can happen from this
  state.
- Devin: no issues.

### Ambiguities

- Auth.js's own `/api/auth/signin` page would be a second button. The builder
  pointed `pages.signIn` and `pages.error` at `/weight-log/edit`.
- An unconfigured deployment shows "Sign-in isn't available on this
  deployment."

### Judgment calls

- Owner to confirm: the signed-in placeholder has a Sign out button.
- Owner to confirm: page copy. "Signed in. Weigh-in entry arrives with the
  cutover." / "That Google account can't sign in here." / "Sign-in didn't
  finish. Try again." / "Sign-in isn't available on this deployment."
- Owner to confirm: the address comparison trims whitespace and ignores case.
  `email_verified` must be boolean `true`.
- `OWNER_EMAIL` is a plain optional string, so a malformed value refuses
  sign-in instead of failing the build.
- `ownerProcedure`: no session is `UNAUTHORIZED`, a non-owner is `FORBIDDEN`.
- The guard test identifies `ownerProcedure` by middleware identity and also
  flags `weight_log` or `weightlog` mounts.

### Checks

- `pnpm verify` green apart from the 4 `/meet` tests (fixed in #142). CI
  `check` passed on the PR.
- Guard proven to fail with a temporary unguarded router.
- Dev server with production-like `NEXTAUTH_URL` and a `www` host: the
  `redirect_uri` is the apex callback, the state cookies are host-only on
  `www`, and the 308 keeps the query.
- Google accepted all three registered redirect URIs and refused an
  unregistered one.

### Next steps

- Fresh Claude deep review (`weight-log-migration-reports/slice-1-claude-review.md`):
  nothing serious. Three low findings. (1) The guard checks only the first
  path segment, so a nested `weightLog` mount escapes it. (2) The guard can't
  see owner data read or written outside tRPC, such as a server action or a
  direct `db` read in the edit page. (3) Nobody has clicked the real
  server-action button yet. A fresh fixer is fixing 1 and 2 with automated
  checks. The owner's post-deploy check covers 3, and it must use the button.
- Fixed in `102ed249`. The guard now checks every router segment and flags
  near-miss spellings at any depth. A new `ownerDataBoundary.test.ts` fails when
  a file under `src/app/weight-log/edit/` imports the database or Drizzle, or
  when a `"use server"` module there exports anything besides the sign-in and
  sign-out actions. Both were proven to fail. The review is closed after one
  round. Waiting on the owner to merge #142, then #141.
- On November 9 the owner signed in on `localhost:3000/weight-log/edit` with
  the real Google client (slice 1 branch at `102ed249`). It worked. That
  created the owner's `users`, `accounts`, and `sessions` rows in production.
- Optional for the owner: set Vercel Production `NEXTAUTH_URL` to
  `https://www.chappyasel.com` to drop one redirect hop. The apex works as is.
- After merge and deploy: the owner signs in at
  `https://www.chappyasel.com/weight-log/edit`, signs out, and tries another
  Google account.

## Slice 2: storage, import, entry, weekly table (#138)

2a is on branch `worktree-agent-a772e01a4518be175` (pushed, no PR), head
`313897bf`, worktree `/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/agent-a772e01a4518be175`.
The full report is `weight-log-migration-reports/slice-2a.md`, and it has the
cutover-day commands. The Neon test branch is `weight-log-import-test`
(endpoint `ep-proud-union-akswp9yx`). The production endpoint is
`ep-winter-base-akkl2xak`.

### Shortcuts

- Weekly-average parity compares trimmed means recomputed from both sides, not
  Excel's saved cells. The importer already checks those cells on every run.
- The cutover-only scripts are `import.ts`, `parity.ts`, `parity-check.ts`,
  and `sources.ts`, a decrypt-only copy of the old format. Delete them after
  cutover.

### Issues

- The plan's fact was wrong: the Jan '26 cut has 20 empty planned weeks, not
  19. The same rule also trims one empty week from Feb '19 - Jul '19. That
  makes 21 dropped weeks plus 2 shortened phase ends. The import computes this
  from the data.
- `refresh-pareto.ts --check-reference` (the September 12 reference) fails on
  both the old snapshot and the database. Later weigh-ins moved that day's
  smoothed bodyweight. It's stale reference data, not a regression.
- Nothing in the database prevents phase overlap. 2b and slice 3 writes must
  keep phases back to back.
- The S3 object and the gitignored `data/weight-log/*.enc` in the main
  checkout remain until after cutover.
- `tests/superset-setup.test.ts` timed out once under load and passed alone.

### Ambiguities

- Owner to confirm: the running phase is named "Bulk Aug '26 - Aug '27"
  because its planned weeks run to Aug '27. The workbook's own label said
  "Mar '27".
- Several derived names end a month later than the old typed labels, for
  example "Bulk Sep '18 - Feb '19" for "Sep '18 - Jan '19". A phase now ends
  the day before the next one starts (decisions 9 and 10).
- `--workbook` is removed from `refresh-pareto.ts`, which now always reads the
  database. The encrypted `pareto.enc` audit file is gone.
- The new scan columns are stored, but nothing in the DTO reads them yet.

### Judgment calls

- Owner to confirm: maintenance phases are named "Maintain ...".
- Owner to confirm: the public phase picker shows only the derived name,
  without the old "Cut · " prefix.
- Owner to confirm: the "Last import" header now means the latest weigh-in
  change. 2b should relabel it.
- Set points are labelled "Set point 1" and "Set point 2".
- The regional-panel parser fails on an unknown row label instead of skipping
  it.

### Checks

- Migration `0023_weight_log.sql` creates seven new tables, with check
  constraints added by hand, and touches no existing table.
- Import on the Neon branch: 1627 weigh-ins (1 excluded), 20 phases, 463
  planned weeks, 2 set points, 10 scans, 1 recollection, 917 strength
  readings. A second run without `--replace` refused to write.
- Parity: 0 unexpected differences.
- `pnpm verify`: only the 4 `/meet` tests and one setup-test timeout failed.
- Codex deep review of 2a (`scratchpad/codex-slice2a-review.md`) found two
  problems and nothing serious in the loader, transaction, migration, or page
  boundary.
  1. Parity passed without checking the added scan columns when `--workbook`
     was left out. The lead fixed it in `bcc66f0b`: `--workbook` is required,
     and a scan in only the workbook or only the database is reported. A rerun
     on the Neon branch still shows 0 unexpected differences.
  2. The importer trims whitespace from the scan conditions note and stores a
     blank note as null. The lead accepted this as a normalization. The note
     is text the owner typed, and nothing reads it yet. Not fixed.
- The fresh Claude deep review runs on the whole slice 2 PR after 2b, since
  2b adds the router and the edit page.

### Next steps

- 2b started on November 9, before #141 merged, at the owner's prompting ("I
  just saw an empty page"). It runs in 2a's worktree with the slice 1 branch
  merged in. The lead rebases onto `main` after #141 lands. The report goes to
  `.slice-2b-report.md` in that worktree.
- Cutover-day steps are in the 2a report's "Next steps".

### 2b (entry and weekly table)

The builder's report is `weight-log-migration-reports/slice-2b.md`. Head
`9e5dceda`; the branch merges slice 1 in at `3c47c721`. The cutover PR is
#144 (opened by the lead, not to merge before cutover day). The UI check
screenshots are on the ParaDev page
https://app.superset.sh/page/weight-log-editor-check-3mvav9, visible only to
the owner because it shows real weights.

- Router `weightLog` (`upsertWeighIn`, `deleteWeighIn`, `phases`,
  `weekTable`) on `ownerProcedure`. An upsert keeps the `excluded` flag. The
  router refuses dates after tomorrow in UTC.
- Owner to confirm: "Gap to original target" is target minus original target
  (workbook column AA), not average minus original target.
- Owner to confirm: "Change from last week" compares with the previous
  calendar week across a phase boundary. lb/wk is empty in a phase's first
  week.
- Owner to confirm: "Last import" is relabelled "Updated", and the table
  headers are abbreviated (Avg, Chg, Target, Gap, lb/wk, Orig, Gap), each with
  a Tooltip.
- After a delete, "Updated" doesn't move.
- Strength at Bodyweight picks up a new weigh-in within its five-minute cache.
- `loadWeekRecords` runs three reads without a transaction.
- The headless check ran on Portable at 1.9 to 2.6 per core (the worker was at
  8 to 11). The builder restored the Neon branch afterwards and confirmed it
  with an md5 over every weigh-in.
- The lead copied the Google keys into the cutover worktree's `.env.local` and
  runs it on `localhost:3000` against the Neon test branch so the owner can try
  it. The owner's sign-in there creates user rows only on the test branch.
- Fresh Claude review of all of slice 2
  (`weight-log-migration-reports/slice-2-claude-review.md`). Nothing loses data
  during the import. Findings:
  1. Medium: the editor's "today" never advances. A tab left open overnight
     saves over yesterday's weigh-in. Fix A.
  2. Medium: on cutover morning parity compares against a snapshot older than
     the workbook. The runbook in `docs/weight-log.md` is also missing the
     migrate step and the absolute `.enc` paths. Fix B.
  3. Low: `--replace` after cutover would erase site entries. Fix B.
  4. Low: the public payload carries the exact time of the last save, and the
     header shows the UTC date. Fix A.
  5. Low, for slice 3: a new phase starting on a Monday that already has
     weigh-ins would leave that week's row in the old phase and hit the
     primary key. Starting a phase must move the old phase's rows on or after
     the new start. Goes into the slice 3 brief.
  6. Low: reverting #144 after the first site entry is not a rollback. Roll
     forward or restore Neon. Fix B adds this to the runbook.
  7. Low: the owner should see that 21 weeks are trimmed, not 19. Told to the
     owner on November 9; no objection.
- Codex review of 2b: still running when the fixes started. Its findings go to
  fix A if they fall in A's area.

### Owner's request: spreadsheet colors (November 9)

The owner asked to replicate the workbook's coloring. The lead read the
conditional-formatting rules (not the values) on all 20 phase tabs. Every tab
since mid-2023 uses two rules:

- Mon to Sun weigh-ins: white `#FCFCFF` to green `#63BE7B`, min to max, over
  the phase.
- Average, Target, and OG Target: blue `#5A8AC6`, white `#FCFCFF` at the 50th
  percentile, red `#F8696B`. One scale is shared across the three columns.

Left out: the dropped %bf/wk scales, the 2021 to 2024 tabs' ± column scales
and data bars, which the current tabs dropped, and the `BF%` sheet (the public
DEXA table has its own). The owner approved adding Mon to Sun columns to the
weekly table so the green scale has a home. Dark mode interpolates through the
card background instead of white.

### Fix round 1 (November 9, after "Run the implementation")

- Fix A (`weight-log-migration-reports/fix-a.md`): stale today, a "Replace"
  label, the public Updated date as a Pacific calendar date, and the colors
  with Mon to Sun columns.
- Fix B (`weight-log-migration-reports/fix-b.md`): exact parity against the
  workbook export, with the snapshot comparison reported but not failing; the
  full runbook in `docs/weight-log.md`; the `--replace` guard.
- A and B share the cutover worktree with separate file ownership and commit
  only their own files.

#### Fix A result (`63ee71c0`, `04e89aa4`, `447ed768`, pushed to #144)

- Done. "Today" now updates on visibilitychange, pageshow, focus, and a
  midnight timer. A typed draft keeps its date. "Replace" shows on a date
  that already has a weigh-in, with "Replaces N lb" once the owner types, and
  saving the same value is disabled. The public "Updated" date is the Pacific
  calendar date with no time of day. The pareto field became
  `bodyweightUpdatedOn`.
- The weekly table runs Week, Mon to Sun, Avg, Chg, Target, Gap, lb/wk, Orig,
  Gap, which is the workbook's order. Days use the green scale. Avg, Target
  and Orig share one blue-white-red scale. Excluded days are struck through,
  unfilled, and carry a Tooltip.
- Checks: `pnpm verify` passes except the known `/meet` failures (PR #142)
  and one load timeout. Screenshots at 390 and 1280 in light and dark are
  version 2 of the ParaDev page. The test branch's weigh-ins were the same
  before and after, by checksum.
- Judgment calls, Owner to confirm:
  - the workbook's column order, so on a phone the summary sits to the right
    after a sideways scroll
  - black or white text on filled cells
  - dark mode's white stop replaced by `#262626`, so low values look unfilled
  - the word "Bodyweight updated"
  - excluded weigh-ins left out of the scale's range
- Gaps:
  - Nobody compared the colors against the workbook's rendered cells. The
    owner should check one phase.
  - No real iPhone has restored the tab the next morning.
  - The screenshots ran on Portable, under load, because the worker was
    worse.
  - With zero weigh-ins, "Updated" shows 1969-12-31.
  - Deleting a weigh-in doesn't move "Updated" back.
- Process issue: two agents committing in one worktree. The lead's merge
  `92eee4fc` took in A's staged border fix (sticky Week column borders).
  The content is right; it just has no commit message of its own. Next time,
  one agent per worktree.
- The lead added A's suggested lines to `docs/weight-log.md` (`5fe9e9f6`).
- Next: once the cutover scripts are deleted, tighten
  `importedAt`/`sourceModifiedAt` to `z.iso.date()`.

#### Fix B result (`affb2932`, `a2d7c798`, pushed to #144)

- Done. Parity now compares exactly against the workbook export. The old
  snapshot is an informational section that never fails, except for
  recollection and strength readings, which only the snapshot carries. The
  real run on the Neon branch found 0 unexpected differences, and its counts
  match the import.
- `--replace` refuses when the database holds weigh-ins the export lacks or
  records differently. `--discard-site-entries` overrides it. This was proven
  on the branch with dry runs and a checksum taken before and after.
- The runbook (`docs/weight-log.md` → "Cutover day") has: the journal check
  (`pending-migrations.ts`), `db:migrate:prod`, a dry run, the import, parity,
  "never revert, roll forward or PITR", and a follow-up PR that deletes the
  scripts. Production today: only `0023_weight_log` is pending.
- Judgment calls, Owner to confirm: the extra `--dry-run` step on cutover day.
  The runbook names the production host by hand rather than committing it.
- Gaps: the guard's real delete-and-insert path has never run, since only
  dry runs were made. The guard doesn't catch a weigh-in deleted on the site,
  so `--replace` would bring it back. Catching that would also block
  legitimate reruns.
- Open: when B ran `pnpm verify`, it failed on tsc errors in A's in-flight
  `WeightLogEditor.test.tsx`. The vitest failures were `/meet` (PR #142 fixes
  it) and two load timeouts that pass when run alone. A owns the tsc fix,
  then rerun verify.

## Slice 3: plan editing and set points (#139)

Started November 9, after fix A landed. The builder `slice3-plan` works in
`.claude/worktrees/slice3-plan-editing`, on branch `weight-log-plan-editing`
cut from the cutover head `5fe9e9f6`. Its draft PR targets the cutover branch.
The brief includes review finding 5: starting a phase moves the old phase's
rows on or after the new start into the new phase, and a test checks after
every mutation that no planned week lies outside its phase. Live checks run
on a child Neon branch, `weight-log-slice3-check`, which the builder deletes
afterwards. The report goes to `reports/slice-3.md`.

## Slice 4: Apple Health mirror (#140)

### Builder report (November 9, `reports/slice-4.md`)

- Branch `weight-log-health-mirror` at `02ad6d19`, pushed, no PR yet. It
  touches six files: the `GET /api/weight-log/mirror` route, the `mirror.ts`
  helper, their tests, and `env.js` and `.env.example`. It merges cleanly onto
  the cutover head.
- The token is `WEIGHT_LOG_MIRROR_TOKEN`, compared as a constant-time SHA-256.
  With no token set, every request gets 503. A missing or wrong token gets
  401, and neither touches the database. The response carries only date and
  pounds, over at most 366 days, with no-store and noindex. Other methods get
  405.
- The Shortcuts live in `~/Desktop/Agents/apple-health/shortcut/`, uncommitted,
  in six paths. `Health Daily Sync` keeps its 210 actions unchanged and adds 37
  for the mirror. `Weight Backfill` is new, 36 actions, one year per run, and
  asks for confirmation before it writes. The token is asked for at import
  and is never stored in a file. Build guards fail any Health write other
  than a guarded Weight write in lb.
- Checks: 34 route tests and 16 builder tests pass. `pnpm verify` passes
  except the known `/meet` failures and timeouts under load. A live read-only
  run on the Neon test branch matched the database's counts for every year.
  Nothing was checked on a phone.
- Judgment calls, Owner to confirm:
  - excluded weigh-ins are mirrored
  - a sample from any source marks a date as done
  - samples are logged at 07:00 in the phone's current time zone
  - the 60-day look-back
  - one confirmation tap per backfill year
  - the token is pasted at each import
- Unproven until the phone: parsing `<date> 07:00` with Specified Date, and
  the Bearer header in Get Contents of URL. The runbook's 2018 spot check is
  the test.
- Issue: in apple-health, the signed `Health Daily Sync.shortcut` and
  `probe-capture.shortcut` were already deleted in the working tree before
  this slice ran, by someone else. Stage only the slice's six paths, and
  re-sign at step 0.
- Deep review: Codex is running (`scratchpad/codex-slice4-review.md`), and a
  fresh Claude reviewer follows.

Started November 9 on branch `weight-log-health-mirror`, cut from the cutover
branch, in worktree `.claude/worktrees/slice4-health-mirror`. Changes in
`~/Desktop/Agents/apple-health/shortcut/` are left uncommitted in the home repo
for the lead to commit after review. No Shortcut is built, signed, or
installed. The report goes to `weight-log-migration-reports/slice-4.md`.

## Owner asks during the build (2026-11-09)

- **Sign-in screen.** The owner said the signed-out page looked bad. It is now a centered card with "Weight Log", one line, and a full-width Google button: commit `3592e567` on PR #141, merged into the cutover branch as `92eee4fc`. Judgment call, Owner to confirm: the line reads "Sign in to add weigh-ins." That merge also took in fix A's staged 8-line `WeightLogEditor.tsx` edit, and fix A has been told.
- **Quick weigh-in Shortcut with a weekly card.** The owner wants a Shortcut that saves today's weight and shows how the week is going. Research is done: `reports/shortcut-api-research.md`. It recommends slice 5, built after #144 and slice 4: a scoped `WEIGHT_LOG_ENTRY_TOKEN`, a POST weigh-in route and a PNG week-card route, and Show Notification with the card. It waits for the deep review. Seven open questions are with the owner. It changes decisions 15 and 36 and un-defers the "Log Weight" Shortcut, so nothing is built until the owner says yes.
- **Codex hang (lead's mistake).** Started in the background without
  `< /dev/null`, `codex exec` sat at "Reading additional input from stdin" for
  1h46m (2b) and 32 min (slice 4) without reviewing anything. Both were killed
  and rerun with stdin closed at 14:58. The 2b rerun also covers fix A and fix
  B. Rule from here on: always close stdin on a background `codex exec`.

## Fix round 2 (November 9, Codex deep reviews)

- **Codex on 2b and fix round 1** (`reports/codex-slice2b-review.md`): nothing
  critical or high. Three P2 findings went to fresh fixer `fix-c-cutover`,
  whose report goes to `reports/fix-c.md`:
  1. `--replace` can still erase a save that lands between the guard's read
     and the delete. Fix: a table lock held through the check.
  2. A date before the first phase can be saved and then can't be reached or
     deleted from the page.
  3. A pending save's completion wipes a newer draft typed on another date.
  Slice 3 was told to finish on `5fe9e9f6` and merge the cutover branch
  afterwards.
- **Codex on slice 4** (`reports/codex-slice4-review.md`): the endpoint is
  sound. Four Shortcut findings went to fresh fixer `fix-d-health`, whose
  report goes to `reports/fix-d.md`:
  1. Medium: travel breaks the date check that stops duplicates.
  2. Medium: the 60-day Find's "No Samples Found" modal can block unattended
     runs forever.
  3. Low: the backfill's look-back stops covering 2018 after November 2028.
  4. Low: the structural check accepts a broken duplicate guard.
- Still to come for slice 4: a fresh Claude reviewer, after fix D.

### Fix D result (`reports/fix-d.md`, apple-health uncommitted)

- All four Codex findings held up and are fixed. Samples are now written at
  one fixed instant, `<date>T12:00:00Z`, and the duplicate guard compares the
  ISO date of that same Date in the run's own zone. Find and the write loop
  sit inside "site count > 0". The daily Find is Latest First, Limit 60, over
  36,500 days. Both Finds must reach back to 2018 until 2100. The structural
  check now requires the guard's operand to be exactly that Date's ISO
  format. Tests: 42 of 42, including 14 mutation cases.
- Health now shows mirrored samples at 4:00 or 5:00 AM Pacific, not 7:00.
- Judgment calls, Owner to confirm:
  - 12:00 UTC rather than a local time. The site's date holds from UTC-12 up
    to, but not including, UTC+12. In New Zealand Health shows the next day.
  - "greater than 0" stands in for the device-proven "is not".
  - the newest 60 samples in the daily Find
  - the new `Health Daily Sync` is installed after the backfill
  - today stays in the daily range, even though the sample is future-dated
    east of UTC-4
- Unproven until the phone: that `T12:00:00Z` parses as UTC. The W5 spot
  check is the test, and 12:00 PM there means the `Z` was ignored.
  Also unproven: the nested Repeat, and the condition code.
- Fresh Claude review of slice 4 is running and reports to
  `reports/slice-4-claude-review.md`.

### Fix C result (`reports/fix-c.md`, pushed to #144 at `b16764ab`)

- All three Codex 2b findings held up and are fixed, each test-first:
  1. A real `--replace` run now starts with `LOCK TABLE weight_log_weigh_ins
     IN EXCLUSIVE MODE`, held to commit. The transaction moved into
     `scripts/weight-log/import-database.ts`. A live race on a Neon child
     branch lost the save without the lock and kept it with the lock. The dry
     run stays read-only, with no lock.
  2. The week grid reads a new `weightLog.week` (`ownerProcedure`) by
     calendar week, so every saved weigh-in can be reached by typing its
     date, including dates before the first phase.
  3. Each save or delete clears only the draft it sent, and delete
     confirmation is keyed by date.
- Checks: `pnpm verify` passes except the known `/meet` failures, and the
  meadow check is clean.
- Judgment calls, Owner to confirm:
  - the lock covers only the weigh-in table, the one the site wrote before
    slice 3. Slice 3 adds writes to phases and planned weeks, but `--replace`
    is dead after cutover, so this matters only if the import is reused.
  - a save during an import waits rather than fails
  - the server still accepts dates back to 2000
  - the editor stays editable while a request is pending
- Gaps: the editor wasn't driven in a browser for this round, only unit
  tests. The Previous arrow still stops at the first phase, so a pre-phase
  week is reached by typing its date.
- Issue: `neonctl branches create` printed a child branch's password into
  the agent's tool output. The branch is deleted, so the credential is dead.
  Future briefs say to filter it.
- The lead formatted `ownerDataBoundary.test.ts`, which failed
  `prettier --check` (`0635835b`). Slice 3 was told to merge the cutover head.

## Landed (November 9, on the owner's "go for it")

- Squash-merged to main: #142 `13674254` (the `/meet` test clock), #141
  `7a745af6` (sign-in, `ownerProcedure`, the guards, the centered card), and
  #143 `5b167fda` (body fat off by default). CI's only failures on #141 and
  #143 were the four `/meet` tests that #142 fixes.
- Production deploy of `5b167fda` succeeded. `www.chappyasel.com/weight-log/edit`
  serves the sign-in card with the Google button, and `/weight-log` and
  `/meet` answer 200.
- Devin never reviewed #141's last commit (`3592e567`, the card). It is
  layout only.
- The cutover branch merged main as `71e83947` and is pushed. The edit-page
  conflicts kept the cutover's versions, which already contain slice 1. The
  doc conflict keeps both sentences. Typecheck passes, and 189 weight-log,
  `/meet` and router tests pass. Slice 3 was told to merge `71e83947`.
- Still owed: the owner clicks "Sign in with Google" on production. Slice 1
  review finding 3 says that server-action path has never run there.

### Slice 4 fresh Claude review (`reports/slice-4-claude-review.md`)

- The endpoint is sound, and the first 210 actions are unchanged. The time
  zone claim holds for samples the mirror wrote, but not for samples entered
  by hand.
- High: W3, "delete all Weight", can lose readings a scale wrote to Health
  after the 2026-09-04 export that never reached the site. Decision 34 covers
  only the 52 days in that export.
- Medium:
  - "No Samples Found" can mean Weight read access is off, which would
    rewrite every date.
  - Seven mutations of the built Shortcuts pass the build checks, including
    taking the value from `excluded` instead of `pounds`.
  - A sample corrected by hand duplicates after travel.
  - `Log My Weight` still writes Weight.
  - Allow Once on the first web request stalls the next 08:00 run.
  - The `T12:00:00Z` parse is checked only after a whole year has been
    written.
- Low:
  - today's sample can be dated in the future
  - the 210-action test compares the builder with itself
  - the token has no minimum length
  - nothing confirms the backfill landed
  - nobody has tried a single-weigh-in response
  - decisions 32 and 33 in the plan still describe 07:00 local and the
    Shortcuts-only check
- All of it went to fresh fixer `fix-e-health`, whose report goes to
  `reports/fix-e.md`. This is the second and last review round. Whatever is
  left after it stays here.
- Lead to do: update decisions 32 and 33's wording in the plan to match what
  shipped, marked as a lead edit, with the owner to confirm.

## Slice 3 result (`reports/slice-3.md`, draft PR #146)

- Draft PR #146 targets the cutover branch. The lead merged the cutover head
  with main into it (`bd65cab2`). 247 weight-log, router, script and `/meet`
  tests pass.
- Pure planners in `src/lib/weight-log/plan-edits.ts` handle start, rate
  change and end move. `planViolations` checks every invariant, and a
  1,000-edit randomized run passes. The router adds `startPhase`,
  `changeRate`, `moveEnd`, `setPoints` and `saveSetPoints`, all on
  `ownerProcedure`. Each runs in one transaction under an advisory lock, and a
  start from a stale page gets `CONFLICT`. `PlanEditor.tsx` adds Plan and Set
  points sections under Weeks, and a start needs two taps to confirm.
- Live check on a Neon child branch: a rate change moved every later target,
  extending and shortening work, a shorter plan past a weighed-in week is
  refused, and a retroactive start moves that week into the new phase
  (finding 5). Two simultaneous starts gave one success and one `CONFLICT`.
  The weigh-in fingerprint never changed. Screenshots:
  https://app.superset.sh/page/weight-log-slice-3-ui-check-vzmvxu
- Judgment calls, Owner to confirm:
  - shortening past weighed-in weeks is refused, not cut short
  - a moved week takes the new plan's target as its original target
  - a start on the current Monday replaces the phase
  - a new plan must cover every weighed-in week from its start on
  - only the running phase's end moves
  - the starting target has no direct edit
  - set points save as one list, at most 10
  - the start picker runs from 12 weeks back to 26 weeks ahead, defaulting
    to next Monday
  - targets are stored to 6 decimals and rates entered to 2
- Ambiguity: decision 9 versus finding 5. The build follows finding 5, so
  every week on or after the start joins the new phase.
- Issues: an old "uncontrolled to controlled" console warning in the Weeks
  picker. The router tests check SQL through a proxy, and only the live check
  ran it.
- Deep review: Codex is running (`scratchpad/codex-slice3-review.md`), and a
  fresh Claude reviewer follows.

### Slice 3 Codex review (`reports/codex-slice3-review.md`)

- P1:
  1. A stale tab's rate or length save can change a different phase, since
     the payload names only `weekStart`.
  2. A refetch can retarget an armed start confirmation, so it replaces a
     phase the owner never saw.
- P2:
  3. The rate selector disappears after a length change.
  4. Two concurrent set-point saves can collide on the primary key.
  5. The import and a phase start can deadlock.
- P3:
  6. Rounding lets a set point of 0 through.
- All six went to fresh fixer `fix-f-plan`, whose report goes to
  `reports/fix-f.md`. A fresh Claude reviewer follows, the last round.
- Lead note: both P1s need two tabs editing the plan at once. Real but
  unlikely for one owner. They're fixed because a wrong plan write is silent.

### Fix E result (`reports/fix-e.md`, apple-health uncommitted)

- The second and last review round is done. The runbook is now W0 to W9, and
  the delete moved to W5 behind three new steps:
  - W2 confirms Weight read and write access, and turns off every other
    Weight writer.
  - W3 dry runs the backfill on 2026 with Always Allow and taps Cancel at
    the counts.
  - W4 takes a fresh Health export, and a pasted script lists the Weight
    dates since 2026-09-04 that the site lacks.
- After the delete, W6 writes one sample (2018-09-27) and checks its exact
  instant before any year is written. W8 reruns every year and expects
  `logged 0`.
- Changes in the Shortcuts:
  - The daily writes only when Health's count is above 0, so a refused read
    writes nothing.
  - The backfill takes a day range.
  - The readout shows logged, already there, and the site's count.
  - `mirror_check` now rejects every mutation the review found. Tests: 68
    of 68.
- Lead, in this repo: `WEIGHT_LOG_MIRROR_TOKEN` must be at least 32
  characters (`64ba460a` on `weight-log-health-mirror`). The plan's decision
  33 and slice 4 now note 12:00 UTC and the any-source duplicate check, as a
  lead edit for the owner to confirm.
- Judgment calls, Owner to confirm:
  - keep the daily range through today (the future-dated sample only happens
    abroad)
  - retire `Log My Weight`
  - the backfill has no Health-count guard, so its alert is the check
  - a day range instead of a separate test Shortcut
- Phone-only: the `T12:00:00Z` parse, the `MM-DD` defaults, the "has any
  value" row guard, the website prompt's wording, and the Reset Privacy path.
- W4 needs `/weight-log/edit`, which the cutover ships before slice 4.
- Next: commit the six apple-health paths, open the slice 4 PR after the
  cutover, then the owner's runbook.
- Lead committed the six apple-health paths as `816b7fa`, local only and not
  pushed. The two `.shortcut` deletions and the other sessions' edits there
  are untouched. The Shortcuts are still unsigned; that happens at runbook
  step W0.
- Owner decided, November 9: retire `Log My Weight` (now decision 38), and
  keep the daily mirror range through today (decision 39). Both are already
  how the build and runbook behave, so nothing changes in the code.

## Cutover day (November 9, on the owner's "now")

The owner confirmed production Google sign-in works ("sign in worked"), which
settles slice 1 review finding 3.

From the cutover worktree, with `DATABASE_URL` unset and `node --env-file=.env`
(host checked as `ep-winter-base-akkl2xak` before each step):

1. `pending-migrations.ts`: only `0023_weight_log` pending.
2. `pnpm db:migrate:prod`: applied. Rechecked: latest `0023_weight_log`,
   pending none.
3. Dry run passed.
4. Import: 1627 weigh-ins (1 excluded), 20 phases (9 bulk, 8 cut, 3
   maintenance), 463 planned weeks, 2 set points, 10 scans, 1 recollection,
   917 strength readings, one transaction. Running phase Bulk Aug '26 - Aug
   '27. Trimmed 21 empty planned weeks. Decision 26 names 19. Parity counted
   the trim as intended, so the import's trim rule accepted both extra weeks.
   The lead has not yet checked which two they are. Owner to confirm.
5. Parity: 0 differences from the old snapshot, 0 unexpected differences from
   the workbook and historical context. Exit 0.
6. #144 squash-merged as `44c9112d`.
7. Hermes `Weight Log Refresh` (`7bd64831c4b3`) paused on Portable with
   `hermes cron pause`. Removing it and `weight_log_refresh.py` waits a week
   (decision 30).
8. apple-health and sleep-debt switch (decisions 28, 29, 31) delegated to an
   agent; report at `reports/cutover-apple-health.md`.

The workbook's last weigh-in is Nov 4 (file mtime Nov 4 10:30). Nov 5-9 were
never in the workbook, so the owner enters them on `/weight-log/edit`. No
catch-up import (decision 27).

Lead mistake worth recording: plan cutover steps 5-6 (apple-health and
sleep-debt) belonged to no slice's brief. Slice 2b's brief covered the import
and the page, slice 4's the mirror, and nobody owned the reader switch until
cutover day. Caught on the day from the plan's cutover list.

### After the merge

- Production deploy of `44c9112d` succeeded. `/weight-log` answers 200 and
  renders the imported running phase. `/weight-log/edit` answers 200 with the
  sign-in card. `weightLog.week` answers a signed-out request with 401.
- A network drop (DNS failure) stopped both running agents mid-task around
  22:16 UTC. Both were resumed with the state the lead saw from outside.
- Slice 4 rebuilt as branch `weight-log-mirror` from main: its two commits
  (`02ad6d19`, `64ba460a`) cherry-picked as `b6f0b06a`, `c798bfc8`. Merging
  main into the old branch gave 17 add/add conflicts, because the branch held
  the cutover branch's pre-squash history. Typecheck, lint, and 157 tests pass.
  PR #147, not merged. The old branch `weight-log-health-mirror` stays on origin.
- The cutover review dev server on :3000 is stopped.

### Slice 3 fresh Claude review (`reports/slice-3-claude-review.md`), the last round

Fix F's gate on `040e6bc1` (main merged in) passed every step. The lead
filled in its result and stopped the agent. #146 now targets main, holds only
slice 3's 12 files, and is out of draft. Not merged.

The reviewer found no P0-P2. Ten P3s. Three depend on imported data, so the
lead ran read-only counts on production: the running phase has 0 planned
rows with no target, its first planned row is on its start, and there are 2
set points. So **P3-1, P3-2 and P3-9 cannot happen on today's data.** (34
no-target rows exist, all in ended phases, which the page doesn't edit.)

Fixed by the lead in `27d123bc`: **P3-3**. Picking the running phase in Weeks
and then starting a phase on its own Monday left the table on the deleted
phase, failing to load. The table now falls back to the current phase. The
rule is a pure `tablePhaseToShow`, with three tests. The same commit runs
Prettier on the two PlanEditor files, which failed `prettier --check` at
`040e6bc1` while ESLint passed.

Left for later (two review rounds are the limit). None touches stored data:

- **P3-4**: a double tap on Rate, Length, or Set points between save and
  refetch sends a stale revision. The server refuses it, and the page can then
  show "The plan changed since this page loaded it" over the success line.
  The fix is the `landing` flag Start a phase already uses.
- **P3-5**: a weigh-in saved from another device while a plan edit's
  transaction is open can land in a week the edit just deleted. The weigh-in
  survives but shows no target. The fix is a shared advisory lock in
  `upsertWeighIn`.
- **P3-6**: the Start confirmation says an already-ended current phase "ends"
  the Sunday before. Only imported data can reach this.
- **P3-7**: the API accepts any start Monday (the page offers 12 back and 26
  ahead). Owner-only, so only a scripted mistake reaches it.
- **P3-8**: a rate of 10.004 or a target of 0.04 passes the page and fails
  zod on the server, so the page shows a generic "Try again."
- **P3-10**: the cutover import's `--replace` guard ignores plan and set point
  edits. The script is due for deletion, which ends this.
- P3-1, P3-2, P3-9 as above, if a later data fix ever creates those shapes.

### apple-health and sleep-debt (`reports/cutover-apple-health.md`)

Decisions 28, 29 and 31 are done.

The live sync runs from `~/Desktop/Agents/apple-health`. The plan's "home Git
repository" was stale: it has no commits.

- **Read-only role.** `weight_log_reader` can SELECT the seven `weight_log_`
  tables only. It is `default_transaction_read_only` and `NOINHERIT`. Its URL
  is in `~/.config/personal-website/weight-log-readonly-url` (600). As that
  role:
  - SELECT on `users` and `accounts` is refused.
  - INSERT, UPDATE and CREATE TABLE are refused even with READ WRITE forced.
- **Reader.** `sidecar_xlsx.py` is replaced by `sidecar_weight_log.py`, which
  reads Neon's HTTPS SQL endpoint with `urllib`, standard library only.
- **Commits.** apple-health `031484a` (the agent) and `0afe8a7` (the lead,
  keeping the role create and rotate script). Both are local and unpushed,
  on top of slice 4's `816b7fa`.
- **Live run.** The table was backed up first, and `health_sync.py
  weight-log` wrote 1,627 weigh-ins. All 1,624 shared dates are equal on
  weight, phase, week, and target. Only the three days from Nov 2 to Nov 4
  are new in `daily`, and `validate` passes.
- **Intended differences.**
  - `period_sheet` holds the derived names (20 to 20). Four end months move to
    the phase's actual end.
  - `week_avg_lb` is now filled for 3 rows the workbook left blank.
  - `week_delta_lb` follows the site's definition. Nothing reads it.
- **Sleep-debt.** `analyze_sleep_debt.py` (gitignored, edited in place)
  reads `health.db`. Weight, phase and debt are equal on all 4,413 days
  against the old workbook loader.

Owner to confirm:

- the Neon-specific HTTPS transport
- the role covering all seven tables rather than the three it reads
- `week_delta_lb` on the site's definition
- the 10% shrink guard
- whether `CLAUDE.md`'s "no HTTP" line in apple-health should name this read
  as an exception

**Gap against the plan's "done when."** `health.db` picks up site weigh-ins
only on an XML rebuild or a manual `health_sync.py weight-log`. The hourly
import never refreshed `weight_log`, and the old workbook reader didn't
either. So a new site weigh-in doesn't reach `health.db` on its own. The
next step is the owner's call: add the refresh to the hourly import, making
it non-fatal so a network failure can't fail the snapshot.

## Merges on the owner's "no need to ask me for this session" (November 9, evening)

- **#146** squash-merged as `c651a514`. Before merging, the lead fixed Devin's
  two findings and answered them on the PR:
  - `c28a7db9`: `upsertWeighIn` takes the plan lock shared. This is the race
    Devin and the Claude review (P3-5) both found, so that P3 is fixed.
  - `65d2a94e`: the rate inputs use `step="0.01"`.

  The deploy succeeded, and both pages answer 200.
- **#147** squash-merged as `62e67fe2`. Devin found no issues. The deploy
  succeeded. `/api/weight-log/mirror` answers 503 (no token set yet) and 405
  to a POST, as designed.
- **Entry polish.** The owner's first iPhone feedback is with an agent on
  branch `weight-log-entry-polish`, reporting to `reports/entry-polish.md`:
  - Sign out shows the icon only.
  - The date reads relative, and is sized to stop overlapping Pounds.
  - Pounds is pre-filled with the last weight, and Save is a check mark.
  - The gap above the week grid is tightened.
  - The Weeks table gains a week number from 0 and colors on every column.
  - The phase picker gains kind dots, the cycle number, and the week count.
  Cycle is numbered across all phases by start date. Owner to confirm.
- **#148** (entry polish) squash-merged as `c1de0296`. All checks passed and
  Devin found no issues. The deploy succeeded.
  - The lead pushed the builder's main-merge `b2eb3684` before its typecheck
    finished. It had a duplicate `tablePhaseToShow` (TS2393). The builder
    fixed it in `1f521c3c` before merge. Lead mistake: run tsc before
    pushing, never `;` the push after the checks.
  - Owner to confirm, from `reports/entry-polish.md`:
    - Cycle is numbered across all phases. `CONTEXT.md` currently lists
      "cycle" as a word to avoid.
    - Pounds has no select-on-focus.
    - A carried value saves in one tap.
    - Excluded weigh-ins never seed Pounds.
    - Signed colors show direction (blue down, red up), with a scale per
      column.

## Owner ask: edit the sheet itself (November 9, night)

Owner's words, condensed: they want to change any number in the Weeks area
like a spreadsheet, tapping a cell to type. Today gets a red outline. The
Weigh-in section at the top "feels kind of pointless and not contextual". They
also want to edit lb/wk and the target for any week, and changing one moves
the other.

Delegated to agent `sheet-editing` (branch `weight-log-sheet-editing`,
report `reports/sheet-editing.md`). The lead's calls, each Owner to confirm:

- **Layout.** The Weigh-in section and the Plan section's Weekly rate form
  are removed. Length, Start a phase, and Set points stay.
- **Editable cells.**
  - Day cells save, replace, or delete a weigh-in.
  - Target and lb/wk are both one `changeRate` edit, with rate = target
    minus the previous week's target, so later targets in the phase shift
    (decision 11).
  - Original targets never change (decision 12).
- **Interaction.** Return or blur saves, and Escape cancels. Clearing a day
  cell deletes the weigh-in, with one level of Undo in a status line.
- **Today.** Today's cell has a red outline. An empty today cell pre-fills
  the last counted weigh-in. The table scrolls this week into view on load.
- **Excluded.** The excluded flag stays read-only (decision 14).
- **Other dates.** Dates outside every phase must stay reachable for
  weigh-ins. The builder picks how.

### #149 fix round, layout round, and merge (November 10)

- **Fix round** (`f20110a4`, report section "Fix round"). Devin's two findings and the lead's two are all fixed:
  - Every write in the Weeks table settles through `mutateAsync`.
  - `bareRow` computes Change from the previous week's average.
  - Undo of a delete goes through the new `restoreWeighIn`, which keeps the excluded flag and refuses with CONFLICT when the date has a weigh-in again.
  - Targets and rates keep six decimals.
- **Layout round** (`0befe40d`, report section "Layout round"). Owner's words, condensed: put Plan and Set points in the top nav beside Sign out; no back button; Weeks isn't collapsible because it is the main content; move the phase picker and Go to date into the top nav; no auto-scroll to the current week, "because the main way, pretty much exclusively, how we're going to be doing this is via the shortcut". Built as:
  - Plan and Set points became pages, `/weight-log/edit/plan` and `/weight-log/edit/set-points`, at every width. The lead's brief allowed a popover from 640 px; the builder chose pages. Owner to confirm.
  - The title copies the chart's barbell, which turns into an arrow only on hover.
  - The picker and Go to date portal into the header.
  - The column is 1024 px.
  - Today keeps its outline, and nothing scrolls on load.
- **Devin's re-review** found one issue: the nav icons were bold, and the site uses regular for navigation. The lead fixed it in `bc794afb`.
- **Merged** as `57ffac86` on the owner's standing "no need to ask me for this session". The production deploy succeeded. All three pages answer 200 on www, and `/weight-log/edit/plan` serves the sign-in card, so the deploy has the new routes.
- **Cleanup.**
  - The `localhost:3000` preview is stopped.
  - Neon branch `weight-log-owner-preview` is deleted.
  - These worktrees are removed: `owner-preview`, `sheet-editing`, `entry-polish`, `slice4-health-mirror`.
- **Near miss** (builder's report). Another cleanup removed the builder's id file from the shared scratchpad, so a `neonctl branches get` ran with an empty id and read the default (production) branch. It was a read only. Lesson for future briefs: keep each agent's Neon ids in its own scratchpad file, and refuse an empty id before any neonctl call.

## Slice 5: Log Weight Shortcut (November 10, owner said "Yes, recommended")

The owner accepted every recommendation in `reports/shortcut-api-research.md`:

- a separate entry token that can write only today's or yesterday's weigh-in and never deletes
- Replace or Cancel when the date already has a weigh-in
- the week card as a notification
- no sparkline
- no Health write
- a hand-built recipe

Builder `quick-entry`, PR #150, report `reports/slice-5.md`. The apple-health runbook commit `05b0b8b` is local.

- **Deep review.**
  - Codex (scratchpad `codex-slice5-review.md`) found one medium and two lows: the date window followed the server's UTC date, not the phone's today and yesterday; Next's implicit OPTIONS answered 204 with no auth and no cache header; and the guard test sent only empty input.
  - The fresh Claude reviewer (`reports/slice-5-claude-review.md`) found one medium and six lows:
    - the card rounds averages differently from the editor (off by 0.1 lb in about 12% of two-weigh-in weeks)
    - a replaced excluded day isn't mentioned
    - card failures answer a bare 500
    - font tracing on Vercel
    - nothing stops the two tokens from being equal
    - Shortcut save failures never reach `reportServerError`
    - wording
- **Lead's call on the window, Owner to confirm.** Accept a date that is today or yesterday in some real time zone, UTC−12 through UTC+14. The owner travels, and the Shortcut sends the phone's date. A Pacific-only window would refuse a morning weigh-in in Europe.
- **Fix round** given to a fresh fixer, `slice5-fix`, with every finding above, starting with a merge of `origin/main` after #149.
- **Fix round result** (`d99f7476`, report section "Review fix round"). All ten findings are fixed, each with a test that failed on the old code. The changes:
  - `shortcutWindow` covers UTC−12 yesterday through UTC+14 today.
  - Every route, the mirror included, answers OPTIONS with a 405 and the no-store headers.
  - The guard test runs Next's auto-implemented methods with both empty and valid input.
  - `format.ts` is shared by the editor, card, and notification.
  - Excluded days are named in the question and summary.
  - The card returns a JSON 500 on a failed load or build.
  - The week-card route has `outputFileTracingIncludes` for the Georgia Pro fonts.
  - `env.js` refuses equal tokens.
  - `logFailure` reports through `reportServerErrorAfterResponse` with a message carrying no data.
  - The request types are renamed away from "entry".
  - The runbook's step 9 has a fallback (apple-health `07b2e4b`, local).

  `heavy -- pnpm verify` passed on the merged head with 6,634 tests.
- **Devin.** The first pass at 09:32 found no issues. Two `/devin review` requests on the fix round (10:37 and 11:19) each posted "Starting Devin Review." and then nothing for 40 and 12 minutes. On #149 a re-review answered in 2 minutes. The lead merged without that re-review, because Codex and a fresh Claude had both reviewed the slice and their findings were all fixed with tests. If Devin posts later, answer it in a follow-up.
- **Merged** as `1c88cd27` on the owner's standing merge authorization.
- **Open from the fix round, each Owner to confirm.**
  - The any-zone window (decision 38) can accept four dates at once.
  - OPTIONS answers 405, and that now includes the mirror.
  - The excluded-day wording.
  - The after-response error reporter.
- **Unverified until the owner's first run.**
  - Font tracing on Vercel.
  - The three device-only recipe steps: the JSON field types, attaching the image to Show Notification, and the decimal key.
- **Out of slice.** `/api/og/section` fetches its fonts over HTTP at runtime, because it has no tracing include. It needs a one-line follow-up.

## After slice 5: generated Shortcut and the sheet card (November 10)

- **Token and Shortcut.** At the owner's "do all the work for me", the lead generated `WEIGHT_LOG_ENTRY_TOKEN` and saved it to `~/.config/personal-website/weight-log-entry-token` (mode 600). The lead added it to Vercel Production and redeployed with `vercel redeploy --scope openlattice`. Agent `log-weight-shortcut` added a generated, signed Log Weight to `build_shortcut.py`, with the token built in, writing to the gitignored `shortcut/private/` (apple-health `44e5aff`). The owner installed it on the Mac, and the first run worked.
- **Owner's feedback on the card.** In their words: "ugly ass image tho that doesn't match the design of the actual site. and should show the previous week as well for comparison and look more like an actual snapshot of the spreadsheet." On the notification text: "a lot to read. thoughts on using icons too?"
- **#151, merged as `7f3a3701`** (report `reports/week-card-sheet.md`). The card is now the Weeks table's header plus last week's and this week's rows, in the editor's SF Pro and colors. lb/wk, Orig, and Orig's Gap are left off so the text reads at about 8.9 pt in a 360 pt notification. The route returns a `title` (`✓ 221.0`, `↻ 221.0, was 220.0`, `= 221.0`) and a one-line `summary`. The lead's pixel worry turned out to be the surroundings: sampled colors are identical. Devin's one finding is fixed in `8c0d71e2`. The lead rebuilt the Shortcut to use `title` (apple-health `9a35fca`), and the owner reinstalls it.
- **#152, merged as `daa32387`** (report `reports/week-card-portrait.md`). The card is now portrait: a three-week grid on top, then eleven weeks (five back, this week, five ahead) in a summary table. Over four rounds of owner feedback: headers and labels are bold, numbers are regular, and each week is labelled with its number beside the month over the day. Future weeks show no year, and dashes are light gray. "Chg" became "+/-" and "lb/wk" became "lbs/w", with rates shown to one decimal. Both changes apply across the card, the editor, and Plan; storage keeps 6 decimals. The editor's Weeks table now uses the same week label. Devin found no issues. Live card is 720×1192 at 2×. Open: whether iOS crops a card this tall in the notification; owner checks on the phone.
- **#153, merged as `b6146e03`.** The owner's phone cropped the expanded notification at week 13, so with the owner's agreement the card now shows three weeks ahead instead of five (`WEEKS_AFTER`). Devin's one finding (stale "five" wording) is fixed. The lead merged with the fixup's CI still pending after local tests and lint passed; CI later passed in full.
- **#154, merged as `f2b254e0`** (report `reports/shortcut-placeholder.md`). `GET /api/weight-log/weigh-in?date=` answers the latest counted (not excluded) weigh-in before that date. The Shortcut (apple-health `4f83013`, local) prefills its weight prompt with it. Live check: 200 with a date and a numeric pounds. Owner to confirm: skipping excluded, reading on the weigh-in route, and a whole weight showing as "150" rather than "150.0". Offline, the Shortcut now stops before the prompt rather than at the save. Owner reinstalls the Shortcut.
- **Owner to confirm:**
  - lb/wk dropped from the card
  - plain-symbol titles
  - "Kept 220.0" as the title on `exists`
  - the card's tighter spacing compared with the editor

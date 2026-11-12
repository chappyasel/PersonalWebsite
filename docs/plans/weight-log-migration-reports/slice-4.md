# Slice 4 report: Apple Health mirror

## Branch and head

- PersonalWebsite branch `weight-log-health-mirror`, head `02ad6d19` ("Add the
  read endpoint the Apple Health Shortcuts use"), pushed to origin. No PR.
- It branched from `origin/worktree-agent-a772e01a4518be175` at `9e5dceda`. That
  branch has moved eight commits since (to `5fe9e9f6`), and a trial merge with
  `git merge-tree` is clean. The slice changes these six files and nothing
  else:
  `.env.example`, `src/env.js`, `src/lib/weight-log/mirror.ts`,
  `src/lib/weight-log/mirror.test.ts`, `src/app/api/weight-log/mirror/route.ts`,
  `src/app/api/weight-log/mirror/route.test.ts`.
- Worktree: `/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/slice4-health-mirror`.

## Changed files in the home repo (uncommitted)

`~/Desktop/Agents/apple-health` is its own Git repository (branch `main`), not
part of the home directory's repo. Nothing there is committed or pushed. My
changes, all under `shortcut/`:

- `shortcut/build_shortcut.py` (modified)
- `shortcut/Health Daily Sync.plist` (modified, regenerated)
- `shortcut/Weight Backfill.plist` (new, generated)
- `shortcut/test_build_shortcut.py` (new)
- `shortcut/NOTES.md` (modified: a new section at the end)
- `shortcut/RUNBOOK-iphone.md` (modified)

Not mine, left alone: `shortcut/Health Daily Sync.shortcut` and
`shortcut/probe-capture.shortcut` already showed as deleted in the working tree
before I built anything, along with other sessions' edits to `CLAUDE.md`,
`README.md`, `analysis/`, `scripts/`, `tests/`, and new untracked files. Stage
only the six paths above.

## The endpoint

`GET /api/weight-log/mirror?from=YYYY-MM-DD&to=YYYY-MM-DD` with
`Authorization: Bearer <WEIGHT_LOG_MIRROR_TOKEN>` returns
`{"weighIns":[{"date","pounds"}]}`, oldest first.

- The token is its own variable (decision 35). It is compared in constant time:
  both sides are hashed with SHA-256, then compared with `timingSafeEqual`.
- With the variable unset, every request gets 503
  `The Health mirror is not configured`. A missing or wrong token gets 401 with
  `WWW-Authenticate: Bearer`. Neither reads the database.
- The range must be two real dates, `from` not after `to`, and at most 366 days
  with both ends counted, so a leap year fits in one request.
- Every response carries `Cache-Control: private, no-store, max-age=0`,
  `X-Robots-Tag: noindex, nofollow, noarchive`, and `nosniff`.
- POST, PUT, PATCH, and DELETE get 405 `The Health mirror only reads` with
  `Allow: GET, HEAD`. HEAD is answered by Next from GET.
- The query selects `date` and `pounds` only, and `toMirrorWeighIns` filters to
  the range and drops every other field again, so a wider read cannot widen
  the response.

## The Shortcuts

- **`Health Daily Sync`**: the snapshot's 210 actions are unchanged (the first
  210 actions of the new build equal the tracked plist exactly). The mirror
  adds 37 actions after the done notification: ask the site for the last 14
  days, Find Weight samples from the last 60 days and collect their dates, then
  for each weigh-in `If WeightDatesInHealth contains <date>` do nothing,
  `Otherwise` make the date `<date> 07:00`, log Weight in lb, and note the date.
  A last notification reports `logged N of M`, the dates logged, and the site's
  error text if it refused.
- **`Weight Backfill`** (new, 36 actions): asks for a year, fetches
  `from=<year>-01-01&to=<year>-12-31`, shows an alert with the site's count for
  that year and a Cancel button, then runs the same Health check and logging
  loop as the daily step (Find reaches back 3,700 days).
- **Token**: the Text action is empty in the file, and an Import Question
  (the shape the corpus Mastodon export uses) asks for it when the shortcut is
  added. The token is never in the repo, so every re-import asks for it again.
- **Build guards** (`mirror_check`, part of `structural_check`): a Log Health
  Sample outside the Otherwise branch of that If fails the build, and so does a
  type other than Weight, a unit other than lb, a non-GET request, a URL other
  than the mirror, a filled token Text, any other empty Text, or a literal
  `Bearer ` followed by text.
- `detect.dictionary.WFInput` was added to `ATTACHMENT_ALLOWLIST` on the
  Mastodon export's evidence. The validator's empty-Text rule is suppressed for
  these two targets only.

## What I verified and how

- Route and helper tests (vitest, synthetic data, no database): 34 pass in
  `mirror.test.ts` and `route.test.ts`. They cover a missing, wrong, unprefixed,
  or Basic token (401, no query); an unset token (503, no query); range
  parsing including the leap year and 367 days; only the requested range coming
  back with only date and pounds (the mock returns out-of-range rows and an
  `excluded` field); the no-store and noindex headers; 405 for every other
  method; and the exact SQL with its two parameters.
- `heavy -- pnpm verify` (ran on Portable): typegen, tsc, eslint, artwork tests,
  search index, and meadow pass. Vitest failed on the four known
  `MeetBooking.test.tsx` cases and on two `tests/superset-setup.test.ts` cases
  that timed out at 6 to 8 seconds under load (Portable was at about 1.6 per
  core). Rerun alone, `superset-setup.test.ts` and both mirror test files
  pass (34 of 34).
- Live, read-only: `next dev` on port 3027 against the Neon test branch (host
  `ep-proud-union-akswp9yx`, checked before starting) with a throwaway token.
  No token and a wrong token gave 401, POST gave 405, a bad range gave 400, and
  HEAD gave 200 with no-store. A 14-day range returned 7 weigh-ins with keys
  `date` and `pounds` only. Per-year counts matched the database: 2018 55, 2019
  172, 2020 127, 2021 158, 2022 254, 2023 234, 2024 195, 2025 239, 2026 193.
  I stopped the server and deleted the token file afterwards.
- Shortcuts: `/usr/bin/python3 build_shortcut.py --no-sign` passes the
  structural check and the vendored validator for all three targets.
  `probe-capture.plist` is byte-identical to before. A second build is
  byte-identical to the tracked plists. `test_build_shortcut.py` (16 tests,
  `cd shortcut && /usr/bin/python3 -m unittest test_build_shortcut -v`) passes,
  including one negative test for each guard.
- Not verified, and cannot be from the Mac: anything on the phone. macOS has no
  HealthKit to write to, and I did not sign, install, AirDrop, or run any
  Shortcut, nor touch the hourly sync or the launch agent.

## Owner's steps

These are in `shortcut/RUNBOOK-iphone.md`, "Weight mirror setup", in decision
33's order:

0. Once the site serves the mirror, build and sign both shortcuts on the Mac
   (`python3 build_shortcut.py` in `shortcut/`).
1. Make a token with `openssl rand -hex 32` and keep it in a password manager.
   Set `WEIGHT_LOG_MIRROR_TOKEN` in Vercel Production, redeploy, and check it
   with the runbook's `curl` line, which prints a count or the error.
2. Turn off Weight write access for Withings, MyFitnessPal, and Wyze.
3. Delete all Weight samples: Browse > Body Measurements > Weight > Show All
   Data > Edit > Delete All. Weight only.
4. AirDrop both shortcuts and paste the token at each import. Replace the old
   `Health Daily Sync`, or delete it and rename the new copy.
5. Run `Weight Backfill` for 2018 in the foreground, allow Weight read and
   write, tap OK on the count, tap OK on "No Samples Found", then check in
   Health that the entries are at 7:00 AM on the right dates, source
   Shortcuts.
6. Run it once for each of 2019 to 2026.
7. Confirm the 8:00 automation runs `Health Daily Sync` with Run Immediately
   on, and run it once by hand.

## Shortcuts

- `Health Daily Sync`: 247 actions (210 snapshot plus 37 mirror). One Health
  write, guarded.
- `Weight Backfill`: 36 actions. New. One Health write, guarded, after a
  confirmation alert.
- `probe-capture`: unchanged.
- Neither `.shortcut` file is signed. Signing is step 0 above.

## Issues

- The signed `Health Daily Sync.shortcut` and `probe-capture.shortcut` are
  deleted in the apple-health working tree, and that deletion is not mine. If
  it isn't intended, `git -C ~/Desktop/Agents/apple-health restore` them before
  the commit, or sign again, which writes new ones.
- Two `tests/superset-setup.test.ts` cases time out under heavy load. That is
  outside this slice and they pass alone.

## Ambiguities

- Decision 32 says to log "each date that has no Shortcuts sample yet". The
  mirror skips a date that has a Weight sample from any source. After steps 2
  and 3, the only other source is a reading the owner adds by hand, and
  logging a second one on that date would be a duplicate. Filtering the Find
  by source would also mean a source predicate the corpus does not show.
- Whether iOS offers Replace when importing a shortcut with an existing name
  varies by version, so the runbook covers both outcomes.

## Judgment calls

- Excluded weigh-ins are sent. Exclusion only leaves a reading out of its
  week's average, and the reading is real. Owner to confirm.
- The mirror counts a Weight sample from any source as "this date is done" (see
  Ambiguities). Owner to confirm.
- Each sample is logged at 07:00 in the phone's time zone at run time. A
  backfill run while travelling would log at 07:00 in that zone. Owner to
  confirm.
- The daily Find looks back 60 days, so an empty result, and the blocking
  "No Samples Found" modal at 08:00, comes only after more than 55 days
  without a weigh-in (the longest gap since 2018). Owner to confirm.
- The backfill shows the site's count and waits for OK before it writes. That
  adds one tap per year. Owner to confirm.
- The token sits in the Shortcut's Text action, pasted at import, and is not
  stored anywhere else on the phone. Re-importing means pasting it again.
  Owner to confirm.
- The `Specified Date` action parsing `<YYYY-MM-DD> 07:00` is the one piece of
  wiring no corpus export or device run shows. The 2018 spot check in step 5 is
  the test, and the runbook says to stop there if a time or date is wrong.
  Owner to confirm.
- The range cap is 366 days so a backfill year is one request.
- I left `README.md` in apple-health alone because another session has
  uncommitted edits there.

## Next steps

- The lead reviews and commits the six apple-health paths, then signs both
  shortcuts (or leaves that to the owner's step 0).
- Merge `weight-log-health-mirror` into the integration branch. It merges
  cleanly today.
- After the endpoint is in production, the owner works through the runbook's
  W0 to W7.
- apple-health's `README.md` could mention `Weight Backfill` and the mirror once
  the other session's edits there land.
- `health.db`'s `body_mass` view takes the spreadsheet's `weight_log` first and
  Health's BodyMass for other dates. Decision 28 moves `weight_log` to the
  database. After the move, the mirrored Health samples share dates with it, so
  the view still shows each date once.

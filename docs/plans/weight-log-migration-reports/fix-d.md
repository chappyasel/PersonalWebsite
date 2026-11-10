# Fix D report: Codex findings on the Health mirror Shortcuts

All four findings held up against the code, and all four are fixed in
`~/Desktop/Agents/apple-health/shortcut/`. Nothing is committed, signed,
installed, or run on a phone.

## What changed

Each of the four findings, checked against the code first:

1. **Travel breaks dedup. Confirmed.** The old run wrote `<date> 07:00` in the
   phone's zone at run time and compared that date with Health's Start Dates
   formatted in the same zone. After a flight across the date line, a sample
   written at home falls on a different local date, so the guard misses it and
   the run writes a second sample. Now every sample is written at one fixed
   instant, `<date>T12:00:00Z`. The guard's operand is that same Date run
   through the same ISO-date Format Date as the Health dates in the same run.
   Both sides are local dates in the same zone, so a sample the mirror wrote
   matches in any pair of zones.
2. **An empty Find stalls unattended runs. Confirmed.** A Find Health Samples
   that returns nothing raises a blocking "No Samples Found" modal before
   anything is written, and the 08:00 automation never gets past it. Three
   changes: the Find and the write loop now sit inside
   `If <Count of weighIns> is greater than 0`, so a day the site sends nothing
   never reaches the Find. The daily Find now sorts by Start Date, Latest
   First, with Limit 60 (the shape of the corpus `Log My Weight` export) over
   a 36,500-day window, so it is empty only if Health has no Weight samples at
   all. The runbook now installs the new `Health Daily Sync` after the
   backfill, so Health already holds samples by its first run.
3. **The backfill's lookback stops covering 2018. Confirmed, with a different
   date.** 3,700 days from 2018-01-01 ends on 2028-02-18. Codex's
   Nov 13, 2028 is correct for the first weigh-in, 2018-09-27, which is the
   one that matters. Both Finds now reach back 36,500 days. The build fails
   if any Weight Find reaches back less than from 2100-12-31 to 2018-01-01.
4. **The guard accepted a literal operand. Confirmed.** `mirror_check` only
   looked at the If's left side, so `If WeightDatesInHealth contains "x"`
   passed. It now requires the operand to be exactly one action output: an
   ISO-date Format Date over the Specified Date action whose text is the
   weigh-in's `date` followed by `T12:00:00Z`. Log Health Sample must write at
   that same Date. `WeightDatesInHealth` may only be filled from the ISO date
   of a Health sample's Start Date, and must be filled at least once.

Two extra guards came out of the work: every Weight Find and every Log Health
Sample must sit inside the site-count If, and a Weight Find with a Limit must
sort by Start Date, Latest First, or the Limit keeps arbitrary samples.

Final state of the six paths, all under `~/Desktop/Agents/apple-health/shortcut/`:

- `build_shortcut.py` (3,151 lines, modified). New constants
  `WEIGHT_HEALTH_LOOKBACK_DAYS = 36500`, `WEIGHT_LOG_FIRST_DATE`,
  `WEIGHT_LOOKBACK_COVERS_UNTIL`, `WEIGHT_MIRROR_HEALTH_LIMIT = 60`,
  `WEIGHT_SAMPLE_DATE_SUFFIX = "T12:00:00Z"`, and `COND_GREATER_THAN = 2`
  replace the 60-day, 3,700-day, and `07:00` constants. `a_find_health` takes
  `latest_first`. The mirror builders gained a site count, the site-count If,
  and the Date-then-Format pair the guard and the write share.
  `mirror_check` is rewritten as described in finding 4, with four small
  helpers before it.
- `Health Daily Sync.plist` (regenerated). 251 actions: the first 210 are
  byte-identical to the tracked plist at HEAD, then 41 mirror actions. md5
  `1d87a62177af361006edf419145da5a7`.
- `Weight Backfill.plist` (regenerated, untracked). 39 actions. md5
  `0d25cee42b61cc4a1a58433abf5b796f`.
- `test_build_shortcut.py` (433 lines, untracked). 42 tests. New:
  `TimeZoneRuleTest`, `EmptyFindTest`, `LookbackCoverageTest`, and 14 new
  `MirrorCheckTest` mutations.
- `NOTES.md` (modified). The mirror section's run description, evidence
  table, guards list, and known costs are rewritten, and a new section,
  "Time zones: one instant, compared in the run's own zone", explains the
  rule and what it costs.
- `RUNBOOK-iphone.md` (modified). "Weight mirror setup" now explains the
  12:00 UTC time, imports only `Weight Backfill` at W4, backfills 2018 with a
  spot check at W5 and 2019 to 2026 at W6, and replaces `Health Daily Sync`
  at W7. New subsections: "If a run stops on No Samples Found" and
  "Travelling".

`probe-capture.plist` is unchanged (md5 `3fa6eab5f2a251a65bd2a8ff24555cce`).

## What I verified and how

- `/usr/bin/python3 build_shortcut.py --no-sign`: the structural check and the
  vendored validator (python3.13) pass for all three targets. A second build
  is byte-identical.
- The first 210 actions of the new `Health Daily Sync` equal the 210 actions
  of the plist at HEAD, compared as parsed plist objects.
- `cd shortcut && /usr/bin/python3 -m unittest test_build_shortcut -v`: 42 of
  42 pass. One test or more per fix:
  - Time zones: the written suffix is fixed UTC. For every pair of whole and
    half-hour offsets from UTC-12 to UTC+14, a sample written in one zone
    matches its own date when read in the other and never collides with the
    day before or after. Two controls fail as they should: the old `07:00`
    local rule fails Tokyo to New York, and a local-noon rule fails Pacific
    to Tokyo. The UTC date equals the site date for offsets from -12 up to,
    but not including, +12. The guard tests the Date the sample is written at.
  - Empty Find: the Find and the log sit inside the site-count If. The daily
    Find is Latest First, Limit 60, 36,500 days. The backfill Find has no
    Limit.
  - Lookback: the old 3,700-day window reaches 2018-09-27 on 2028-11-13 and
    not on 2028-11-14. The new window covers until 2100. A shorter Find fails
    the build.
  - Guard mutations, each of which `mirror_check` now rejects: a literal
    operand, extra text around the operand, the raw site date, a Format Date
    over the Health side, a format that includes the time, a Date without the
    UTC suffix, a write at another Date, the dates list filled from something
    else or never filled, the site guard removed, compared with another
    number, or counting something else, the Find moved before the site guard,
    and a limited Find without Latest First.
- Fault injection: with `a_if_contains` patched to pass a literal, a build
  into a scratch `--out-dir` fails with the new guard message, and the
  deliverable plists keep their md5s.
- `plutil -lint` passes on both plists.
- `git status --short shortcut/` shows only the six paths plus the two deleted
  `.shortcut` files that were already deleted before this work.

## What can only be verified on the phone

- That the Date action parses `<YYYY-MM-DD>T12:00:00Z` as 12:00 UTC. The W5
  spot check covers it: 2018 samples show 5:00 AM up to Nov 3 and 4:00 AM from
  Nov 4 in Pacific time. 12:00 PM means the `Z` was ignored and the samples
  are at local noon, which still dedups for zone changes under 12 hours.
- That `If <Count> is greater than 0` (condition code 2 with a number value)
  behaves as the validator's sample table says. The device-attested "is not"
  is code 5, which the validator rejects; see Judgment calls.
- That Latest First with Limit 60 over a 36,500-day window returns the newest
  60 samples.
- Whether HealthKit accepts a future-dated sample, and whether a later
  "in the last N days" Find counts it. This only arises east of UTC-4 (see
  Ambiguities).
- That a Repeat over a Find nested inside an If runs as it does at top level.
- That the "No Samples Found" modal never appears in the new order.

## Shortcuts

- `Health Daily Sync`: 251 actions (210 snapshot plus 41 mirror). One Health
  write, inside the site-count If and the duplicate guard's Otherwise.
- `Weight Backfill`: 39 actions. One Health write, behind the confirmation
  alert, the site-count If, and the duplicate guard.
- `probe-capture`: unchanged.
- Neither new file is signed.

## Issues

- `Health Daily Sync.shortcut` and `probe-capture.shortcut` still show as
  deleted in the apple-health working tree. That deletion predates this work
  and is not mine. Signing writes new ones.
- Codex's date in finding 3 is relative to the first weigh-in, not to
  2018-01-01. The fix covers both.
- The validator rejects condition code 5 ("is not") without a
  `WFConditionalActionString`, though a device export uses it. I used code 2
  rather than patch the validator, per the lesson already in NOTES.md.

## Ambiguities

- The 12:00 UTC sample has the site's date only for offsets from UTC-12 up to,
  but not including, UTC+12. In New Zealand and further east, Health shows it on the next day.
  A hand-entered sample there is matched by its local date, so the mirror may
  write a second sample beside it.
- East of UTC-4, the 08:00 run comes before 12:00 UTC, so today's sample is
  dated in the future. If HealthKit refuses it, the run stops on that write
  and the next day writes it. If a second run the same morning does not count
  a future sample in its Find, it writes a duplicate. At home in Pacific time
  the run is 3 to 4 hours after 12:00 UTC, so neither happens.
- Health shows mirrored samples at 4:00 AM (PST) or 5:00 AM (PDT), not 7:00.

## Judgment calls

- Samples are written at 12:00 UTC, not at a local time. Local noon fails a
  Pacific to Tokyo trip, and 14:00 UTC (6:00 or 7:00 AM Pacific) would move
  the safe band to UTC-14 through UTC+10. Owner to confirm.
- The site guard uses condition code 2, "is greater than 0", rather than the
  device-attested code 5, which the validator rejects. Owner to confirm.
- The daily Find keeps the newest 60 samples, so a site date older than the
  60th-newest Health sample would be written again. The site sends 14 days,
  so this needs 60 or more Weight samples in Health within two weeks. Owner to
  confirm.
- Both Finds reach back 36,500 days, and the build requires coverage until
  2100-12-31. The backfill reads every Weight sample on each run. Owner to
  confirm.
- The runbook installs the new `Health Daily Sync` only after the backfill,
  so its first run never meets an empty Health. Owner to confirm.
- Today stays in the daily range despite the future-dated edge east of UTC-4.
  Excluding today would remove it and delay every sample by a day. Owner to
  confirm.
- A Date parse that fails on the phone would log a whole backfill year at the
  wrong time before the W5 check catches it. That risk predates this fix; the
  runbook still says to stop at W5 if a time or date is wrong. Owner to
  confirm.

## Next steps

- The lead reviews and commits the six paths, staging nothing else in
  apple-health.
- Sign both shortcuts at runbook step W0 once the endpoint is live.
- The owner works through W0 to W7, with the W5 spot check as the test of the
  `T12:00:00Z` parse.
- If W5 shows 12:00 PM, decide whether local noon is good enough or whether
  to try Convert Time Zone, which no corpus export shows yet.

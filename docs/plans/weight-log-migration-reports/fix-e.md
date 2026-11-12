# Fix E report: the second review of the Health Weight mirror

Every finding in `slice-4-claude-review.md` is addressed in
`~/Desktop/Agents/apple-health/shortcut/`, except two that live in this repo
(L4 and L6, under Issues). The changes touch only the six slice paths:
`build_shortcut.py`, `Health Daily Sync.plist`, `Weight Backfill.plist`,
`test_build_shortcut.py`, `NOTES.md`, and `RUNBOOK-iphone.md`. Nothing is
committed, signed, installed, AirDropped, or run on a phone. The two
`.shortcut` files other sessions deleted are untouched.

## What changed

### H1. Nothing is deleted until the loss is ruled out

The runbook's Weight mirror setup is now W0 to W9, and the delete moved from
W3 to W5. Three new steps come before it:

- **W2** confirms Shortcuts may read and write Weight. It turns off Weight
  writing for every app listed under Weight's Data Sources & Access, not just
  the three named before.
- **W3** imports `Weight Backfill` and dry runs it on 2026: Always Allow at
  the website prompt, then at the alert both the site's count and Health's
  count must be above 0, then Cancel. That proves the token, the website
  permission, the request, and Health read access, with nothing written.
- **W4** exports all Health data on the phone and keeps the zip in
  `export-archive/source-zips/<date>-export.zip`, the archive's existing
  convention. It unzips only `export.xml` to `export-archive/<date>/` and runs
  a comparison script, pasted into the runbook as a heredoc. The script lists
  every Weight date the new export has, the 2026-09-04 export lacks, and the
  site lacks, with the reading and the app that wrote it. The owner adds each
  one on the site or lets it go, and runs the script again until the list
  holds only dates they chose to drop. If the Mac cannot do it, the owner
  reads Health's Weight list from Sep 4, 2026 against the site by hand. The
  52 Health-only days stay out, per decision 34, and the script does not list
  them.

### M1. Read access is confirmed, and an empty read writes nothing unattended

- The runbook confirms Weight read access in W2 and proves it in W3 (Health's
  count above 0) before anything is deleted.
- `Health Daily Sync` now writes only inside `If <Count of
  WeightDatesInHealth> is greater than 0`. A refused read now writes nothing
  instead of a duplicate of every weigh-in, and the notification reads
  `Health Weight samples read: 0 (0 means Health returned no Weight sample,
  so nothing was written)`.
- `Weight Backfill` cannot require that, since it seeds an empty Health. Its
  alert now comes after the Health read, shows how many Weight samples Health
  returned, and says to tap Cancel at 0 on any run but the one-day check.
- "No Samples Found" is now a stop sign outside the one-day check. The
  runbook's section says to tap OK (the daily then writes nothing and the
  backfill reaches its alert, where you tap Cancel), check W2, and only
  re-run the backfill when Health really is empty.
- The detection uses only attested actions: Count over a named variable
  (snapshot path, device-proven) and `If <Count> is greater than 0` (already
  in the build). HealthKit cannot tell a refused read from an empty store, so
  no Shortcut can tell them apart directly. The count is the best signal
  available.

### M2. Every mutation the review found now fails the build

`mirror_check()` is rewritten around the order of actions and an if-stack. It
now fails the build when:

- the duplicate guard runs before `WeightDatesInHealth` is filled;
- `WeightDatesInHealth` is filled from a Repeat that is not over a Weight
  Find, or from a detail not read off that Repeat's Repeat Item;
- the loop around Log Health Sample does not repeat over the `weighIns` value
  the site-count guard counts;
- the Magnitude is anything but a Get Dictionary Value `pounds` over the
  Repeat Item of the loop that writes;
- a Limit sits anywhere but the daily Find. The daily needs a rolling window
  of at most 14 days ending today (read off the URL's two Format Dates) and a
  Limit of at least 60, Latest First;
- in the daily run, the write is not inside the Health-count If, that If
  counts something else, or it runs before the list is filled;
- the weigh-in's `date` is not read off the writing loop's Repeat Item, or
  the write is not inside `If <date> has any value` (see L2).

`ReviewMutationTest` holds one test per mutation in the review's table, run on
both shortcuts where both apply. That covers Health dates read after the
writes, Magnitude from `date`, from `excluded`, and from outside the loop, the
daily dates Repeat over a Sleep Find, and a Body Fat Find. It also covers
Limit 1 on the backfill, a small daily Limit, a wider rolling window, and the
write loop over the error value. Beyond the table, it covers the date read
off something else, the daily without its Health guard, that guard counting
something else or placed before the dates, and the row guard removed or moved
onto `pounds`. Two shape tests pin the row guard as code 100 with no operand,
and the backfill as building clean without a Health-count If. The tests sit in
a new class, not in `MirrorCheckTest`, and each asserts the specific error text
it expects.

### M3. Corrections go through the site, never a hand entry

The runbook has a new "Correcting a weigh-in" section: correct it on the site,
delete that date's sample in Health, and let the mirror write it again. Within
14 days the next 8:00 run does it. For an older date, run the backfill on that
one day. Removing a weigh-in means deleting it on the site and in Health. The
"covers the hand-entered case" claim is gone from `build_shortcut.py` and
`NOTES.md`. Both now say a hand-typed sample is stored at the moment it was
typed, so after a trip its date can move and the mirror writes a second
sample. The Travelling section says the same.

### M4. `Log My Weight` is documented, not changed

It is the owner's shortcut: Find the newest Weight sample, Ask `Today's
weight:`, Log Weight. W2 step 3 says to stop using it and explains the three
conflicts. Its readings never reach the site. The mirror skips that date, so a
site correction for the day never reaches Health. Its Find stops on No Samples
Found between W5 and W6. My recommendation is under Judgment calls.

### M5. Always Allow, and how to recover

W3 step 4 and W9 say to tap Always Allow at the first request. A new section,
"The website permission", covers both mistakes. Allow Once: run the shortcut
by hand again and choose Always Allow. Don't Allow: the shortcut's details >
Privacy > Reset Privacy, then run by hand. If that menu is not there on this
iOS version, delete the shortcut and import it again.

### M6. One sample proves the parse before a year is written

`Weight Backfill` now asks for a year, then a first and last day as `MM-DD`
(default `01-01` and `12-31`), and sends `?from=<Y>-<A>&to=<Y>-<B>`. Runbook
W6 runs it on 2018-09-27 alone, the first weigh-in, right after the delete.
The check is concrete:

- the notification's new `written at:` line, the instant formatted ISO 8601
  with its offset, must read `2018-09-27T05:00:00-07:00`;
- Health must show one entry, Sep 27, 2018, 5:00 AM, source Shortcuts.

The undo is deleting that one entry. The recovery is to stop and send
screenshots. The two expected failures (`12:00:00-07:00`, and `logged 0` with
`already 0`) are named.

### L1. Unchanged

The daily still asks through today. See Judgment calls.

### L2. The single-weigh-in case is now visible

The one-day check in W6 is exactly a one-element `weighIns`, so it runs on the
device before any year. In the build, every row now reads `date` off the Repeat
Item and writes only inside `If <date> has any value` (code 100, device-attested
14 times in the owner's library). If Repeat ever walked a dictionary's keys,
each pass finds no `date` and writes nothing. The notification then shows
`logged` plus `already in Health` short of the site's count, and W6 names that
as a stop.

### L3. The snapshot test no longer compares the builder with itself

Two tests pin the first 210 actions of `Health Daily Sync`. One compares them
with the plist at Git HEAD (`git show HEAD:shortcut/Health Daily Sync.plist`)
and skips without Git. The other compares a SHA-256 of them, taken at HEAD
`f9d7228`
(`15959644fcaf2b83fb72f96314b571214931a706b3ccbbb0bc16dd57c9953c7c`), and runs everywhere. A third test shows that a
changed action changes the digest.

### L4. Checked on the Mac, not on the phone

W1 now has the owner read the token into `T` without echoing it and check
`echo ${#T}` prints 64. A phone-side check would need the request wrapped in an
If on the token's length, which is not attested. A short token already shows
`Unauthorized` on the notification's `site error:` line, and the runbook says
so. The server-side `min(32)` the review asks for is in this repo; see Issues.

### L5. A final pass proves the backfill landed

The readout now reads `logged L, already in Health K, of N weigh-ins from the
site`, so every run shows whether L + K = N. W7 checks that per year, and the
new W8 runs every year again, expecting `logged 0, already in Health N, of N`.

### Readout

Both shortcuts' notifications now carry logged, already in Health, the site's
count, how many Weight samples Health returned, the instants written, and the
site's error. `WeightTimesLogged` and `WeightDatesAlreadyInHealth` replace the
old logged-dates list.

## What I verified, and how

- `/usr/bin/python3 build_shortcut.py --no-sign`: structure PASS and validator
  PASS (vendored, python3.13) for all three targets, with the same four known
  suppressions. A second build is byte-identical. `plutil -lint` is OK on all
  three plists.
- `Health Daily Sync.plist`: 261 actions, md5
  `936953a288f460a10f6c90463b5fd186`. Its first 210 actions equal the plist
  at HEAD, and the import question is at ActionIndex 217.
  `Weight Backfill.plist`: 49 actions, md5
  `31a10108a80ed742ea01e33fb9b9450d`, import question at ActionIndex 6.
  `probe-capture.plist` is unchanged.
- `cd shortcut && /usr/bin/python3 -m unittest test_build_shortcut -v`: 68
  tests, all pass. Every earlier guard test still passes; three were updated
  for the new shape (the site guard is found by its UUID, the moved-Find
  mutation inserts before the site If, and the URL assertion now expects the
  day range).
- Fault injection outside the tests: patching `a_log_weight` to take the
  Magnitude from `date` made a scratch `--out-dir` build fail with the
  Magnitude error, and the real plists' md5s did not move.
- The W4 script ran against a fixture built on the real export DTD header,
  with a Correlation and Weight records from MyFitnessPal, Wyze, and
  Shortcuts. It listed the right 3 dates and made one request per year with
  the Bearer header. I also extracted the heredoc from the runbook text and
  ran it under zsh, to prove the paste works as written. Its body is identical
  to the tested script. I did not run it on the two 2.5 GB exports: this Mac
  was at a load of about 49 on 18 cores.
- The site claims in the runbook and NOTES (a range in the wrong order or a
  badly typed day is refused) match `parseMirrorRange` on the
  `weight-log-health-mirror` branch.
- `git status --short shortcut/` shows only the six paths, plus the two
  `.shortcut` deletions that were there before.

## What only the phone can verify

- That `WFAskActionDefaultAnswer` pre-fills `01-01` and `12-31`. The key is in
  the toolkit and the validator, not in any device shortcut. If the fields
  come up empty, typing the days works. Leaving one empty sends an empty day,
  the site refuses it, and nothing is written.
- That `If <Dictionary Value> has any value` behaves on the device as in the
  owner's shortcuts, where it tests other value kinds.
- The `<date>T12:00:00Z` parse, now checked on one sample in W6.
- That a refused Weight read gives Health's count 0 and the modal. The design
  assumes it, as HealthKit documents.
- The website prompt's wording and the Reset Privacy menu path on iOS 26/27.
- How Health treats a sample dated later than now (L1).

## Shortcuts

| Shortcut | Actions | Change |
|---|---|---|
| `Health Daily Sync` | 261 (first 210 unchanged) | Health-count If around the writes, row-date If, readout with skipped dates, Health count, and written instants |
| `Weight Backfill` | 49 | asks for a year and a day range, alert after the Health read with both counts, row-date If, the same readout |
| `probe-capture` | unchanged | none |

## Issues

- **L4 is outside my paths.** The server-side minimum belongs in this repo:
  `WEIGHT_LOG_MIRROR_TOKEN: z.string().min(32).optional()` in `src/env.js` on
  the mirror branch. The runbook's 64-character check covers setup, but not a
  later hand edit in Vercel.
- **L6 is outside my paths.** `docs/plans/weight-log-migration.md` still says
  "no Shortcuts sample yet" (decision 32) and "07:00 local" (decision 33 and
  near line 420). The build now counts every source's samples and writes at
  12:00 UTC. The plan also does not mention the dry run, the export check, or
  the one-day check before a year.
- **W4 depends on `/weight-log/edit`** to add a missing weigh-in. If that page
  ships after the mirror, the owner needs another way to add a date before
  W5.

## Ambiguities

- The review asked to detect a missing read "with proven actions if
  possible". It is not fully possible: HealthKit returns the same empty answer
  for a refused read and an empty store. The build makes the unattended run
  safe in both cases and leaves the attended backfill to the alert and the
  owner.
- "Compare Health's Weight dates since 2026-09-04 against the site." I
  compared by date, not value, and only dates the 2026-09-04 export lacks.
  A day both exports have but with a newer reading in Health is not listed.
  The site is the record, so its reading wins.

## Judgment calls

- **L1: keep `to = today`.** *Owner to confirm.* The review's fix (`to = today
  - 1`) removes the future-dated sample east of UTC-4 at the cost of one day's
  delay on every normal morning at home. At home the 8:00 run is 3 to 4 hours
  after 12:00 UTC, so the future case only happens abroad. I recommend keeping
  today for the home case, and switching to `today - 1` only if the owner
  travels east of UTC-4 often enough to care. If chosen, it is one Adjust
  Date in the URL, and `_site_window_days` would need to accept a window that
  ends yesterday.
- **M4: retire `Log My Weight`.** *Owner to confirm.* The site's entry page
  covers weigh-ins until the planned site entry Shortcut ships. Every reading
  it logs is missing from the site and blocks the mirror for that date. The
  runbook says to stop using it and leaves deleting it to the owner. Leaving
  it installed but unused is harmless.
- **M2: the backfill has no Health-count If.** *Owner to confirm.* It must
  write into an empty Health once. Its alert carries the check instead, and a
  test pins that the backfill does not need the If.
- **M6: a day range rather than a separate test shortcut.** *Owner to
  confirm.* It adds two Asks with defaults, so a year run costs two extra
  taps, and lets the owner rewrite one corrected old date (M3) without a
  whole year.
- **H1: the dry run uses 2026.** The current year has weigh-ins on the site,
  so the alert shows both counts. Any year would do.

## Next steps

1. Lead: decide L1 and M4 with the owner, and take L4 and L6 into this repo's
   mirror branch and plan.
2. Lead: confirm `/weight-log/edit` exists before the owner reaches W4.
3. Deep review of this fix, then the owner signs on the Mac
   (`python3 build_shortcut.py` without `--no-sign`) and follows the runbook
   from W0. The phone checks above are W3, W6, W7, and W8.

# Slice 4 review: the Apple Health Weight mirror

Fresh Claude review, 2026-11-09. Scope: `git diff 9e5dceda..HEAD` on
`weight-log-health-mirror` (the endpoint), and the uncommitted Shortcut builder
in `~/Desktop/Agents/apple-health/shortcut/` (builder, tests, both plists,
`NOTES.md`, `RUNBOOK-iphone.md`).

What I ran: the builder with `--no-sign --out-dir /private/tmp/slice4-review-build`
(both targets PASS structure and the vendored validator), the 42 builder tests
(all pass), a comparison of the built `Health Daily Sync` against the plist at
the apple-health repo's HEAD, and in-memory mutations of the built workflows
run through `structural_check()` and the vendored validator. I made no edits,
sent no request to the mirror endpoint, and wrote to no database. The only
network calls were two `curl -sI` header reads: the apex redirects to `www`,
and `/api/weight-log/mirror` is a 404 on production today.

No finding breaks the endpoint. The findings are in the Shortcuts and the
runbook. The one I rate high is a runbook step that can lose data for good.

## High

### H1. W3 deletes Health-only weigh-ins logged after the 2026-09-04 export, and nothing keeps them

`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/RUNBOOK-iphone.md:70`

W3 says the weigh-ins that only Health has "stay in the 2026-09-04 export and in
`health.db`". The 52-day count (decision 34) was measured against that export.
Health has gone on taking Weight samples from Withings, Wyze, and MyFitnessPal
for two more months. `Health Daily Sync` does not collect Weight (it is not in
`TYPES` or `GROUPED_TYPES`), and `health.db`'s weights come from the
spreadsheet. A day since 2026-09-04 that a scale wrote to Health but the owner
never put on the site is in no export and no database. W3's Delete All removes
it, and the backfill cannot restore it because the site does not have it.

I could not count such days without the phone. The rate before the export (23
scattered days in about eight years) suggests zero or one, but the step cannot
be undone.

Fix: add a W2.5 to the runbook. Take a fresh Health export (Health > profile >
Export All Health Data), diff its `HKQuantityTypeIdentifierBodyMass` dates
since 2026-09-04 against the site, and either add the missing days on the site
or record them as accepted losses before W3. A cheaper second check fits in the
same step. Import `Weight Backfill` (W4) before W3, run it once, and tap Cancel
at the count alert. The alert comes before any Health read or write, so this
proves the token, the URL, and the import question while Health still holds
its old samples.

## Medium

### M1. The runbook tells the owner to tap OK on "No Samples Found", which writes duplicates when Weight read access is off

`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/RUNBOOK-iphone.md:121-129`,
`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/build_shortcut.py:1277`

The runbook and the in-shortcut comment both say the Find is empty "only when
Health holds no Weight sample at all". `NOTES.md:1011` gives a second cause:
without read access, HealthKit returns nothing, the same as an empty store. If
Shortcuts' Weight read switch is off (turned off by hand, never granted, or
reset), every Weight Find comes back empty. Then:

- The 08:00 daily run stalls on the modal. If the owner follows the runbook
  and taps OK, `WeightDatesInHealth` is empty, and the run writes all 14 dates
  again. That is up to 13 duplicates per run, and the same thing happens on
  every later run.
- A W6 run, where the runbook says no modal can appear, writes a full year's
  duplicates if OK is tapped.

Fix, in two parts:

1. Runbook. Outside W5, "No Samples Found" means stop. Tap Open Health, not
   OK, and check that Shortcuts can read Weight.
2. Build. Wrap the daily run's write loop in
   `If <Count of WeightDatesInHealth> is greater than 0`. The daily run never
   needs to write into an empty store, because the backfill seeds it first, so
   tapping OK then writes nothing. Also put the count of Health dates in both
   notifications, so "Health had 0 dates" is visible.

### M2. The build guards pass a workflow that reads Health after it writes, or writes the wrong value

`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/build_shortcut.py:2675-2872`

`mirror_check()` sets `dates_filled` once anywhere in the action list and never
checks the order. It also never checks where the Magnitude comes from, or what
the Repeat feeding `WeightDatesInHealth` iterates over. I applied each of these
mutations to the built `Weight Backfill` or `Health Daily Sync`, and each one
returned `[]` from `structural_check()`:

| Mutation | Effect on device |
|---|---|
| Move the Find, Repeat, and Add to Variable block that fills `WeightDatesInHealth` to after the write loop | The guard sees an empty list, and every date is written on every run |
| Set the Log Health Sample Magnitude to the `date` Get Dictionary Value | Wrong value |
| Change the `pounds` Get Dictionary Value key to `excluded` | Wrong value |
| Point the daily run's Health-dates Repeat at a Sleep Find instead of the Weight Find | The guard checks the wrong dates |
| Make the dates Find a `Body Fat Percentage` Find | It is no longer a "Weight Find", so every Find rule is skipped |
| Give the backfill Find `Limit 1`, Latest First | A rerun of any older year duplicates |
| Point the write loop's Repeat at the `error` value | Nothing written, silently |

The first two mutations together also pass the full vendored validator
(`validate()` returned `True`, with only the four known suppressions).

Fix: in `mirror_check()`, require the Append to `WeightDatesInHealth` to come
before the duplicate guard's If. Require the Repeat around the Health Detail to
take the Weight Find's output. Require the Magnitude to be a Get Dictionary
Value with key `pounds` over `Repeat Item`. Require the write Repeat to take the
`weighIns` value that the site-count guard counts. Require every Health Find
that feeds `WeightDatesInHealth` to be Weight. Forbid a Limit on the backfill
Find. Add each mutation above to `MirrorCheckTest`.

### M3. Hand-entered corrections duplicate after a trip, and the runbook has no correction procedure

`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/build_shortcut.py:287`,
`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/NOTES.md:2315`,
`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/RUNBOOK-iphone.md:28`

The claim that 12:00 UTC "covers the hand-entered case too" holds only while the
phone stays in the zone where the sample was entered. Health's Add Data
defaults to the current time. Take a correction for Nov 5 entered at 21:00
Pacific, which is 05:00 UTC on Nov 6. In London, that sample's local date is
Nov 6. The guard for Nov 5 formats 12:00 UTC on Nov 5 as Nov 5, finds no match,
and writes the site's uncorrected value beside the correction. The same sample
also blocks Nov 6. A correction made in the morning fails the other way, after
a trip west. This only bites within the 14-day window, but per decision 32,
correcting a value in Health means adding one by hand.

There is a cleaner path, and the runbook does not mention it. Correct the
weigh-in on the site, then delete that day's sample in Health. The next daily
run (within 14 days), or `Weight Backfill` for that year, writes the corrected
value at 12:00 UTC. No hand-entered sample is involved.

Fix: document that path in the runbook as the way to correct a weigh-in, and
drop the "covers the hand-entered case" claim from the builder comment and
`NOTES.md`.

### M4. The owner's own `Log My Weight` shortcut still writes Weight, and W2 cannot switch it off

`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/RUNBOOK-iphone.md:65`

`NOTES.md` copies the Log Health Sample encoding from the owner's
`Log My Weight` shortcut, so that shortcut writes Weight from the Shortcuts
source. W2 turns off Withings, MyFitnessPal, and Wyze, but turning off Weight
writing for Shortcuts would also stop the mirror. If the owner keeps using
`Log My Weight`, its sample (at the current time, with whatever value was
typed) makes the mirror skip that date. Health then disagrees with the site
silently, and the M3 travel problem applies to it.

W2's fixed list of three apps can also miss a writer the author did not know
about.

Fix: in W2, read the writers from Health > Browse > Weight > Data Sources &
Access, not from a fixed list. Add a line telling the owner to delete or
disable `Log My Weight`, or change it to log on the site instead.

### M5. The first network request can stall the 08:00 run on a domain prompt

`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/RUNBOOK-iphone.md:114`

`Health Daily Sync` has never contacted a server before. The first time a
shortcut connects to a new domain, Shortcuts asks to allow it, with Allow Once,
Always Allow, and Don't Allow. W7 runs the shortcut by hand, which surfaces the
prompt, but the step only talks about Health permission. If the owner taps
Allow Once, the next 08:00 run asks again with nobody there to answer. The
snapshot is already saved by then, so the cost is a stuck run with no Weight
write. The backfill asks the same question once per year's run.

Fix: in W5 and W7, tell the owner to tap **Always Allow** for
`www.chappyasel.com`, and to tap Always Allow on any other prompt during the
W7 hand run.

### M6. The one unproven encoding on the write path is checked only after a year has been written

`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/build_shortcut.py:1330`,
`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/RUNBOOK-iphone.md:82-99`

`NOTES.md` marks the `Date` action built from the text
`<YYYY-MM-DD>T12:00:00Z` as not attested. Every write depends on it. The W5
spot check comes after all of 2018 is written. If the Date action yields
nothing, Log Health Sample falls back to its default date, and a year of
samples could land on the current instant. If it drops the time, they land at
local midnight. The confirm alert shows only a count, so nothing on screen
before the write tells these cases apart. W5.6 says "stop and send a
screenshot" but gives no way to recover.

Fix:

1. Add the first weigh-in's Date to the backfill's confirm alert, formatted
   with the time (for example, "first sample: Sep 27, 2018, 5:00 AM"), so a
   parse failure shows before OK.
2. In W5.6, add the recovery: repeat W3's Delete All, which is safe at that
   point because Health holds only what this run wrote, and stop.

## Low

### L1. Today's sample is written in the future east of UTC-4, and a cheap fix removes the case

`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/build_shortcut.py:1395`

`NOTES.md` already covers this. A second run before 12:00 UTC can write today
twice if "in the last N days" excludes future samples, and it is unknown
whether HealthKit accepts such a sample.

Fix: have the daily run ask for `to = today - 1`. At 08:00 in any zone up to
UTC+14, 12:00 UTC yesterday is already past, so no future sample can be
written. The cost is one day's delay. The backfill for the current year can
still write today, but it runs in the foreground at home.

### L2. A one-element `weighIns` list has not been tried on the device

`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/build_shortcut.py:1319-1327`

Every device-proven Repeat in this project iterates over Health samples. If the
site returns a single weigh-in (a sparse two weeks, or a backfill year with one
entry), Get Dictionary Value returns one dictionary, not a list of many. I am
not certain Repeat with Each treats that as one item rather than iterating
over its keys. If it iterates over the keys, `date` and `pounds` come back
empty, and the Date action meets the M6 failure.

Fix: before W7, run the daily shortcut by hand against a 14-day window that
holds exactly one weigh-in, or add a one-entry case to the probe list in
`NOTES.md`.

### L3. The snapshot-prefix test compares the builder with itself

`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/test_build_shortcut.py:48`

`test_daily_keeps_the_snapshot_and_appends_the_mirror` compares the first
actions with `build_actions()` from the same code. A change to a shared helper
(`a_find_health` gained a parameter in this diff) would alter both sides and
still pass. I checked the claim directly: the first 210 actions of the built
plist equal the HEAD plist byte for byte as parsed. The only top-level change
is the new `WFWorkflowImportQuestions` entry, with `ActionIndex` 217 on the
Mirror Token Text.

Fix: pin the test to `git show HEAD:"shortcut/Health Daily Sync.plist"`, or to a
committed hash of its first 210 actions.

### L4. The token has no minimum length

`/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/slice4-health-mirror/src/env.js:68`,
`/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/slice4-health-mirror/src/lib/weight-log/mirror.ts:38`

`z.string().optional()` accepts a one-character or whitespace token. A token of
a single space would be matched by `Bearer  ` (two spaces), because `(.+)`
captures the space. Nobody sets that on purpose, but the check costs nothing.

Fix: `z.string().min(32).optional()`. That keeps the build safe when the
variable is unset and fails it on a token that is obviously wrong.

### L5. No step shows that the whole backfill landed

`/Users/chappyasel/Desktop/Agents/apple-health/shortcut/RUNBOOK-iphone.md:101-104`

A year that stops partway (screen lock, error) shows no notification, and the
runbook says only to run it again. After W6, nothing confirms that Health holds
every site date.

Fix: end W6 with one more pass over every year, expecting `logged 0 of N` each
time. Alternatively, compare the Weight count in Show All Data with the site's
total.

### L6. The plan still describes the old scheme

`/Users/chappyasel/.paradev/worktrees/PersonalWebsite/think-finally-ready-fully-15fb8de6/docs/plans/weight-log-migration.md:133,139,420`

Decision 32 says "no Shortcuts sample yet", but the build counts every source.
Decision 33 and line 420 say samples are timed "07:00 local", but they are now
12:00 UTC. Update both decisions, so the next reviewer does not hold the build
to a rule it changed on purpose.

## Checked and sound

- **Endpoint auth.** The handler refuses with 503 when the token is unset or
  empty, and it checks the token before it parses the range or touches the
  database. The comparison hashes both sides with SHA-256 and compares them
  with `timingSafeEqual`, so neither length nor a matching prefix leaks through
  timing. Only `Bearer` (any case) is accepted. The token is server-only and
  used nowhere else.
- **Endpoint proxy and host.** `src/proxy.ts` leaves `/api/` paths alone, and
  `www.chappyasel.com` is the canonical host (the apex answers 308 to `www`), so
  no redirect can drop the `Authorization` header.
- **Endpoint caching and methods.** The route is `force-dynamic` and sends
  `private, no-store, max-age=0`, `noindex`, and `nosniff` on every response,
  errors included. Next's automatic HEAD runs through `GET`, so it is
  authenticated too. POST, PUT, PATCH, and DELETE return 405 without touching
  the database.
- **Endpoint range handling.** Both dates are required. The parser rejects
  impossible dates (2026-02-30), unpadded dates, and dates with a time. It
  refuses a reversed range. The 366-day limit is computed in UTC
  milliseconds, so DST cannot skew it.
- **Endpoint fields.** The query selects only `date` and `pounds`, and
  `toMirrorWeighIns` re-filters to the range and rebuilds each object from those
  two fields. Excluded readings are sent on purpose. Error bodies are fixed
  strings that never echo the input.
- **Time zones, for samples the mirror wrote.** The claim holds. The written
  instant is fixed, and the guard formats that same instant with the same
  Format Date that formats Health's start dates, in the same run, so both keys
  are in one zone. That stays true even if Format Date's ISO style turned out to
  use UTC rather than local time. Weigh-ins one day apart are 24 hours apart, so
  they never share a key. East of UTC+12, the key for date D is D+1 on both
  sides, so the mirror stays self-consistent while Health shows the next day,
  as the runbook says. `timeparse.py` records that Shortcuts emits ISO times
  with the local offset (`-07:00`), which supports "local" for the date-only
  form too. The exceptions are hand-entered samples (M3) and the unproven
  parse of the `Z` suffix (M6).
- **Type, unit, and guard placement in the built plists.** Each plist has
  exactly one Log Health Sample. It is Weight in lb and sits in the Otherwise
  branch of `If WeightDatesInHealth contains <Formatted Date>`. That operand
  formats the very Date action the sample is logged at, and both sit inside
  `If <Count of weighIns> is greater than 0`. The committed working-tree
  `Health Daily Sync.plist` is identical to a fresh build.
- **The first 210 actions of `Health Daily Sync`.** They are unchanged against
  the apple-health repo's HEAD plist (see L3).
- **No modal from an empty site response.** A refused or empty response gives
  Count 0, which skips the Find and every write. The readout and the
  notification still run, and the notification shows the site's error text.
- **Lookback.** 36,500 days covers 2018 from any run before 2100. The daily
  Find is sorted Latest First with Limit 60, which covers 14 days unless
  another writer floods Weight.
- **The token never enters the repo.** The Mirror Token Text is empty. The
  import question targets the right action index in both plists (217 and 4).
  The build fails on a filled token, on a literal `Bearer <text>`, or on any
  other empty Text.
- **Requests.** Each shortcut makes one GET to the mirror URL. The URL carries
  only dates (or the typed year), and the header carries only the token. No
  Health value leaves the phone.
- **Backfill confirm and cancel.** The alert comes before the Find and any
  write. Its Cancel button is on, so Cancel ends the run with nothing written.
  Rerunning a year, or resuming one that stopped partway, is idempotent
  because the Find has no Limit.

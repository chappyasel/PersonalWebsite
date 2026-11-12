# Slice 3 review: plan editing and set points (PR #146)

Fresh Claude reviewer, November 9, 2026. Branch `weight-log-plan-editing` at
`040e6bc1`, diffed against main `44c9112d`. I read the planners, the router,
both editor components, the import script's lock change, the schema, the
loader, `buildWeightLog`, `buildWeekTable`, and the owner decisions. I ran the
three slice 3 test files read-only (54 of 54 pass) and probed the planners
with a scratch `tsx` script on invented data. I ran nothing against any
database.

I found no P0, P1, or P2 defect. No path in this slice writes or deletes a
weigh-in. Under the lock, the planners cannot leave phases overlapping or
planned weeks outside their phase. Stale pages are refused. Every finding
below is P3. Two of them depend on the shape of the imported running phase,
which I could not check without reading the database. Each of those names a
read-only query the lead can run.

## Findings

### P3-1. Imported planned weeks with no target make Length describe one edit while the server does another

- **Where:** `src/app/weight-log/edit/PlanEditor.tsx:171-173` and `:406-408`;
  `src/lib/weight-log/plan-edits.ts:330-355`; `scripts/weight-log/import-plan.ts:120-125`.
- **Scenario:** The import copies every snapshot week of a phase into
  `weight_log_planned_weeks`, including weeks whose target is null. In the
  old snapshot, those are weeks past the plan that hold weigh-ins. The page
  filters those rows out (`row.target !== null`), so Length counts weeks only
  up to the last week with a target. The planner uses the last planned row
  of any kind. Invented example: the running phase has targets through week
  10, and weeks 11 and 12 are rows with a null target and weigh-ins.
  - Length shows 10. The owner types 11, and the page says "Adds 1 week at
    +0.25 lb/wk." The server sees a new last week (11) before its last row
    (12), tries to remove week 12, and refuses with "The week of … has
    weigh-ins, so the plan can't end before it."
  - The owner types 14. The page says "Adds 4 weeks." The server refuses with
    "The week of … has no target to continue from."
  - The owner types 12. The page says "Adds 2 weeks." The server returns an
    empty edit and reports success, and nothing changes.

  As a result, the running phase's plan cannot be extended from the page at
  all. The heading's "N weeks, ending …" at `PlanEditor.tsx:202` comes from
  `running.end`, which does count the null rows, so it disagrees with the
  Length field. Nothing is corrupted.
- **Confidence:** High that the code behaves this way: I read both sides, and
  the probe confirmed the planner's choice of last week. Whether production
  has such rows is unknown. Run `select week_start from
  weight_log_planned_weeks w join weight_log_phases p on p.id = w.phase_id
  where p.end_date is null and w.target is null` read-only.
- **Fix:** Pick one rule and use it on both sides. The simplest is for
  `planEndMove` to treat the last week with a target as the plan's last week.
  When it extends, it overwrites the null rows with targets, which is safe
  because writes replace a row on the same Monday. Alternatively, the import
  could stop writing planned rows whose target is null, since
  `buildWeightLog` already gives weigh-in-only weeks a row with no target.

### P3-2. Shortening can delete every planned week of an imported phase, and nothing on the page can then restore a plan

- **Where:** `src/lib/weight-log/plan-edits.ts:322-347`;
  `PlanEditor.tsx:195` (forms hidden when `planned.length` is 0) and
  `plan-edits.ts:330-334` ("This phase has no planned weeks to move").
- **Scenario:** `planEndMove` accepts any last week on or after the phase's
  start. If the phase's first planned row comes later than its start, a last
  week of `phase.startDate` removes every row. Invented example: the phase
  starts 2026-01-05, and its rows start 2026-01-12. The owner sets Length to 1,
  which sends lastWeek 2026-01-05. Both rows are deleted, and
  `planViolations` reports nothing (the probe confirmed it). After that, the
  Plan section shows no Rate or Length form, and the server refuses every
  `moveEnd`. The only way back is Start a phase on the phase's own Monday, and
  the picker offers that only within 12 weeks of today.
- **Confidence:** High for the planner (probe). Whether it can happen depends
  on whether any running phase's first row is after its start. Phases created
  on the page always start with a row, so only imported data can trigger it.
- **Fix:** Refuse an end move that would leave the phase with no planned
  week, or measure the minimum from the first planned row instead of
  `phase.startDate`.

### P3-3. Replacing a phase that the Weeks picker shows by explicit choice leaves the weekly table in a failure state

- **Where:** `src/app/weight-log/edit/WeightLogEditor.tsx:229`, `:236`,
  `:551`, `:569-577`; `src/server/api/routers/weightLog.ts:213-215`.
- **Scenario:** The owner picks the running phase in the Weeks picker, which
  sets `tablePhaseId` to its id. They then start a phase on that phase's own
  Monday, which deletes it. `useRefreshPlan` invalidates `weekTable`. The
  refetch for the deleted id gets `NOT_FOUND`, and the Weeks section shows
  "The weekly table failed to load." Retry keeps failing, and the picker shows
  a blank value. The owner recovers by picking another phase or reloading.
  In a related case, after a start that does not replace, an explicit choice
  keeps the table on the old phase instead of the new current one.
- **Confidence:** High, from reading the code. I did not drive it in a
  browser.
- **Fix:** Derive the shown id as `tablePhaseId` when it is still in
  `phases`, and otherwise `currentId`. Alternatively, have `useRefreshPlan`
  or a successful start clear `tablePhaseId`.

### P3-4. Rate, Length, and Set points can be resubmitted between a successful save and the refetch, and a stale-page refusal for the owner's own edit then overwrites the success message

- **Where:** `PlanEditor.tsx:317-323` and `:376`; `:426-430` and `:473`;
  `:783-787` and `:864`.
- **Scenario:** After `onSuccess`, `mutation.isPending` is false. The draft
  is cleared only after `refresh()` resolves, which takes about 125 ms per
  query between iad1 and us-west-2. Until then, `changed` is still true and
  the button is enabled. A second tap (a double tap on a phone) sends the old
  revision or old `previous` list. The server correctly refuses it with
  `CONFLICT`. Then `onError` sets "The plan changed since this page loaded
  it" (or "The set points changed…"). Whichever callback runs last decides
  whether the owner sees that message or the success line. Commit `4f49a68c`
  fixed exactly this for Start a phase with `landing`, but not for the other
  three forms. The server refuses the duplicate, so no data is affected.
- **Confidence:** High, from reading the code.
- **Fix:** Use the same `landing` flag in RateForm, EndForm, and
  SetPointsEditor, or clear the draft in `onSuccess` before awaiting the
  refetch.

### P3-5. A weigh-in saved during a plan edit can land in a week the edit just deleted

- **Where:** `weightLog.ts:99-118` (the edit reads weigh-ins under
  `PLAN_LOCK`); `weightLog.ts:272-287` (`upsertWeighIn` takes no lock).
- **Scenario:** Tab A shortens the plan from 12 to 10 weeks. Inside its
  transaction it reads weigh-ins, finds none in weeks 11 and 12, and deletes
  those rows. Before A commits, the phone saves a weigh-in dated in week 12.
  Both commit. Week 12 now has a weigh-in and no planned row. The planner's
  rule is "no planned week with a weigh-in is ever dropped", and the
  confirmation copy promises the same. The same race applies to
  `planStartPhase`'s `keptWeighIns` check. The weigh-in itself survives,
  belongs to the running phase, and appears with no target, so this is a
  broken promise rather than lost data.
- **Confidence:** High that the window exists. It needs two devices to save
  within one transaction's lifetime, so it is unlikely.
- **Fix:** Have `upsertWeighIn` take `pg_advisory_xact_lock_shared(PLAN_LOCK)`
  inside a transaction. Alternatively, have `editPlan` lock the weigh-in
  table in SHARE mode before reading it. That would block saves for the
  edit's few milliseconds.

### P3-6. The start confirmation misdescribes an already ended current phase

- **Where:** `PlanEditor.tsx:708-713`; `plan-edits.ts:234-240`.
- **Scenario:** The latest phase has an end date and the new start comes
  later, leaving a gap. Invented example: the phase ended 2026-02-01, and the
  owner starts 2026-03-02. The page says "Cut … ends Sunday, Mar 1, 2026, and
  this plan replaces its planned weeks from Mar 2 on." The server leaves the
  end at Feb 1 (`endPhases` is empty, which the probe confirmed), so the
  confirmation states an end the server does not write. After cutover, the
  page always creates a running phase, so this needs imported data or a
  future data fix.
- **Confidence:** High (code and probe). It is unlikely in practice.
- **Fix:** When `current.end < addDays(start, -1)`, say "starts after
  {current.label}, which ended {date}."

### P3-7. The API accepts any start Monday, while the page offers 12 weeks back through 26 ahead

- **Where:** `weightLog.ts:306-316`; `plan-edits.ts:194-198`.
- **Scenario:** `startDate` has no upper bound, and when no phase exists it
  has no lower bound either. A call with `startDate: "2091-01-01"`, a valid
  Monday, ends the running phase on 2090-12-31. That phase's dates then cover
  64 years with no plan, and the new phase starts in 2091. The call is
  owner-only, so this is a hand-written or scripted mistake, not an attack.
- **Confidence:** High.
- **Fix:** On the server, bound `startDate` to the window the picker offers,
  or to within `MAX_PLAN_WEEKS` of today.

### P3-8. Values the page accepts but the server refuses get the generic "Try again" message

- **Where:** `PlanEditor.tsx:85-88` against `weightLog.ts:57-61` and
  `:77-81`; `PlanEditor.tsx:99-110`.
- **Scenario:** `validRate(10.004)` passes on the page. The server checks
  `.max(10)` before it rounds, so the call fails with a zod error, and
  `failure()` shows "The rate didn't save. Try again." Trying again fails
  the same way. Likewise, a starting target or set point of 0.04 passes
  `validPounds`, rounds to 0 on the server, and gets the generic message.
- **Confidence:** High.
- **Fix:** Round on the page with the server's rule before validating, or
  move the server's rate transform ahead of the range check.

### P3-9. More than 10 imported set points would make Set points unsaveable

- **Where:** `weightLog.ts:381-382`; `scripts/weight-log/import-plan.ts:83`.
- **Scenario:** The import writes every set point in the workbook, and the
  DTO allows 20. `saveSetPoints` caps both `pounds` and `previous` at 10. With
  11 stored, `previous` fails validation on every save, so the owner can
  never save, not even a deletion that would bring the list under 10.
- **Confidence:** Conditional. I did not count the production set points.
  Run `select count(*) from weight_log_set_points` read-only.
- **Fix:** Allow `previous` up to the DTO's 20, or match the cap to the
  import's.

### P3-10. `--replace` would discard plan and set point edits without a word

- **Where:** `scripts/weight-log/import-database.ts:46-80` and `:110-113`.
- **Scenario:** The `--replace` guard counts only weigh-ins that the workbook
  lacks or records differently. Starting with slice 3, the site also owns
  phases, targets, original targets, and set points that the workbook cannot
  restore. A re-import after a phase start deletes and rebuilds all of them
  and reports nothing. The build review accepted the weigh-in lock gap
  because `--replace` is dead after cutover, and commit `b16764ab` marks the
  script for deletion. As long as the script exists, its guard does not
  cover what slice 3 added.
- **Confidence:** High.
- **Fix:** Delete the script after cutover as planned. If it stays, have
  `--replace` also refuse when phases, planned weeks, or set points differ
  from the import plan.

## Checked and sound

- **Weigh-ins.** No slice 3 path writes or deletes `weight_log_weigh_ins`.
  `editPlan` only selects dates from it. The cascade from
  `weight_log_phases` reaches planned weeks only, and weigh-ins have no
  foreign key to phases.
- **Write order in `editPlan`.** The order is week deletes, phase deletes,
  phase ends, the phase insert, then the week upsert. A replacement on the
  same Monday deletes the old phase before inserting the new one, so the
  unique `start_date` index holds. The cascade removes the old phase's
  remaining rows before the upsert writes them back. The new end
  (start − 1) is always a Sunday after the old start, so
  `weight_log_phases_weeks_check` passes.
- **Planner invariants.** The current phase is always the latest by start
  date. A new start can't come before it. The current phase ends the day
  before or is deleted. The upsert reassigns every displaced week, and every
  week past the new plan is deleted after the weigh-in check. I re-read the
  1,000-edit seeded run and found it meaningful. In my probe, 500 alternating
  rate changes kept every rate exact to eight decimals, so `cleanTarget`
  prevents drift.
- **Locks.** `editPlan`, `saveSetPoints`, and the real import all take
  `PLAN_LOCK` first. The import then takes EXCLUSIVE on weigh-ins, while an
  edit takes only ACCESS SHARE. Neither waits on the other while holding a
  lock the other needs. Under READ COMMITTED, the reads after the lock see
  everything committed before it. No other advisory lock in the repo uses
  the single-bigint key space (books and weightlifting use the two-int
  form). A thrown `PlanEditError` or `TRPCError` rolls back and releases the
  lock.
- **Stale-page detection.** The revision covers every phase field and every
  planned week field. All three queries and `editPlan` compute it from the
  same column shapes. `loadWeekRecords` reads in parallel on separate
  connections, so a revision from a torn read matches no committed state.
  That fails safe, with a spurious refusal. `changeRate` also checks the
  week's phase. The Start confirmation records phase and revision and lapses
  when either changes. Every field edit clears it, so the payload is the plan
  the confirmation described.
- **Rounding.** Starting targets and set points are rounded to 0.1 before
  the positive check, and rates to 0.01. Targets come from the start target
  plus index × rate, not from a running sum. The page's `signed` uses the
  server's rounding formula, so the rate it shows is the rate saved.
- **Dates.** All planner and page date math runs on ISO strings at UTC
  midnight, so Pacific time and daylight saving never move a Monday.
  `today` is the device's date, and `weekStartOf` and `startChoices` work on
  it as a string.
- **Repo rules.** Every new procedure is on `ownerProcedure`. PlanEditor has
  no `title=` attribute; `title` there is `CollapsibleSection`'s heading
  prop. It uses no sheet, dialog, or popover.
- **Known items.** Decision 9 against review finding 5, and a moved week
  taking the new plan's target as its original target, are already on the
  owner's confirm list in the build review. I did not count them again.

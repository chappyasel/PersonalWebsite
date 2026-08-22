# Visitor journey analytics review

## Objective and scope

Add a typed, privacy-conscious measurement layer for homepage delivery and the
main visitor journey. The work covers homepage delivery mode, world boot,
section arrival, Door activation, contact selection, and entry into primary
deep pages. It does not change PostHog dashboards, project settings, or other
external state. The separate boot-state branch owns transition coverage; this
branch does not duplicate that refactor.

## Baseline evidence

Facts:

- `src/lib/analytics.ts` accepts any event name and any property record.
- The analytics module imports PostHog dynamically and schedules initialization
  after window load or during an idle callback.
- Before this amendment, `capture` called initialization immediately and could
  bypass that scheduler. A rejected import resolved to cached `null`, while
  `captureOnce` marked its key before delivery succeeded.
- PostHog initializes with `person_profiles: "always"`.
- Only Book Notes calls `capture`. Its events are `book_viewed`,
  `book_notion_opened`, `book_audible_opened`, and `book_link_copied`.
- `src/app/page.tsx` makes a pre-paint world eligibility decision from WebGL,
  reduced-motion, and Save-Data signals.
- `StacksHome` owns the client eligibility check, world reveal, render-error
  boundary, context-loss fallback, and 40-second hang fallback.
- `FlatHome` and the world can coexist in the DOM during handoff.
- `PropLink` and `Grabbable` both route Door activation through
  `useOpenTarget`.
- The homepage unit registry has seven bounded section slugs in `data.ts`.

Hypotheses:

- Existing PostHog dashboards may depend on current Book Notes event properties.
  No dashboard or repository evidence was inspected outside this repository.

## Implementation summary

Facts:

- `AnalyticsEventProperties` is the closed event catalog. `capture` and
  `captureOnce` infer the allowed property shape from its event name. There is
  no untyped escape hatch because all four existing Book Notes events fit the
  catalog.
- The document-lifecycle analytics interface owns a bounded FIFO queue. Capture
  calls made before the load/idle scheduler starts initialization do not import
  PostHog. Successful initialization flushes queued events in order.
- The queue holds at most 100 events. When full, it drops the newest capture
  request and preserves the earlier funnel chronology. It stores no event after
  PostHog accepts that event's synchronous `capture` call.
- `captureOnce` treats a stable key as pending while its event is queued and as
  delivered only after the transport call succeeds. Book views, deep-page
  entries, homepage delivery, world boot, world runtime fallback, and each
  homepage section use stable keys.
- PostHog still imports dynamically and initializes after load or idle time. A
  rejected import clears the cached attempt, retains queued events, and permits
  retry. Production schedules retries after 1, 5, and 30 seconds; a later
  capture can start another attempt after those automatic retries are spent.
- Initialization and capture failures remain fail-open. Development builds log
  initialization failures to the console; production does not expose them to
  visitors.
- PostHog now initializes with `person_profiles: "identified_only"`. Anonymous
  events remain available for journey analysis without creating anonymous
  person profiles.
- SDK autocapture, automatic pageview/pageleave events, dead-click capture,
  rage-click capture, heatmaps, performance capture, and session recording are
  disabled. This makes the typed first-party catalog the measurement source.
- The SDK property sanitizer removes queries and fragments from `$current_url`,
  `$referrer`, `$initial_current_url`, and `$initial_referrer`, including nested
  person-property payloads. Malformed URL values are dropped.
- Homepage delivery records `world`, `reduced_motion`, `save_data`,
  `webgl_unavailable`, or `runtime_fallback`. Runtime fallback also records its
  known cause as `render_error`, `context_lost`, or `timeout`.
- World boot starts at the pre-paint script and ends at the fully revealed
  world gate. It records outcome, integer duration in milliseconds, and cold or
  warm path once per document.
- World section arrival waits for a settled Unit. Flat section arrival waits
  for a section to cross the middle fifth of the viewport. Both modes share the
  same per-section dedupe key.
- Door activation records a source-authored Door ID, owning section, and closed
  destination class. It does not record an href.
- Contact selection records one of five closed method values.
- The root route tracker records Book Notes, Weightlifting, Personal Manual,
  Core Daily Routine, Liar's Dice, and Golf. It handles both path routes and
  the repository's public/local subdomain rewrites without sending a hostname
  or pathname.
- Existing Book Notes event properties remain intact. They describe the public
  library record and never include notes, summaries, search terms, or other
  book contents.
- `StacksHome` runs `browserStacksWorldEligibility` once on mount. The same
  `useWorld` result controls delivery selection and canvas preloading, so
  reduced-motion and Save-Data cannot change between separate probes.

## Shortcuts taken

None.

## Issues discovered but not fixed

Facts:

- The full unit suite currently has six failures in untouched scene files:
  `aboutBootSilhouettes.test.ts`, `canvasCompositing.test.ts`,
  `freeRoamControls.presentation.test.ts`,
  `musingsPaperPhysics.test.ts`, `scenePerformance.presentation.test.ts`, and
  `units/aboutReadingStack.test.ts`. The task-focused suite passes.
- Full lint exits successfully with one existing warning in untouched
  `scene/reactionArchetype.test.ts` for unused `LIFT_LAMBDA`.
- A clean worktree lacks the ignored generated `next-env.d.ts`. `next typegen`
  loads `next.config.js`, so it also needs `SKIP_ENV_VALIDATION=1` when local
  credentials are absent. The command misleadingly exited zero when validation
  failed and did not generate types.

## Ambiguities

- "Once per page lifecycle" is interpreted as once per browser document. A
  full reload starts a new lifecycle; Strict Mode effect replay, hydration, and
  SPA revisits in the same document do not.
- "Primary deep pages" is interpreted as the bounded local destinations linked
  by homepage Doors, plus the homepage's dedicated Golf route: Book Notes,
  Weightlifting, Personal Manual, Core Daily Routine, Liar's Dice, and Golf.

## Judgement calls and rationale

- Journey deduplication lives at the analytics interface so every caller gets
  the same document-lifecycle rule. Action events remain repeatable because a
  second explicit selection is a second action.
- Door properties use source-authored IDs and a closed destination class. They
  do not include hrefs.
- Homepage section arrival means entry into the center viewport band in flat
  mode and a settled Unit after world reveal in world mode. Camera frames and
  section-boundary crossings are too noisy for a journey funnel.
- When several flat constraints apply, reason precedence is reduced motion,
  then Save-Data, then WebGL availability. This credits an explicit visitor
  preference before a device constraint.
- `homepage_delivery` records the first resolved delivery. If a revealed world
  later loses context, `homepage_world_runtime_fallback` records the transition
  without rewriting the successful boot fact.
- Existing public Book Notes metadata stays in its existing events to avoid an
  unrelated analytics contract break. No notes or summaries enter the catalog.
- `StacksHome` uses one eligibility result to choose world or flat delivery,
  record the flat reason, and authorize canvas preloading. This prevents a
  second capability probe from disagreeing with the reason already measured or
  starting a world download for a newly ineligible visitor.
- The queue drops new events rather than old events when it reaches 100 entries.
  Preserving the beginning of a journey is more useful for the proposed funnel,
  and a fixed bound prevents analytics failure from growing memory without
  limit.
- Three timed retries balance recovery from a transient chunk failure against
  indefinite background work. The queue remains available after that bound, so
  a later visitor action can retry without losing earlier facts.

## Files changed

- `docs/reviews/2026-08-21-journey-analytics.md`
- `src/app/books/components/BookDetailContent.tsx`
- `src/app/components/AnalyticsRouteTracker.test.ts`
- `src/app/components/AnalyticsRouteTracker.tsx`
- `src/app/components/ContactButtons/ContactButton.tsx`
- `src/app/components/ContactButtons/index.tsx`
- `src/app/components/stacks/FlatHome.tsx`
- `src/app/components/stacks/StacksHome.tsx`
- `src/app/components/stacks/scene/Grabbable.tsx`
- `src/app/components/stacks/scene/links.tsx`
- `src/app/components/stacks/webglProbe.test.ts`
- `src/app/components/stacks/webglProbe.ts`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/pagePresentation.test.ts`
- `src/lib/analytics.test.ts`
- `src/lib/analytics.ts`

## Automated checks

Eligibility recheck amendment:

- `SKIP_ENV_VALIDATION=1 yarn next typegen`: passed and generated route types;
  the ignored `next-env.d.ts` remains uncommitted.
- `yarn vitest run src/app/pagePresentation.test.ts src/lib/analytics.test.ts
src/app/components/AnalyticsRouteTracker.test.ts
src/app/components/stacks/webglProbe.test.ts`: passed, 4 files and 20 tests. The
  presentation contract requires exactly one eligibility call and zero
  `browserCanUseStacksWorld` calls in `StacksHome`.
- `yarn tsc --noEmit --pretty false`: passed.
- `yarn eslint src/app/components/stacks/StacksHome.tsx
src/app/pagePresentation.test.ts`: passed with no warnings.
- Three-file `yarn prettier --check`: passed.
- `git diff --check`: passed.

Amendment checks, run after the deferred queue and policy corrections:

- `SKIP_ENV_VALIDATION=1 yarn next typegen`: passed and generated route types.
  This is a clean-checkout prerequisite because `next-env.d.ts` is ignored and
  absent in fresh Superset worktrees. The generated file remains uncommitted.
- `yarn vitest run src/app/pagePresentation.test.ts src/lib/analytics.test.ts
src/app/components/AnalyticsRouteTracker.test.ts
src/app/components/stacks/webglProbe.test.ts`: passed, 4 files and 20 tests.
  The analytics interface tests prove pre-start capture does not call the
  loader, FIFO flush, once-key retention across a rejected load, successful
  retry, failed-delivery retention, and the drop-newest queue bound.
- `yarn tsc --noEmit --pretty false`: passed.
- `yarn eslint src/lib/analytics.ts src/lib/analytics.test.ts
src/app/components/stacks/StacksHome.tsx src/app/pagePresentation.test.ts`:
  passed with no warnings.
- `yarn lint`: exited zero with the one existing warning in untouched
  `src/app/components/stacks/scene/reactionArchetype.test.ts` for unused
  `LIFT_LAMBDA`.
- The first five-file `yarn prettier --check` run failed only on ledger
  wrapping. `yarn prettier --write
docs/reviews/2026-08-21-journey-analytics.md` formatted it; repeating the
  five-file check passed.
- `git diff --check`: passed after formatting.

Checks from the initial implementation, before this amendment:

- `yarn install --frozen-lockfile`: passed in 10.54 seconds. Yarn reported the
  repository's existing peer-dependency warnings.
- `yarn next typegen`: exited zero but failed environment validation and did
  not create `next-env.d.ts`. This is not a valid successful setup result.
- `SKIP_ENV_VALIDATION=1 yarn next typegen`: passed, generated route types, and
  created ignored `next-env.d.ts`. `git check-ignore -v next-env.d.ts` confirmed
  `.gitignore:21`; the file is not part of the commit.
- Focused scene import regression run covering `AuthoredProps`,
  `ProjectArtifacts`, `UnitBlog`, `UnitBooks`, `UnitTraining`, and Musings shelf
  tests: passed, 10 files and 45 tests after replacing a test-runner-incompatible
  alias in the shared Door module.
- `yarn test`: failed with 6 tests in 6 untouched files. A JSON reporter check
  counted 197 files, 1,548 tests, 1,542 passing tests, and 6 failing tests. The
  failing files are listed under issues discovered but not fixed. The full
  suite was not rerun after the amendment because its known failures are
  outside this task and the requested focused checks are current.

## Manual review steps

No interactive browser review was run, per repository instructions. Before
shipping, use a non-production PostHog project or local capture stub to check:

1. Load `/` in world, reduced-motion, Save-Data, and WebGL-unavailable cases.
   Confirm one `homepage_delivery` event per reload with the expected reason.
2. Complete a cold and warm world load. Confirm one `homepage_world_boot` with
   a plausible duration and matching `boot_path`.
3. Force a render failure, context loss, and hang in separate reloads. Confirm
   the bounded fallback cause and a readable flat page.
4. Traverse several Units, reverse direction, and revisit them. Confirm each
   section appears once per reload. Repeat in flat mode by scrolling sections
   through the middle viewport band.
5. Activate a Door from a normal prop, a Movable Prop, and a Touch Focus Door
   Label. Confirm one event per activation and no URL property from application
   code.
6. Select each contact method and enter each primary deep page through both
   root-domain paths and subdomains.
7. Load a page with arbitrary query and fragment values. Inspect the outgoing
   event and confirm SDK URL properties contain only origin and pathname.
8. Navigate away and back with client-side routing. Confirm delivery, boot,
   deep-page, book-view, and section facts do not duplicate in one document.

## Potential regressions and edge cases

- The initial flat server render must not emit a flat-delivery or section event
  before the client selects world mode.
- A runtime world failure must not leave a successful boot outcome duplicated
  or replaced.
- Flat and world copies of homepage content must not emit duplicate section
  events.
- Analytics import, initialization, or capture errors must not affect visitor
  actions.
- A sustained initialization outage can fill the 100-event queue. The newest
  events are then intentionally absent until older queued events flush.
- A transport that throws after partially accepting an event could cause that
  event to be retried. PostHog's synchronous `capture` call is the available
  acceptance boundary; this layer cannot observe network acknowledgement.
- Disabling PostHog's previously default automatic events changes any dashboard
  that depended on `$pageview`, `$pageleave`, autocapture, rage/dead clicks,
  heatmaps, performance capture, or session replay. Repository search found no
  references to such dashboards, but dashboard state was intentionally not
  inspected or changed.
- The flat section tracking wrapper adds one `width: 100%` block around each
  Unit slot. It preserves the existing flex order and gap but is worth checking
  on narrow and wide flat layouts.
- Document-lifecycle dedupe intentionally suppresses a second visit to the same
  deep page or section after SPA navigation. Use repeatable action events when
  repeated intent matters.
- Cross-subdomain deep-page continuity depends on the existing shared PostHog
  cookie behavior and project key. This change does not alter either setting.

## Rollback notes

Revert the task commit. No database migration, persistent schema change, or
external PostHog mutation is part of this work. Reverting restores PostHog's
previous automatic-capture defaults as well as the untyped `capture` function.

## Proposed PostHog dashboard queries

Create one dashboard named `Visitor journey` after events reach the chosen
PostHog project. PostHog supports direct `events` queries and dot-property
access in SQL insights, and `{filters}` makes the dashboard date range apply.
See the current [PostHog SQL editor documentation](https://posthog.com/docs/data-warehouse/sql).

### Delivery mix

Visualization: table or stacked bar.

```sql
SELECT
    properties.mode AS mode,
    properties.reason AS reason,
    count() AS page_lifecycles,
    round(100.0 * count() / sum(count()) OVER (), 1) AS share_pct
FROM events
WHERE event = 'homepage_delivery'
  AND {filters}
GROUP BY mode, reason
ORDER BY page_lifecycles DESC
```

### World boot reliability and latency

Visualization: table. Add a dashboard alert separately if the non-ready count
or p95 exceeds the accepted launch threshold.

```sql
SELECT
    properties.boot_path AS boot_path,
    properties.outcome AS outcome,
    count() AS boots,
    round(avg(toFloat(properties.duration_ms)), 0) AS mean_ms,
    round(quantile(0.5)(toFloat(properties.duration_ms)), 0) AS p50_ms,
    round(quantile(0.95)(toFloat(properties.duration_ms)), 0) AS p95_ms
FROM events
WHERE event = 'homepage_world_boot'
  AND {filters}
GROUP BY boot_path, outcome
ORDER BY boot_path, outcome
```

### Runtime fallback causes

Visualization: time series, weekly interval, stacked by cause.

```sql
SELECT
    toStartOfWeek(timestamp) AS week,
    properties.cause AS cause,
    count() AS fallbacks
FROM events
WHERE event = 'homepage_world_runtime_fallback'
  AND {filters}
GROUP BY week, cause
ORDER BY week, cause
```

### Section reach

Visualization: grouped bar. Event count is document reach because the client
emits each section once per document; unique visitors answers a separate
cross-document question.

```sql
SELECT
    properties.delivery_mode AS delivery_mode,
    properties.section AS section,
    count() AS document_reach,
    uniq(distinct_id) AS unique_visitors
FROM events
WHERE event = 'homepage_section_arrived'
  AND {filters}
GROUP BY delivery_mode, section
ORDER BY
    delivery_mode,
    CASE section
        WHEN 'about' THEN 1
        WHEN 'books' THEN 2
        WHEN 'training' THEN 3
        WHEN 'systems' THEN 4
        WHEN 'projects' THEN 5
        WHEN 'blog' THEN 6
        WHEN 'talks' THEN 7
        ELSE 99
    END
```

### Door activation

Visualization: table, then duplicate as a time series if volume justifies it.

```sql
SELECT
    properties.section AS section,
    properties.destination AS destination,
    properties.door_id AS door_id,
    count() AS activations,
    uniq(distinct_id) AS unique_visitors
FROM events
WHERE event = 'homepage_door_activated'
  AND {filters}
GROUP BY section, destination, door_id
ORDER BY activations DESC
LIMIT 100
```

### Contact and deep-page outcomes

Visualization: table.

```sql
SELECT
    'contact' AS outcome_type,
    properties.method AS outcome,
    count() AS events,
    uniq(distinct_id) AS unique_visitors
FROM events
WHERE event = 'homepage_contact_selected'
  AND {filters}
GROUP BY outcome

UNION ALL

SELECT
    'deep_page' AS outcome_type,
    properties.page AS outcome,
    count() AS events,
    uniq(distinct_id) AS unique_visitors
FROM events
WHERE event = 'deep_page_entered'
  AND {filters}
GROUP BY outcome

ORDER BY outcome_type, events DESC
```

### Funnel insight configurations

PostHog recommends keeping funnel steps to required events and supports inline
event combinations. See the current [funnels documentation](https://posthog.com/docs/product-analytics/funnels).

Create `Homepage traverse reach` with these exact settings:

1. `homepage_delivery`
2. `homepage_section_arrived`, filter `section = books`
3. `homepage_section_arrived`, filter `section = training`
4. `homepage_section_arrived`, filter `section = projects`
5. `homepage_section_arrived`, filter `section = talks`

Use ordered steps, unique users, a 30-minute conversion window, first-touch
attribution, and breakdown by the first step's `reason` property. Other events
may occur between steps.

Create `Homepage to primary deep page` with these exact settings:

1. `homepage_delivery`
2. `homepage_door_activated`, filter `destination` is one of `books`,
   `weightlifting`, `liarsdice`, `manual`, or `routine`
3. `deep_page_entered`, filter `page` is one of `books`, `weightlifting`,
   `liars_dice`, `manual`, or `routine`

Use ordered steps, unique users, a 30-minute conversion window, first-touch
attribution, and breakdown by step 2's `destination`. This measures navigation
arrival, not whether the destination values match row by row. Use the Door SQL
table to investigate any mismatch.

Create `Homepage to contact` as a two-step ordered funnel from
`homepage_delivery` to `homepage_contact_selected`, unique users, 30-minute
window, broken down by step 2's `method`.

## Policy decisions and owner-review flags

### Person profiles

Decision: use `person_profiles: "identified_only"`.

Facts:

- Repository search found no `posthog.identify`, `$set`, or
  `setPersonProperties` call.
- The new events contain no visitor identifier or visitor-supplied free text.
- Current PostHog documentation says `person_profiles` accepts `always` or
  `identified_only` and now defaults to `identified_only`. PostHog also states
  that anonymous events remain queryable without a person profile. See
  [JavaScript configuration](https://posthog.com/docs/libraries/js/config) and
  [People](https://posthog.com/docs/data/persons).
- With no identify calls, `always` would create person profiles for otherwise
  anonymous visitors when analytics mounts site-wide. `identified_only` avoids
  that privacy and billing exposure while retaining anonymous event analysis.

### Automatic PostHog features

Owner review required: keep or revise the project-wide disabling of
autocapture, automatic pageviews/pageleaves, dead/rage clicks, heatmaps,
performance capture, and session recording.

Facts:

- This branch disables those SDK features so the closed first-party event
  catalog is the only application measurement source.
- Repository search found no dashboard definitions that depend on the automatic
  events.
- External dashboards and PostHog project settings were intentionally not
  inspected or changed.

Hypothesis:

- Existing external dashboards may depend on one or more disabled automatic
  events despite the absence of repository evidence.

Review question: approve the typed-only measurement policy, or identify the
specific automatic features and dashboards that must remain supported.

## Recommended next steps

1. Review the six unrelated failing scene contracts and decide whether the
   source or the assertions are stale before treating `yarn test` as a release
   gate.
2. Put `SKIP_ENV_VALIDATION=1 yarn next typegen` in the clean-worktree setup or
   verification owner chosen by the green-baseline/toolchain work. Keep
   `next-env.d.ts` ignored.
3. Perform the manual event review above against a non-production project.
4. Review the project-wide automatic-feature shutdown before release.
5. Let the boot-state branch add transition coverage; do not duplicate its
   refactor in this analytics branch.
6. After enough traffic, create the proposed dashboard and set boot/fallback
   thresholds from observed distributions. No dashboard was created by this
   task.

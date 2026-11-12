# Quick weigh-in Shortcut: research

Read-only investigation, November 9, 2026, for the owner's request: "quickly
input my weight and then get like, hey, here's how you're doing this week so
far. Like a little visual." No code was written and no database was touched.

Code read on the cutover branch (`worktree-agent-a772e01a4518be175`, head
`a2d7c798`) and the slice 4 worktree (`slice4-health-mirror`, uncommitted
mirror route on top of `9e5dceda`).

## Recommendation

Build it as slice 5 (a new issue and PR 5), after the cutover (#144) lands and
after slice 4, whose bearer check it reuses.

- Two REST route handlers under `src/app/api/weight-log/`, beside slice 4's
  mirror:
  - `POST /api/weight-log/weigh-in` takes `{ date, pounds, replace }` and
    answers JSON.
  - `GET /api/weight-log/week-card?date=YYYY-MM-DD` answers a PNG of the
    current week.
- Both accept only `Authorization: Bearer <WEIGHT_LOG_ENTRY_TOKEN>`, a new
  token separate from `WEIGHT_LOG_MIRROR_TOKEN`. The entry token can write
  only today's or yesterday's weigh-in, can never delete, and can read only
  the week card.
- The Shortcut ("Log Weight") asks for a number, posts it, asks before
  replacing an existing weigh-in, fetches the card, and shows it with Show
  Notification: the PNG as the rich preview and one line of numbers as the
  body. Show Notification does not open the Shortcuts app, so it works from
  the Action button, Control Center, a widget, or Siri.
- The card is a seven-day strip (Monday to Sunday, colored with the
  workbook's green scale from `color-scale.ts`) above four numbers: the week's
  average so far, its target, the gap to target, and the change from last
  week.

This changes two owner decisions and moves one deferred item, so the owner
signs off on those first (see "Conflicts with the plan").

## Conflicts with the plan

- Decision 15 says owner access is Google sign-in. This adds a second way to
  write owner data: a long-lived token in a Shortcut on the owner's phone. It
  needs the owner's explicit yes, and the plan should record it as a new
  decision.
- Decision 35 gives the mirror its own read-only token. The entry Shortcut
  must not reuse it, or the read-only token gains a write. Separate token,
  separate env var.
- The plan's Deferred list has "A one-tap 'Log Weight' Shortcut for entry."
  The owner's request un-defers it. Move it from Deferred into Slices.
- Decision 7 (a second weigh-in for a date replaces it) still holds. The
  Shortcut adds a confirmation in front of the replace, the same way fix A
  put a "Replace" label on the editor's button
  (`src/app/weight-log/edit/WeightLogEditor.tsx:271`).
- Decision 36 lists four PRs. This is a fifth.
- Decision 22 (entry defaults to today in the phone's time zone) carries
  over: the Shortcut sends the phone's local date, never the server's.

No live break found. One note for the lead: the slice 4 worktree is cut from
`9e5dceda`, before fix A and fix B, so its diff against the cutover head shows
`color-scale.ts` and the runbook as deleted. That is a stale base, not a
change, and resolves when slice 4 rebases.

## 1. Auth

A Shortcut cannot run Google OAuth. Apple's API limitations page says OAuth 2
"is currently not supported"
([support.apple.com](https://support.apple.com/guide/shortcuts/api-limitations-apd891a6c84e/ios)).
It can send a fixed header, which is what slice 4 already relies on.

Recommended model:

- A new env var `WEIGHT_LOG_ENTRY_TOKEN`, 32 random bytes in hex
  (`openssl rand -hex 32`), set in Vercel Production only, optional in
  `src/env.js` like `WEIGHT_LOG_MIRROR_TOKEN`. With it unset the routes answer
  503 and touch nothing. Previews and CI have none, matching decision 17.
- Compare it the way slice 4 does in `src/lib/weight-log/mirror.ts`
  (`isMirrorAuthorized`): SHA-256 both sides, then `timingSafeEqual`. Move
  that function into a shared module (for example
  `src/lib/weight-log/bearer.ts`, `isBearerAuthorized(header, expected)`) and
  have both routes call it. Whichever slice lands second does the move.
- Hashed in the database versus plain in an env var: keep the env var. It is
  the pattern the mirror and `CRON_SECRET` already use, and a database table
  of tokens needs a migration, a revoke UI, and a deep review for little gain
  with one owner and one device. Anyone who can read Vercel's env already has
  `DATABASE_URL`, so hashing the stored token buys nothing here.
- Revoke by rotating: new value in Vercel, redeploy, paste the new value into
  the Shortcut. Write that in the runbook.
- Scope, enforced in the route, not the Shortcut:
  - Writes only for a date within one day of the server's UTC date, either
    direction. A phone in Pacific time is at most one day behind UTC, and
    `latestDate()` in `src/server/api/routers/weightLog.ts` already allows
    one day ahead. Older corrections go through `/weight-log/edit`.
  - No delete, no phase, plan, or set-point writes.
  - Read only the week card for a date in the same window.
  - A leaked token can therefore change at most two or three dates, each
    visible on `/weight-log/edit` and fixable there or by Neon restore
    (decision 13).
- Rate limits: none needed in v1. A 256-bit token cannot be guessed, the
  repo has no rate limiter to reuse, and the date window bounds what a leaked
  token can do. Vercel's firewall can block a flood if one ever happens.
- The token lives in a Text action inside the Shortcut. Shortcuts has no
  secret store, so anyone holding the Shortcut file holds the token. The
  runbook must say: never share it by iCloud link, never AirDrop it to anyone
  else. Slice 4 has the same constraint.

How it fits `ownerProcedure` and the guard tests:

- `ownerProcedure` (`src/server/api/trpc.ts:128`) stays session-only. Teaching
  it to accept a bearer token would give the token every owner power
  (`youtube.triggerSync`, `books.triggerSync`, `weightlifting`, `post`), which
  is the opposite of scoping it.
- `weightLogOwnerOnly.test.ts` checks only tRPC procedures under `weightLog`,
  and `ownerDataBoundary.test.ts` checks only files under
  `src/app/weight-log/edit/`. A route under `src/app/api/weight-log/` passes
  both without being covered by either. The slice 1 Claude review named this
  hole (finding 2). The slice adds a third guard, described under "Tests"
  below, so every route there is listed, names its token, and refuses a
  missing or wrong token before the database is touched.

## 2. Endpoint shape

REST route handlers, not tRPC. Reasons:

- `CLAUDE.md` allows REST under `src/app/api/` for third-party integrations.
  An Apple Shortcut is an outside client that cannot hold a NextAuth session.
  The plan already reads slice 4's mirror this way.
- tRPC here uses the superjson transformer. A Shortcut can post
  `{"json": {...}}` to `/api/trpc/weightLog.upsertWeighIn`, but the call
  would still need a session, and putting a token procedure inside
  `weightLog` breaks the guard's rule by design.
- The card is a PNG. tRPC returns JSON only.

Keep decision 7's write in one place: move the upsert out of the router into
a function such as `saveWeighIn(db, { date, pounds, replace })` in
`src/lib/weight-log/weigh-ins.ts`, returning
`{ status, previous }`. The tRPC mutation calls it with `replace: true` (the
editor already shows "Replace" before saving). The route calls it with what
the Shortcut sends.

`POST /api/weight-log/weigh-in`

- Request: `{ "date": "2026-11-09", "pounds": 181.9, "replace": false }`.
  Accept `pounds` as a number or a numeric string, because a Shortcut's
  dictionary field can send either; round to one decimal (decision 22) with
  the router's existing `pounds` schema. Validate `date` with the router's
  `weighInDate` plus the narrower window above.
- Response, always HTTP 200 JSON for every expected outcome, so the Shortcut
  can branch on a field instead of on a status code (Apple's docs do not say
  how Get Contents of URL treats a 4xx body, so do not depend on it):
  - `saved`: no weigh-in existed for the date.
  - `exists`: one exists with a different value and `replace` was false.
    Nothing written. Includes `previous`.
  - `replaced`: `replace` was true. Includes `previous`.
  - `unchanged`: the same value already exists. Nothing written. This makes a
    retried request harmless.
  - Every response also carries `summary`, the one-line text for the
    notification body (see section 3), computed after the write.
- 401 for a missing or wrong token, 503 when the token is unset, 400 for a
  bad body, 405 for other methods. Headers as the mirror route:
  `Cache-Control: private, no-store, max-age=0`, `X-Robots-Tag: noindex,
  nofollow, noarchive`, `X-Content-Type-Options: nosniff`.
- `export const dynamic = "force-dynamic"` and the Node runtime (postgres-js).

`GET /api/weight-log/week-card?date=2026-11-09`

- The same token. Answers `image/png` for the week containing `date`, with
  the same no-store headers. The date picks the week and marks "today" on the
  strip; it uses the window above.
- A separate GET rather than a PNG from the POST, so the POST's JSON can tell
  the Shortcut about `exists`, and so the card can be reused later ("how am I
  doing" without logging).

Should the Shortcut warn before replacing? Yes. The owner may run it twice by
accident, or after entering the weight on the site. On `exists` the Shortcut
shows Choose from Menu: "Today has 182.4 lb. Replace with 181.9?" with
Replace and Cancel. Replace re-posts with `replace: true`.

## 3. The visual

What a Shortcut can show, checked against Apple's Shortcuts User Guide:

- Show Notification: "Media that's passed into the notification is displayed
  in a rich preview, such as an image or a Maps location," and it "runs
  instantly and continues to the next action"
  ([Show Notification](https://support.apple.com/guide/shortcuts/use-the-show-notification-action-apd2175adcab/ios)).
  It is not on Apple's list of actions to avoid in widget or Apple Watch
  shortcuts.
- Quick Look shows an image full screen, but Apple lists "Preview content,
  such as the Quick Look action" among the actions to avoid in shortcuts run
  from a widget or Apple Watch, and a widget run "automatically opens" the
  Shortcuts app when an action can't finish there
  ([complicated shortcuts](https://support.apple.com/guide/shortcuts/about-actions-in-complicated-shortcuts-apd081d9d61f/ios),
  [widget](https://support.apple.com/guide/shortcuts/run-shortcuts-from-the-home-screen-widget-apd029b36d05/ios)).
- Show Result and Show Alert display text; Apple's pages I read say nothing
  about images in Show Result. Untested.
- Rich text or HTML through Make Rich Text from HTML ends in Quick Look, with
  the same app-opening cost, and renders worse than a PNG.
- A home-screen widget showing the week needs a third-party app (Scriptable,
  Widgy) or a native app. Out of scope.
- Ask for Input set to Number opens a number pad, and Apple says to use that
  type for widget and Watch runs. The decimal key needs a device check.
- Get Contents of URL: Apple documents GET, POST, PUT, PATCH, and DELETE, and
  a Request Body of "JSON, a Form or a File" for POST, PUT, or PATCH
  ([first API](https://support.apple.com/en-au/guide/shortcuts/apd58d46713f/ios)).
  Apple's pages do not describe the Headers field, though the action has one
  under Show More and slice 4 depends on it too. Confirm on the owner's first
  run.

Recommendation: Show Notification with the PNG as its input and a one-line
body. The collapsed notification shows the line; a long press shows the
card. If the card request fails, the line still arrives.

The card, built only from data that exists today:

- Source: `loadWeekRecords` and `buildWeightLog`, then `buildWeekTable(log,
  phaseId)` for the phase covering the date (`src/lib/weight-log/week-table.ts`),
  then `weekTableColors(rows)` over the whole phase so the colors match the
  editor's table (`src/lib/weight-log/color-scale.ts`).
- Header: "Week of Nov 9", and the derived phase name, for example "Bulk Aug
  '26 - Aug '27".
- Seven cells, Monday to Sunday: the weigh-in to one decimal, filled with the
  green scale; today's cell outlined; future days blank; an excluded day
  unfilled, as in the editor.
- Four numbers under the strip, from the current row:
  - Average so far, with "3 of 7" weigh-ins. It is the trimmed mean, which
    drops the high and low only at three or more weigh-ins, so midweek it
    moves more than at week's end. Colored with the shared blue-to-red scale.
  - Target, same scale.
  - Gap to target (average minus target), signed.
  - Change from last week (this average minus last week's), signed.
- A week past the plan's end has no target. Hide target and gap then, and say
  "No target this week".
- The notification body, from the POST's `summary`: "181.9 saved. Week avg
  182.3 (3 of 7), target 182.0, 0.3 over. Last week 181.6."

Rendering: `next/og` `ImageResponse` on the Node runtime, as
`src/app/api/og/section/route.tsx` does, with Georgia Pro from
`src/app/books/[bookId]/fonts.ts` (the owner wants no sans on these pages).
About 1200 by 675, opaque light background, since a notification image does
not follow dark mode. Two satori rules from memory: never pass an `undefined`
style value (it throws mid-stream, after the handler returns, as a 500), so
spread optional fills such as a missing cell color; and pass any Phosphor icon
through `phosphorSvg`. Check that Georgia's digits line up in the strip; they
are old-style figures by default.

Not in v1: a sparkline of the last eight weekly averages against targets. It
is easy to add later from the same rows.

## 4. Privacy

What keeps the card and the write private:

- No route answers without the bearer token. With the token unset, they
  answer 503 and never query.
- The token travels only in the `Authorization` header, never in the query
  string, so it stays out of URLs, logs, and history.
- Every response sends `Cache-Control: private, no-store, max-age=0`. Vercel's
  CDN caches a route response only when it says `public` or `s-maxage`, so
  nothing is shared between requests. Both routes are `force-dynamic`.
- `X-Robots-Tag: noindex, nofollow, noarchive`, and no link to either route
  anywhere on the site.
- The card URL is not guessable into anything: without the token it answers
  401 and an empty body.
- The route logs no weights. Errors log the status, not the body.
- The token is separate from the mirror's, so revoking one leaves the other.

For calibration: the week's weigh-ins, targets, and original targets are
already in the public `/weight-log` page's payload (the `WeightLog` DTO's
`weeks` carries `weights`, `target`, and `originalTarget`). The card shows
nothing the public chart does not, apart from the gap and change arithmetic.
The real asset to protect is the write.

## 5. Effort and sequencing

One slice, about the size of slice 4's route work plus a card renderer:

- Two route handlers, a shared bearer check, the extracted `saveWeighIn`, a
  summary function, a satori card, and tests. Roughly 500 to 700 lines
  including tests.
- No migration. No change to the public page or the editor's behavior.
- The Shortcut itself is about ten actions.

Dependencies:

- The cutover PR (#144): the tables, `loadWeekRecords`, `buildWeekTable`, and
  the colors from fix A. Build on the cutover branch after it merges.
- Slice 4: share the bearer helper. If slice 4 lands first, slice 5 moves
  `isMirrorAuthorized` into the shared module. Slice 4 also proves on the
  owner's iPhone that a `Get Contents of URL` with a Bearer header works,
  which slice 5 then relies on.
- Slice 3 does not block it. Both touch `weightLog.ts` only if slice 3 edits
  the upsert, which it should not.

Yes, it should be a new issue and slice. It changes the access model, so it
waits for the deep review.

## Proposed slice 5: quick weigh-in Shortcut (PR 5)

**Changes**

- `src/lib/weight-log/bearer.ts`: `isBearerAuthorized`, moved from slice 4's
  `mirror.ts`. The mirror route calls it.
- `src/lib/weight-log/weigh-ins.ts`: `saveWeighIn(db, { date, pounds,
  replace })` returning `saved | exists | replaced | unchanged` and
  `previous`, in one transaction (read the date's row, then insert or update;
  a concurrent insert of the same date hits the primary key and retries).
  `weightLog.upsertWeighIn` calls it with `replace: true`.
- `src/lib/weight-log/week-summary.ts`: from a `WeightLog` and a date, the
  current week's row, its colors, the count of weigh-ins, and the one-line
  summary text.
- `src/app/api/weight-log/weigh-in/route.ts`: the POST described above.
- `src/app/api/weight-log/week-card/route.tsx` and a card component beside
  it: the PNG.
- `src/env.js` and `.env.example`: `WEIGHT_LOG_ENTRY_TOKEN`, optional.
- `docs/weight-log.md`: an "Entry from a Shortcut" section with the token
  rotation steps.
- The Shortcut, one of:
  - a hand-build recipe in `~/Desktop/Agents/apple-health/shortcut/RUNBOOK-iphone.md`
    (recommended for v1, see the open questions), or
  - a `Log Weight` builder in `build_shortcut.py`, once slice 4 has proven the
    `Get Contents of URL` encoding on device. `NOTES.md` records many
    parameter encodings that failed on device until probed, and the builder
    has no attested `downloadurl` action today.
- Recipe: Ask for Input (Number) > Format Date (current date, `yyyy-MM-dd`) >
  Text (the token) > Get Contents of URL (POST, header `Authorization: Bearer
  <Text>`, JSON body date, pounds, replace false) > If `status` is `exists`:
  Choose from Menu (Replace, Cancel), on Replace post again with replace true
  > Get Contents of URL (GET week-card, same header) > Show Notification
  (title "Weight Log", body `summary`, input the image).
- The plan: a new decision for the entry token and its scope, slice 5 under
  Slices, and the Deferred line removed.

**Read first:** slice 4's `src/app/api/weight-log/mirror/route.ts` and
`src/lib/weight-log/mirror.ts`; `src/server/api/routers/weightLog.ts`;
`src/lib/weight-log/week-table.ts`, `color-scale.ts`, `records.ts`;
`src/app/api/og/section/route.tsx`; the satori memory notes
`gotcha_satori_undefined_style.md` and `gotcha_phosphor_satori_og.md`;
`apple-health/shortcut/NOTES.md` and `RUNBOOK-iphone.md`.

**Tests**

- A route guard, `src/app/api/weight-log/routes.guard.test.ts`: it lists
  every `route.ts(x)` under `src/app/api/weight-log/` and fails on one not in
  an allowlist mapping path to token env var. For each listed route and each
  exported method, with the database mocked to throw on any access (the
  `weightLogOwnerOnly.test.ts` pattern), a missing token, a wrong token, and
  the other route's token each get 401 without touching the database. Prove
  it fails with a temporary unlisted route.
- `saveWeighIn` with synthetic data: each of the four outcomes, `excluded`
  kept on replace, and the tRPC mutation's behavior unchanged.
- The POST route: the date window (today, yesterday, tomorrow allowed; two
  days back refused), pounds as number and as string, rounding, 503 when
  unset, 405 on other methods, and the no-store headers on every response,
  including 401.
- `week-summary`: average so far with one, two, and three weigh-ins (the
  trim), the change across a phase boundary, a week with no target, the
  summary text.
- The card through the real satori renderer for: an empty week, one
  weigh-in, a full week, an excluded day, and a week with no target. This is
  the test that would have caught the book OG 500s.
- `pnpm verify`.

**Checks**

- `pnpm verify`.
- Run `pnpm dev` against the Neon test branch, `curl` the POST and the card
  with a local token, and look at the PNGs. Show them to the owner on a
  ParaDev page, visible only to the owner, since they hold real weights.
- The owner sets `WEIGHT_LOG_ENTRY_TOKEN` in Vercel Production, builds or
  installs the Shortcut, and runs it once from the Action button or Control
  Center after merge. Check the notification preview and the replace prompt.

**Wait or on-screen:** wait for the deep review. It adds an access path that
writes owner data, which the Build wave rules name.

**Done when** the owner runs Log Weight on the iPhone, the weigh-in appears on
`/weight-log/edit` and the public chart, a second run the same day asks before
replacing, and the notification shows the week card.

## Open questions for the owner

1. Do you accept a second way to write weigh-ins besides Google sign-in: a
   token kept in the Shortcut, limited to today's and yesterday's weigh-in?
   Recommended: yes, with that limit and no deletes.
2. Should the Shortcut ask before replacing a weigh-in that already exists for
   the day? Recommended: yes, a Replace or Cancel menu that shows both
   values.
3. Notification with the card as its preview, or the card full screen with
   Quick Look? Recommended: notification. Quick Look opens the Shortcuts app
   when run from a widget or Watch and needs a tap to dismiss.
4. Card contents: the seven-day strip plus average so far, target, gap, and
   change from last week. Add an eight-week sparkline? Recommended: not in v1;
   add it if the strip feels thin after a week of use.
5. Should Log Weight also write the Apple Health sample right away, instead
   of waiting for the 08:00 mirror? Recommended: no. The mirror already skips
   dates that have a Shortcuts sample, so this would work, but a replaced
   weigh-in would then need a second Health write, and decision 32 keeps
   Health one-way and simple. If you usually weigh in after 08:00 and want
   Health the same day, say so.
6. Hand-built Shortcut from a written recipe, or generated and signed by
   `build_shortcut.py`? Recommended: hand-built for v1. It is about ten
   actions, and the builder has not yet proven its URL action on device.
7. Make this slice 5 with its own issue and PR, after the cutover and slice 4?
   Recommended: yes.

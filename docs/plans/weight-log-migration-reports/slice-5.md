# Weight Log slice 5, Log Weight Shortcut: build report

Branch `weight-log-quick-entry`, cut from `origin/main` at `c1de0296`, in `/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/quick-entry`.

PR: https://github.com/chappyasel/PersonalWebsite/pull/150 (base `main`, not merged). Checks are green: `check`, `quality-contracts`, Vercel, and Devin. Devin's review found no issues. The slice waits for the deep review.

ParaDev page: https://app.superset.sh/page/log-weight-week-card-01cnjh (`just_me`). It has three cards from the live route and two from the test fixtures, all with invented values. Its source is `.quick-entry-check/` in the worktree, which I added to the repo's shared `info/exclude`. I did not open a pane.

`apple-health` commit: `05b0b8b` Add the Log Weight shortcut recipe to the iPhone runbook. It touches only `shortcut/RUNBOOK-iphone.md`. It is local and not pushed. The other sessions' uncommitted edits in that repo are untouched.

## Commits

- `7007b2bb` Move the Weight Log bearer check into its own module
- `06efcefd` Save weigh-ins through one function that reports what it did
- `3b270694` Summarize a week for the Log Weight notification
- `d8e2523a` Add the Log Weight Shortcut's weigh-in and week card routes
- `a3657a90` Document Log Weight entry and add slice 5 to the plan

## What changed

1. **`bearer.ts`.** `isBearerAuthorized(authorization, expected)` is the mirror's `isMirrorAuthorized` with a new name and module. The mirror route calls it, and its tests moved to `bearer.test.ts`.
2. **`weigh-ins.ts`.** `saveWeighIn(db, { date, pounds, replace })` runs one transaction. It takes `pg_advisory_xact_lock_shared(PLAN_LOCK)`, then `select pounds ... for update` on the date. With no row it inserts with `on conflict do nothing`. If a concurrent save won that race, it reads again and finds that save's row. With a row it returns `unchanged` (same pounds, no write), `exists` (different pounds and `replace` false, no write), or `replaced` (updates only `pounds`, so `excluded` stays). It returns `{ status, previous }`. The same module holds the entry window (`entryWindow`, the server's UTC date and one day either side), `parseWeighInEntry` (pounds as a number or numeric string, rounded to one decimal, `replace` as a boolean or `"true"`/`"false"`, default false), and `parseCardDate`.
3. **`weightLog.upsertWeighIn`.** The body is now `await saveWeighIn(ctx.db, { ...input, replace: true }); return { date: input.date, pounds: input.pounds }`. Input validation, the lock, the return shape, and `excluded` are unchanged. The only other change to `weightLog.ts` is the `saveWeighIn` import. `PLAN_LOCK` and `sql` stay imported because `editPlan` and `saveSetPoints` use them.
4. **`week-summary.ts`.** `weekSummary(log, date)` finds the week holding the date in the `WeightLog` DTO. It takes that week's row from `buildWeekTable` for the week's phase and the light colors from `weekTableColors` over the whole phase, so the card agrees with the editor. It also reads last week's average. A week with no row comes back empty, labeled with the phase whose dates cover it, if any. `weekLine` and `entrySummary` write the notification line and the Replace question.
5. **`POST /api/weight-log/weigh-in`.** The flow is: 503 when the token is unset, 401 for a bad token (with `WWW-Authenticate: Bearer`), 400 for a bad body or a date outside the window, then the save, then the week. The answer is `{ status, date, pounds, previous, summary, question? }`, always 200 for the four outcomes. A failed save answers 500 and logs `weigh-in route: save failed (<code>)`, never the error text, because a Postgres error's detail can quote the row. If the week read fails after a save, the answer is still 200 with only the first part of the line. GET, PUT, PATCH, and DELETE answer 405 with `Allow: POST`.
6. **`GET /api/weight-log/week-card`** and `WeekCard.tsx`. It has the same token, 503 and 401 handling, and a date in the window. It answers a 1200 by 640 light PNG in Georgia Pro regular and bold. The header reads "Week of Nov 9" with the phase name. Below are seven day cells: today outlined, later days dashed, excluded days struck through and unfilled. Then come the average so far with "N of 7 weigh-ins", the target, the gap to target, and the change with "Last week X". A week with no target shows one "No target this week" box in place of target and gap. Optional styles are spread in, never set to undefined. The `headers` option overrides `ImageResponse`'s own cache header, and I checked that in `next/og`'s source.
7. **Env.** `WEIGHT_LOG_ENTRY_TOKEN: z.string().min(32).optional()` in `src/env.js`, plus a commented line in `.env.example`.
8. **Guard test.** `src/app/api/weight-log/routes.guard.test.ts` walks the folder for `route.*` files and checks them against `ROUTE_TOKENS` (path to env var). For each route and each exported method, it sends no token, a wrong token, the token without `Bearer`, and the other route's token. The database is a proxy that records any access. Each answer must be 401 or a 405 with `Allow`, and the database must be untouched. With the token unset, each answer must be 503 or 405. With the right token and an empty request, at least one method must reach 400 and none may answer 401, which proves the listed variable is the one the route checks.
9. **Docs.** `docs/weight-log.md` has a new "Entry from a Shortcut" section, with "Rotating the entry token" under it. The plan amends decision 36 (a fifth PR) and adds a "Log Weight Shortcut" decisions block, 38 to 43, labeled as Chappy's from November 10, 2026. It adds a slice 5 section under Slices, mentions slice 5 in the slices intro and run order, adds a slice 5 line to Owner steps, and removes the Deferred line.
10. **Runbook.** A new section of `RUNBOOK-iphone.md`, "Log Weight: record a weigh-in from the phone", covers L1 (token and Vercel), L2 (an 11-step build), L3 (first run), what the notification can say, and rotation. W2 step 3 now points to it.

## What I verified and how

- `heavy -- pnpm verify` on Portable: typegen, tsc, eslint, the artwork tests, the search index, and meadow passed. Vitest passed 6551 tests and failed one. That failure was `tests/superset-setup.test.ts` ("copies env from the primary checkout..."), which timed out at about 12 s against its 5 s limit while three heavy slots were busy. Alone it passes 6 of 6 in 4 s. It doesn't touch anything this branch changed. CI's `check` job passed.
- The Weight Log tests (`src/lib/weight-log`, `src/app/api/weight-log`, `src/app/weight-log`, and the router) passed: 34 files, 344 tests.
- `weigh-ins.test.ts` pins the exact SQL for each of the four outcomes and for the race path. It checks that the lock comes first, that the update never names `excluded`, and it covers the window edges, pounds parsing and rounding, `replace` parsing, and malformed bodies.
- `weightLog.test.ts`: the upsert tests now expect begin, lock, read, update, and commit. They still check that `excluded` is never written, the rounding, and the refusals.
- `week-summary.test.ts` covers averages with one, two, and three counted weigh-ins (the trim, with an excluded day), a change across a phase boundary, a week with no target, an empty week, colors equal to the editor's, the formatting, and every summary line.
- `weigh-in/route.test.ts` covers the four outcomes, `replace` passing through, pounds given as a string, rounding, today, yesterday, and tomorrow allowed, two days back or ahead refused, bad bodies, 401 three ways, 503, 500 with no weight in the log, the save that succeeds when the week read fails, no-store headers on every answer, and 405.
- `week-card/route.test.tsx` renders six week shapes through the real satori and resvg: empty, one weigh-in, full, excluded day, no target, and planned but empty. Each must come back as a 1200 by 640 PNG, and every counted day's fill color must cover more than 5000 pixels. It also checks the headers, the window, 401, 503, and 405.
- Guard proof: a temporary `leak/route.ts` failed the listing test ("leak/route.ts is not listed with its token"). Once listed, it failed all six refusal tests ("GET leak/route.ts answered 200"). I removed it afterwards.
- Live check: I ran `next dev` on port 3027 against Neon child branch `br-super-shape-aknqsl6p` (`weight-log-quick-entry-check`) of `weight-log-import-test`, host `ep-rough-star-aky3899o`. A wrapper ran every psql command and refused any host other than that one. Before any request, I replaced every weigh-in of the running phase (from 2026-08-24) with an invented series near 150 lb, and every planned target and original target of that phase with an invented line. Results:
  - The empty card returned 200 with `image/png` and `private, no-store, max-age=0`.
  - The first POST returned `saved`, and then the one-weigh-in card.
  - The same pounds sent as a string returned `unchanged`.
  - I set the day's `excluded` to true. A new value with `replace: false` returned `exists` with `previous` and the `question`. With `replace: true` it returned `replaced`, and the row still had `excluded = t`.
  - A date two days back returned 400. No token and a wrong token returned 401 with `WWW-Authenticate: Bearer` and no-store. The card without a token returned 401. GET on the POST route returned 405. A card for last week returned 400.
  - After I seeded seven invented weigh-ins, the full-week card's average was the trimmed mean.
- Cleanup: the dev server is stopped and the child branch is deleted (a `neonctl branches list` shows no `quick-entry-check`). I deleted the scratch files holding the URL, the throwaway token, and the auth header. A grep of `.next` finds no trace of the child host. The worktree had no `.env.local`. The server got its settings from the environment with `SKIP_ENV_VALIDATION=1`.

## Shortcuts

- No device run. The Shortcut recipe is unverified on the phone. Three of its steps aren't checked against an export or the owner's library: the JSON body field types (Text, Number, Boolean), passing the image into Show Notification, and the decimal key on Ask for Input's number pad. The research marked the same three as device checks.
- I did not run the 503 case live, because it needs a server restart without the token. Unit and guard tests cover it.
- The live run covered only the current week (November 9 to 15), because the window allows nothing else. The excluded-day and no-target cards on the page come from the test fixtures, rendered through the same component.
- The "full week" card shows days after today filled, with dashed edges. That only happens with seeded data.

## Issues

- The plan's new decisions and slice 5 section link to `./weight-log-migration-reports/shortcut-api-research.md`. That file is committed on the lead's records branch (`6f8df3b0`), not on `main`, so the link is dead on `main` until that branch lands.
- A replace with the same pounds is now a no-op, and `updated_at` no longer moves (see Judgment calls). No test or page depended on it.
- A save of a new value takes one more database round trip than the old upsert: the `FOR UPDATE` read before the write. With the iad1 to us-west-2 latency in the memory notes, that is about 125 ms more for the owner page's Save. The PR body says so.
- `tests/superset-setup.test.ts` times out under load. It predates this branch.

## Ambiguities

- **The window for "yesterday".** I kept the spec's window: the server's UTC date and one day either side. In Pacific time, yesterday falls outside it after 4 PM (PST) or 5 PM (PDT), because UTC has already moved on a day. The Shortcut always sends today, so this only matters if someone sends yesterday by hand. Widening it to two days back would let the token change four dates. Owner to confirm.
- **Count on the card and in the line.** "3 of 7" counts weigh-ins that count toward the average, so an excluded day is left out. Owner to confirm.
- **The card window.** The card answers only for dates in the same window, so it can't show last week. That follows the spec ("Read only the week card for a date in the same window"). Owner to confirm.

## Judgment calls

- **`saveWeighIn` reads, then writes.** The spec allowed either a read or a retry on the primary key. I lock the row with `FOR UPDATE` and insert with `on conflict do nothing`, which gives a correct answer under concurrency without catching errors. Owner to confirm.
- **Same pounds writes nothing**, even on the owner page with `replace: true`, so `updated_at` and the public "Updated" date move only on a real change. Owner to confirm.
- **Six decisions, not one.** The lead asked for a new decision for the token. I recorded all six accepted answers as decisions 38 to 43, since each changes what is built. Owner to confirm.
- **`question` is a separate field** from `summary` on `exists`. The Shortcut uses `question` as the menu prompt, and the server writes it as "Mon, Feb 4 already has 101.4. Replace it with 100.9?" (the test fixture's invented values). The server can't know the phone's "today", so it names the date. Owner to confirm.
- **Wording.** "Average so far", "Gap to target", "Change", "Last week X", "No average last week", "No target this week", "N of 7 weigh-ins"; signed values use a real minus sign. Owner to confirm.
- **Card size 1200 by 640**, not the research's 675, to cut empty space under the stats. Owner to confirm.
- **Errors.** A failed save answers 500 with "The weigh-in didn't save. Try again." and logs only the step and error code. A failed week read after a successful save still answers 200 with the shorter line. Owner to confirm.
- **The pounds schema is duplicated.** `weigh-ins.ts` has its own `pounds` schema (number or string) rather than importing the router's, so the router change stays inside `upsertWeighIn` for the merge with #149. Owner to confirm.

## Owner steps

Set the token in Vercel (after the deep review and merge):

1. On the Mac: `openssl rand -hex 32`. Keep the 64 characters in the password manager. Never reuse the mirror's token.
2. Vercel > PersonalWebsite > Settings > Environment Variables > add `WEIGHT_LOG_ENTRY_TOKEN` for **Production** only, with that value.
3. Redeploy Production.
4. Check it in Terminal: `read -rs 'T?Token: '; export T; echo ${#T}` must print `64`. Then `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" "https://www.chappyasel.com/api/weight-log/week-card?date=$(date -u +%F)"` must print `200`. `401` means the token differs, and `503` means the variable isn't set in Production.

Build the Shortcut on the iPhone (`RUNBOOK-iphone.md`, section "Log Weight", step L2):

1. Shortcuts > `+` > name it **Log Weight**.
2. **Text** with the token. Rename the output `Token`.
3. **Ask for Input**: Number, prompt `Weight`, decimals on, negatives off. Rename the output `Pounds`.
4. **Current Date**, then **Format Date** with Custom format `yyyy-MM-dd`. Rename the output `Day`.
5. **Get Contents of URL** to `https://www.chappyasel.com/api/weight-log/weigh-in`: POST, header `Authorization` = `Bearer ` + `Token`, JSON body `date` (Text, `Day`), `pounds` (Number, `Pounds`), `replace` (Boolean, False). Rename the output `Answer`.
6. **Get Dictionary Value** `status` from `Answer`. **If** it is `exists`: get `question`, then **Choose from Menu** with that prompt. Replace runs the same request with `replace` True and sets the variable `Answer`. Cancel runs Stop This Shortcut.
7. **Get Dictionary Value** `summary` from `Answer`, renamed `Summary`. If it has no value, show `error` in a notification and stop.
8. **Get Contents of URL** for `https://www.chappyasel.com/api/weight-log/week-card?date=` + `Day`: GET, same header. Rename the output `Card`.
9. **Show Notification**: title `Weight Log`, body `Summary`, with `Card` as its input or attachment.
10. Run it once in the foreground and tap **Always Allow** for `www.chappyasel.com`. Run it a second time with another number: it must ask before replacing.
11. Add it to the Action button or Control Center.

## Next steps

- The lead runs the deep review (Codex, then a fresh Claude) on #150.
- After merge, the owner sets the token and builds the Shortcut as above. The slice is done when a run from the Action button saves, a second run asks, and the notification shows the card. Record on the runbook what the device showed for the three unattested steps.
- When #149 lands, rebase or merge `main` into this branch. The overlap is the `upsertWeighIn` body in `weightLog.ts` and its tests in `weightLog.test.ts`.
- Push the `apple-health` runbook commit when that repo's other work is ready, or leave it local for the owner.
- No GitHub issue exists for slice 5. Open one if the tracker should have it.

## Review fix round

The fixes for the deep review's findings on PR #150: three from Codex and seven from the Claude review. The branch is `weight-log-quick-entry`, and its head is `d99f7476`, pushed. It includes a merge of `origin/main` at `57ffac86`, which is #149.

### Commits

- `94e6e89a` Name the Shortcut's weigh-in request without "entry"
- `9a8f1db7` Accept today or yesterday in any time zone from the Shortcut
- `09251a3e` Refuse OPTIONS, report failures, and catch the week card's errors
- `74948d5b` Fail validation when the entry token is the mirror's
- `8263f942` Type the week card's two fonts as a pair
- `885ffe33` Say when the Shortcut's date holds an excluded weigh-in
- `94f18591` Write the Shortcut's pounds with the editor's formatters
- `d99f7476` Merge main, with the Weeks table editor from #149
- `apple-health` `07b2e4b` Give Log Weight a fixed message when the site answers with neither key. This commit is local and not pushed, and it touches only `shortcut/RUNBOOK-iphone.md`. The other sessions' uncommitted changes in that repo, including `paths.py` and `README.md`, are untouched.

### What changed, by finding

**Codex 1, date window.** `shortcutWindow(now)` in `src/lib/weight-log/weigh-ins.ts` now runs from yesterday in UTC−12, which is `(now − 12 h).date − 1 day`, to today in UTC+14, which is `(now + 14 h).date`. The card uses the same window through `parseCardDate`. The window holds three or four dates. Decision 38, `docs/weight-log.md`, `.env.example`, and the `env.js` comment state the new rule, and the docs now say a leaked token can change at most four dates. Decision 38 says the lead made the change and the owner has yet to confirm it, and it quotes the old wording.

**Codex 2, OPTIONS.** Each of the three routes, the mirror included, now exports `OPTIONS` as the same 405 as its other refused methods, with `Allow` and the no-store headers. HEAD needs no export. Next maps HEAD to GET when a route exports GET, so HEAD on the mirror and the card runs the token check, and on the weigh-in route it reaches the 405. The headers, `reply`, and the 405 handler now live once in `src/app/api/weight-log/responses.ts`. The guard test builds each route's handlers with Next's own `autoImplementMethods` over `HTTP_METHODS`, so it covers the HEAD and OPTIONS that Next adds. Every refusal must carry `Cache-Control: private, no-store, max-age=0`, and every 405 must carry `Allow`.

**Codex 3, guard input.** Each listed route now has a request it would serve: a mirror range, a weigh-in body, and a card date, all invented, on a clock pinned to 2030-02-04. Every refused token is sent twice, once with an empty request and once with that valid request, and the database must stay untouched. A new test sends the valid request with the right token and requires a database access, which shows the valid inputs are ones the routes would serve.

**Claude 1, rounding.** `pounds` and `signed` live in `src/lib/weight-log/format.ts`, which uses `roundTenth` from #149's `sheet.ts`. The Weeks table (`WeekSheet.tsx`, where #149 moved them from `WeightLogEditor.tsx`), the card, the notification line, and the Replace question all import them. The editor change is the import and the removal of the two local functions. `HALF_TENTH_LOG` in the fixture holds the 150.2 and 150.5 week. `week-summary.test.ts` checks that the average reads 150.3, the same as `toFixed(1)`, with a gap of +0.3 and a line reading "Week avg 150.3 (2 of 7), target 150.0, 0.3 over." A new `WeekCard.test.tsx` checks that the card's markup reads 150.3 and never 150.4.

**Claude 2, excluded days.** `saveWeighIn` reads `excluded` with `pounds` under the same `FOR UPDATE` and returns it in `SaveResult`. A new date returns false. The update still never names `excluded`. When the flag is set, `saveSummary` says so:
- `exists`: the summary is "Kept 101.4, which is left out of the weekly average." and the question is "Mon, Feb 4 already has 101.4, which is left out of the weekly average. Replace it with 100.9? The new value stays left out."
- `replaced`: "100.9 saved, replacing 101.4. It stays left out of the weekly average."
- `unchanged`: "100.9 was already saved. It is left out of the weekly average."

The numbers are the fixture's invented ones. The JSON answer's fields are unchanged.

**Claude 3, card errors.** The card catches a failure in the read of the weigh-ins and fonts (step `load`) and in the week's math (step `build`). It answers `{ "error": "The week card could not be drawn." }` with status 500 and the shared headers. Satori's own errors still happen while the body streams, so the six render tests remain their guard.

**Claude 4, font tracing.** The other satori routes don't solve this. The book OG card is `force-static` and renders at build, where `public/` is on disk. The section OG route (`/api/og/section`) uses the same loader with no tracing, so it has the same HTTP fallback at runtime. The `/meet` and `/weightlifting` cards keep their fonts in `src/fonts/` and list them in `outputFileTracingIncludes`. I followed that pattern: `next.config.js` now lists `./public/fonts/GeorgiaPro-Regular.ttf` and `-Bold.ttf` for `/api/weight-log/week-card`. The route keeps both fonts in a module-level promise and drops it on a failed read, so the next request tries again. I left the shared loader in `books/[bookId]/fonts.ts` alone.

**Claude 5, token reuse.** `src/env.js` passes `createFinalSchema` to `createEnv`. On the server, it adds an issue on `WEIGHT_LOG_ENTRY_TOKEN` when both tokens are set and equal. The issue names the variable and not its value. Validation then throws, and since `next.config.js` imports `env.js`, the build stops. `SKIP_ENV_VALIDATION` still skips the check, as it skips every other one. A new `src/env.test.ts` imports a fresh `env.js` against an invented environment. It checks that two different tokens, either token alone, and neither token pass, and that equal tokens fail without the value appearing in the log.

**Claude 6, error reporting.** `logFailure(route, step, error)` in `responses.ts` logs `<route> route: <step> failed (<code>)` and passes a fresh `Error` with that same line to `reportServerErrorAfterResponse`, with `source: "request"`, the route path, and the step as `label`. The original error never reaches the reporter. The weigh-in route and the card both use it. I used the after-response variant so the Shortcut never waits up to 3 s on PostHog. It calls `reportServerError` inside Next's `after`.

**Claude 7, wording.**
- `.env.example` and the `env.js` comment state the real scope: a date that is today or yesterday in some time zone. They also say the token must differ from the mirror's.
- `CONTEXT.md` has the relationship line "**Log Weight Shortcut → Weight Log**: writes the day's weigh-in with its own token, never deletes."
- I renamed the code: `WeighInEntry` is now `WeighInRequest`, `parseWeighInEntry` is `parseWeighInRequest`, `entryWindow`, `isInEntryWindow`, and `OUTSIDE_ENTRY_WINDOW` are `shortcutWindow`, `isInShortcutWindow`, and `OUTSIDE_SHORTCUT_WINDOW`, `entrySummary` is `saveSummary`, and the parsed result's key is `weighIn`. I also added a glossary note under Weigh-in. It says "entry" survives only in `WEIGHT_LOG_ENTRY_TOKEN`, the "Entry from a Shortcut" docs section, and the 503 message, and never names a weigh-in. Renaming the env var would have meant changing the runbook, the owner steps, and decision 38 for a variable that isn't set anywhere yet, so I kept it.
- In the runbook, step 9 now saves `error` to a `Message` variable. When that is empty, it sets `Message` to "The site did not answer. Try again." and shows `Message`. "What the notification can say" now has that text and the excluded-day clause, and its window line matches the new rule.

**Merge of main.** #149 had merged by the time I finished, so I merged `origin/main`. The conflicts were the router's imports and `WeightLogEditor.tsx`. For the router I kept both sides: #149's `MAX_WEIGH_IN` and `weeklyAverage`, plus `saveWeighIn`. For the editor I took #149's file as it is on main and moved the formatter change into `WeekSheet.tsx`. `upsertWeighIn` still calls `saveWeighIn` with `replace: true` under the shared plan lock, and `restoreWeighIn` is as #149 landed it. The Shortcut's pounds schema now takes its ceiling from `MAX_WEIGH_IN`, which is 1500, the same value as before.

### What I verified and how

- I wrote these tests before the fixes and saw them fail on the old code:
  - The four new window tests in `weigh-ins.test.ts`, plus the parser's post-midnight case.
  - The guard test, which failed 15 tests, starting with "OPTIONS mirror/route.ts answered 204 without no-store".
  - `env.test.ts`, where the promise resolved instead of rejecting.
  - The two rounding tests, which expected "150.3" and received "150.4".
  - The excluded-day tests in `saveSummary` and `saveWeighIn`.
- For the route tests I wrote with the fixes, I put the old route files back from `a3657a90` and ran them. These five failed: the report on a failed save, OPTIONS on both routes, and the card's two 500 cases. I then restored the new files. I also checked the card markup test against the old `Math.round` formatter, and it failed.
- The route tests pin the clock at 4:30 PM Pacific, past UTC midnight. The weigh-in route accepts Pacific's yesterday, today, and UTC's today, and refuses the day before yesterday and UTC's tomorrow. The card refuses UTC's tomorrow and renders Pacific's yesterday as a PNG.
- After the merge, the Weight Log tests (`src/app/weight-log`, `src/lib/weight-log`, `src/app/api/weight-log`, `src/server/api/routers`, and `src/env.test.ts`) passed: 441 tests, 1 skipped.
- `heavy -- pnpm verify` on the merged head passed on Portable: typegen, tsc, eslint with zero warnings, the unit suite (734 files, 6634 tests passed, 25 skipped), the artwork tests, and meadow.
- I didn't use a live database this round.

### Shortcuts

- I didn't run a production build, so the font tracing is still unconfirmed on Vercel. The include follows the `/meet` and `/weightlifting` pattern. Check it on the preview by asking for a card and confirming that no request for `/fonts/GeorgiaPro-*.ttf` appears in the function's logs. Or run `pnpm build` and look for the two files in `.next/server/app/api/weight-log/week-card/route.js.nft.json`.
- I didn't run the runbook's new step 9 on a phone. It uses only actions the recipe already uses (Get Dictionary Value, If, Text, Set Variable, Show Notification).
- I didn't check the PostHog report end to end. A unit test checks the reporter's arguments, and reporting is on only in production.

### Issues

- `/api/og/section` has the card's old font problem: no tracing, so at runtime it fetches both fonts over HTTP through the apex's 308. This is outside this slice. Fixing it takes the same `outputFileTracingIncludes` line for that route.
- The guard test imports two of Next's internal modules (`next/dist/server/route-modules/app-route/helpers/auto-implement-methods` and `next/dist/server/web/http`). A Next upgrade that moves them breaks the test at import, loudly, and does not leave a gap.

### Ambiguities

- **The 405 for OPTIONS.** The lead asked for a 405, and I followed that. A CORS preflight would also get a 405. No browser calls these routes, so nothing depends on it. Owner to confirm.
- **HEAD on the card with a valid token** renders the whole card and Next drops the body. That is Next's default for HEAD, and I didn't add a cheaper HEAD. Owner to confirm.

### Judgment calls

- **The window is the lead's call**, recorded in decision 38 as needing the owner's confirmation. It can accept four dates at once, for example from 10:00 to 12:00 UTC, so the docs now say "at most four dates". Owner to confirm.
- **The OPTIONS fix also covers the mirror route**, because the extended guard test covers every route in the folder. The mirror's refusal text and `Allow` are unchanged. Owner to confirm.
- **I added a shared `responses.ts` module** for the headers, `reply`, the 405 handler, and `logFailure`, and didn't fix each route on its own. Owner to confirm.
- **The excluded-day wording**, given above. Owner to confirm.
- **The `shortcutWindow` name**, not the suggested `requestWindow`, because it names who the window is for. Owner to confirm.
- **The after-response reporter**, so a slow PostHog never delays the Shortcut. Owner to confirm.
- **I kept the font cache in the card route** and didn't change the shared books loader, so the change stays inside this slice. Owner to confirm.
- **The `format.ts` dash is "—"**, as the editor shows it. The card keeps its own "–" for empty stats, as it drew them before. Owner to confirm.

### Next steps

- The lead decides whether this round needs another deep-review pass. Devin will review new commits only after a `/devin review` comment on the PR.
- The owner confirms decision 38's new window and the judgment calls above.
- On the preview deployment, confirm the card reads its fonts from disk (see Shortcuts).
- Push the `apple-health` commits `05b0b8b` and `07b2e4b` when that repo's other work is ready, or leave them for the owner.

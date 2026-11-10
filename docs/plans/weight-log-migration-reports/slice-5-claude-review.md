# Slice 5 review: Log Weight Shortcut (PR #150)

A fresh Claude reviewer read branch `weight-log-quick-entry` against `origin/main` on 2026-11-10. It did not repeat the three findings already reported: the UTC date window, the framework's implicit `OPTIONS`, and the guard test sending only empty input.

Nothing here is high severity. The token checks, the no-delete rule, the separate token, and the owner page's lock and `excluded` behavior all hold. One medium finding: the card and the notification can disagree with the editor's weekly table by 0.1 lb, and the notification line can contradict itself. The rest are low.

Every number below is invented.

## What was checked and holds

- `saveWeighIn` under concurrency (`src/lib/weight-log/weigh-ins.ts:48-83`). Two saves of a new date: the second `INSERT ... ON CONFLICT DO NOTHING` waits for the first to commit, returns no row, and the second pass's `SELECT ... FOR UPDATE` takes a fresh READ COMMITTED snapshot and sees the committed row. A concurrent delete leads to a clean insert. Both plan edits (`weightLog.ts:100`, `:400`) and the import (`import-database.ts:102`) take `PLAN_LOCK` exclusively before any row or table lock, and the save takes it shared before its row lock, so the order is the same everywhere and no deadlock is possible. The import's `LOCK TABLE ... EXCLUSIVE` is reached only after the save has released its shared lock.
- The owner page. `upsertWeighIn` still takes `pg_advisory_xact_lock_shared(PLAN_LOCK)` in a transaction before writing, and the update sets only `pounds`, so `excluded` never changes. The editor ignores the mutation's return value (`WeightLogEditor.tsx:333`), so returning the input instead of the row is safe. A same-pounds save is now `unchanged` and no longer bumps `updated_at`. The only reader of `updated_at` is the public "Updated" line (`records.ts:114`), which should not move when nothing changed.
- `doublePrecision` round-trips exactly through postgres-js, so `previous === pounds` (`weigh-ins.ts:73`) is a sound equality check.
- Request parsing. A non-JSON body, `null`, an array, extra fields (stripped), `NaN`, `Infinity` (zod 4 rejects it, and `1e400` parses to `Infinity`), negative values, values that round to 0, and values over 1500 are all refused with a 400 and the `{ error }` shape. Pounds go through the same rounding and range as the owner page.
- The week math in `week-summary.ts`. Week boundaries come from `weekStartOf`. The trimmed average comes from `buildWeekTable`'s `weeklyAverage`, so it drops the high and low from three or more and leaves excluded days out. `change` and `lastWeek` both use the previous calendar week in any phase, so they agree across a phase boundary. A week with no target hides the gap and shows "No target this week". The colors come from `weekTableColors` over the same phase rows the editor's `weekTable` query returns, so the fills match the editor.
- Satori. Every optional style is either always defined or spread in conditionally (`WeekCard.tsx:85-91`). The route test renders six weeks through the real renderer. `next/og` applies the passed headers with `Headers.set`, so `Cache-Control: private, no-store, max-age=0` replaces its default rather than joining it. Georgia Pro Regular and Bold both contain U+2212 (the minus in `signed`) and U+2013 (the card's dash), so satori never falls back to a remote font for them.
- The runbook's "Log Weight" recipe matches the API: the body fields `date`, `pounds`, and `replace`; the four status values; `question` on `exists`; `summary` on every 200; `{ error }` on every refusal. The notification texts it quotes match the code's strings. The URL uses `www.chappyasel.com`, the canonical host (the apex answers 308 to it), so the POST is not redirected.
- The docs and the plan's decisions 38 to 43 and slice 5 section describe the code as built.

## Findings

### 1. Medium: the card and the notification round averages differently from the editor, and the line can contradict itself

`src/lib/weight-log/week-summary.ts:103-105` and `:137`; compare `src/app/weight-log/edit/WeightLogEditor.tsx:111-112`.

The card and the notification format pounds with `(Math.round(value * 10) / 10).toFixed(1)`. The editor's weekly table formats them with `value.toFixed(1)`. The two differ whenever a trimmed mean lands on a hundredths 5, which happens in weeks with 2, 4, or 6 counted weigh-ins. In a sweep of 2,500 invented two-weigh-in weeks between 150 and 200 lb, 300 differed (12%).

Failing scenario: a week has two counted weigh-ins, 150.2 and 150.5, and a target of 150.0. The trimmed mean is 150.35 (stored as 150.34999...).

- The editor's table shows an average of 150.3 and a gap of +0.3.
- The card shows an average of 150.4 and a gap of +0.3.
- The notification reads "Week avg 150.4 (2 of 7), target 150.0, 0.3 over." The gap is rounded on its own from the unrounded 0.34999..., so the line's own numbers do not add up.

The module comment says the card "agrees with `/weight-log/edit`", and the test only checks values that round the same way.

Fix: move the editor's two formatters (`pounds` and `signed`) into one shared module, such as `src/lib/weight-log/format.ts`, and have `WeekCard`, `weekLine`, `entrySummary`, and the editor all import them. Add a test with the 150.2 / 150.5 week that asserts the card's average string equals the editor's.

### 2. Low: replacing an excluded weigh-in from the Shortcut never says the day is excluded

`src/lib/weight-log/weigh-ins.ts:58-79` and `src/lib/weight-log/week-summary.ts:172-183`.

`saveWeighIn` reads only `pounds`, so neither the Replace prompt nor the summary knows the day is excluded. Decision 39 keeps the flag on a replace, so the new value also stays out of the average.

Failing scenario: Tuesday's 152.0 is excluded on `/weight-log/edit` as a bad reading. The owner weighs again and enters 150.4 in Log Weight. The prompt asks "Tue, Nov 10 already has 152.0. Replace it with 150.4?". After Replace, the notification reads "150.4 saved, replacing 152.0. Week avg ...", and the average still leaves Tuesday out. Only the struck-through cell on the card shows why, and only after a long-press.

Fix: select `excluded` along with `pounds`, return it in `SaveResult`, and have `entrySummary` add a short clause to `question` and `summary` when it is true, such as "It stays left out of the weekly average."

### 3. Low: a failure in the week card answers Next's bare 500, with no headers and no `{ error }` body

`src/app/api/weight-log/week-card/route.tsx:58-63`.

Nothing in `GET` catches errors after authorization. If `loadWeekRecords`, the font load, or `buildWeightLog` throws, Next 16.1.6 sends `new Response(null, { status: 500 })` (`next/dist/build/templates/app-route.js:413`). That response has no `Cache-Control: no-store`, no `X-Robots-Tag`, and no `nosniff`. That breaks the rule that every answer carries them, and `docs/weight-log.md` says "Every answer, refusals included" does. The weigh-in route catches the same failures and answers `{ error }` with the headers.

Failing scenario: Neon is briefly unreachable. The card answers an empty 500 with no `Cache-Control` header. The Shortcut passes that empty body to Show Notification as the attachment.

Fix: wrap the load and the `buildWeightLog` call in try/catch, log only the step and the error code (as `logFailure` does in the weigh-in route), and answer `reply({ error: "The week card could not be drawn." }, 500)`. Satori's own errors happen while the body streams, so this catch cannot see them. The six render tests remain the guard for those.

### 4. Low: on Vercel, each card may fetch both fonts from production over HTTP

`src/app/books/[bookId]/fonts.ts:11-26`, used at `src/app/api/weight-log/week-card/route.tsx:60-61`.

`loadFont` reads `process.cwd()/public/fonts/...` and, when that fails, fetches `https://chappyasel.com/fonts/...`, which 308-redirects to `www`. `next.config` lists no `outputFileTracingIncludes` for this route, and `public/` is not normally inside a function bundle, so on Vercel each render probably downloads about 300 KB of fonts through a redirect, with no caching between requests. A preview deployment fetches production's fonts. If that fetch fails, finding 3 applies. A build was out of scope for this review, so whether the files are traced is unconfirmed.

Failing scenario: every Log Weight run spends two extra round trips before the card renders, and the notification image arrives later or not at all if the Shortcut's request times out.

Fix: add `"/api/weight-log/week-card": ["./public/fonts/GeorgiaPro-*.ttf"]` to `outputFileTracingIncludes`, and keep the loaded fonts in a module-level promise so a warm function reads them once.

### 5. Low: nothing enforces that the entry token differs from the mirror token

`src/env.js:69-76`.

`docs/weight-log.md` and the runbook say "never set them to the same value", but only the owner's care enforces it. If the two values match, the mirror token, which lives on the Mac in the apple-health scripts, can write weigh-ins, and the guard test's "the other route's token" check no longer separates anything in production.

Fix: right after `createEnv` in `src/env.js`, throw when both are set and equal. That fails the build the way a short token does now.

### 6. Low: a failed save reaches only `console.error`, never the error reporter

`src/app/api/weight-log/weigh-in/route.ts:76-79` and `:101-109`.

`logFailure` writes a line to the function log. It does not call `reportServerError`, which the site uses so that failures reach the owner. A save from the owner page that fails goes through tRPC's reporting, so the same database fault is reported from the page and silent from the phone.

Failing scenario: a constraint or connection error makes every Shortcut save fail for a week. The owner sees "The weigh-in didn't save. Try again." on each run, and nothing appears where server errors are normally reviewed.

Fix: in `logFailure`, also call `reportServerError` with `source: "request"`, the route pattern, and a fresh `Error` whose message is only the step and the code. Its sanitizer already drops SQL parameters, but sending no original message keeps the "never log a weight" rule simple to check.

### 7. Low: wording in the docs and the glossary

- `.env.example` says the token "can write only today's weigh-in", and `src/env.js:71` says "It writes only today's weigh-in (a day either side, by UTC)". `docs/weight-log.md` states the true scope: three dates around the server's UTC date. Fix: use the docs' wording in both comments.
- `src/lib/weight-log/CONTEXT.md` has no relationship line for the Shortcut, while it lists Health and the warehouse. The code names the request `WeighInEntry` and the window `entryWindow`, and the glossary lists "entry" under _Avoid_ for a weigh-in. Fix: add "**Log Weight Shortcut → Weight Log**: writes the day's weigh-in with its own token, never deletes" under Relationships, and either rename the type to `WeighInRequest` or note in the glossary that "entry" names the Shortcut's route, not a weigh-in.
- The runbook's step 9 shows `error` when `summary` is missing. A gateway failure from Vercel (502 or 504) returns text or HTML, which has neither key, so the notification body is empty. Fix: in step 9.2, fall back to a fixed text such as "The site did not answer. Try again." when the error value is also empty.

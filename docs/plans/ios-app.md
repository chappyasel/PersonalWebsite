# iOS app

Goal: ship chappyasel.com as an App Store app that clears Guideline 4.2
(Minimum Functionality) by adding things only a native app can do, while the
site itself keeps updating without review.

## Built (2026-11-23)

- `app.widget` tRPC query (`src/server/api/routers/app.ts`,
  `src/server/queries/appWidget.ts`): books in progress, latest workout, latest
  musing. Public, one request per widget refresh. Checked against real data on
  a local dev server.
- `ios/`: XcodeGen project (`xcodegen generate` in `ios/`), bundle
  `com.chappyasel.site`, iOS 26, team Q82S7VERUD. The `.xcodeproj` is
  gitignored.
  - App: native tab bar (Home, Books, Musings, Lifts), one WKWebView per tab,
    pull to refresh, swipe back, off-site links in an in-app Safari sheet,
    user agent suffix `ChappyApp/1`.
  - Widgets: Currently Reading (small, medium) and Latest (medium). Taps open
    the app on the matching tab and URL.
  - Builds for the simulator. Not yet run on a simulator or device.

## Weight Log (2026-11-24, merged 2026-11-25)

Owner decisions: an owner token in the Keychain instead of Google sign-in;
v1 is today's entry, the Weeks table, and corrections, with Plan and Set
points left on the web editor; a cached table that opens at once and
refreshes on open; App Intents replace the Log Weight Shortcut. The bar is
"at least as good" as the Shortcut and the web editor.

- Auth: `WEIGHT_LOG_APP_TOKEN` (`src/env.js`) as a bearer stands in for the
  Google session in `ownerProcedure`, on `weightLog.*` paths only
  (`isOwnerApp`, `src/server/api/ownerApp.test.ts`). Its own token, so
  revoking it leaves the Shortcut and the mirror working. Local copy:
  `~/.config/personal-website/weight-log-app-token`. Set in Vercel
  Production 2026-11-25. The Owner said "merge and push" (2026-11-25), so it
  merged on Devin's review alone; the Codex and fresh-Claude deep review that
  access-control slices take has not run yet.
- `weightLog.sheet` (`src/lib/weight-log/app-sheet.ts`): the server builds
  what `WeekSheet.tsx` builds (shown phase, this week's bare row, loose rows,
  text, colors, editable cells, carried weigh-in). The app only renders it.
- `weightLog.logWeighIn`: the Shortcut's save (`exists` / `replace`), plus
  the card's three weeks as app rows.
- `ios/Chappy/WeightLog/`: Weight tab with a today card (carried value in
  grey, Save, Replace confirmation, outcome line, week line, 3-week card),
  the Weeks table (frozen Week column, workbook colors, today ring, struck
  excluded days, header hints), a cell editor above the keyboard (Done,
  arrows, Cancel, empty deletes), one-level Undo with the web's messages,
  phase menu, Go to date, offline queue for today's entry.
- Intents: Log Weight (opens the tab focused) and Save Weight (background,
  asks before replacing, snippet of the 3-week card), both in Shortcuts and
  Siri, so the Action button can run them.
- Testing before merge: a dev server on Portable (`next dev -p 3917`) served
  tailnet-only with `tailscale serve --bg --https=10443`; build 4's site is
  set to it through a dropped `Documents/weight-log-base`. That dev server
  reads and writes the production database. Turn the proxy off with
  `tailscale serve --https=10443 off`.
- Not yet seen rendered by an agent: no simulator pass. The Owner used
  build 4 against the dev server and asked to merge without listing gaps.
- After merge the dev server and proxy were stopped and a
  `Documents/weight-log-base` of `https://www.chappyasel.com` was dropped
  so build 4 talks to production.

## Known gaps

- App icon is the site's 512 px tile upscaled to 1024. Needs a real 1024 render.
- Owner-only pages (weight log edit, Dad's Journal) are reachable by URL. App
  Review would hit Google sign-in without Sign in with Apple (4.8). Block those
  paths in the app before submitting.
- 4.2 risk remains. Widgets are the main native argument; push for new
  musings and offline books would strengthen it.

- Weight Log: no background refresh (`BGAppRefreshTask`), so the cache
  refreshes only on open. Plan and Set points stay on the web editor.
- Devin's PR #162 findings left open: Go to date into another phase loads
  it but doesn't open the day's cell; Go to date on a past week with no row
  opens nothing (the web editor builds a bare row); the 3-week card under
  today's entry keeps the save's values after a table correction; widgets
  show gallery samples as live data when the fetch fails.
- The Weight tab ships in every build. Gate it out of the App Store build
  before submitting.
- The hand-built Log Weight Shortcut and its `WEIGHT_LOG_ENTRY_TOKEN` still
  work; retire them once the Owner has moved the Action button to the app's
  Save Weight or Log Weight intent.

## Next

1. Deep review of the owner-app bearer path (Codex, then a fresh Claude).
2. Simulator pass on the worker: the room in WKWebView, tabs, Weight tab,
   widget taps.
3. Background refresh for the weight cache.
4. Gate owner-only tabs and pages, real 1024 icon, then TestFlight and App
   Store submission.

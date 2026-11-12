# Week card as a sheet snapshot

## Commits and PR

- PR: https://github.com/chappyasel/PersonalWebsite/pull/151 (branch `weight-log-week-card-sheet`, from `origin/main` at `1c88cd27`). Not merged.
- `42c57f38` Draw the Log Weight card as a snapshot of the Weeks table
- `8c0d71e2` Color a week outside every phase on its own scale (answers Devin's one finding)
- `73802d86` Leave Orig and its Gap off the week card (scope addition)
- `263d239e` Answer Log Weight with a symbol title and a one-line week (scope addition)
- `27a7b124` Set the week card for a 360 pt notification (lead review 1, item 3)
- `fa5c114c` Keep lb/wk on the week card and set it at 18 px (lead review 2, item 2)
- Runbook, separate repo: `56b184d` in `~/Desktop/Agents/apple-health`, touching only `shortcut/RUNBOOK-iphone.md`. Local, not pushed. The repo's other uncommitted changes belong to other sessions and are untouched.

## ParaDev page

https://app.superset.sh/page/weight-log-week-card-as-a-sheet-snapshot-q3219b

It shows three cards (mid-week with last week full, a full current week, a phase boundary), each beside a headless screenshot of the real `WeekSheet` rendered from the same invented log. Version 5 opens with the built 14-column card at 350 px beside the editor and the first card at 350 px, with a table of the text size each gives. The editor shots were re-rendered at 12:36 from the same log as the cards. It also has an HTML mock of the expanded notification with the new title and body (drawn, not captured from a phone), the card at full size beside the editor, a pixel-sampled color table, and a card whose rows carry a year. Source: `test-results/week-card-sheet/` in this workspace, which git ignores.

## What changed

- **Card.** `src/app/api/weight-log/week-card/WeekCard.tsx` (component now `WeekCardImage`) draws the table's header row, then last week's row and this week's row, as flex rows of fixed-width cells. It uses the editor's headers, fills, formatting, rules (neutral-200 under the header and left of Avg, neutral-100 between rows), muted `#` column, struck and muted excluded days, medium weight on the current row, and a red-600 ring on the asked-about day, on white with the editor's ink (`#413c39`) and muted (`#56514d`) colors. Its size, type, and columns are set for the notification (see "Set for 350 pt"). The output is at 2× density and measures 1480 × 220 px with two rows (1584 wide when a row label carries a year). `cardSize(card)` gives the size to `ImageResponse`. The stat tiles and the "Week of" title are gone.
- **Caption.** A small caption names each row's phase with the phase picker's color dot, or reads "Outside every phase", the editor's own caption. At a phase boundary it lists both phases.
- **Rows.** `src/lib/weight-log/week-card.ts` (`weekCard(log, date, runningId)`) gives each row the editor's row for that week, colored over the table that holds it. A week the log has sits in its loader phase's table. A week the log lacks joins the table of the phase that holds it, with `phaseHolding` and the running phase, as the editor adds this week. A week outside every phase is colored alone. The previous row is dropped when the log lacks it and no phase holds it (the log's first week). The route reads the running phase from `records.phases` (`endDate === null`), as the `phases` query does.
- **Shared with the editor.** `src/lib/weight-log/week-columns.ts` (`DAY_NAMES`, `SUMMARY_COLUMNS`), plus `rate` and `weekLabel` in `format.ts`. `WeekSheet.tsx` imports them in place of its own copies. Its only other change is that the local `weekLabel` now calls the shared one.
- **Fonts.** `scripts/generate/weight-log-card-fonts.py` subsets SF Pro Display Regular and Medium from `/Library/Fonts` into `src/fonts/weight-log/` (87 KB and 91 KB). It bakes `tnum` into the cmap, because satori can't turn features on and SF Pro's default figures are proportional, and it keeps U+2212. `next.config.js` traces `./src/fonts/weight-log/*.otf` instead of the two Georgia Pro files. The module-level cache with retry on failure is unchanged.
- **Set for 350 pt (lead reviews 1 and 2).** The card draws 14 columns: it leaves out only Orig and its Gap (`CARD_COLUMNS` in `WeekCard.tsx`). Each cell keeps 2 px between its text and its edge, so neighbouring numbers sit 4 px apart, about one space. The ring is 1.5 px, inside that pad. `#` is 25 px and Week 66 px. There is no gutter or border around the table, the vertical padding is 4 px, and the caption is 13 px on an 18 px row. SF Pro Display is 18 px, the size at which a 50 px cell holds the widest text: "Target" (2.75 em), just ahead of "178.6" and "+0.30" in medium (2.70 em). The card is 740 pt wide, so its text lands at **8.5 pt at 350 pt** (8.8 pt at 360). The first card was 5.6 pt at 350. A larger font gains little, because the pads don't grow with it: 20 px works out to about 8.7 pt, and with no padding at all these 14 columns top out near 9.3 pt. In round 1, `27a7b124` had dropped lb/wk for 8.9 pt at 360; round 2 asked to keep 14 columns, so `fa5c114c` restores it. The editor is unchanged.
- **Colors (lead reviews 1 and 2).** No difference, so nothing in the card's coloring changed. In round 2 I re-ran the editor dump and screenshot (12:36) from the same `upTo(date)` invented log the cards use. The new PNGs are byte for byte the same as the 11:18 ones. Pixel samples from the built card and the fresh editor shot are identical in all 24 cells of the two rows: Nov 4 Chg +0.2 is (249, 138, 141) in both, Nov 11 Chg 0.0 is (215, 226, 242), Target 178.8 is (174, 197, 227), and the Gap and lb/wk columns match too. Since nothing differed, there was no fix for a failing test to pin. The card takes its colors from `weekTableColors` over the whole phase table, planned weeks included, as the editor does, and the parity test compares against the editor's table for the row's phase. Beside the rest of the table, the editor's cells can look paler than the same color on the two-row card. The page has the sample table.
- **Notification text (scope addition).** `saveSummary(saved, week, today)` returns `{ title, summary, question? }`:
  - `title`: `✓ 221.0` saved, `↻ 221.0, was 220.0` replaced, `= 221.0` unchanged, `Kept 220.0` on `exists`, each ending ` · excluded` when the day is left out of the average.
  - `summary`: `Avg 221.0 · 4.0 under target`, `over target`, `on target` when the gap rounds to zero, `Avg 221.0` alone past the plan's end, `No average yet` when nothing counts, `Week unavailable` when the save worked but the week read failed.
  - `question`: `Today has 220.0. Replace with 221.0?`, or `... has 220.0, excluded. Replace with 221.0? It stays excluded.` It names the date ("Mon, Nov 9 has ...") when the date is not today in `America/Los_Angeles` (`ownerToday`, using `OWNER_TIME_ZONE` from `records.ts`).
- **Summary.** `WeekSummary` is now `average`, `target`, and `gapToTarget`. `counted` and `lastWeek` went with "(1 of 7)" and "Last week".
- **Docs.** The two Shortcut bullets in `docs/weight-log.md` describe the new card and the new answer fields. Decisions 40 and 41 in `docs/plans/weight-log-migration.md` gain a dated note each, and 40 says the owner has yet to confirm the wording. Decisions 38, 39, 42, and 43 needed no change. The runbook's "What the notification can say" lists every body and title, and L3 steps 3 and 4 quote the new texts.

## Verified

- `WeekCard.test.tsx` (jsdom) renders the real `WeekSheet` from the same invented log, with a stand-in tRPC that answers as the server would (`buildWeekTable`, the `week` query's bare-row data, phases newest first). It checks that every cell's text, fill, and text color in each card row equals the editor's row in the table named for the card row's phase. It runs 10 cases: a phase boundary, a full week, an excluded day, one weigh-in, a planned empty week, no target, an empty week the running phase holds, weeks outside every phase, two consecutive outside weeks with weigh-ins (this case fails on `42c57f38`), and the log's first week. Further tests cover the ring's cell, the row order with week numbers and phases, the single row in the first week, and the half-tenth rounding.
- `route.test.tsx` renders eight shapes through the real satori and resvg: an empty week, one weigh-in, a full week, an excluded day, no target, a planned empty week, last week in another phase, and the log's first week. Each case checks the PNG size against `cardSize`, every fill color by pixel count, and the red ring. Auth, window, 500, 503, and 405 cases are unchanged.
- `heavy -- pnpm verify` passed on the first two commits. On the scope-addition commits it passed every step except one vitest timeout in `tests/superset-setup.test.ts` (6.5 s against a 5 s limit, at a load near 3 per core), which passed when run alone. Its first run also caught a tsc error (`zonedDate` takes milliseconds), fixed before the commit. tsc and the weight-log suites (311 tests) ran on the committed state before the push. PR checks on `8c0d71e2` were green: check, quality-contracts, and Vercel.
- `week-summary.test.ts` covers each title, the excluded marker on every outcome, each summary form including the never-empty ones, the question on, before, and after the owner's today, and `ownerToday` across UTC midnight. The weigh-in route tests check `title` and `summary` for each status, the excluded question, a request at 05:00 UTC whose date is named because it is still the previous day in Los Angeles, and `Week unavailable` when the week read fails.
- The parity test compares the card's 14 cells with the matching editor cells and asserts the editor still has 16. The route test checks the fill colors of the columns the card draws.
- `heavy -- pnpm verify` passed in full on `27a7b124`. PR checks on `263d239e` were green (check, quality-contracts, Vercel, and Devin's second pass, which raised nothing), and on `27a7b124` (check, quality-contracts, Vercel).
- `heavy -- pnpm verify` passed in full on `fa5c114c`.
- I looked at each rendered card: the ring clears the text, the Chg and Target headers stay apart (Target fills its cell), and a year label fits its widened column.
- Mid-round, another session removed this branch's worktree (`.claude/worktrees/week-card-sheet`) while verify was running, which took the uncommitted round-2 edits and the gitignored harness with it. I recreated the worktree from `27a7b124` and reapplied the edits. I re-rendered the three cards, and they came out byte for byte the same as the ones published on the page, before `pnpm verify` and the commit.
- Visual check: the cards and editor screenshots on the page above. The editor's measured header widths at phone width (44 px per number column, 66 px for Week) set the card's column widths. The computed ink and muted colors (rgb 65,60,57 and 86,81,77) match the card's hex values.

## Shortcuts

- The editor screenshots come from `WeekSheet` rendered in jsdom, serialized, and shown in headless Chromium with the site's Tailwind CSS compiled by the CLI. That is not the running app: the header, phase picker, and controls are missing. The harness isn't committed. Its base copy is in the session scratchpad, and the variant scripts were lost with the worktree.
- The card's columns have fixed widths sized for three-digit weights. A weight of 1000 lb or more, a weekly change of 10 lb or more, or a rate of 10 lb/wk or more would crowd its cell. None of these is realistic, and the server caps lb/wk at 10.

## Issues

- The card's text is about 8.5 pt at 350 pt, short of 9 pt. With 14 columns, 9 pt can't be reached without removing the space between numbers. Dropping lb/wk would give about 9.2 pt.
- Numbers sit 4 px apart between cells, about one space. Same-colored neighbours, like Thu and Fri on Nov 4, read as close together.
- "Target" fills its cell, so "Chg Target" in the header reads almost as one phrase.
- Until the Shortcut is rebuilt, its notification title stays "Weight Log" and its body shows only the week line, so the outcome ("saved", "replaced") isn't in the text. The card still rings the day. The runbook says steps 8 to 11 don't read `title` yet.
- The runbook commit describes the route's new text, which goes live only when #151 merges and deploys.
- In headless Chromium on a Mac, the `SF Pro Display` font face resolves to the installed font, which can apply its `trak` table. The subset drops `trak`, so letter spacing may differ from the browser by a fraction of a pixel. It isn't visible in the comparisons.
- The ring and the medium weight aren't covered by the parity test. The ring has its own test. The medium weight is checked only by eye.

## Ambiguities

- The brief said to keep the font tracing in `next.config.js` and also to use the editor's fonts. The editor uses SF Pro Display, not Georgia Pro, so I kept the mechanism (traced files, read from disk once per warm function) and changed which files it traces. **Owner to confirm.**
- "Label the rows the way the table would": the `#` column is the week's number in its own phase, so a boundary card reads 7 then 0, and the Week label adds a year only when the week's year differs from the asked-about date's. **Owner to confirm.**

## Judgment calls

Scope addition:

- **Orig and its Gap are dropped from the card,** and the card's spacing departs from the editor's (18 px type, 2 px pads, no gutter or border, a 13 px caption) so the text is as large as 14 columns allow in the notification. **Owner to confirm.**
- **The ring is 1.5 px** instead of the editor's 2 px, so it clears the text inside a 2 px pad. **Owner to confirm.**
- **`summary` is never empty.** The lead allowed an empty value with no average, but the current Shortcut (L2 step 9) treats an empty `summary` as a failed request and shows "The site did not answer". So it reads `No average yet` with nothing counted and `Week unavailable` when the read fails. **Owner to confirm.**
- **`exists` gets a title too,** `Kept 220.0`, so every 200 has both fields. The Shortcut stops on Cancel, so nobody should see it. **Owner to confirm.**
- **"Today" means today in Los Angeles.** The Shortcut sends the phone's own date, so the question can say "Today" whenever that date is today in the owner's home zone and never be wrong; elsewhere, or after midnight on the East Coast, it names the date. **Owner to confirm.**
- **Excluded wording:** ` · excluded` in the title, and "..., excluded. Replace with ...? It stays excluded." in the question, instead of the editor's "left out of the weekly average". **Owner to confirm.**
- **"on target"** when the gap rounds to 0.0, as the old line did. **Owner to confirm.**

First pass:

- **Caption with phase dots.** The editor names a phase only in its header picker, with a colored dot. The card puts the same dot and label in a caption above the table, in the style of the editor's "Outside every phase" caption. It lists both phases at a boundary. **Owner to confirm.**
- **Weeks outside every phase are colored alone.** This matches the editor on a plain load. If the owner has also used Go to date on the other week, the editor colors the two together and the card won't match. **Owner to confirm.**
- **The previous row disappears** when it has no weigh-ins and no phase holds it, rather than showing an empty row. **Owner to confirm.**
- **New font files.** I committed two SF Pro subsets, about 180 KB, to `src/fonts/weight-log/` instead of reusing the weightlifting subset, which lacks U+2212 and the tabular figures. This follows the existing practice of committing SF Pro subsets for server images. **Owner to confirm.**

## Next steps

- The owner runs the Log Weight Shortcut once against the preview or production deploy after merge and looks at the notification and Quick Look on the phone.
- The lead rebuilds the Log Weight Shortcut to show `title` as the notification's title and `summary` as its body, and updates L2 steps 8 to 11 and `build_shortcut.py` in the apple-health repo to match. Push `56b184d` there with that work.
- If 8.5 pt is still too small on the phone, the next options are dropping lb/wk (about 9.2 pt), or a narrower card for the notification with the full table for Quick Look, which needs a second fetch in the Shortcut.

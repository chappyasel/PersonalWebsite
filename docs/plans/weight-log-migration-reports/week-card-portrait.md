# Week card in portrait

## Commits, PR, and page

- PR: https://github.com/chappyasel/PersonalWebsite/pull/152 (branch `weight-log-week-card-portrait`, from `origin/main` at `7f3a3701`). Not merged.
- `7c57a971` Draw the Log Weight card in portrait, with eleven weeks
- Page: https://app.superset.sh/page/weight-log-week-card-portrait-jpse3m. Source: `test-results/week-card-portrait/` in this workspace, which git ignores. The harness that made it (the invented log, the variant, the renderer, the editor dump, the screenshot script) is in the branch worktree's ignored `test-results/week-card-portrait/harness/`.

## What changed

- **Layout.** `src/app/api/weight-log/week-card/WeekCard.tsx` draws a portrait card 360 px wide at 2x (720 px PNG) whose height follows its rows: 610 to 968 px in the four page cases. From the top:
  - A 12 px caption with this week's phase dot and name on the left (or "Outside every phase") and "Week 5 · Dec 2" on the right, or the Monday alone outside a phase.
  - Mon to Sun headers, then this week's seven day cells, 50 by 40 px, numbers centered at 16 px regular. Each cell has the editor's fill. The asked-about day has the 2 px red ring. An excluded day is struck through and muted, with no fill. Days with no weigh-in are empty.
  - The summary table at 14 px: `#`, Week, Avg, Chg, Target, Gap, lb/wk (`CARD_COLUMNS`, the editor's columns less Orig and its Gap). It keeps the editor's rules: neutral-200 under the header and left of Avg, neutral-100 between rows. This week's row is medium. Later weeks are muted, as the editor mutes them. Number columns share the width Week leaves, in whole device pixels, so a year in a Week label ("Jan 6, 2031") narrows them from 55 px to 47.5 px instead of shrinking the type.
  - Phase changes: where the phase changes inside the window, a label row (a neutral-200 rule, then the phase's dot and name at 12 px) sits over the new phase's first row. The first rows get a label only when they aren't in this week's phase, since the caption already names it. A window inside one phase has no label rows.
- **Rows.** `src/lib/weight-log/week-card.ts` (`weekCard`, plus `currentRow`, `WEEKS_BEFORE`, `WEEKS_AFTER`) returns up to 11 rows, oldest first. The date's week always shows. Any week the log has shows. An earlier week the log lacks shows while a phase holds it and the log has begun (as #151 did for last week). A week before the log's first week is dropped. A later week the log lacks is dropped, because it is past the plan and the editor has no row for it. Coloring is unchanged from #151: each row is colored over its phase's whole table, and a week outside every phase alone.
- **Fixture.** `week-summary.fixture.ts` gains `WINDOW_LOG` (a cut, a bulk, and a running maintenance phase, 26 weeks, every week planned and weighed, one excluded Tuesday) and `loggedThrough(date)`.
- **Route.** Only its doc comment changed. Auth, window, headers, error JSON, font tracing and cache, and the notification `title`, `summary`, and `question` are untouched.
- **Editor.** `WeekSheet.tsx` is unchanged.
- **Docs.** The card bullet in `docs/weight-log.md` describes the new layout and row rules. Decision 41 in `docs/plans/weight-log-migration.md` gains a dated note saying the owner has yet to confirm the layout and that the 16-column variant was not shipped.

## Verified

- **Parity.** `WeekCard.test.tsx` renders the real `WeekSheet` in jsdom from the same invented log, through the tRPC stand-in from #151. For each case it checks the seven day cells against the editor's row for this week, and every summary row's `#`, Avg, Chg, Target, Gap, and lb/wk against the editor's row in the table for that row's phase (text, fill, text color). The Week label is checked against `weekLabel` separately, because a row the editor doesn't show on the card's date is read with the editor's today set to that week's Sunday, which can change the label's year. 14 cases: a phase start with the log's first weeks, a full week, an excluded day, one weigh-in, a planned empty week, no target past the plan, an empty current week the running phase holds, an empty earlier week, weeks outside every phase, two outside weeks with weigh-ins, the log's first week, eleven weeks of one phase, the next phase's planned weeks, and a new phase's first weeks. The half-tenth rounding case also runs through it.
- **The parity test catches drift.** I mutated the card twice and restored it from a copy. Shifting each day fill by one day failed 12 cases. Coloring over only the window's weeks, instead of the whole phase table, failed 7.
- **Other card tests.** Five weeks either side with numbers 1 to 11, the start at the log's first week, the stop past the plan, the kept empty earlier week, label rows (none in one phase, one for the next phase, two when the window starts in an earlier phase), the caption text, medium and muted rows, the struck excluded day, and one ring, in the strip only.
- **Rates and labels.** A new `format.test.ts` pins `rate()` on 11 values, including both signs of a quarter pound, and `weekLabel()` with and without the year. A card test spans New Year (a bulk from Dec 16, asked on Jan 1) and finds no four-digit year anywhere on the card, with the caption reading "Week 2 · Dec 30". The parity test checks each Week label against `cardWeekLabel`. The editor tests now expect the "+/-" and "lbs/w" headers, the renamed cells, "+1.0" and "+1.2" in the cells and messages, and a new case: stored rates of 0.25 and −0.25 read "+0.3" and "−0.3", the field opens on "0.25", Enter on it sends nothing, and a typed 0.3 sends 0.3.
- **Route renders.** `route.test.tsx` renders 11 shapes through real satori and resvg: the original eight dates (each now an 11-week window, including a window across a phase start, an excluded day, and the log's first week), an empty week after the plan's end, and two `WINDOW_LOG` cases (eleven weeks of one phase with an excluded day, and the next phase's planned weeks). Each checks the PNG is 720 px wide at `cardSize`, every fill drawn in the strip and the table by pixel count, the red ring, and that the bottom 16 device rows are white, so `cardSize` never cuts off the last row. Auth, window, 500, 503, and 405 cases are unchanged and pass.
- **Gate.** `heavy -- pnpm verify` passed in full on `7c57a971` (typegen, tsc, eslint, vitest, artwork, search index, meadow), run on Portable at about 1 per core. PR checks: see the line I sent the lead.
- **Visual.** I rendered both layouts for four dates through `ImageResponse` and looked at each: mid-phase (Dec 4, crossing into 2031), a phase boundary (Oct 30), the log's first weeks (Sep 11), and the plan's last week (Jan 29). Beside each is a headless Chromium screenshot of the real `WeekSheet` rendered from the same `upTo(date)` log, with the site's Tailwind CSS compiled by the CLI, plus the cut's table for the boundary. The colors agree cell by cell by eye, and the parity test pins them. The page shows each card at full size and inside an HTML mock of an expanded notification 360 pt wide.

## Text size at 360 pt

The card's layout is 360 px wide, so its pixel sizes are its point sizes in a 360 pt notification.

| Card | Text | Size |
| --- | --- | --- |
| Default | This week's day numbers | 16 pt |
| Default | Summary table and headers | 14 pt |
| Default | Caption and phase labels | 12 pt |
| Variant | Everything, no year in a Week label | 6.75 pt |
| Variant | Everything, with a year | 6.25 pt |
| On main (#151), for reference | Everything | 8.9 pt |

The variant's size is the largest SF Pro size that fits 16 columns of tabular numbers in 360 px with 2 px between a cell's text and its edge. Its day columns can't be narrower than a number, because this week's row keeps its numbers.

## Shortcuts

- The variant lives only in the harness (`test-results/week-card-portrait/harness/variant.tsx` in the branch worktree), not in the repo. It is not parity-tested. Its excluded days in swatch rows get a short muted dash, which the editor doesn't draw.
- The notification frames on the page are drawn in HTML, not captured from a phone. Their title and body lines are written by hand to match the route's wording for each shown weigh-in.
- The editor screenshots come from `WeekSheet` rendered in jsdom and shown in headless Chromium, as in #151. The header, phase picker, and controls are missing.

## Issues

- The card is now 610 to 968 px tall at 2x (305 to 484 pt), against 220 px before. I haven't seen how an iPhone's expanded notification or the collapsed thumbnail crops or scales a portrait image this tall. The collapsed notification shows a small square thumbnail, which will show only part of it.
- The page's mock shows this, but a window crossing New Year narrows the number columns to 47.5 px. "Chg" and "Target" in the header sit close, about 4 px apart.
- The ring and the medium and muted weights are covered by their own tests, not by the editor parity check, which compares text and colors only.

## Ambiguities

- "Days after today are empty." I show whatever the editor's row has. Days after the asked-about date have no weigh-ins in practice, so they are empty, but I don't blank them on purpose. If the Shortcut asks about yesterday and today already has a weigh-in, today's cell shows it, as the editor would. **Owner to confirm.**
- "Weeks past the plan's end that the editor wouldn't show." I read this as later weeks the log lacks. An earlier week the log lacks but a phase holds still shows as an empty row, as #151 showed last week, so a skipped week reads as skipped instead of disappearing. The editor itself has no row for such a week unless it is the current week. **Owner to confirm.**

## Judgment calls

- **Day numbers are regular weight at 16 px, centered.** Medium at 16 px fills 43 of the cell's 50 px, and the 2 px ring touched the text. Regular leaves 2 px clear. The editor right-aligns and sets the current row in medium. In a strip with nothing below it to align to, centered reads better, and every cell is this week's anyway. **Owner to confirm.**
- **Phase labels only where needed.** No label when the window holds one phase, a label at each change, and a label at the top only when the first rows aren't in this week's phase. Labelling every segment would repeat the caption on most cards. **Owner to confirm.**
- **Caption wording** "Week 5 · Dec 2", using the editor's `#` count, which starts at 0 ("Week 0" in a phase's first week). **Owner to confirm.**
- **The summary table keeps lb/wk** and drops Orig and its Gap, as the lead's design says. #151 had dropped lb/wk for width, which portrait no longer needs. **Owner to confirm.**
- **Type sizes.** 14 px for the table rather than larger, so a window with a year in a label still fits without shrinking the type. 15 px would fit only without a year. **Owner to confirm.**

## Next steps

- The owner picks the default or the variant on the page. If the variant wins, it needs to move into the repo with a parity test.
- After merge, the owner runs the Log Weight Shortcut once on the phone and looks at the expanded notification, the collapsed thumbnail, and Quick Look on the Mac with a tall card.
- If the collapsed thumbnail matters, a square crop of the day strip could be served separately, which would need a second fetch in the Shortcut.

## Round 2: bolder type and a three-week grid

The owner's feedback on the page: "bolder fonts please. i'd actually like to see the previous two weeks in the 7-day grid cuz it's helpful for comparison". Later in the round the owner added three more: no year in the card's Week labels ("for future dates no need for '2031' – it's obvious it's the next year haha"), the headers "+/-" and "lbs/w" on the card and the editor, and rates "always to 0-1 decimal place not 2".

### Commits and page

- `1d5f04c5` Grid the last three weeks on the Log Weight card, in bolder type.
- `c0628174` Read rates to one decimal under +/- and lbs/w, and drop the card's years.
- `15e11a91` Call the rate lbs/w everywhere, and read it to one decimal on Plan. At the lead's word that "across the board" covers Plan: Plan's rate field is labelled "lbs/w", its length message reads "+0.5 lbs/w" through the shared `rate()` (its own two-decimal formatter is gone), and the status line's messages, the rate cell's refusal, and the server's "no lbs/w to change" say lbs/w. The edit fields still show two decimals. `heavy -- pnpm verify` passed before the push.
- Both are pushed to #152, which stays a draft. The PR body is updated.
- Page, version 3 of the same page: https://app.superset.sh/page/weight-log-week-card-portrait-jpse3m. Source: `test-results/week-card-portrait/` in this workspace. Following the owner's rule, it shows only the current state, with no earlier round, variant, or old figure. Each case shows the card in the 360 pt notification frame, the card at full size, and the editor's table with the new headers, all from the same invented log. Version 2 had the round 1 card beside each new one.

### What changed

- **Type.** `WEIGHT` in `WeekCard.tsx` sets three weights: Medium (500) for the caption, column headers, day names, phase labels, and the grid's month; Semibold (600) for numbers and Week labels; Bold (700) for this week's grid row and table row. Round 1 was Regular with a Medium current row.
- **Fonts.** `weight-log-card-fonts.py` now subsets Medium, Semibold, and Bold, the same way as before (`tnum` baked into the cmap, U+2212 kept). The new files are about 90 KB each. Regular is no longer drawn, so its subset is deleted. The Medium file is byte for byte the one already committed. `next.config.js` already traces `./src/fonts/weight-log/*.otf`, so it needed no change. The route's cache reads the three files.
- **Grid.** `DayGrid` replaces `DayStrip`. It has up to three rows, two weeks ago, last week, and this week, from `gridRows(card)` in `week-card.ts`, which filters `card.rows`. So the grid shows exactly the weeks the table shows in that span: in the log's first weeks only those that exist, and an earlier empty week a phase holds as an empty row. Each row has a 33 pt label column with its Monday, the month (11 pt Medium, muted) over the day of the month (14 pt), then seven 46 pt day cells. Each cell has the row's own colors, which `weekCard` computes within that week's phase table. Rows have the table's neutral-100 rule between them. Today keeps its 2 pt red ring, an excluded day is muted and struck through, and days after today are empty because they have no weigh-ins.
- **Phase labels in the grid.** `linesOf(card, rows)` now builds the lines for both blocks with round 1's rule: a rule, dot, and name where the phase changes, and one at the top when the first rows aren't in this week's phase.
- **Summary table.** The type changed, and the Week column is sized for a Bold "May 31" (3.44 em). Cell padding stays 4 pt. (In `1d5f04c5` it was 3 pt so a Bold row fit beside a year; `c0628174` removed the years and restored it.)
- **No year on the card** (`c0628174`). `weekLabel(week, today, { year: false })` never writes a year, and the card uses it through `cardWeekLabel` for the caption, the grid, and the table. "Jan 6" follows "Dec 30" with no "2031". The editor calls `weekLabel` without the option, so it still adds the year for a week outside today's. The Week column is always the narrow one, so the number columns are 54.5 pt.
- **Headers and rates, on the card and the editor** (`c0628174`). `SUMMARY_COLUMNS` in `week-columns.ts` now labels change "+/-" and the rate "lbs/w", which both views draw. The editor's rate cells are named "lbs/w, week of Jan 14" to match. `rate()` in `format.ts` writes one decimal, rounding halves away from zero: +0.30 reads "+0.3", 0.25 "+0.3", −0.25 "−0.3", 1 "+1.0", and 0.04 "0.0". The stored rates keep six decimals. The editor's status messages ("at +1.2 lb/wk. Later targets moved +0.7 lb.") and a sent rate's pending readout use the same `rate()`.
- **The lbs/w edit field.** It still opens on `poundsPerWeek.toFixed(2)`, so a stored 0.25 reads "+0.3" in the cell and opens as "0.25". Saving it untouched sends nothing, and a typed value is still rounded to two decimals (`rateEdit`), so a typed 0.3 saves as 0.3. A rate with more than two decimals, such as an imported 0.333333, opens as "0.33" as before.
- **Blocks.** The grid and the table each sit in a `data-block` wrapper so tests can tell their labels apart.
- **Docs.** In `docs/weight-log.md`: the card bullet, the weekly table's columns, the editing bullets (the cell is now "lbs/w"), and the precision note. In `docs/plans/weight-log-migration.md`: dated notes on decision 23 (headers and one-decimal rates) and decision 41 (the grid, the type, no year), owner yet to confirm. No glossary entry names these columns: `src/lib/weight-log/CONTEXT.md` defines Target and Original target only, so it needed no change.

### Verified

- **Parity.** `WeekCard.test.tsx` now compares the day cells of every grid row, not only this week's, with the editor's row in the table for that row's phase (text, fill, text color), plus every summary row as before, in the same 14 cases. They include a grid that crosses a phase start (Jan 22: two cut weeks, then the bulk's first), the log's first week (one row), and excluded days in this week's row (Jan 31) and in last week's row (Feb 4).
- **The test catches drift.** I mutated the card twice and restored it from a copy. Coloring the earlier grid rows with this week's colors failed 13 tests. Shifting each day fill by one failed 18.
- **New tests.** The grid holds this week and the two before it, and two rows or one in the log's first weeks. The grid's phase labels at a phase start, and none in one phase. Weights: earlier grid and table rows at 600, this week's at 700. An excluded day struck in this week's row and in last week's. A 4.5:1 contrast check of every number the card draws, against its fill or white, over 2 dates. The fills' own contrast test in `color-scale.test.ts` passes unchanged.
- **Route renders.** `route.test.tsx` renders 12 shapes through real satori and resvg, one more than round 1 (the log's second week, a two-row grid). The fill check now covers every grid row's days.
- **Gate.** `heavy -- pnpm verify` passed in full on each commit's tree (typegen, tsc, eslint, vitest, artwork, search index, meadow), on Portable at about 2 per core. Each push came after it.
- **Visual.** I rendered the four cases through `ImageResponse` with the three fonts and looked at each, and re-dumped and re-shot the editor's tables from the same invented log, since the headers and rates changed. The grid's colors agree with the editor's rows by eye, and the parity test pins them. The card and the editor both read "+/-", "lbs/w", one-decimal rates, and the card has no year.

### Measured sizes at 360 pt

| Text | Weight | Size |
| --- | --- | --- |
| Grid day numbers | Semibold, this week Bold | 14 pt (16 pt in round 1) |
| Grid week label | Month Medium over day Semibold or Bold | 11 pt over 14 pt |
| Table numbers and Week labels | Semibold, this week Bold | 14 pt |
| Table number columns | | 54.5 pt wide |
| Table column headers | Medium | 14 pt |
| Caption, day names, phase labels | Medium | 12 pt |

A Bold "178.6" at 14 pt is 39.6 pt wide in a 46 pt cell, so the 2 pt ring clears it by 1.2 pt. At 15 pt Bold it would overlap the ring. The cards are 730 to 1196 px tall at 2x in the page's cases (365 to 598 pt), against 610 to 968 px in round 1.

### Shortcuts

- The notification frames are still drawn in HTML. The editor shots are still `WeekSheet` in jsdom shown in headless Chromium, without the header and controls.
- The harness's `render.tsx` now writes `card2-*.png` and no variant. It stays in the branch worktree's ignored `test-results/`.

### Issues

- The grid's numbers dropped from 16 to 14 pt, so the grid no longer reads larger than the table. Fills, Bold, and the ring set this week apart, not size.
- The card grew again. At a phase boundary inside the grid it gains two label rows, so the boundary case is 598 pt tall. How the phone crops or scales it is still unchecked.
- `signed()`, which writes Avg's change and the gaps, still rounds a half toward positive infinity (−0.25 reads "−0.2"), as before. Only `rate()` rounds away from zero now. Changes and gaps come from averages, so an exact half is rare.
- The headers use the owner's "+/-" with a hyphen, while the numbers use U+2212.
- Semibold and Bold differ by one step, so this week's emphasis is quieter than the jump from Regular to Medium was.
- At a phase start the grid repeats the caption's phase name over this week's row. That follows the table's rule, which round 1 already had.

### Ambiguities

- "A short label column at the left, the way the summary table labels weeks." I used the same Monday label as the Week column, split into month over day so it fits 33 pt, and without the year, which the table below shows. **Owner to confirm.**
- "Days after today stay empty." As in round 1, I show what the editor's row has. Days after the date have no weigh-ins in practice. **Owner to confirm.**
- "Anywhere else these columns appear." Settled by the lead: `15e11a91` renames Plan's field and every message to "lbs/w" and reads Plan's rate to one decimal.

### Judgment calls

- **Grid numbers at 14 pt**, the floor the lead set, because 15 pt Bold doesn't clear the ring next to a label column. **Owner to confirm.**
- **Two-line week labels** (month over day) instead of "Nov 18" on one line. One line needs about 46 pt, which leaves day cells too narrow for a Bold number and the ring. **Owner to confirm.**
- **Weights:** Medium labels, Semibold numbers, Bold for this week, as the lead suggested. Excluded days stay Semibold, muted, and struck. Later, muted table rows stay Semibold. **Owner to confirm.**
- **Regular removed** from the repo and the route, since nothing draws at 400. **Owner to confirm.**
- **A whole-number rate reads "+1.0"**, not "+1", so the rate column stays aligned on its decimal point like the weights. **Owner to confirm.**
- **Halves round away from zero** for rates, so a cut and a bulk at the same quarter pound read the same, −0.3 and +0.3. JavaScript's `Math.round` would give −0.2. **Owner to confirm.**
- **The lbs/w edit field opens on two decimals**, the stored value, not the one-decimal reading, so a 0.25 rate opens as "0.25" and isn't changed to 0.3 by opening and saving it. The cell and the field can therefore disagree in the second decimal. **Owner to confirm.**
- **Status messages use one decimal too** ("Set the week of Jan 14 to 101.2 lb at +1.2 lb/wk"), since they read the same `rate()`. After typing 0.25, the message says "+0.3". **Owner to confirm.**
- **Phase labels inside the grid** follow the table's rule, including a label over this week's row at a phase start even though the caption names the phase. **Owner to confirm.**

### Next steps

- The owner looks at version 3 of the page and confirms the layout or asks for changes.
- After merge, the owner runs the Log Weight Shortcut once on the phone and checks the expanded notification and the collapsed thumbnail with a card this tall.
- If the grid should read larger than the table, the options are dropping the label column (the day header could carry the weeks) or Semibold for this week's grid row so 15 pt clears the ring.

## Round 4: bold labels, regular numbers, numbered week labels

The owner's feedback on round 3: the numbers shouldn't be bold, the headers should; the grid's two-line date should be used in the table too, for more spacing; an empty value's dash should be much lighter; and the grid's labels need the week number, in one compact segment with the date.

### Commit and page

- `69f8f562` Bold the Log Weight card's labels, and label each week by number and date. Pushed to #152, which stays a draft. The PR body is updated for round 4.
- Page, version 4 of the same page: https://app.superset.sh/page/weight-log-week-card-portrait-jpse3m. It holds only the four round 4 cards, each in the 360 pt notification frame and at full size. The four PNGs are also copied over `test-results/week-card-portrait/card-*.png`. The round 3 editor shots moved out of the published folder to `test-results/week-card-portrait-round3-editor/`.

### What changed

- **Weights.** `WEIGHT` is now `{ number: 400, current: 500, label: 700 }`. Bold: the caption, day names, column headers, phase labels, and the week label. Regular: every number in the grid and the table. Medium: this week's numbers in both, as the editor's current row is. Later weeks stay muted.
- **Fonts.** `weight-log-card-fonts.py` subsets Regular, Medium, and Bold. Regular is regenerated and Semibold is deleted. Bold and Medium are byte for byte the committed files. A fresh run only changes their `head.modified` stamp, so I kept the committed bytes. The route and the harness load Regular, Medium, and Bold.
- **Week label.** A new `WeekLabel` is the first cell of every grid and table row. It shows the week's number in its phase (the editor's `#`) at 13 pt Bold muted, right-aligned in a 17 pt column, and beside it the month at 11 pt Bold muted over the day of the month at 14 pt Bold. A week outside every phase has no number. The table's `#` column is gone, and its header reads "Week". The grid's header has "Week" over the label column too, so both headers line up.
- **Sizes.** Grid and table rows are both 34 pt (the table's were 26), to fit the two-line label. Table numbers are 15 pt (14 before). Grid numbers stay at 14 pt. Headers, day names, and the caption are 13 pt, and phase labels 12 pt. The grid's day cells are 44.5 pt and run to the card's right edge, as the table's last fills do. The label column is 48.5 pt in the grid and 50.5 pt in the table, because the table's number columns round to whole device pixels (61.5 pt each).
- **Dashes.** A null value with no fill draws its dash in neutral-300 (`DASH`, `#d4d4d4`).
- **Height.** The four cases are 842 to 1368 px at 2x (421 to 684 pt). Round 3's were 730 to 1196 px.
- **Docs.** The card bullet in `docs/weight-log.md` and a dated note on decision 41 in `docs/plans/weight-log-migration.md`.
- **Editor.** Unchanged.

### Verified

- **Parity.** The 14 cases plus the half-tenth case pass. The table rows compare the five `CARD_COLUMNS` cells (text, fill, ink) with the editor's. Each grid and table row's label is checked too: its number against the editor's `#` cell, and its month and day against `cardWeekLabel`.
- **The tests catch drift.** Adding one to the label's number failed 16 tests. Dropping the dash color failed the dash test. I restored the file from a copy after each.
- **New tests.** The grid's and the table's labels match for the same week. The table header is "Week" and the five columns. Headers and labels are Bold, numbers Regular. Every dash is `DASH`, and no other cell is. The contrast test skips dashes and still checks every number at 4.5:1.
- **Route renders.** `route.test.tsx` passes unchanged through real satori and resvg with the new fonts.
- **Gate.** `heavy -- pnpm verify` passed in full before the commit (typegen, tsc, eslint, vitest, artwork, search index, meadow), on Portable at about 1 per core.
- **Visual.** I rendered all four cases through `ImageResponse` and looked at each one. The Medium "178.6" in the ringed cell clears the ring. Two-digit week numbers (10 to 13 in plan-end) fit. In the boundary case the label numbers restart at 0 under the bulk's label.

### Measured sizes at 360 pt

| Text | Weight | Size |
| --- | --- | --- |
| Grid day numbers | Regular, this week Medium | 14 pt |
| Table numbers | Regular, this week Medium | 15 pt |
| Week label: number, then month over day | Bold | 13 pt; 11 over 14 pt |
| Caption, day names, column headers | Bold | 13 pt |
| Phase labels | Bold | 12 pt |

A Medium "178.6" at 14 pt is 37.8 pt in a 44.5 pt cell, which leaves the 2 pt ring 1.3 pt clear. At 15 pt it would touch the ring, so the grid stays at 14 pt.

### Shortcuts

- The notification frames are still drawn in HTML. The page no longer shows the editor beside each card, because the lead asked for the cards only.
- The harness's `render.tsx` now writes `card-*.png` to `test-results/week-card-portrait/page4/` in the branch worktree.

### Issues

- The page's description still reads "with the one-table variant and the editor beside it". The CLI has no way to change it without minting another version.
- The card is taller again, up to 684 pt in the boundary case. How the phone crops or scales it is still unchecked.
- The grid's label column (48.5 pt) and the table's (50.5 pt) differ by 2 pt, so the grid's Mon edge and the table's Avg rule don't line up. The label text itself starts at the same x in both.
- This week's row stands out only by Medium numbers and, in the grid, the ring. Medium over Regular is a quiet step.

### Ambiguities

- "You still have the text sizing wrong." I read it as the hierarchy: numbers too heavy against small labels. So labels went to 13 pt Bold and table numbers to 15 pt Regular. If the owner meant the numbers are too large, 14 pt in the table is a one-line change. **Owner to confirm.**
- "Put the 2 of those into the same little segment." I read the two as the week number and the month-over-day date, side by side in one cell. **Owner to confirm.**

### Judgment calls

- **Merged `#` and Week into one label column** in the table, the same segment as the grid's, so both blocks label weeks the same way. **Owner to confirm.**
- **The week number is muted and the day is ink**, so the date leads and the number reads as secondary. No "W" prefix. The "Week" header and the caption's "Week 5" give the context. **Owner to confirm.**
- **This week's numbers are Medium**, not Regular, matching the editor's current row. **Owner to confirm.**
- **Table numbers 15 pt, grid numbers 14 pt.** The grid can't fit 15 pt next to the ring. **Owner to confirm.**
- **Rows are 34 pt**, not 36, to limit the card's height while fitting the two-line label. **Owner to confirm.**
- **Dashes are neutral-300 on white.** They are drawn in that color only when the cell has no fill. In practice no empty value has a fill, and a test pins that. **Owner to confirm.**
- **The grid's cells run to the card's right edge**, to free width for the label. **Owner to confirm.**

### Next steps

- The owner looks at version 4 of the page and confirms the weights, the label segment, and the sizes.
- After merge, the owner runs the Log Weight Shortcut once on the phone and checks the expanded notification and the collapsed thumbnail with a card this tall.

## Round 4 editor

The owner approved round 4 ("ok let's ship this. also update the main edit page as needed").

- **Commit.** `45929353` Head the editor's weekly rows as the Log Weight card does. Pushed to #152, still a draft. The PR body is updated.
- **What changed.** In `WeekSheet.tsx`, a new `WeekLabelCell` is each row's sticky `<th scope="row">`: the week's number in its phase, muted, beside the month (10 px) over the day of the month (13 px), all bold. It replaces the `#` cell and the Week header cell, and the header row now reads Week, Mon to Sun, then the summary columns. Header text is bold. Numbers stay regular, and this week's row stays medium. A summary value that is null and has no fill gets `text-neutral-300` (`dark:text-neutral-600`). Rows carry `data-week`. The cell buttons' scroll margin is `scroll-ml-20`, down from 28, because the sticky column is narrower.
- **Accessibility.** The visible label is `aria-hidden`. A screen-reader span gives the full label and the number, "Nov 9, week 5", or "Nov 9, 2031, week 5" for a week outside today's year. Cell names ("Weigh-in, Tue, Jan 8, …", "lbs/w, week of Jan 14") are unchanged.
- **Height.** The label is 25 px tall, inside the row's existing 28 px (36 px on touch), so the day cells, the edit inputs, and today's ring keep their size.
- **Parity.** `WeekCard.test.tsx` finds the editor's row by `data-week` instead of its Week text. It now compares each card row's label (number and month-over-day) with the editor's row header directly. Adding one to the editor's number failed 15 card tests. `WeightLogEditor.test.tsx` checks the new header row, the row headers' numbers and names, and the light dash on an empty Avg.
- **Headless check.** I rebuilt the site's Tailwind CSS, dumped the mid-phase table from jsdom, and opened it in headless Chromium at 1280 px and 390 px wide (`test-results/week-card-portrait/editor-r4/` in the branch worktree). Neither width scrolls the page sideways. At 390 px the table scrolls inside its own container, and with it scrolled the label column stays pinned at the left over the fills.
- **Gate.** `heavy -- pnpm verify` passed in full before the commit. After it I changed only `docs/weight-log.md`.
- **Docs.** The weekly table bullet in `docs/weight-log.md` describes the row header, the weights, and the dash. The card bullet now says neither view shows a year.
- **Judgment call.** The editor no longer shows a year on screen. The phase picker's names carry the years, and screen readers still hear the year. **Owner to confirm.**
- **Shortcut.** The check used the jsdom dump, not the signed-in page, because the dev environment reads the production database.

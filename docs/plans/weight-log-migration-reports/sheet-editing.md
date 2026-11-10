# Weight Log sheet editing: build report

Branch `weight-log-sheet-editing`, cut from `main` at `c1de0296`, in `/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/sheet-editing`. `origin/main` has not moved since, and the branch merges cleanly.

PR: https://github.com/chappyasel/PersonalWebsite/pull/149 (base `main`, not merged).

ParaDev page: https://app.superset.sh/page/weeks-sheet-ui-check-ksuvat (`just_me`, version 1). Its source is `.ui-check-sheet/` in this workspace, which is gitignored through `.git/info/exclude`. I did not open it in the sidebar.

## Commits

- `8e29fafd` Add the Weeks sheet's cell rules
- `12cd7124` Edit weigh-ins and the plan in the Weeks table
- `f1e91f91` Describe the Weeks table's editing in the Weight Log doc
- `3cdfc707` Fit a touch cell's input and keep the phase Select controlled. The UI check found both problems.

## What changed, by request

1. **One editor.** The Weigh-in section is gone: the date field, Pounds, the check button, and the week grid. The Plan section's Weekly rate form is gone too. The phase picker, Length, Start a phase, and Set points stay. `WeightLogEditor.tsx` is now a thin shell that renders `WeekSheet`, `PlanEditor`, and `SetPointsEditor` inside one `TooltipProvider`. `failure` and `isConflict` moved from `PlanEditor.tsx` to `refusal.ts`, since both editors use them.
2. **Editable cells.**
   - The seven day cells go through `upsertWeighIn` and `deleteWeighIn`.
   - Target and lb/wk go through `changeRate`.
   - Avg, Change, Gap, Original target, and Gap to original stay read-only.
   - `editableCells` in `src/lib/weight-log/sheet.ts` lists the editable cells in reading order, and Tab follows that list.
3. **Target as a rate.** `targetEdit` rounds the typed target T to 0.1 and sends `roundHundredth(T − previous target)`, with the plan revision from the table query. It refuses a target more than 10 lb from the week before, because the server caps a rate at 10 lb/wk. A phase's first week has no lb/wk and `planRateChange` can't set one, so its target and lb/wk are both read-only (`planEditable`).
4. **Interaction.**
   - A tapped cell becomes a shadcn `Input` of the same size, with `type="text"`, `inputMode="decimal"`, and `enterKeyHint="done"`. Nothing is selected and the caret is at the end.
   - Return or blur saves, and Escape cancels. An unchanged value sends nothing, and so does an empty cell that was empty.
   - Tab and Shift+Tab move between editable cells. Past the last one, the browser moves focus on and blur saves.
   - Weigh-ins round to 0.1 and rates to 0.01, as the server does. `readNumber` accepts the table's minus sign (U+2212) and a decimal comma, and refuses "1e2" or "12abc".
   - When the server refuses, its message goes on the status line and the cell keeps the typed text. On Return or Tab the cell stays open with `aria-invalid`. After a blur the text stays in the closed cell, red with a dotted underline, until the next edit or Escape. A CONFLICT refusal refetches the plan.
5. **Clearing and Undo.**
   - Clearing a day deletes its weigh-in.
   - A floating status line names every change, for example "Changed Wed, Nov 4 from 166.0 to 166.7 lb." It offers one level of Undo, which `undoOf` turns into the same mutations: a new weigh-in is deleted, a replaced or deleted one gets its old pounds back, and a rate change sets the old rate.
   - Undo is disabled while a request is in flight. Dismiss is an icon button with a Tooltip.
6. **Today.**
   - Today's cell has `ring-2 ring-inset ring-red-600 dark:ring-red-500` and `aria-current="date"`.
   - An empty today opens with `lastWeighInBefore`, muted, and the status line reads "Filled in from Wed, Nov 4. Not saved yet."
   - On load the table picks the phase that holds today, by the loader's rule (`phaseHolding`), and scrolls this week's row into view.
   - If the phase's table has no row for this week, for example after the running phase's plan ends, the table adds one from `weightLog.week`.
   - The `#` and Week columns stay sticky, and the table scrolls sideways inside its card on the phone.
7. **Excluded weigh-ins** stay struck through. Their flag can't be changed in the table. When the owner edits one, the status line says it stays left out of the weekly average.
8. **Any date.**
   - Go to date is an outline button with a calendar icon, covered by an invisible native date input with `max={today}`.
   - It opens the picked day for typing. A week in a phase joins that phase's table. A week outside every phase shows in a separate table under "Outside every phase".
   - Days after today on the device clock aren't editable.
9. **Components and names.**
   - The table uses shadcn Input, Button, Select, and Tooltip, with Phosphor icons (CalendarBlank, ArrowCounterClockwise, X). There are no `title=` attributes, sheets, or modals.
   - Cells have names such as "Weigh-in, Tue, Jan 8, today, 100.4 lb" and "Target, week of Jan 14, 100.5 lb". The open input is named "Weigh-in, Mon, Nov 9".
10. **Docs.** The Owner page section of `docs/weight-log.md` now describes the editable table, Undo, and Go to date, and no longer mentions the rate form.

## What I verified and how

- **Gate.** `heavy -- pnpm verify` passed on Portable in 4m06s: typegen, tsc, eslint with zero warnings, vitest (726 files, 6,479 tests), artwork, the search index, and meadow. After the last commit I ran the editor and sheet tests (80 pass), eslint, tsc, and Prettier on the changed file. `pnpm exec prettier --check` passes on all 12 files the branch touches.
- **Unit tests.** `src/lib/weight-log/sheet.test.ts` (24 tests) covers:

  - `readNumber`
  - weigh-in, target, and rate edits, including the target-to-rate conversion and its rounding, the 10 lb limit, and unchanged values
  - `undoOf` for a new weigh-in, a replace, a delete, and a rate change
  - which cells are editable, including the first week and the landing state
  - `phaseHolding`, `bareRow`, and `withWeeks`

  `refusal.test.ts` covers the moved helpers. Every number in the tests is invented.

- **Component tests.** `WeightLogEditor.test.tsx`, in the existing jsdom style, covers:

  - the page without the Weigh-in section or rate form
  - opening a day, caret placement, Return, blur, Escape, unchanged values, an invalid number, future days, and Tab order
  - clearing and its Undo, the Undo of a new weigh-in and of a replace
  - a refusal keeping the typed text, and a CONFLICT refetch
  - a target edit sending rate 1.2 with its revision, and its Undo
  - an lb/wk edit, and the first week staying read-only
  - today's outline and its move at midnight, and the pre-fill and its blur rule
  - an injected row after the plan ends
  - Go to date inside and outside a phase
  - the picker, the colors, and two-decimal lb/wk

  `PlanEditor.test.tsx` checks the Plan section has no Weekly rate form.

- **UI check, setup.**
  - `next dev` on port 3019 against Neon child branch `br-super-sky-ak8qgdd4` of `weight-log-import-test`, on host `ep-super-mud-akrbdob9`, which is neither production nor the parent. Every psql call went through a wrapper that refused any other host.
  - Before any shot, I replaced every weigh-in, target, original target, and set point with synthetic values.
  - Sign-in used `OWNER_EMAIL="owner@example.test"`, a temporary user and session row, and `NEXTAUTH_URL=http://localhost:3019`. PostHog pointed at a dead local port.
- **UI check, results.**
  - The runs: headless Chromium with mobile emulation and touch at 390 px, Playwright WebKit with touch at 390 px, and Chromium at 1280 px, each in light and dark.
  - Every run loaded scrolled to this week (scrollY 249 on the phone, 113 at 1280) with today's empty cell outlined.
  - Today's cell opened with the muted 166.0, caret at 5 of 5, nothing selected. The input text was 16 px on touch screens and 12 px with a mouse, and it didn't overflow its cell.
  - A change from 166.0 to 166.7 on Wed Nov 4 showed "Changed Wed, Nov 4 from 166.0 to 166.7 lb." with Undo. Undo put it back ("Put Wed, Nov 4 back to 166.0 lb.").
  - `scrollWidth − innerWidth` was 0 in every state.
  - The page also has a recording of the loop on the phone at normal speed and slowed to 40%: tap today, edit the carry, Return, Undo.
- **Found by the UI check, now fixed.** At 52 px wide a touch cell clipped a 16 px "166.0" ("166.(" in Chromium, a cut first digit in WebKit). Touch cells are now 60 px. Also, React warned that the phase Select switched from uncontrolled to controlled. `main` has the same warning. The Select now starts at `""`, and the warning is gone from the rerun.
- **Cleanup.**
  - The dev server is stopped.
  - Child branch `br-super-sky-ak8qgdd4` is deleted, and its user and session rows went with it. `neonctl branches list` shows only production, `weight-log-import-test`, and the March import branch.
  - The worktree `.env.local` and the scratchpad files `db-url`, `session-token`, `branch-id`, and `q.sh` are deleted.
  - A grep of `.next`, `.sheet-check`, and the scratchpad finds no trace of the child host.

## Shortcuts

- The headless capture ran on Portable. Headless Playwright doesn't touch the screen, and the worker was at 3.5 to 5.0 per core.
- I didn't check on a real iPhone. WebKit at 390 px with touch is the nearest stand-in, and it can't show the keyboard, the decimal pad, or the page zoom.
- The UI check didn't exercise a server refusal, a target or lb/wk edit, Tab, or Go to date in a browser. The component tests cover those.

## Issues

- Fixed in the fix round: undoing the deletion of an excluded weigh-in used to bring it back counted.
- Fixed in the fix round: undoing an imported rate with more than two decimals used to restore it rounded to 0.01.
- Fixed in the fix round: a target edit could land up to 0.005 lb from the typed value.
- The iOS decimal pad has no minus key. A negative lb/wk keeps its minus because the cell opens with the current value, but a rate can't go from positive to negative on the pad alone.
- On a phone the floating status line sits behind the keyboard while a cell is open. It shows once the cell closes.
- While a just-saved cell keeps focus after Return, the grey focus ring hides today's red outline. The outline returns when focus moves on.
- At 1280 px the table still scrolls sideways inside its card, as it does on `main`, because the editor column is capped at 672 px.

## Ambiguities

- "Future days beyond tomorrow are not editable" could allow tomorrow. I stopped at today on the device clock, as the old form did. The server would take tomorrow by its UTC clock.
- The brief didn't say whether today's carried weigh-in should save when the cell loses focus. I made it save only on Return, as the old check button did, so a stray tap never records a weight.
- The brief asked for "a shared status line" without placing it. The accordion's `overflow-hidden` rules out a sticky line, and a line above the table would be off-screen on a phone once the table scrolls to this week.

## Judgment calls

- A phase's first-week target and lb/wk are read-only, because `planRateChange` has no previous week to measure from. Owner to confirm.
- Days after today aren't editable, including tomorrow. Owner to confirm.
- Today's carried value saves only on Return. Blur or Tab without typing saves nothing. Owner to confirm.
- The status line is a pill floating 1 rem above the bottom edge. It never touches the edge and only fades in, because Safari latches a solid toolbar strip under fixed UI at the edge. Owner to confirm.
- lb/wk now shows two decimals, since it is edited to 0.01. Owner to confirm.
- Touch cells are 60 px wide and taller than mouse cells, so a finger lands on the right one and a 16 px input fits. The phone table is about 56 px wider as a result. Owner to confirm.
- After a blur, a refused value stays in its closed cell, red with a dotted underline, rather than snapping back. Owner to confirm.
- Weeks outside every phase show in their own table under "Outside every phase", below the phase's table, only after Go to date picks one. Owner to confirm.

## Next steps

- Let the owner set a phase's starting target from the table, which needs a server edit that moves the first week's target.
- Check the table on the owner's iPhone: the decimal pad, the status line against the keyboard, and the sticky columns while scrolling sideways.
- Run the deep review (Codex, then a fresh Claude reviewer) if the owner wants one, since this slice writes to the database through existing mutations only.

## Fix round

The lead's fix round for #149, on the same branch. Commits:

- `42402d6b` Keep rates exact, restore deleted weigh-ins, and send the week before's average (server)
- `f5648ad5` Settle each cell's write on its own and undo deletes and rates exactly (page)
- `f20110a4` Describe exact rates and restoring a deleted weigh-in in the Weight Log doc

What changed:

1. **Overlapping saves (Devin, `WeekSheet.tsx:581`).** TanStack Query v5 runs a `mutate` call's own callbacks only for the hook's latest call. Every write in the table, including each Undo, now goes through `mutateAsync`, and a small `write(promise, done, fail)` helper settles that call's cell, status, and Undo. `busy` counts writes in flight instead of reading `isPending`, which also reflects only the latest call, so Undo stays disabled until every write is back. The component test mock had hidden this, because it ran every call's callbacks. It now runs them only for the latest call, as v5 does, and `mutateAsync` returns a promise that `settle` and `refuse` resolve. There are two new tests. In one, the second save lands first, the first cell stays saving and Undo stays disabled, then the first lands, and both cells settle with their own status and Undo. In the other, a refusal and a save settle on their own cells. Run against `3cdfc707`'s `WeekSheet.tsx`, both fail.
2. **`bareRow` Change (Devin, `sheet.ts:266`).** `weightLog.week` now reads from the previous Monday through Sunday in the same query and returns `previousAverage`, the trimmed mean of the week before's counted days, by the loader's rule. `bareRow` takes it and sets Change to the week's average minus it, as `buildWeekTable` does, or null when either is missing. A router test checks the wider date range and that an excluded day in the previous week stays out of its average. A unit test checks Change on a bare row.
3. **Excluded undo.** I took the lead's suggested design: a new `restoreWeighIn` on `ownerProcedure` takes `{date, pounds, excluded}`. It holds the shared plan lock, as `upsertWeighIn` does, and inserts with `on conflict ("date") do nothing`. If no row comes back, the date has a weigh-in again, and it refuses with CONFLICT ("That day has a weigh-in again, so the undo left it as it is."). It can never change the flag on an existing row, so decision 14 still holds for saves. `SheetChange` now records the day's `excluded` flag, and `undoOf` sends `restoreWeighIn` for any undone delete, excluded or not. The status line reads "Put Tue, Jan 8 back to 100.4 lb, still left out of the weekly average." A CONFLICT refetches the weigh-ins. Router tests cover the SQL and its parameters, the CONFLICT with a rollback, and the input checks. Component tests cover an excluded and a counted restore, and the CONFLICT.
4. **Rate precision.** The router's `poundsPerWeek` input now transforms with `cleanTarget` (six decimals) instead of rounding to 0.01. That covers `changeRate` and `startPhase`. `targetEdit` sends `cleanTarget(T − previous)`, so the server's `cleanTarget(previous + rate)` is T. `undoOf` sends the old rate through `cleanTarget`, not `roundHundredth`. A typed lb/wk is still rounded to 0.01, and the page still shows two decimals. Fix-F's rounding tests cover weigh-ins, set points, and starting targets, and none of them pinned the rate, so none needed to change. The contract change is in the docs: "Targets and rates keep six decimals." New tests: a router test that 0.3333334 lb/wk writes targets 100.333333, 100.833333, and 101.333333; a unit test that a target typed over a six-decimal previous target round-trips to exactly the typed value; and a component test that a target edit sends 0.666667 and its Undo sends the imported 0.333333.

Verified:

- `heavy -- pnpm verify` passed on Portable in 3m44s: 726 test files, 6,490 tests. tsc ran clean before the push. `pnpm exec prettier --check` passes on every file the branch touches. `origin/main` still hasn't moved since `c1de0296`.
- I didn't rerun the headless UI check. This round's page changes are in how writes settle and in what Undo sends. The table's layout and styling didn't change. The component tests cover the new behavior.
- I updated the PR description with a Fix round section and removed the three fixed known limits.

Left as they are, for the owner: the iOS decimal pad has no minus key, the status line sits behind the keyboard while a cell is open, and the focus ring covers today's outline after Return.

## Layout round

The owner's layout changes for #149, from the lead, on the same branch. Commits:

- `cda1ea67` Move Plan, Set points, and the Weeks controls into the editor's header
- `0befe40d` Describe the editor's header and pages in the Weight Log doc

What changed, by ask:

1. **Plan and Set points in the nav.** I gave them their own pages, `/weight-log/edit/plan` and `/weight-log/edit/set-points`, at every width. A popover on wide screens would have meant two ways to reach the same forms and a second set of tests. Pages are simpler, and the forms need the room. The owner gate moved from `page.tsx` to `ownerPage.tsx`, and all three pages call it, so each reads the session on the server before rendering. The new `EditorHeader.tsx` holds the title, then a nav with Weeks, Plan, Set points, and Sign out. Each link is a ghost Button with an `aria-label`, and the current page carries `aria-current="page"` and the accent fill. Below 640 px the links show only their icons, and a shadcn Tooltip names each one. Nothing uses `title=`. PlanEditor and SetPointsEditor are the same forms as before, now in a new `EditorSection` card, which is always open, with a heading. They sit in a 672 px column.
2. **No back arrow.** The title copies the chart's own header: the barbell icon at `text-2xl md:text-4xl`, turning into an arrow only on hover or focus. The link's accessible name is "Weight Log, back to the chart".
3. **Weeks doesn't fold.** The table renders in `EditorSection` with no heading. It's still a region named "Weeks" for screen readers.
4. **Phase picker and Go to date in the header.** The header leaves an empty slot (`headerSlot.ts`), and WeekSheet portals its two controls into it with `createPortal`. Without the slot, as in the component tests, they render above the table. At 1024 px and wider the header is one row: title on the left, then the picker, Go to date, the links, and Sign out on the right. Narrower, the picker and Go to date take a second row, with the picker filling the width. Below 640 px, Go to date is a calendar icon with a Tooltip. The native date input still lies over it, so a tap opens the phone's picker. The page column grew from 672 px to 1024 px. At 1280 px the whole table now fits in its card, where before it scrolled sideways inside it.
5. **No auto-scroll.** `cellRef` only hands focus back after Return or Escape. Today's cell keeps its red outline.

Tests:

- `page.test.tsx`: each of the three pages shows its own editor, lists Weeks, Plan, and Set points in order, and marks only its own link with `aria-current`. Each page shows only the sign-in button without a session. Only the Weeks page has the slot. There's no `title=` anywhere. The title's arrow is hidden until hover.
- `WeightLogEditor.test.tsx`: the Weeks view has no Length form, no set points, no fold button, and no heading. The Plan view has Length and Start a phase. The Set points view has its heading. With a slot in the document, the picker and Go to date land in it and not in the table's region. Nothing calls `scrollIntoView` on load, and today's cell still has `aria-current="date"`.

Verified:

- `heavy -- pnpm verify` passed at `0befe40d` on Portable in 3m44s: typegen, tsc, eslint, vitest (726 files, 6,503 tests), artwork, search index, and meadow. tsc ran clean before the push, and prettier passes on every touched file. The first run, before the commit, hit one `unbound-method` lint error in my new test, which I fixed. It also hit a 5-second timeout in `insectSteering.test.ts`, a scene test this branch doesn't touch. It passed on the rerun and in the full run.
- UI check: `next dev` on port 3019 against a new child of `weight-log-import-test`, host `ep-hidden-heart-aka36m0n`, which is neither production nor the parent. Before any shot I replaced every weigh-in, target, original target, and set point with synthetic values, using the same recipe as the first check. Sign-in used `owner@example.test` and a temporary user and session row. Headless Chromium (mobile, touch) and WebKit at 390 px, and Chromium at 1280 px, each in light and dark.
  - Every page has `scrollWidth − innerWidth = 0`, and no header part leaves the screen.
  - At 390 px the Weeks header is two rows: the title and nav on top, the picker (x 12 to 334) and Go to date (x 342 to 378) below.
  - At 1280 px it's one row: title, picker, Go to date, nav.
  - Plan and Set points have one-row headers at both widths.
  - Weeks opens with `scrollY` 0.
- The recording shows a 390 px phone going to Plan, Set points, and back to Weeks through the nav, then opening the picker, then editing a cell and undoing it.
- ParaDev page: version 2 of https://app.superset.sh/page/weeks-sheet-ui-check-ksuvat, with the header, Weeks, picker, edit, outline, Plan, and Set points shots, plus the recording at normal speed and 2.5 times slower. I didn't open it in the sidebar.
- Cleanup:
  - The dev server is stopped. Child branch `br-broad-truth-ak49paa8` is deleted, and the user and session rows went with it.
  - The worktree's `.env.local` and the session token file are deleted.
  - Grep finds no trace of the child host in `.next`, the check folder, the scratchpad, or the page folder.
  - Someone else's cleanup had already removed this round's `branch-id`, `db-url`, and `q.sh` from the shared scratchpad. My `neonctl branches get` with the empty id read the default branch. It read only, and nothing was written. I then deleted the child by its explicit id after checking its name and parent.

Judgment calls, for the owner:

- Pages at every width, not a popover on wide screens.
- Plan and Set points keep a visible heading under the header, because a phone's nav shows only icons. Weeks has none.
- Sign out stays icon-only at every width. The page links show their names from 640 px.
- The page column is now 1024 px for all three pages. The Plan and Set points forms stay in a 672 px column, left-aligned under the title.

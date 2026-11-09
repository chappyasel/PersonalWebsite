# Weight log

`/weight-log` is a public, read-only chart available by direct link, with no password required. It stays out of site navigation, search, and sitemaps. A dedicated 1200 × 630 share image and Open Graph / Twitter metadata describe the chart without including measurements. It opens on the full history with the seven-day trend, future weight plan, and all three body-fat layers enabled. The Layers control groups the other series into Weight and Body fat, with short group labels and a compact active legend. Future weight and future body fat have independent toggles; either can appear without the other or without historical body fat. The seven-day trend and main body-fat estimate use solid lines. A lighter dashed line identifies planned weight. Weight lines retain phase colors; body-fat lines, measured markers, and percentage-axis labels use purple. Lighter purple and different dash patterns distinguish early estimates and future body fat. Hidden series do not expand either axis. Layers and About open in privacy-masked shadcn popovers beside the phase and date controls. Layers has an explicit Close button, and selections persist when the panel closes. Popup state lives in the layer picker so opening or dismissing it does not rebuild the chart. Chart data is memoized independently of layer selection, and the DEXA plot and calendar skip unrelated parent updates. Range presets share one select. On mobile, range, Layers, and a Settings icon occupy one row; phase, exact dates, and calculation notes sit inside Settings. A small Weight / Body fat key replaces the expanded legends, with the full legend available in a popover. Reset zoom appears only when available on mobile. Desktop retains inline filters and expanded legends. The chart has a 600 px minimum width with horizontal touch scrolling on narrow screens. About this chart holds the calculation notes. Dragging across the plot with a mouse or pen zooms to the selected dates in either direction. Reset zoom restores the range before the first drag; manual date or phase changes establish a new range. Escape cancels a drag, and touch scrolling stays available. A horizontal hover guide snaps to the nearest visible series at the hovered date and labels its value in pounds or percent. Mouse clicks have no focus outline; keyboard focus remains visible. Phase, date, and range controls live inside Bodyweight over time and affect only that chart. The DEXA panel and year calendar retain their full histories. The page uses the same theme background and shared shadcn cards as Weightlifting, with lighter cards on the dark background. Both pages use 12 px outer padding on phones and 12 px card padding, with 8 px horizontal padding for the weight chart. Larger screens retain their existing spacing. Controls, checkboxes, and accordions use shared shadcn components, without summary-stat cards. Weightlifting and Weight Log share the collapsible section component, with the heading outside the card. The header shows elapsed years of recorded history and the date of the latest weigh-in change, labelled Updated. Drag instructions remain available to assistive technology without visible helper text. DEXA scan data, selected-scan details, bulk scenarios, and calculation notes are collapsed by default. Numeric scan-table cells use a blue-white-red scale independently for each metric; missing values remain uncolored.

The chart includes daily readings, workbook weekly averages, recorded targets, original targets, set points, a seven-day trend, a twelve-month rolling average, planned future weight, and a DEXA-based body-fat estimate. Bulking is red, cutting blue, and maintenance yellow. DEXA total-body checkpoints appear below it. Other scan methods are outside this version. The owner records and corrects weigh-ins on `/weight-log/edit`, described under Owner page.

The full-history calendar shows all 12 months of a selected year, with Monday-first weeks. Days after the last weigh-in show planned weights in faint gray when a dated projection exists, using the same daily interpolation as the chart. The year picker extends through the plan. Historical gaps and days without a plan remain blank; actual weigh-ins take precedence. Planned values do not affect the weigh-in count or color scale, and their tooltips identify them as planned weights. Its blue-white-red scale uses the minimum, midpoint, and maximum of all recorded weigh-ins. Changing the year or chart filters never rescales those colors. Hover, focus, or tap a recorded day for a formatted tooltip containing its weight, weekly average, target, trend sample count, annual average, and body-fat estimates. Tapping the open day again or pressing Escape closes it. There is no separate day-details footer or visible color-scale legend. Tooltip portals carry the same privacy masking classes as the page. Calendar state stays in memory.

Main-chart data lines use phase colors, with solid weekly averages, long-dashed seven-day trends, dotted twelve-month averages, short-dashed targets, dotted original targets, and longer-dashed future plans. Body-fat estimates use dash-dot lines between scans, dotted lines after the latest scan, and round dots for future values. Global set-point guides stay neutral. Continuous lines change color at dated phase boundaries; when phase templates overlap, the latest start takes precedence. Dates without an assigned phase are gray. Each phase's separate weekly and target lines keep its own color. SVG gradients use the resolved time axis so cropping, resizing, flat lines, and sparse data retain the same phase boundaries.

## Storage

The data lives in Postgres, in seven `weight_log_` tables defined in `src/server/db/schema.ts` (migration `0023_weight_log.sql`). The `wl_` prefix already belongs to weightlifting.

- `weight_log_weigh_ins`: one row per date, with pounds and an `excluded` flag. Weigh-ins are independent of phases and belong to whichever phase covers their date.
- `weight_log_phases`: kind (`bulk`, `cut`, or `maintenance`), a Monday start, and a Sunday end. A null end marks the running phase. Phases never overlap. There is no name column: the site derives names like "Bulk Aug '26 - Aug '27" from kind and dates, and a running phase uses its last planned week as the end.
- `weight_log_planned_weeks`: one row per Monday, with its phase, target, and original target.
- `weight_log_set_points`: the set-point guides, by position.
- `weight_log_scans`: DEXA scans with every workbook column, including bone mineral content, the regional panel, BMD, T- and Z-scores, the A/G ratio, visceral fat, and the conditions note. The regional panel exists for only some scans, so its columns are nullable.
- `weight_log_body_fat_recollections` and `weight_log_strength_history`: the historical context behind the early body-fat estimate.

`getWeightLog()` in `src/lib/weight-log/data.ts` reads every table in one repeatable-read, read-only transaction and builds the `WeightLog` DTO in `records.ts`. Weeks with weigh-ins but no planned row still appear, with no target. `importedAt` and `sourceModifiedAt` both report the latest weigh-in change.

## Owner page

`/weight-log/edit` is where the owner records weigh-ins. Signed out, it shows only the Google sign-in button. Signed in as `OWNER_EMAIL`, it shows a weigh-in form, the week around the form's date, and the weekly table. Every read and write goes through the `weightLog` tRPC router (`src/server/api/routers/weightLog.ts`), and every procedure there is on `ownerProcedure`. `weightLogOwnerOnly.test.ts` and `ownerDataBoundary.test.ts` enforce both rules.

- The form's date starts at today in the device's time zone, so the editor renders only in the browser. The pounds field takes one decimal place, and the server rounds to one decimal place as well. A date holds at most one weigh-in, so saving a date that has one replaces its pounds and keeps its `excluded` flag. The server refuses dates later than tomorrow by its UTC clock.
- The week grid shows Monday to Sunday for the form's date. Tapping a day moves the form to that date and fills in its weigh-in, if any. A date with a weigh-in offers Delete, which asks once before removing it. Deleting a weigh-in drops its `excluded` flag with it.
- The weekly table follows the workbook's phase tabs: weekly average, change from the previous calendar week's average (across a phase boundary), target, average minus target, lb/wk (target minus the previous week's target in the same phase), original target, and target minus original target. It opens on the running phase, and a picker lists older phases by their derived names. Weeks past the plan with weigh-ins appear with no target. Tapping a week moves the form and grid to its Monday.

The public chart is `force-dynamic` with no shared cache, so a saved weigh-in appears there on the next request. Strength at Bodyweight caches its analysis for five minutes (`src/server/queries/weightliftingPareto.ts`), so a new weigh-in reaches it within five minutes.

## Local workspace setup

There is nothing to restore. A workspace reads whichever database its `DATABASE_URL` points to. The repository's `.env` points at production, so local development shows the real chart, and any write from a local script reaches production. Point `DATABASE_URL` at a Neon branch before trying the import or anything else that writes.

## Importing the workbook

The workbook stays in iCloud as the archive. The import is a one-time move into the database, run on cutover day after the morning weigh-in. Weigh-ins after that go in through `/weight-log/edit`, and a reading entered in the workbook after the import must be re-entered by hand.

The import writes everything in one transaction. `--expect-host` must match the host in `DATABASE_URL`, so the command cannot write to a database you did not name. It refuses to run when any `weight_log_` table already holds rows. `--replace` deletes the existing rows first, inside the same transaction, but refuses while the database holds a weigh-in whose date the workbook export lacks or whose pounds differ from it. After cutover those are site entries, and the workbook cannot restore them. The refusal names their count and dates. `--discard-site-entries` overrides it. `--dry-run` runs every check, including the `--replace` guard, in a read-only transaction and writes nothing. `--history-context` is the old encrypted companion holding the recollection and strength summaries, decrypted in memory with `NEXTAUTH_SECRET`; a plain JSON file also works. The import prints only counts, the running phase's name, and the dates of trimmed weeks.

On the way in it applies the phase rules. Every phase must start on a Monday and be a bulk, cut, or maintenance. Each phase ends the day before the next one starts, and its planned weeks from that day on are dropped when they hold no weigh-ins. A dropped week that holds a weigh-in stops the import. A date has at most one weigh-in, and the one excluded reading keeps its flag.

The parity check is read-only. It runs `import_workbook.py` on the same workbook the import read and requires exact equality with that export for every weigh-in, exclusion, scan value (including the added scan columns), set point, target, original target, and weekly average in the weeks kept. The recollection and strength readings must match the old encrypted snapshot, which is their only other copy. It lists decision 26's intended differences by name: the trimmed weeks and shortened phase ends, the derived phase names, the removed `other` kind, and the added scan columns. Anything else is printed as a date and field name, never a value, and makes it exit 1. It also compares the database with the old snapshot and prints those differences without failing, because the snapshot changes only when the Hermes job uploads. Pass parity the same `--exclude-sheet` values the import's export used. Its tests use synthetic data and run in `pnpm verify`.

### Cutover day

The plan's "Cutover day" list is the order of the day. These are the commands for its database steps. Run them from a checkout of the cutover branch whose `.env` holds production's `DATABASE_URL` and `NEXTAUTH_SECRET`, in a shell where `DATABASE_URL` is unset, because an exported value overrides `.env` for every command below. The `.enc` files exist only in the main checkout, so pass them by absolute path.

```sh
unset DATABASE_URL
WEIGHT_WORKBOOK="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Spreadsheets/Weight Log.xlsx"
ENC=/Users/chappyasel/Desktop/Repos/PersonalWebsite/data/weight-log
```

1. Check that production has nothing pending except 0023. The script reads `drizzle.__drizzle_migrations` and the journal, prints the host, and must print `Pending: 0023_weight_log` and exit 0. Stop if anything else is pending. Confirm the host is production's, not a Neon branch.
   ```sh
   node --env-file=.env --import tsx scripts/weight-log/pending-migrations.ts
   ```
2. Apply the migration.
   ```sh
   pnpm db:migrate:prod
   ```
3. After the owner has entered the morning weigh-in in the workbook, dry-run the import, then run it. Set `HOST` to the host step 1 printed.
   ```sh
   set -o pipefail
   python3 scripts/weight-log/import_workbook.py "$WEIGHT_WORKBOOK" \
     | node --env-file=.env --import tsx scripts/weight-log/import.ts \
         --history-context "$ENC/history-context.enc" \
         --expect-host "$HOST" --dry-run
   ```
   Run the same command again without `--dry-run`.
4. Run the parity check. It must end with `Unexpected differences from the workbook export and historical context: 0` and exit 0. The informational snapshot section can list weigh-ins entered in the workbook since the last Hermes upload, and the weeks that hold them. Nothing else should appear there.
   ```sh
   node --env-file=.env --import tsx scripts/weight-log/parity.ts \
     --workbook "$WEIGHT_WORKBOOK" --snapshot "$ENC/snapshot.enc"
   ```
5. Once the site holds an entry, never revert the cutover PR. A revert brings back the S3 reader, which shows the last snapshot without the site's entries, and nothing refreshes it once the Hermes job is off. Roll forward with a fix, or use Neon point-in-time restore.
6. Once cutover passes, delete the cutover scripts in a follow-up PR: `import.ts`, `import-plan.ts`, `parity.ts`, `parity-check.ts`, `pending-migrations.ts`, `sources.ts`, and their tests. Keep `import_workbook.py`, which the DEXA image refresh below still uses. Also delete the main checkout's `data/weight-log` folder, the S3 snapshot object, and the Neon branch `weight-log-import-test`.

### Refreshing the training-room DEXA image

The training room also shows a committed PNG. The database updates the live chart, estimates, and bulk scenarios, but does not rebuild this image. Render it from the workbook with the analysis repository's Python environment:

```sh
~/Desktop/Repos/WeightliftingApp-AnalyzeData/venv/bin/python \
  scripts/generate-training-scene-figures.py --dexa-only \
  --workbook "$WEIGHT_WORKBOOK"
```

This command validates the workbook with the website importer and uses the analysis repository's existing DEXA chart renderer. It keeps the imported data in memory and replaces only `public/images/stacks/training-figures/dexa-lean-mass-vs-bodyweight.png`. Review the rendered image before deploying it through the normal website release. No other training figures or analysis-repository files change. A scan taken after cutover is not in the workbook, so this image needs a database source before the next scan.

The October 7, 2026 refresh includes ten scans. The workbook calculates body fat from its rounded masses; its latest value rounds to 13.9%, while the BodySpec report prints 14.0%. The import preserves the workbook value. No Field Note is added for a data refresh; quality-bar test 2 requires a distinct semantic completion beyond ordinary viewing.

## Automatic refresh

There is none. The chart reads the database on every request, so a weigh-in shows on the next page load. The Hermes job "Weight Log Refresh" (`7bd64831c4b3`, `~/.hermes/scripts/cron/weight_log_refresh.py`) used to import the workbook and upload an encrypted snapshot every morning. It is disabled on cutover day and removed a week later.

## Workbook importer

The importer keeps actual date cells, daily weights, phase boundaries, target values, and the days included in each weekly calculation. It checks recomputed averages against Excel's saved values. Formula-specific exclusions survive import; excluded readings remain visible. Nonnumeric daily annotations are counted and skipped. No formulas are evaluated as code. DEXA values come from the `BF%` sheet: the total-body row with reported body-fat overrides, bone mineral content, and the conditions note, plus the regional, bone-density, and visceral-fat panel for the scans that have it. A zero in that panel is kept as zero.

Dates come from workbook cells, even when a copied tab has a newer name. To omit an unfinished tab after reviewing it, pass `--exclude-sheet "Sheet name"` to the importer. Correcting a mislabeled date before the import requires changing the source workbook and importing again.

## Analysis choices

The seven-day trend adapts the trimmed mean in `WeightliftingApp-AnalyzeData/src/analysis_utils.py` for sparse logging. At each weigh-in, it uses available readings from that day and the preceding six calendar days. With three or more readings, it removes one highest and one lowest. It linearly bridges trend anchors at most 14 days apart. Longer gaps remain empty, and the observed trend never extends past the last weigh-in. Selecting a calendar day shows its trend sample count. Raw readings and workbook weekly means remain separate series.

The twelve-month average is the arithmetic mean of recorded weigh-ins in the interval after the same calendar date one year earlier through the current day. February 29 uses February 28 as the prior-year boundary. It uses partial history at the beginning, omits missing readings, leaves empty twelve-month windows blank, and stops at the last actual weigh-in. Like the seven-day trend, it is computed before filtering.

The date axis uses January 1 markers for ranges of at least two years, month or quarter starts for medium ranges, Mondays for shorter ranges, and days for close views. Each marker has a vertical gridline. The weight grid uses one-pound steps with five-pound major lines and labels; its bounds follow only visible weight series and set points.

Set points come from consecutive cells beneath the aggregate sheet's `Set Points` header. Future weight uses the workbook's explicit weekly targets, interpolated in time within each phase. It is a plan, not a trend extrapolation. The main chart distinguishes these dashed future lines from historical targets and marks the last weigh-in. Original target values remain available as a separate comparison.

The body-fat axis starts at 4% and ends at the next whole percentage above the visible values, with a quarter-point minimum margin. Hidden projections do not expand its range. When only body fat is visible, horizontal gridlines and labels use 1% steps, with stronger lines and labels at multiples of 4%. Missing measurements never render markers.

The body-fat overlay uses a transparent visualization heuristic. At scan anchors, fat-free mass equals scan weight multiplied by one minus the reported body-fat fraction. This includes bone and preserves reported percentage overrides. Between scans, fat-free mass interpolates linearly in time. Smoothed scale weight receives an interpolated offset between the two scan dates, making the curve meet both DEXA readings. Missing smoothed weight leaves a gap. Earlier dates have a separate optional layer described below. This is retrospective interpolation, so adding a later scan can revise estimates between scans.

### Early body-fat estimates

The default-off `Early body fat · exploratory` layer reconstructs history between a provisional recollection and the first usable DEXA. It uses phase colors, a faint dotted center line, and a shaded envelope of alternative histories. Recollections are labeled separately from scans. Hovering shows the center and full range. The percentage axis retains its 4% floor, clipping lower band values visually without changing them. Fitting happens before date filters and zooming.

The DTO's optional `historicalContext` field, built from the recollection and strength-history tables, contains a dated body-fat range, its provenance note, and comparable strength readings. A recollection needs a matching scale weight to establish starting fat-free mass. An approximate date must be disclosed in the note, especially when the recollection predates the first recorded weight. Missing context produces no early curve. No personal assumptions or fitted values belong in source code or test fixtures.

`historical-body-fat.ts` converts each end of the starting range into fat-free mass using the weight at that date. The center line starts at the midpoint of the recollection and reaches the first DEXA's reported composition. Fat-free mass can change over time, so revisiting the same weight no longer implies the same body composition. The scale correction fades from zero at the starting recollection to the scan-to-scale difference at the DEXA. Missing smoothed weights remain gaps, and dates outside the two anchors receive no early estimate.

The central progress curve is half calendar time, one quarter cumulative weight gain during recorded bulks, and one quarter sustained strength progress. Strength uses the median session performance within 90 days on either side of each date, requiring at least three sessions per lift. Only comparable lifts with at least 5% endpoint improvement participate; at least two must be available at a date. Normalized log progress is bounded from zero through one, and a running maximum reduces the effect of temporary performance dips. Unsupported dates fall back to time. Strength only distributes the assumed endpoint change over time; it does not convert lifting performance into pounds of muscle. The imported performance summary uses comparable variations and low-repetition sets.

A 28-day mean of available weight trends supplies cycle changes. The existing DEXA gain/loss partition model assigns a possible fat-free component to those changes. For any progress path `p`, the cycle adjustment is `cycleShare * (cumulativeCycleFFM - p * finalCycleFFM)`, keeping both endpoint constraints intact. The center uses half this adjustment. This permits changes through bulks and cuts without replacing the endpoints with the later training-period regression.

The shaded envelope spans both ends of the recollection, calendar, front-loaded, delayed, bulk-informed, and strength-informed progress paths, zero/half/full cycle adjustments, and a DEXA endpoint sensitivity of plus or minus two percentage points. Impossible compositions are omitted. The center is always included in the envelope. This is a set of conditional scenarios, not equally likely outcomes or a confidence interval. The former backward scan-prediction score is removed because it did not validate reconstruction of earlier muscle gain. No numerical probability or coverage is assigned to this envelope.

Strength and lean-mass changes can have weak associations over a training block, as shown in [Bagheri et al.](https://pubmed.ncbi.nlm.nih.gov/39206316/). Hydration and glycogen also affect DEXA lean-mass measurements, as shown in [Toomey et al.](https://pubmed.ncbi.nlm.nih.gov/28204901/). These findings explain why performance is supporting evidence and why the paths remain explicit assumptions. Neither study validates this reconstruction.

The recollection and strength summaries live in `weight_log_body_fat_recollections` and `weight_log_strength_history`, apart from the weigh-ins. The import fills them from the old `history-context.enc` companion and fails on invalid or undecryptable context rather than silently dropping it. When the DTO builder finds several recollections, it uses the earliest.

After the last scan, the model uses `FFM = anchor FFM + k * weight change`, the relationship in the analysis repo's `src/dexa/forecast.py`. Separate gain and loss values of `k` are medians of consecutive scan ratios. Intervals with less than 2 lb of change, more than 365 days between scans, or a ratio outside zero to one are excluded. With fewer than two usable intervals in a direction, FFM stays constant and the interface states that fallback. Planned future weight drives a separate dashed body-fat projection. Impossible percentages are omitted rather than clamped. These are heuristic estimates, not daily measurements or validated predictive intervals. The main time-series chart does not reproduce the analysis repo's bootstrap forecast or the workbook's Bull/Bear scenarios.

The DEXA panel plots lean soft tissue against bodyweight, adapting `WeightliftingApp-AnalyzeData/src/dexa/calculations.py` and `src/dexa/charts.py`. Numbered scans follow chronological order, with red gain arrows and blue loss arrows. The dashed least-squares trend uses all scans with lean mass; a dotted line connects the latest two complete consecutive scans. Vertical bars show signed residuals. The panel preserves scan numbers, interval efficiencies, and the full-history fit independently of the bodyweight chart filters. Missing lean mass leaves a gap. Selecting or focusing a scan shows its values and interval efficiency, defined as lean gain divided by weight gain for bulks and one minus lean loss divided by weight loss for cuts. No ratio is shown for unchanged weight.

Body-fat contours use one percentage-point steps and hold bone mineral content constant. The database stores each scan's bone mineral content, but the DTO does not carry it yet, so the panel infers it from the latest scan’s weight minus lean and fat mass. It omits contours if those components are missing or the remainder is nonpositive. Reported body-fat overrides do not change this reference. The measurements table retains scans with missing lean mass.

The DEXA chart also projects the current bulk to 240 lb, anchored at the latest scan. A checkbox toggles the overlay; it appears only when the date range includes that scan. The expected path is the median, with a ribbon from the 2.5th to 97.5th percentiles and best/expected/worst endpoint values. Best and worst are percentile scenarios, not absolute limits. Body-fat scenarios use the same inferred bone mass as the contour lines.

`src/lib/weight-log/dexa-projection.ts` adapts the block-bootstrap mean plus future-interval residual from the analysis repo's `src/dexa/forecast.py`, using lean soft tissue directly. It uses consecutive positive-weight scan intervals with at least 2 lb gained, at most 365 days between scans, and complete lean measurements. Observed ratios are not clipped. Intervals sharing a scan are resampled together. Twenty thousand seeded draws combine the resampled mean with one observed centered residual to capture variation in a future bulk as well as uncertainty in the fitted average. The chart requires at least three usable intervals across three scan groups. It omits degenerate or physically invalid bounds and targets more than 60 lb beyond the anchor.

This is a conditional model prediction interval, not a validated 95% coverage claim. It holds the latest scan exact, includes observed scan variation in the historical ratios, and adds no separate measurement-error model. The ribbon therefore narrows to zero at the anchor. It assumes constant lean gain per pound and that the next bulk resembles prior bulks. The UI states the sparse interval count, exclusions, and these limitations. The distinction between a fitted-mean confidence interval and uncertainty for a future outcome follows [NIST's prediction-interval guidance](https://www.itl.nist.gov/div898/handbook/pmd/section5/pmd512.htm).

The calculation tests verify scan-anchor agreement, sparse sampling, gap limits, separate observed and planned values, and fallback behavior. All model inputs come from the Weight Log tables. Filtering the chart never recalibrates the model or changes its historical context.

Workbook weekly means use available readings in the recorded weekly range, trimming one extreme at each end only when at least three remain. The chart displays each weekly mean across that week. It preserves empty calendar weeks rather than drawing through missing history. The DEXA panel follows the analysis project's distinction between lean soft tissue and bone mineral content; it does not substitute fat-free mass for lean mass.

## Access and storage

- The page and server-only data loader allow anonymous reads. There is no public data API or static data import.
- Production and local development read the `weight_log_` tables at request time through the site's existing `DATABASE_URL`. No other credential is involved, and no measurement is stored in the repository, S3, or build output.
- The route is dynamic, uses no shared data cache, and sets private/no-store, noindex, no-referrer, and frame-denial headers. Metadata contains no measurements. The route is absent from public search and sitemaps. No chart state or readings go into analytics, URLs, or browser storage.
- `pnpm check:weight-log-boundary` runs after builds. It fails if the route was prerendered, which would freeze measurements into build output, if a workbook entered the Git index, public assets, or a server file trace, or if the chart DTO entered public assets.
- Strength at Bodyweight reads the same tables through `getWeightLog()`, and `pnpm refresh:lifting-pareto` reads them directly.

The server-only data and DTO boundary follow the [Next.js data-security guidance](https://nextjs.org/docs/app/guides/data-security).

## Verification and Field Notes

Use the Python importer tests and the focused Vitest tests under `src/lib/weight-log/` and `src/app/weight-log/`. Fixtures contain synthetic values. No browser automation is needed for these checks.

No Field Note is awarded. Loading the chart fails quality-bar test 2: the qualifying action would be a raw access event, without a separate semantic discovery. No private measurements or viewing history are added to achievement storage.

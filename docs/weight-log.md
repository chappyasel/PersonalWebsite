# Weight log

`/weight-log` is a read-only chart behind the existing private-page password and signed access cookie. It opens on the full history. Users can select dates or a phase, toggle chart series, and inspect exact weigh-ins in a year calendar. DEXA values also have a table.

The chart includes daily readings, workbook weekly averages, recorded targets, original targets, set points, a seven-day trend, planned future weight, and a DEXA-based body-fat estimate. Bulking is red, cutting blue, and maintenance yellow. DEXA total-body checkpoints appear below it. Other scan methods and editing are outside this version.

The full-history calendar shows all 12 months of a selected year, with Monday-first weeks and blank days for missing readings. Its blue-white-red scale uses the minimum, midpoint, and maximum of all recorded weigh-ins. Changing the year or chart filters never rescales those colors. Hover, focus, or tap a recorded day for its weight and trend; selecting it also shows weekly and body-fat details. Calendar state stays in memory.

Main-chart data lines use phase colors, with solid weekly averages, long-dashed trends, short-dashed targets, dotted original targets, and longer-dashed future plans. Body-fat estimates use dash-dot, dotted, and long dash-dot patterns for between-scan, post-scan, and future values. Global set-point guides stay neutral. Continuous lines change color at dated phase boundaries; when phase templates overlap, the latest start takes precedence. Dates without an assigned phase are gray. Each phase's separate weekly and target lines keep its own color. SVG gradients use the resolved time axis so cropping, resizing, flat lines, and sparse data retain the same phase boundaries.

## Refreshing the snapshot

Run from the website repository. The importer writes sensitive JSON to stdout, so always pipe it directly into the encryptor. The source workbook stays outside the repository.

```sh
set -o pipefail
python3 scripts/weight-log/import_workbook.py "$WEIGHT_WORKBOOK" \
  | node --env-file=.env --import tsx scripts/weight-log/store.ts
node --env-file=.env --import tsx scripts/weight-log/store.ts --upload
```

`WEIGHT_WORKBOOK` is the path to the local workbook. The first command validates weekly calculations and writes an encrypted, ignored development snapshot. The second uploads that ciphertext with a private ACL and verifies the stored bytes and decryption. Neither command prints measurements or secrets. There is no automatic sync.

The importer keeps actual date cells, daily weights, phase boundaries, target values, and the days included in each weekly calculation. It checks recomputed averages against Excel's saved values. Formula-specific exclusions survive import; excluded readings remain visible. Nonnumeric daily annotations are counted and skipped. No formulas are evaluated as code. DEXA values come from the total-body section of the workbook, including reported body-fat overrides.

Overlapping phases retain separate chart series. A blank template cannot replace another phase's recorded weigh-ins. Dates come from workbook cells, even when a copied tab has a newer name. To omit an unfinished tab after reviewing it, pass `--exclude-sheet "Sheet name"` to the importer. Correcting a mislabeled date requires changing the source workbook and importing again.

## Analysis choices

The seven-day trend adapts the trimmed mean in `WeightliftingApp-AnalyzeData/src/analysis_utils.py` for sparse logging. At each weigh-in, it uses available readings from that day and the preceding six calendar days. With three or more readings, it removes one highest and one lowest. It linearly bridges trend anchors at most 14 days apart. Longer gaps remain empty, and the observed trend never extends past the last weigh-in. Selecting a calendar day shows its trend sample count. Raw readings and workbook weekly means remain separate series.

Set points come from consecutive cells beneath the aggregate sheet's `Set Points` header. Future weight uses the workbook's explicit weekly targets, interpolated in time within each phase. It is a plan, not a trend extrapolation. The main chart distinguishes these dashed future lines from historical targets and marks the last weigh-in. Original target values remain available as a separate comparison.

The body-fat axis starts at 4% and ends at the next whole percentage above the visible values, with a quarter-point minimum margin. Hidden projections do not expand its range. When body fat is visible, horizontal gridlines and labels use 1% steps, with stronger lines and labels at multiples of 4%. Missing measurements never render markers.

The body-fat overlay uses a transparent visualization heuristic. At scan anchors, fat-free mass equals scan weight multiplied by one minus the reported body-fat fraction. This includes bone and preserves reported percentage overrides. Between scans, fat-free mass interpolates linearly in time. Smoothed scale weight receives an interpolated offset between the two scan dates, making the curve meet both DEXA readings. Missing smoothed weight leaves a gap. No estimate is made before the first DEXA. This is retrospective interpolation, so adding a later scan can revise estimates between scans.

After the last scan, the model uses `FFM = anchor FFM + k * weight change`, the relationship in the analysis repo's `src/dexa/forecast.py`. Separate gain and loss values of `k` are medians of consecutive scan ratios. Intervals with less than 2 lb of change, more than 365 days between scans, or a ratio outside zero to one are excluded. With fewer than two usable intervals in a direction, FFM stays constant and the interface states that fallback. Planned future weight drives a separate dashed body-fat projection. Impossible percentages are omitted rather than clamped. These are heuristic estimates, not daily measurements or validated predictive intervals. The main time-series chart does not reproduce the analysis repo's bootstrap forecast or the workbook's Bull/Bear scenarios.

The DEXA panel plots lean soft tissue against bodyweight, adapting `WeightliftingApp-AnalyzeData/src/dexa/calculations.py` and `src/dexa/charts.py`. Numbered scans follow chronological order, with red gain arrows and blue loss arrows. The dashed least-squares trend uses all scans with lean mass; a dotted line connects the latest two complete consecutive scans. Vertical bars show signed residuals. Date filters preserve scan numbers, interval efficiencies, and the full-history fit. Missing lean mass leaves a gap. Selecting or focusing a scan shows its values and interval efficiency, defined as lean gain divided by weight gain for bulks and one minus lean loss divided by weight loss for cuts. No ratio is shown for unchanged weight.

Body-fat contours use one percentage-point steps and hold bone mineral content constant. The snapshot has no explicit bone field, so the panel infers it from the latest scan’s weight minus lean and fat mass. It omits contours if those components are missing or the remainder is nonpositive. Reported body-fat overrides do not change this reference. The measurements table retains scans with missing lean mass.

The DEXA chart also projects the current bulk to 240 lb, anchored at the latest scan. A checkbox toggles the overlay; it appears only when the date range includes that scan. The expected path is the median, with a ribbon from the 2.5th to 97.5th percentiles and best/expected/worst endpoint values. Best and worst are percentile scenarios, not absolute limits. Body-fat scenarios use the same inferred bone mass as the contour lines.

`src/lib/weight-log/dexa-projection.ts` adapts the block-bootstrap mean plus future-interval residual from the analysis repo's `src/dexa/forecast.py`, using lean soft tissue directly. It uses consecutive positive-weight scan intervals with at least 2 lb gained, at most 365 days between scans, and complete lean measurements. Observed ratios are not clipped. Intervals sharing a scan are resampled together. Twenty thousand seeded draws combine the resampled mean with one observed centered residual to capture variation in a future bulk as well as uncertainty in the fitted average. The chart requires at least three usable intervals across three scan groups. It omits degenerate or physically invalid bounds and targets more than 60 lb beyond the anchor.

This is a conditional model prediction interval, not a validated 95% coverage claim. It holds the latest scan exact, includes observed scan variation in the historical ratios, and adds no separate measurement-error model. The ribbon therefore narrows to zero at the anchor. It assumes constant lean gain per pound and that the next bulk resembles prior bulks. The UI states the sparse interval count, exclusions, and these limitations. The distinction between a fitted-mean confidence interval and uncertainty for a future outcome follows [NIST's prediction-interval guidance](https://www.itl.nist.gov/div898/handbook/pmd/section5/pmd512.htm).

The calculation tests verify scan-anchor agreement, sparse sampling, gap limits, separate observed and planned values, and fallback behavior. All model inputs stay in the encrypted snapshot. Filtering the chart never recalibrates the model or changes its historical context.

Workbook weekly means use available readings in the recorded weekly range, trimming one extreme at each end only when at least three remain. The chart displays each weekly mean across that week. It preserves empty calendar weeks rather than drawing through missing history. The DEXA panel follows the analysis project's distinction between lean soft tissue and bone mineral content; it does not substitute fat-free mass for lean mass.

## Access and storage

- The page and server-only data loader both verify the signed cookie before accessing storage. There is no public data API or static data import.
- Production reads ciphertext from S3 at request time. Local development reads an ignored encrypted file. Local data is excluded from Vercel uploads and Next.js output traces.
- AES-256-GCM encrypts and authenticates the snapshot with fresh salt and nonce. HKDF derives a separate key from `NEXTAUTH_SECRET`; the site password alone cannot decrypt the object. Rotating the server secret requires re-encrypting and uploading the snapshot.
- The existing `DAD_CONTENT_PASSWORD`, signed HttpOnly cookie, and server action provide access. This shares the existing private-page session; it does not add a separate public password-validation API.
- The route is dynamic, uses no shared data cache, and sets private/no-store, noindex, no-referrer, and frame-denial headers. Metadata contains no measurements. The route is absent from public search and sitemaps. No chart state or readings go into analytics, URLs, or browser storage.
- `pnpm check:weight-log-boundary` runs after builds to check prerendering, the Git index, public assets, and server file traces.

The server needs its existing AWS read credentials and the same `NEXTAUTH_SECRET` used during export. Encryption is additional protection for the existing bucket, whose bucket-level public-access blocks were not enabled during implementation. The uploaded object has a private ACL. Do not replace ciphertext with plaintext or publish a signed storage URL.

The data-layer authorization and DTO boundary follow the [Next.js data-security guidance](https://nextjs.org/docs/app/guides/data-security). Bucket-wide [S3 public-access blocking](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html) remains a separate infrastructure setting.

## Verification and Field Notes

Use the Python importer tests and the focused Vitest tests under `src/lib/weight-log/` and `src/app/weight-log/`. Fixtures contain synthetic values. No browser automation is needed for these checks.

No Field Note is awarded. Password entry or loading a private chart fails quality-bar test 2: the qualifying action would be a raw access event, without a separate semantic discovery. No private measurements or viewing history are added to achievement storage.

# Strength at bodyweight

Every exercise detail page with recorded 1RMe includes a bodyweight-conditioned Pareto chart inside the existing Show More panel, including the detail sheet opened from the dashboard. It mounts and requests data only when Show More opens. The main dashboard does not render it.

The chart uses the exercise's category color, the panel's rounded card and centered heading, and matching chart typography and tooltips. Its visible content is the plot and a small legend. Methodology, counts, confidence definitions, and timestamps live in one information popover. Per-attempt details appear on hover; a screen-reader summary preserves the latest attempt and its dominator without adding visible footer text.

Exercise display names come directly from the existing taxonomy. Every variation is analyzed independently; there is no allowlist. The four entries in `src/lib/weightlifting/pareto/config.ts` are optional display-floor overrides. Other exercises have no fixed display floor. Their vertical bounds fit the Pareto frontier, and weaker points outside those bounds are clipped.

## Data path

Lifting attempts come from `wl_sets`, joined to `wl_exercises` and `wl_workouts`. The existing weightlifting sync remains responsible for importing the phone backup. A repeatable-read, read-only transaction reads all positive 1RMe sets for the requested `reps_weight` variation and its sync timestamp. It uses the site's Pacific reporting dates, stored as UTC calendar fields. It never selects only session maxima, PRs, or sets above the display floor. Missing reps or lifted weight do not remove an otherwise valid 1RMe attempt.

The lifting tables contain no bodyweight column. Bodyweight already has production storage: `getWeightLog()` reads the encrypted Weight Log snapshot from private S3 storage in production and an ignored encrypted snapshot in development. The Pareto estimator extracts only actual daily cells from its weekly rows. Weekly averages, targets, scans, phase names, and historical recollections never enter the analysis payload.

`weightlifting.getBodyweightPareto` is a public tRPC query. The server returns dates, recorded lifting metrics, estimated bodyweights, estimate provenance, frontier membership, counts, and source timestamps. It does not return workout identifiers, names, comments, source files, storage keys, credentials, or daily weigh-in arrays. The chart masks its measurements from PostHog DOM capture and keeps controls in component state. Provider errors become a generic unavailable state with Retry.

The query caches each exact exercise display name for five minutes and shares the existing weightlifting invalidation tag. A lifting sync invalidates it. A bodyweight upload becomes visible on a subsequent request after cache expiry; the first expired read can serve the previous result while Next.js refreshes it. The displayed analysis timestamp identifies that generation. The browser query also has a five-minute stale time and refetches through normal query mount/focus behavior.

## Refresh command

From this workspace, with the existing server environment in `.env` and `WEIGHT_WORKBOOK` pointing to the workbook outside the repository:

```sh
pnpm refresh:lifting-pareto --workbook "$WEIGHT_WORKBOOK" --check-reference
```

This validates the workbook with the existing Python importer, pipes its JSON into the existing encryptor without displaying measurements, reads the current lifting database, discovers every exercise with positive recorded 1RMe and regenerates all of their payloads, verifies each frontier against an independent pairwise dominance calculation, and checks that there are zero unestimated valid attempts. It atomically replaces an encrypted analysis artifact at `data/weight-log/pareto.enc` and verifies decrypted readback. No database writes, sync mutations, uploads, or deployments occur.

The encrypted analysis artifact is an audit output. The website regenerates the same DTO from its runtime sources; it does not depend on a developer's generated file. Both encrypted files are already excluded from Git, Vercel uploads, and Next.js local-data tracing. Repeating the command replaces the snapshot instead of appending records. Analysis results are deterministic for unchanged source contents; refresh timestamps and encryption nonces change.

`--check-reference` is an optional regression against the supplied September 12, 2026 sources. It checks the 320 × 14 bench attempt, recorded 473 1RMe, estimated bodyweight approximately 217.34 lb, and strict dominance by the January 14 343 × 11 attempt at approximately 213.29 lb with the same 1RMe. These expectations are confined to the opt-in verification command. They are never production model parameters. Later weigh-ins can legitimately revise historical smoothed estimates, so omit this historical check for future routine refreshes.

Once the local encrypted Weight Log exists, regenerate and verify without reading a spreadsheet:

```sh
pnpm refresh:lifting-pareto
```

Verify the actual production sources, including S3 rather than the local snapshot:

```sh
NODE_ENV=production pnpm refresh:lifting-pareto --production
```

Production verification writes only the local encrypted audit artifact. It needs the existing database read access, AWS read credentials, bucket configuration, and matching `NEXTAUTH_SECRET`. No new migration, credential, scheduler, or public storage object is required. `--production` rejects a workbook import.

### Publishing fresh weigh-ins

Publishing current bodyweight uses the existing [Weight Log refresh workflow](weight-log.md#refreshing-the-snapshot). Preserve the authoritative encrypted `history-context.enc` companion before importing, so the workbook refresh retains unrelated historical recollections. An isolated checkout can restore this companion from the current production snapshot's `historicalContext`, encrypted with the same server secret. Do not overwrite that production field with an empty local copy.

From the checkout holding that companion:

```sh
set -o pipefail
python3 scripts/weight-log/import_workbook.py "$WEIGHT_WORKBOOK" \
  | node --env-file=.env --import tsx scripts/weight-log/store.ts
node --env-file=.env --import tsx scripts/weight-log/store.ts --upload
```

Then verify the actual production data:

```sh
NODE_ENV=production pnpm refresh:lifting-pareto --production --check-reference
```

Upload performs ciphertext readback and decryption verification. The existing phone-backup sync remains independent; run it through the existing site workflow if the lifting database is behind. This change does not sync or replace the lifting tables.

## Axes and layout

Bodyweight labels stay five pounds apart, with lighter one-pound minor gridlines. Bounds round outward to five-pound multiples with padding around the visible cloud. Strength bounds and label spacing use only frontier points above the configured display floor, with a small padded margin rounded to multiples of five pounds. Dominated attempts and a weak latest set never expand the vertical range. Five-pound minor lines fill wider intervals; narrow ranges use five-pound labels with one-pound minor lines. The chart clips out-of-range points instead of allowing Recharts to expand the bounds.

Major lines are darker than minor lines. The strength unit sits above the plot, leaving the tick labels free of a rotated title. The bodyweight title has its own space below the ticks. Narrow screens can scroll the chart horizontally so five-pound labels keep their spacing. There is no control to expand the view to weaker attempts. Dominance still includes all attempts, including those clipped below the plot.

The bench chart is at `/weightlifting/flat-barbell-bench-press#exercise-more` on the root host, or `/flat-barbell-bench-press#exercise-more` on the weightlifting subdomain. Open Show More to reveal the chart. Each exercise uses its own analysis without a second lift picker.

## Analytical contract

- Build one continuous calendar-day line between the first and last actual weigh-ins. Interpolate missing days linearly before applying any smoothing. Sunday and Monday are consecutive days, with no weekly join.
- Use a centered seven-day arithmetic average. The first three measured-range days use a leading window, following the reference's historical edge convention. The final three days use a trailing window, with no future values. For very short histories the trailing rule takes precedence, and available days form the window.
- Outside the measured range, carry the nearest actual boundary weight and mark it low confidence. This follows the requested boundary contract explicitly. The Python reference can mix a few interior values into a just-outside estimate because it extends its rolling grid to the requested dates; this implementation keeps boundary carries constant and independent of which lifting dates were queried.
- Preserve whether the day's unsmoothed value was measured, interpolated, or carried, plus the smoothing window, distance to the nearest actual reading, and confidence. High covers zero to seven days, medium eight to 21, and low longer gaps or any carry. These bands describe measurement proximity, not a statistical interval.
- Compare unrounded values. A dominating point has equal-or-lower estimated bodyweight and equal-or-higher 1RMe with at least one strict advantage. Equal coordinates all retain the same frontier status. Only the displayed frontier line deduplicates tied coordinates.
- Every valid attempt receives an estimate. Empty or invalid weight inputs fail the analysis instead of silently dropping attempts. Conflicting readings on the same date fail explicitly.
- Compute dominance before presentation filtering. Bench's default floor is 300 lb 1RMe. The information popover counts all evaluated attempts, including those below the plotted frontier range.
- The latest highlight is the strongest set on the latest calendar day, matching the reference card. A screen-reader summary identifies its frontier status, a concrete dominator, and whether the frontier range hides it. Hover exposes the same per-point metrics and confidence without a visible footer or repeated frontier list.

## Verification

```sh
pnpm test src/lib/weightlifting/pareto src/server/queries/weightliftingPareto.test.ts src/app/weightlifting/components/BodyweightPareto.test.tsx 'src/app/weightlifting/[slug]/ExerciseDetail.test.tsx' 'src/app/weightlifting/[slug]/ExerciseExplorer.test.tsx' src/lib/weight-log src/lib/weightlifting
python3 -m unittest discover -s scripts/weight-log -p 'test_*.py'
pnpm typecheck
pnpm lint
pnpm test
pnpm check:meadow
```

Tests use synthetic fixtures for interpolation, Sunday/Monday continuity, centered/leading/trailing smoothing, boundary carries, confidence thresholds, duplicate coordinates, strict dominance, cropped latest points, source-field isolation, and storage failure. The refresh command adds real-source invariant and optional regression verification. No browser automation or screenshots are part of this verification.

No Field Note is added. Quality-bar test 2 rules it out: opening a chart or inspecting individual attempts supplies no distinct semantic completion beyond ordinary viewing.

### Reference verification, September 12, 2026

The source refresh discovers 266 exercise variations and verifies 45,066 attempts with zero unestimated observations. Every frontier matches the independent pairwise oracle. The original bench regression passes. Repeating a refresh produces identical analysis contents after excluding the refresh timestamp.

Tests cover Show More mounting, exact variation routing, category colors, hidden methodology, and clipping weak attempts without expanding the frontier's vertical range. Axis invariants also pass across all 266 materialized exercise charts. Verification uses unit tests, static checks, source data, and HTTP requests, without browser automation.

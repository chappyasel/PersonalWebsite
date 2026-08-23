# YouTube scoring rollout

The new system stores Learning Value and Positivity independently on a whole-number 0–10 scale. Manual overrides always win; unidentifiable videos remain Unscored. Dashboard aggregates weight accepted scores by Estimated Exposure and show independent coverage.

## Current state

- The historical data is normalized into Channels, Videos, Watch Events, Classifier Runs, Classifications, Manual Overrides, and Calibration Members.
- The current 20-video iteration set has Luna Flex guesses for both dimensions.
- Full video metadata and channel avatars have been refreshed.
- No partial classifier run is active in the dashboard.

## Calibration

1. Run the app locally and open `/youtube/calibrate`. The route and its write APIs are disabled in production and are not linked from the dashboard.
2. Scroll through the single spreadsheet, changing any prefilled 0–10 guesses that look wrong. Unscored guesses remain blank rather than becoming neutral 5s.
3. Click **Save all 20** once. This makes entered ratings permanent manual overrides while leaving blanks Unscored.
4. Run `pnpm youtube:evaluate-scores`.

Revise the independent prompts and regenerate this small set for a few fast rounds. Once the behavior feels right, expand to the full 200-video evaluation set. The release gate is approximately MAE ≤ 1 point with no material systematic bias on that larger set. If Luna passes, use it for the full backfill. Another model can be tested by setting `YOUTUBE_SCORING_MODEL` and scoring the calibration scope again.

## Full backfill

Preflight without spending:

```sh
pnpm youtube:score --scope all
```

After calibration passes, score and activate each dimension only after its run completes:

```sh
pnpm youtube:score --scope all --execute --activate --max-cost 15
```

The script uses Vercel AI Gateway, OpenAI GPT-5.6 Luna, Flex processing, keyed structured outputs, bounded concurrency, retries, restart-safe versioned runs, compact numeric output, and a shared $15 ceiling. A failed or partial run is never used by dashboard trends.

## Metadata refreshes

Video metadata, full uncapped runtimes, and stable channel identities:

```sh
pnpm youtube:backfill-metadata --force
```

Channel avatars, refreshed when missing or older than 30 days:

```sh
pnpm youtube:backfill-channels --execute
```

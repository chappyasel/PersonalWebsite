# Status slice

Active on the worker since 2026-10-04, when the coordinator applied and
verified it. This file is the contract as reviewed then. It shipped in the
same merge as the rest of the request repair (#109). Since activation,
`queue-evidence.ts` changed how it recognises a YouTube row, and nothing the
status reports changed shape.

## Files

Relative to `43307824`:

| File | Change |
| --- | --- |
| `scripts/takeout/status.ts` | new — the status computation |
| `scripts/takeout/status.test.ts` | new — 38 tests |
| `scripts/takeout/status-cli.ts` | new — standalone read-only CLI |
| `scripts/takeout/refresh.ts` | modified — emits `e2e_status`; no new request path |
| `scripts/takeout/refresh.test.ts` | modified — adds 6 status regressions |
| `scripts/takeout/request-state.ts` | new — dependency: `readRequestState` + types |
| `scripts/takeout/queue-evidence.ts` | new — dependency of `request-state.ts` |
| `worker-launcher/youtube_takeout_worker.py` | modified — strict status relay |
| `worker-launcher/test_youtube_takeout_worker.py` | modified — adds 11 relay tests |

`request-state.ts` and `queue-evidence.ts` are in the patch because the status
code imports them; their own tests and the rest of the request work are not, and
can be refreshed at final handoff. The patch does not touch `package.json`,
the lock file, `state.ts`, `config.ts`, `lock.ts`, `download.ts` or
`sync-youtube.ts`.

Verified independently: `git archive HEAD` into a clean directory,
`git apply --check` clean, then with the patch applied —
`vitest run scripts/takeout/status.test.ts scripts/takeout/refresh.test.ts`
68 passed, launcher `unittest` 22 passed, and a scoped
`tsc --noEmit --strict` over the five TypeScript files exit 0. In the full
worktree `pnpm typecheck`, targeted ESLint and `git diff --check` also pass.

## What it changes about truthfulness

`no_new_archive` meant "the Drive check ran and found nothing newer". On its own
it reads as success. It now travels with an `e2e_status` record that reports the
Drive check and the corpus separately:

```json
{"event":"e2e_status","status":{
  "drive_check":"healthy","freshness":"stale",
  "last_ingested_at":"2026-10-04T00:07:16.748Z","ingest_age_hours":15.84,
  "coverage_through":"2026-09-28T06:04:58.013Z","coverage_age_hours":153.88,
  "coverage_source_file":"takeout-20260928T055945Z-1-001.zip",
  "freshness_max_age_hours":144,
  "request_status":"request_state_missing","request_blocker":null,
  "request_detail":null,"last_observed_pending_export":"unknown",
  "request_observed_at":null,"request_state_host":null,
  "failures":["corpus_stale","request_state_missing"]}}
```

That is today's production shape, taken from a fixture copy of the real numbers
(`scripts/takeout/status.test.ts` pins them, and `refresh.test.ts` drives the
same numbers through the real `refresh.ts` entry point with mocked subprocesses).

Rules the tests hold to:

- `last_ingested_at` is when the importer last succeeded. `coverage_through` is
  the archive's own build time. Freshness is computed from the second only.
- Freshness is `missing` with no archive or no build time, `unknown` for an
  unparsable build time **and for one dated in the future** — a negative age
  would otherwise be under every threshold and read as the freshest possible
  data. Never `fresh` by default.
- Age threshold: `YOUTUBE_TAKEOUT_FRESHNESS_MAX_AGE_HOURS`, default **144**
  (one 5-day request cycle plus a day of build and delivery slack). A
  non-positive or non-finite value at the compute boundary is rejected outright.
  `coverage_age_hours` is reported too, so the number stands on its own
  regardless of the threshold.
- Request state: absent is `request_state_missing`, unparsable is
  `request_state_unreadable`, another host's record is `unknown` — never
  `queued` or `awaiting_auth` without a local, parseable record that says so.
- `last_observed_pending_export` is named as history and carries
  `request_observed_at`. Past 24 hours it reverts to `unknown` rather than
  repeating an old observation as the current answer.
- Failures come from a closed vocabulary and are de-duplicated and sorted. The
  importer's own error text is mapped onto it (`download_failed_2` →
  `download_failed`, anything unrecognised → `importer_error_other`).
- `e2e_status` is emitted on the no-new-archive path, after a completed
  ingestion, and on the Drive and sync failure paths. A download failure reports
  `drive_check: "failing"`; a sync failure reports `drive_check: "healthy"`,
  because the Drive check did work and only the ingestion failed.
- A status read that throws emits `e2e_status_unavailable` and nothing else; it
  can never fail a tick that otherwise worked.

Status never changes the tick's exit code. A stale corpus on a healthy tick
still exits 0, so a stale corpus cannot auto-pause the importer that discovers
archives.

## Launcher relay

The launcher forwarded event names only and dropped every field. It now relays
the status through a strict allow list in `safe_status`:

- Four enum fields, four instants (strict `YYYY-MM-DDTHH:MM:SS[.ffffff]Z`),
  three bounded finite numbers, the archive name against
  `takeout-\d{8}T\d{6}Z(-\d+)?-\d+\.zip`, and failures filtered to the closed
  vocabulary with the rest counted as `unrecognised_failures`.
- Every other key is dropped, including anything secret-shaped the child might
  print. Tests assert a `DATABASE_URL`, a cookie object, a stdout tail and a
  nested list never reach the log.
- No hostname is relayed. `request_state_foreign` is derived from the failure
  list instead, and is `null` when the failure list itself was unreadable.
- A field of the wrong shape is omitted and named in `dropped_fields` (our own
  field names, never the child's value). A record that is not schema 1 produces
  `worker_status_rejected`.
- `freshness != "fresh"` also emits `worker_corpus_stale`. `STALE_IS_FAILURE` is
  `False`: the tick did its job, and a gate that fails every week until an
  export arrives is a gate nobody reads. Flip that one constant if you want the
  opposite.
- `e2e_status_unavailable` emits `worker_status_unavailable` as well as the
  generic child event, so a failed status read cannot disappear quietly.
- A failure event still fails the run, status or no status.

## How to check it yourself, read-only

```sh
pnpm exec tsx scripts/takeout/status-cli.ts --pretty
```

Reads `state.json` and `request-state.json` and nothing else: no Drive call, no
browser, no database, no request, no writes. It reports `drive_check: "unknown"`
by design, because that process cannot vouch for a check it did not run. Exit is
0 unless `--fail-on-stale` is passed. Point it at a copy with
`YOUTUBE_TAKEOUT_STATE_DIR` / `YOUTUBE_TAKEOUT_DATA_DIR` to keep away from the
live paths entirely.

`refresh.ts --no-browser` is unchanged except for the added emissions. It still
cannot request an export or open a browser in that mode, and the auto-UI path is
not activated.

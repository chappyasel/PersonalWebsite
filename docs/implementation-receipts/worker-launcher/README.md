# YouTube worker configuration handoff

This follow-up preserves the completed Drive-discovery repair and adds runtime configuration plus an offline-tested worker launcher. All changes remain in the dedicated workspace. No network calls, live runtime/state/credential changes, schedule changes, browser activity, commits, pushes, installation, or deployment were performed during this follow-up. The coordinator owns cutover and live verification.

## Runtime configuration

All overrides must be absolute paths. Empty, relative, and unexpanded `~` values fail.

| Variable | Default | Worker value |
| --- | --- | --- |
| `YOUTUBE_TAKEOUT_DATA_DIR` | `~/.local/share/youtube-takeout` | `/Users/chappyasel/hermes-work/youtube-worker-migration/data` |
| `YOUTUBE_TAKEOUT_STATE_DIR` | `~/.hermes/workspace/state/youtube-takeout` | `/Users/chappyasel/hermes-work/youtube-worker-migration/state` |
| `YOUTUBE_TAKEOUT_CREDENTIALS_DIR` | Selected data directory | `/Users/chappyasel/.config/youtube-takeout-worker` |

The shared configuration supplies Drive OAuth/token paths, incoming staging, history/sidecar, state, and the refresh lock. Saved Drive tokens use mode `0600`. Data holds history/sidecar and an incoming directory whose temporary downloads are cleaned up. Credentials stay outside it. HOME and os.homedir are never retargeted, including in the new tests.

Refresh subprocesses use `process.execPath` and the installed `tsx/cli` resolved from the checkout. They cannot fetch tsx through npx. This also applies to the existing approval path's refresh launch. Sync/scoring logic and arguments are unchanged. `--no-browser` remains mandatory for the worker.

## Launcher

Source: `youtube_takeout_worker.py`. Intended installation: the worker profile's `scripts/youtube_takeout_worker.py`. No installation was performed.

The launcher uses the fixed task root above and cwd `/Users/chappyasel/hermes-work/youtube-worker-migration/runtime`. It requires `owner.json` with `owner` equal to `worker` and boolean `enabled` equal to `true`. Missing, malformed, disabled, or differently owned configuration fails without spawning. It holds an exclusive `fcntl.flock` on `state/launcher.lock` throughout the child process. Contention skips with exit 0. The existing `state/refresh.lock` provides the second lock inside TypeScript; the coordinator's migration fence remains untouched.

The child environment contains only the OS account's actual HOME, PATH `/usr/bin:/bin:/usr/sbin:/sbin`, TZ `America/Los_Angeles`, the three path overrides, `DOTENV_CONFIG_PATH` pointing to protected `runtime.env`, and `SKIP_ENV_VALIDATION=1`. No inherited project or Hermes secrets enter the child. The runtime.env file must be a regular file owned by the current account with mode `0600`. It must contain exactly the three nonempty keys `DATABASE_URL`, `YOUTUBE_API_KEY`, and `AI_GATEWAY_API_KEY`. Single-line quotes, comments, and `export` are accepted; duplicates, interpolation, escapes, unknown keys, and malformed input fail. Values are never logged.

The exact command is:

```sh
/Users/chappyasel/.local/bin/with-worker-node24 corepack pnpm exec tsx scripts/takeout/refresh.ts --no-browser
```

This command is documented for coordinator activation, not executed by this worker. The launcher starts a new process group, times out after 1100 seconds, sends SIGTERM, allows up to 10 seconds, and sends SIGKILL to the group even if its leader has already exited. Timeout returns 124. Other failures return nonzero, including `classify_failed` or `score_failed` events with child exit 0. A successful run requires `refresh_complete` or `no_new_archive`. Output is local JSON with known event names only; raw child output and secret fields are not relayed. It sends no notifications.

## Changed code paths

Follow-up runtime files:

- `scripts/takeout/config.ts`, new
- `scripts/takeout/drive.ts`
- `scripts/takeout/state.ts`
- `scripts/takeout/lock.ts`
- `scripts/takeout/download.ts`
- `scripts/takeout/refresh.ts`
- `scripts/takeout/approve.ts`
- `scripts/sync-youtube.ts`

Follow-up tests:

- `scripts/takeout/config.test.ts`, new
- `scripts/takeout/drive.test.ts`, new
- `scripts/takeout/download.test.ts`
- `scripts/takeout/refresh.test.ts`
- `scripts/sync-youtube.test.ts`, new
- `docs/implementation-receipts/worker-launcher/test_youtube_takeout_worker.py`, new

The combined patch also includes the prior repair's `src/lib/youtube/sync.test.ts` and implementation receipt/evidence. No book-sync changes from the newer main commit are included.

## Verification

Run from the dedicated workspace:

```sh
pnpm exec vitest run scripts/takeout scripts/sync-youtube.test.ts src/lib/youtube
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s docs/implementation-receipts/worker-launcher -p 'test_*.py' -v
pnpm typecheck
```

Targeted ESLint covers all follow-up TypeScript files. Default-path tests resolve paths without opening actual credentials. Drive uses fixture credentials and a mocked OAuth client. Download tests use fixture ZIPs and mocked Drive. Sync and refresh mock database/subprocess work. A fresh Node process verifies scoped dotenv loading with a temporary fixture. Python tests mock child processes and signals while exercising real local flock contention.

Final results: 123 TypeScript tests across 15 files passed; 10 Python tests passed; typecheck, targeted ESLint, and whitespace checks passed. The targeted lint command was `pnpm exec eslint scripts/takeout/config.ts scripts/takeout/config.test.ts scripts/takeout/drive.ts scripts/takeout/drive.test.ts scripts/takeout/state.ts scripts/takeout/lock.ts scripts/takeout/download.ts scripts/takeout/download.test.ts scripts/takeout/refresh.ts scripts/takeout/refresh.test.ts scripts/takeout/approve.ts scripts/sync-youtube.ts scripts/sync-youtube.test.ts`.

Final command results are recorded in `typescript-tests.txt`, `python-tests.txt`, `typecheck.txt`, and `lint.txt`. `combined-from-7540dfcc.patch` contains the complete task change relative to `7540dfcc51e702121fddc3d637d1e27c6b97fd5f`, including the prior repair. `SHA256SUMS` records each patch target and the patch itself; it excludes itself. The patch excludes its own bytes and the hash manifest. Verify from the workspace root with:

```sh
shasum -a 256 -c docs/implementation-receipts/worker-launcher/SHA256SUMS
```

The launcher and migration paths have not been exercised live. The coordinator must review, install, verify worker idempotence, and enable the single schedule. Field Notes does not apply to this internal runtime change.

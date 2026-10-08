# Asking Google for an export

This asks Google for one real YouTube Takeout export. A visible Chrome window
opens, the code fills the form and clicks "Create export" once, and Google
asks you to verify it's you. You do that step yourself, with your passkey or
your password. The window then confirms the export from Google's own list and
closes. Nothing is scheduled, and the importer isn't run.

Run it on the Mac that holds the automation browser profile
(`~/.config/youtube-takeout-profile`), from a checkout of main.

The first run happened on 2026-10-08; see the README. Before running this,
check that the automation profile is still signed in. `approve.ts` exits 1
with `approve_session_missing` if not, and `pnpm takeout:login` fixes it.

## Running it

```sh
export YOUTUBE_TAKEOUT_STATE_DIR=~/hermes-work/youtube-request-live/state
pnpm exec tsx scripts/takeout/approve.ts --wait 30
```

`approve.ts` reports `approve_already_queued` and opens nothing if an export
was confirmed within the last five days.

A click that bounced to "Verify it's you" and was never finished blocks new
requests. When you know nobody finished it, retire it by name:
`approve.ts --retry-unconfirmed <attempt_id>`. The id is in
`request-state.json`. It refuses if any YouTube export is still building.

## During the run

Google may build the export without asking anything. On 2026-10-08, soon
after a sign-in, the window saw no verify step, Google finished in minutes, and the window
confirmed it from the "Completed" row. If Google does show "Verify it's you",
finish it in that window. If Chrome shows
"No passkeys available", choose "Try another way" and enter your password.
Then leave the window alone. Within a poll or two it reads Google's export
list and closes.

Exit codes from `approve.ts`:

- `0` with `approve_queued` and `fresh: true`. The export is confirmed on
  Google's list.
- `4` with `approve_still_waiting`. The watch ended but the window is still
  open and still waiting for you. Finish the step, then run `approve.ts`
  again with no flags to attach to it.
- `2` with `approve_blocked`, `approve_failed`, `approve_retry_refused` or
  `approve_window_gone`. `approve_failed` with `queue_unreadable` means the
  window could not read Google's export list five times in a row. Read `request-session.log`, then
  `pnpm exec tsx scripts/takeout/status-cli.ts --pretty`.
- `1` means the browser profile's Google cookies have expired. Run
  `pnpm takeout:login` first.

To close a waiting window without an export:

```sh
touch "$YOUTUBE_TAKEOUT_STATE_DIR/request-session.release"
```

## After it queues

Google builds the archive over a few hours and puts it in Drive. The worker
job `c0b4ce46c316` downloads and imports it on its next run. Freshness is
judged by the archive's own build time, so once a newly built archive is
ingested, `e2e_status` reports `freshness: "fresh"` as long as its build
time is within the 144-hour threshold. That is the real proof the whole loop
works.

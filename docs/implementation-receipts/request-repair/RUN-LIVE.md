# Asking Google for an export

This asks Google for one real YouTube Takeout export. A visible Chrome window
opens, the code fills the form and clicks "Create export" once, and Google
asks you to verify it's you. You do that step yourself, with your passkey or
your password. The window then confirms the export from Google's own list and
closes. Nothing is scheduled, and the importer isn't run.

Run it on the Mac that holds the automation browser profile
(`~/.config/youtube-takeout-profile`), from a checkout of main.

## The first run: retire the bounced click

The live record still holds the attempt from 2026-10-05, a click that bounced
to a passkey challenge nobody finished. Nothing will start a new attempt until
that one is given up, so the first run names it:

```sh
export YOUTUBE_TAKEOUT_STATE_DIR=~/hermes-work/youtube-request-live/state
pnpm exec tsx scripts/takeout/approve.ts \
  --retry-unconfirmed 839f6aae-b102-4164-9395-632e2fc6365d --wait 30
```

The window reads Google's export list first. If any YouTube export is still
building, it refuses, clicks nothing, and closes. The reason is in
`request-session.log` in the state directory. Otherwise it gives the old
attempt up, starts one new attempt, and waits for you.

## Later runs

```sh
export YOUTUBE_TAKEOUT_STATE_DIR=~/hermes-work/youtube-request-live/state
pnpm exec tsx scripts/takeout/approve.ts --wait 30
```

`approve.ts` reports `approve_already_queued` and opens nothing if an export
was confirmed within the last five days.

## During the run

When Google shows "Verify it's you", finish it in that window. If Chrome shows
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
  `approve_window_gone`. Read `request-session.log`, then
  `pnpm exec tsx scripts/takeout/status-cli.ts --pretty`.
- `1` means the browser profile's Google cookies have expired. Run
  `pnpm takeout:login` first.

To close a waiting window without an export:

```sh
touch "$YOUTUBE_TAKEOUT_STATE_DIR/request-session.release"
```

## After it queues

Google builds the archive over a few hours and puts it in Drive. The worker
job `c0b4ce46c316` downloads and imports it on its next run. Its
`e2e_status` reports `freshness: "fresh"` once the new archive is ingested.
That last part is the real proof the whole loop works.

# YouTube request repair, handoff

The request path asks Google for a YouTube-only Takeout export, waits while a
person does Google's "verify it's you" step in one browser window, and records
the export as queued only when Google's own export list shows it. The importer
on the worker host then picks the archive up from Drive on its schedule.

Nothing types a Google password. A stored-password sign-in was built in round
two and removed in round three (2026-10-07): it needed 1Password's `op` CLI,
which raised a Touch ID prompt on every run, and the owner ruled that out.
Keychain and a script-held passkey were ruled out for the same reason. Google
gates export creation behind reauth, so one tap from a person per export is
the supported route.

The status slice was reviewed and activated separately on the worker on
2026-10-04, and its contract has not changed since. See `STATUS-SLICE.md`.

## What was wrong

The request path had five ways to lie or repeat itself:

1. It wrote its progress into the importer's `state.json`, so a half-finished
   request read as an ingestion fact.
2. "Create export" could be clicked again after a click whose result was never
   established, including after a click that threw on a navigation timeout,
   which is exactly when Google may have queued the export anyway.
3. `queued` could be set from a click, a URL, or a fresh zip in Drive. None of
   those name the queue, and a zip names neither the product nor the attempt.
4. The approval CLI owned the browser, so its 20-minute timeout closed the
   window, the one thing a person mid-passkey cannot afford.
5. `no_new_archive` read as success. On 4 October the importer had ingested at
   00:07 and found nothing newer, while the newest archive Google had built was
   six days old. The check was healthy and the corpus was stale, and nothing
   said so.

## What the repair is

### Request state, apart from the importer (`request-state.ts`)

`request-state.json`. The importer never writes it, and `refresh.ts` reads it
only to report request status. Phases:
`idle`, `awaiting_auth` (explicit, resumable), `submitted_unverified`, `queued`,
`failed`. `planAttempt` decides what a run may do, and three rules carry it:

- An attempt that reached "Create export" can only ever be **verified**, never
  resubmitted, whatever phase the error path left it in. `startAttempt` refuses
  to open a new attempt over an unresolved submission.
- An expired auth wait is not a reason to replace a window someone may be
  standing in front of. While the session is alive the plan is to resume and ask
  for a person; only a dead session allows a fresh attempt.
- The age of a `queued` record proves nothing about Google's queue, so past the
  suppression window the caller has to look before asking again
  (`observe_queue`).

A blocker is a read-only recheck, not a dead end: `recheck_blocked` observes the
queue and the gate and clears the blocker when the obstacle is actually gone, so
a person authenticating by hand does not need anyone to edit JSON.

The whole record is validated on read. `{"schema":1,"phase":"queued"}` is
rejected, because claiming success needs the evidence that justified it; a
phase claiming an attempt it does not have is rejected; a submission dated
before its own form fill is rejected. An unparseable record fails closed and is
left on disk for an operator rather than overwritten.

### What counts as proof (`queue-evidence.ts`)

Two predicates, deliberately opposed:

- **Suppression is generous.** A row that might be a YouTube export stops a
  second request, including one whose products Google did not print. The cost of
  being wrong is a skipped week.
- **Confirmation is strict.** `queued` needs a row on takeout.google.com/manage
  that says YouTube, carries an identity, and was not in the snapshot taken
  before the attempt. The row is usually in progress, but it can also be
  finished: on 2026-10-08 Google built the export in minutes and the first
  sighting read "Completed". No baseline means no confirmation at
  all: a row's id distinguishes it from other rows, not from its own earlier
  self.

A Drive listing cannot confirm anything (`not_a_queue_source`). Neither can a
page that failed to parse: `trustedQueueExports` returns `null` for every
non-queue observation, so "we did not see the list" can never become "the list
was empty".

### The approval window (`session.ts`, `session-host.ts`)

Ownership is claimed *before* the browser launches, through a directory created
atomically; the session record is written only by whoever holds it. A live
holder, another machine's claim, or an owner file that cannot be read all refuse.
A holder whose process is gone can be taken over, and the takeover is reported
(`host_took_over_dead_session`) because a SIGKILLed holder can in principle
leave an orphaned browser.

No timeout and no blocker closes the window. When the polling deadline passes,
or Google wants something only a person can give, the holder stops polling and
**holds**, indefinitely, until one of three things happens: the export is
confirmed queued, the person closes the window, or a release is asked for
(`touch "$YOUTUBE_TAKEOUT_STATE_DIR/request-session.release"`). Ending without a
confirmed export always exits 4; it is never reported as success.

Holding is not the end of the attempt. Someone who signs in by hand gets the
same holder moving again through the resume sentinel
(`request-session.resume`), which `approve.ts` writes whenever it attaches to a
live window. The holder consumes it, so a resume is one request and not a
standing instruction. It clears its hold and grants itself another polling window **in the
window it already owns**: nothing is launched, and a submitted attempt is still
only ever verified, never refilled or resubmitted.

The per-attempt mutex (`request.lock`) is taken around each attempt, not for the
window's life, so a window waiting hours on a person does not block the
scheduled headless path from reading the queue.

### The browser boundary (`takeout-dom.ts`)

Judgements are bound tightly and fail to "unreadable":

- A product and a status count only when read from the **same** export card.
  "Export in progress" somewhere and "YouTube" somewhere else is two facts about
  a page, not one fact about an export.
- One row whose status cannot be read makes the whole queue unreadable, because
  as a baseline it could hide a pending export.
- An empty queue is trusted only when the page says so *and* nothing on it
  suggests an export is being built.
- The page must be HTTPS takeout.google.com on the expected path.
- `observeManageQueue` refuses to navigate while a challenge is on screen, so it
  cannot walk away from a sign-in someone is halfway through.

The real /manage page is a "Summary" list whose rows link to
`/manage/archive/<id>`, not `/manage/export/<id>`. The coordinator added that
link form on 2026-10-05, between the two live holders, and the second holder
then read the page correctly: two expired exports as `complete`, no pending
YouTube export. The reauth screens' wording is still unverified.

### The password route (`native-modal.ts`, `password-route.ts`)

Google's native "No passkeys available" window sits above the page and swallows
the click on the DOM's "Try another way". That is the observed "Loading" hang. Clearing
it needs the accessibility layer (cua-driver 0.22), so the authority is narrow:

- The modal must belong to the browser process this run drives, matched by pid
  **and** application name, and be a window that did not exist before. The pid
  comes from the running browser (`context.browser().newBrowserCDPSession()` →
  `SystemInfo.getProcessInfo`), verified headlessly; the application name comes
  from that pid's own windows and must be one of the known browsers. Playwright's
  build reports "Google Chrome for Testing", so assuming "Google Chrome" would
  either match nothing or match the person's everyday browser.
- Dismissal is proved by re-reading the exhaustive window list and finding **no**
  matching modal for our process. One window id going away is not enough,
  since Chrome can put the dialog back under a new id. The browser's own
  window must still be there, or the "dismissal" was a crash.
- A stable session label travels with `get_window_state` and `click`, which
  accept one; `list_windows` does not, and its schema rejects unknown keys.
  `include_screenshot: false`, `action: "press"`, `delivery_mode: "background"`.
  No focus, no launch, no capture, no configuration or permission change.
- Every reply must be whole. An error-shaped or partial payload, or one
  malformed row, is rejected rather than read as "no windows". Otherwise the
  check that proves the modal is gone would pass exactly when the driver had
  stopped answering.
- **Off by default.** It needs `YOUTUBE_TAKEOUT_NATIVE_MODAL=1` *and*
  `YOUTUBE_TAKEOUT_NATIVE_MODAL_OPERATOR_ACK=reviewed-dismiss-no-passkeys-modal`.
  Disabled, or unbound, the route blocks with
  `native_modal_driver_unavailable` / `native_modal_present` instead of
  pretending password support works.
- It is wired to the **passkey** step, which is where the dialog actually
  appears. Wiring it to a visible password field, the shape this had in
  review, would have meant the native fix never ran at all. A password prompt already
  on screen is left to the person and their vault.
- With the adapter disabled the route is not invoked at all, so the ordinary
  manual passkey tap remains the default path rather than being converted into
  a block.
- `password-route.ts` never enters a credential, and nothing else in the
  pipeline does either. There is no dependency in `PasswordRouteDeps` that
  could type one.
- It runs once per holder. At a 3-second poll the live run of 2026-10-05
  clicked "Try another way" three times while the page was meant to be
  waiting for a person.

**The modal's real control labels are unverified**, as is any live Google
authentication. `PASSWORD_ROUTE_VERIFICATION` states this in code, and a test
asserts it: `{ adapterDecisions: "covered_by_fixtures", liveGoogleAuth:
"unverified" }`.

### Entry points

`--help` and strict argument parsing run before any cookie is read, any state
written, or any process spawned. The retired `--timeout`, `--no-headed`,
`--debug` and `--then-ingest` are refused by name rather than ignored, so a
script reaching for a flag that moved cannot silently get a different browser.
`request.ts` takes the mutex before every read a decision rests on.

`approve.ts` cannot run the importer at all. `ingestNow` and the `refresh.ts`
reference are gone, and a test asserts the source contains neither. It reports
an export queued before it ran as history (`approve_already_queued`, with the
original timestamp), never as acceptance, and says "the window is still open"
only after the session record confirms a live holder; a holder that never
registered is reported as `approve_window_not_started`.

`request.ts`, `session-host.ts` and `approve.ts` end through `exitWhenDone`
(`entry.ts`), which flushes stdout and then calls `process.exit`. Setting
`process.exitCode` and letting the event loop drain is not enough here; the
live finding below is why.

### Status

Active on the worker since 2026-10-04. `STATUS-SLICE.md` has the contract.
`status.ts`, `status-cli.ts` and `refresh.ts` are unchanged since.
`queue-evidence.ts` changed in one place: a row counts as YouTube when a
product name contains "youtube", which the live /manage page needed.
`request-state.ts` grew additively: `recordBaseline`, more sign-in steps,
three blockers that only the removed sign-in wrote, and
`abandonUnconfirmedAttempt`. Nothing the status reports changed shape.

Main's launcher template allows the three retired blocker names. The
launcher installed on the worker predates them and does not; since nothing
writes them, nothing is dropped.

## Round three: what the live run found (2026-10-05 to 10-07)

The coordinator ran two request-only holders against the real Google on
2026-10-05. The second filled the real form, clicked "Create export" once,
reached the passkey challenge, and parked. Nobody finished the step, the
window was closed, and the record stayed at `awaiting_auth` with the click
recorded. Three defects came out of it, plus a dead end. Writing the run
guide turned up a fourth.

**Holders never exited.** Both processes were still alive two days later,
the second one after logging `host_finished`. Chrome for Testing leaves
`chrome_crashpad_handler` helpers running after the browser goes, and they
hold the write end of the browser's stderr pipe, so Node never sees it close.
Plain Playwright exits fine in a headless repro, so the fault was ours: the
entry points set `process.exitCode` and waited for an event loop that could
not drain. Ending the four orphaned helpers let both holders exit by
themselves within a second, which confirmed the cause. `exitWhenDone` now
ends the process explicitly. `entry.test.ts` reproduces the condition with a
shell that exits while its `sleep` child keeps the pipe, and shows the old
entry staying alive and the new one exiting with the right code.

**The first holder failed silently.** It ran before the coordinator's
`/manage/archive/` fix, so it very likely read the real export list as
unreadable. The attempt then returned `queue_unobserved` without saving, and
the holder polled again forever. Nothing reached a record, and its output
went to `/dev/null`. This is inferred from the code and the timing, since
the output is gone. Two fixes followed. The holder's output now goes to
`request-session.log` in the state directory, and `approve.ts` prints the
path. After five unreadable reads in a row, the holder records
`queue_unreadable` and stops polling, so `approve.ts` reports a failure
instead of "still waiting for you".

**The native route clicked on every poll.** See the password route above.

**A click nobody verified was a permanent block.** The live record, a
"Create export" click that bounced to a passkey challenge nobody finished,
can only ever be rechecked under the never-click-twice rule. Google builds
nothing until the step is done, but the code cannot tell that apart from a
slow export, so it waits forever. `--retry-unconfirmed <attempt-id>`, on
`approve.ts` and `session-host.ts`, is the way out. It takes an operator's
word for one named attempt. It refuses a different id, an attempt that never
clicked, a confirmed export, a click under 30 minutes old, a live window, and
any YouTube export building on a /manage read taken under the request mutex
just before. Only then does it give the attempt up. The same window then
starts one new attempt.

**A confirmed export refused every later request.** `approve.ts` stopped at
any `queued` record, whatever its age, so after the first success it would
have answered "already queued" every week from then on. It now asks the
planner, which suppresses for one cycle, 120 hours, and then sends the window
to read Google's list. A queued record from before the run is never reported
as that run's acceptance.

## Files

| New source | |
| --- | --- |
| `scripts/takeout/request-state.ts` | request-only state machine |
| `scripts/takeout/queue-evidence.ts` | what counts as proof |
| `scripts/takeout/request-flow.ts` | the shared attempt driver |
| `scripts/takeout/session.ts` | window ownership, release and resume sentinels |
| `scripts/takeout/session-host.ts` | the window's owner |
| `scripts/takeout/takeout-dom.ts` | the DOM boundary |
| `scripts/takeout/native-modal.ts` | cua-driver 0.22 adapter, off by default |
| `scripts/takeout/password-route.ts` | passkey to password prompt, and stop |
| `scripts/takeout/page-wiring.ts` | one real page, wired once |
| `scripts/takeout/cli-args.ts` | strict argument parsing |
| `scripts/takeout/entry.ts` | exits when `main()` is done |
| `scripts/takeout/status.ts`, `status-cli.ts` | truthful status (active) |
| `vitest.browser.config.ts` | the browser-fixture suite's own config |

| Modified source | |
| --- | --- |
| `scripts/takeout/request.ts` | rewritten onto the shared driver |
| `scripts/takeout/approve.ts` | watches; does not own the window |
| `scripts/takeout/refresh.ts` | emits `e2e_status` (active) |
| `scripts/takeout/lock.ts` | `acquireNamedLock`, additive |
| `vitest.config.ts` | keeps `*.browser.test.ts` out of the unit suite |
| `package.json` | one script, `test:browser-fixtures` |
| `worker-launcher/youtube_takeout_worker.py` | strict status relay (active) |

Tests sit next to each module. `entry-fixture.ts` is the process
`entry.test.ts` runs. The browser-fixture suites are `takeout-dom`,
`native-modal` and `end-to-end`, all `*.browser.test.ts`.
`end-to-end.browser.test.ts` runs the real `request.ts` and `session-host.ts`
entry points against a fake Google, covering six cases. A gated request
parks for a person. The holder confirms the export a person approves. The
holder ends cleanly when the person closes the window. The live record is
recovered with `--retry-unconfirmed`. A cycle-old export leads to one new
request. The retry is refused while an export is building.

`browser.ts` changed in one place on 2026-10-08: `close()` gives up after 10
seconds, because Playwright's close waits on the stderr pipe that headed
Chrome's crash-reporter helpers keep open. `flow.ts`, `state.ts`, `config.ts`,
`download.ts`, `sync-youtube.ts` and the lock file are untouched.

### The browser-fixture tests and CI

CI runs `pnpm verify` on Ubuntu without installing a Playwright browser, and
this repo's CLAUDE.md says the code gate needs none. Every `*.browser.test.ts`
is excluded from the unit suite and runs with `pnpm test:browser-fixtures`,
the same way the room-artwork suites stay separate.

## Verification

Red-then-green logs per slice are in this directory. `slice1` covers the
state machine and evidence, `slice2` the session and driver, `slice3` the
native adapter and password route, `slice4` status and relay, and `slice12`
the exit fix. `slice5`, `slice6` and `slice10` are green only and their
failing states are recorded as mutation checks. `slice7` to `slice9` belonged
to the removed sign-in and stay as history.

`final-gates.txt` has the numbers for this round. `mutation-checks.txt` lists
the invariants broken on purpose and the tests that caught each one.

## What has not been proved

- A full live approval. The holder has reached the real passkey challenge,
  but nobody has finished it in a holder's window yet. That a passkey tap
  completes the pending export without a second click was seen with the old
  approval flow, before this repair.
- Why the first live holder never wrote a record. The unreadable /manage
  cause is inferred; its output was discarded.
- Google's wording on the reauth screens and the native dialog's control
  labels. Code that does not recognise a screen parks for a person.

## For the coordinator

1. **Keep the daily job `8c7c1b43a686` paused** and its ownership fence in
   place. The worker job `c0b4ce46c316` owns discovery and import.
2. **The worker checkout** at
   `/Users/chappyasel/hermes-work/youtube-worker-migration/runtime` on
   `chappys-macbook-pro` was reconciled to `71ee5b83` by Hermes on
   2026-10-08, keeping the installed launcher and the worker-only readback
   helper. Its receipts are in `reconcile-71ee5b83/` beside the checkout. One
   `--no-browser` tick afterwards reported `drive_check: healthy`,
   `freshness: stale`, with unchanged database counts.
3. **The live record** at `~/hermes-work/youtube-request-live/state` holds
   attempt `839f6aae-b102-4164-9395-632e2fc6365d`, the bounced click.
   `RUN-LIVE.md` has the one command that retires it and asks for a new
   export, with a person at the window.

Field Notes does not apply. This is internal ingestion maintenance with
nothing visitor-facing.

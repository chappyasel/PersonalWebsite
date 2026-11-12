# Log Weight prompt starts from the last weigh-in

## PR and commits

- PR: https://github.com/chappyasel/PersonalWebsite/pull/154 (branch `weight-log-shortcut-placeholder`, from `origin/main` at `daa32387`), commit `8c322454`. Not merged. CI (`check`, `quality-contracts`), Vercel, and Devin Review are green. Devin found no issues, so it left no threads to answer.
- apple-health: `4f83013` "Start Log Weight's prompt from the last counted weigh-in", local only, not pushed. It stages only `shortcut/build_shortcut.py`, `shortcut/test_build_shortcut.py`, `shortcut/RUNBOOK-iphone.md`, and `shortcut/NOTES.md`. The other sessions' changes are untouched and unstaged.
- Worktree: `/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/log-weight-placeholder`.

## What changed

### Website

- `GET /api/weight-log/weigh-in?date=YYYY-MM-DD` answers `{ date, pounds }` for the latest weigh-in before `date` with `excluded = false`, or `{ date: null, pounds: null }` when there is none. It goes on the existing weigh-in route rather than a new file, so the route guard's list keeps the same three routes.
- The token check is the POST's, moved into `refuseToken` so both handlers share it. The date check is the card's window rule: `parseCardDate` and the new `parseLastWeighInDate` both call one `parseWindowDate`. A missing, malformed, or out-of-window date answers 400 before any read. A failed read answers 500 `{ "error": "The last weigh-in could not be read." }` and logs `weigh-in route: last failed (<code>)`. Every answer goes through `reply`, so it carries the no-store, noindex, and nosniff headers.
- PUT, PATCH, DELETE, and OPTIONS answer 405 with `Allow: GET, HEAD, POST`. Next derives HEAD from the new GET.
- The query is `lastCountedWeighInBefore(db, date)` in `src/lib/weight-log/weigh-ins.ts`. `weightLog.week` (the editor) now calls it for `before`, so the page's empty today cell and the Shortcut's prompt read the same weigh-in. The SQL is byte-identical to the old inline query.
- `docs/weight-log.md`, "Entry from a Shortcut": a new GET bullet, the POST bullet's new `Allow`, and the window sentence now names this read.

### Shortcut

- `log_weight_actions()` now runs Text (token), Current Date, Format Date (Day), a comment, then URL `…/weigh-in?date=<Day>`, a GET with `Authorization: Bearer <Token>`, Get Dictionary from Input, and Get Dictionary Value `pounds`. Then comes Ask for Input (Number) with `WFAskActionDefaultAnswerNumber` set to that value, and then the POST URL and the flow as before. Current Date and Format Date moved above the Ask. There is no branch between the GET and the POST.
- `log_weight_check()` also requires exactly one GET to the weigh-in URL for today's formatted date, outside every branch, before the Ask, and that any Ask default is `pounds` read from that GET through Get Dictionary from Input. GETs may go to either the card or the weigh-in URL.
- `ATTACHMENT_ALLOWLIST` gains `ask.WFAskActionDefaultAnswerNumber`, with the evidence in the next section.
- The runbook's hand recipe L2 has the new steps 2 to 6, renumbered later steps and cross-references, and an L3 check that the prompt starts from the last weigh-in. NOTES.md gains an attestation row.

## Verified

- Website unit tests: GET answers the weigh-in, nulls, yesterday at the window's edge, 400 on no date, a bad date, Feb 31, and dates before and after the window, 401 on no token or a wrong one, 503 while unset, and 500 with only the step and code logged (the test asserts the invented pounds never reach `console.error`). The 405 list now expects `GET, HEAD, POST`. The lib tests pin the exact SQL and params and the null case, plus `parseLastWeighInDate`'s window. The router test expects the same two queries, with the before-read first, because the helper starts its query when it is called.
- `routes.guard.test.ts`: the weigh-in route's valid request now has `date=2030-02-04` too, so every method, GET included, refuses no token, a wrong token, a bare token, and the mirror token before touching the database, both empty and with a request it would serve. It is green.
- `heavy -- pnpm verify` on `8c322454`: typegen, tsc, eslint, artwork, search index, and meadow passed. In vitest, 6698 tests passed and `tests/superset-setup.test.ts` timed out under load (14 s against a 5 s limit). It passed alone, and CI's `check` is green.
- Shortcut: `heavy -- /usr/bin/python3 -m unittest test_build_shortcut` ran 95 tests and all passed. The new tests cover the GET's URL, header, and lack of a body, the default's attachment chain, the order Day, GET, Ask, POST with no If, menu, or exit between, and three mutations that must fail (a default from another key, the GET after the Ask, the GET without the token).
- Rebuilt with `/usr/bin/python3 build_shortcut.py --only "Log Weight"`: 51 actions, the structure check passed, the vendored validator passed for macOS and iOS (one comment-text warning suppressed, as before), and the file was signed. `shortcut/private/Log Weight.plist` and `Log Weight.shortcut` are mode 600 in a mode-700 folder, and `git check-ignore` confirms the folder is ignored. I printed no token or weight.
- Not verified: nothing ran on a phone or on the Mac's Shortcuts app, and I sent no request to production.

## Shortcuts

- The default's serialization is device-attested, but only weakly. The owner's deleted `Log My Weight` stored `WFAskActionDefaultAnswerNumber` as a `WFTextTokenAttachment` over an `ActionOutput` (with a property aggrandizement on a Health sample). Its actions survive in a freed page of `~/Library/Shortcuts/Shortcuts.sqlite`, and no table row holds them. I read only key names and structure from a copy and printed no values. No corpus export attests this parameter.
- Runtime behavior is unproven: whether a Get Dictionary Value number fills the field, and whether a missing key leaves it empty rather than erroring. The runbook's L3 step 3 is the check.
- The prompt shows `pounds` as Shortcuts formats the number, so 150.0 may show as "150".

## Issues

- Offline or on a network error, Get Contents of URL stops the Shortcut. Before this change it stopped at the POST, after the prompt; now it stops before the prompt appears. Nothing saved offline before either, but the failure now comes earlier. Shortcuts has no continue-on-error (NOTES.md, "No continue-on-error").
- The prompt now waits one round trip to the site, a cold function included, before it appears.
- The null answer (`{ date: null, pounds: null }`) is reachable only with an empty log. How Get Dictionary Value reads a JSON `null` is untested. Refusals and the old deploy's 405 carry no `pounds` key at all, which is the common empty path.

## Ambiguities

- "Previous day's weight" versus the latest before today: I used the latest counted weigh-in before the phone's date, which is yesterday's when yesterday has one, as the lead read it.
- "Excluded" is the right filter. `src/lib/weight-log/entry.ts` already says "An excluded weigh-in is an outlier, so it never seeds the field", and the editor's `week.before` used the same `excluded = false` query. The two now share one function.

## Judgment calls (Owner to confirm)

- **Owner to confirm:** skip excluded weigh-ins, so after an excluded yesterday the prompt shows the day before. This matches the editor.
- **Owner to confirm:** the read lives on the weigh-in route as GET rather than in a new route.
- **Owner to confirm:** `pounds` is a JSON number, not a formatted "150.0" string, so whole pounds may show without the decimal.
- The editor's `weightLog.week` now uses the shared helper. Its SQL is unchanged, and the router test's expected query order is reversed.

## Cache

Follow-up after #154 merged (f2b254e0). The owner asked for the prompt not to wait on the network. apple-health commit `84e31f0`, local and not pushed, sits on top of `4f83013`. It changes the same four files and nothing else.

- **Write.** After the notification and the Mac's Quick Look, Log Weight runs Get Dictionary Value `pounds` on `Answer`, then a Text, then Save File to `apple-health-sync/log-weight-last.txt` (Ask Where to Save off, Overwrite on). The value is the pounds the site saved, rounded to one decimal. The write runs only on the success path: a refusal stops earlier, and Cancel on the Replace menu stops earlier too, so neither writes. It runs last so that a failed write cannot hide the notification.
- **Read.** At launch the Shortcut runs Get File from Folder on the same path with Error If Not Found off, then a Text of that file. The Text is the Ask's default number. No request runs before the Ask, so the prompt shows at once, offline too.
- **Path.** The lead suggested `Shortcuts/Log Weight/last.txt`. I used the existing `apple-health-sync/` folder in the Shortcuts iCloud container, the one Health Daily Sync already saves into on the phone, so Save File never has to make a folder. The file sits outside `inbox/`, so the importer never sees it.
- **The GET is dropped, not kept for a cache miss.** A miss happens about once per iCloud account, because the file syncs between the phone and the Mac. A fallback would put a network wait, an If/Otherwise, and a variable-backed default (an unattested shape) in front of the prompt, all to fill one prompt. Offline, a first-run GET would also stop the run before the prompt. The site's `GET /api/weight-log/weigh-in` stays deployed and harmless, but no Shortcut calls it now. Removing it is the lead's call.
- **Check.** `log_weight_check` now refuses any Get Contents of URL before the Ask, and requires that the Ask's default be a Text of the cache file read with Error If Not Found off. It also requires exactly one Save File, to the cache path, overwriting without asking, after the notification, outside every branch, holding `pounds` from `Answer`. New tests cover each rule, with five mutations that must fail. All 98 tests pass. The rebuild has 53 actions and passed the structure check and the vendored validator for macOS and iOS, and the signed file is in `shortcut/private/` at mode 600.
- **Runbook.** L2's steps 4 and 5 are now the file read and the prompt. A new step 13 writes the cache, the later steps are renumbered with their cross-references, and L3 step 3 says the first prompt is empty and later ones start from the file.

Limits:

- **An edit on the site doesn't reach the cache.** A correction on `/weight-log/edit` doesn't change the file, so the next prompt still shows the last value the Shortcut saved. The next Shortcut save fixes it. The lead accepted this for a placeholder.
- **Excluded weigh-ins.** The cache holds whatever the Shortcut saved, even if that date's weigh-in is excluded. The site's GET would have skipped it.
- **Two devices.** A save on one device reaches the other's cache only after iCloud syncs the file.
- **Get File is unattested on the device (NOTES.md row).** If it errors on a missing file despite the flag, the first run stops before the prompt. Creating the file once by hand would fix that. If it reads nothing, every prompt starts empty and saves still work. Nothing ran on a device.

## Next steps

1. Owner merges #154 when ready. The lead runs the status-code check after deploy.
2. On the Mac, delete Log Weight in Shortcuts, double-click `~/Desktop/Agents/apple-health/shortcut/private/Log Weight.shortcut` (built from `84e31f0`), and run it twice (runbook L3). The first prompt is empty. After the save, `apple-health-sync/log-weight-last.txt` should appear in the Shortcuts iCloud folder, and the second prompt should start from it at once.
3. If the first run stops on a missing file, or the default never fills, record it in NOTES.md. Until then the prompt starts empty and the save still works.
4. Push apple-health `4f83013` and `84e31f0` when the owner says to.

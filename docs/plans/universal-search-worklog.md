# Universal Search implementation worklog

This log records implementation shortcuts, issues, ambiguities, judgment calls, review findings, and follow-up work for [`universal-search.md`](./universal-search.md).

## Status

- Started: August 22, 2026
- Parked: August 23, 2026 (input corruption unexplained)
- Root cause found and shell rewritten: August 28, 2026
- Current phase: enabled at the root layout; awaiting the owner's manual Arc typing pass before merge

## 2026-08-28: The real root cause, and the rewrite

The typing corruption never came from the palette. `StacksHome` registers a
document-level `selectionchange` listener that calls
`window.getSelection().removeAllRanges()` to stop WebKit from selecting scene
text. Its allowlist checks the selection's `anchorNode`/`focusNode`, but
Chrome hides a text field's caret from `window.getSelection()` — the anchor
reports an ancestor of the input — so the allowlist never matched and the
clearer collapsed the search input's caret to 0 whenever typing paused long
enough for the coalesced `selectionchange` task to run (~30 ms). That one
listener produced every reported symptom: characters prepended out of order
at human typing speed, drag selections destroyed on release, Backspace
deleting nothing at caret 0. Fast synthetic typing outpaced the coalesced
event, which is why every automated browser test passed while real typing in
Arc failed. The fix adds `selectableElementFor(document.activeElement)` to
the clearer's bail conditions; `touchArchitecture.test.ts` pins it.

The palette's original hand-rolled shell — `preventDefault` on every
printable key, manual `setRangeText` editing, synthetic `InputEvent`
dispatch, three competing caret restorers, and a window-level
`focusin`/`focusout` reclaim loop — was fighting that clearer and losing,
and was itself capable of reordering keystrokes. It is gone. The palette now
uses the composition the AIC and OpenLattice palettes use: Radix Dialog owns
the portal, focus trap, Escape, and outside dismiss; cmdk owns the input,
arrow selection, and Enter; the input is a plain controlled `Command.Input`.
The controller keeps the shortcut, lazy load, idle preload, scene marker,
pointer-lock release, and focus restore, and loses all focus-reclaim
machinery. `overlay.ts` shrinks to the open marker; the focus-intent helpers
are deleted. One found-in-passing bug: an `autoFocus` attribute on the input
defeats Radix's trap bookkeeping (the FocusScope skips its mount focus and
never records a last-focused element, so later reclaims focus nothing), so
Radix performs the initial focus itself.

The same session reworked presentation to match the AIC palettes: the panel
is top-anchored (`top-4 sm:top-[16vh]`) so the input and the top of results
hold a fixed Y through every loading state; async groups render headings
only with rows or a reportable error (settled-empty groups render nothing);
one anonymous pulsing skeleton group stands in for providers still searching
(anonymous so the private Dad group is not advertised); and settled-zero
shows a centered magnifier with `No results for "query"`.

### 2026-08-28 round two: owner presentation feedback

Ten owner notes, all applied. Keycaps (`Keycap`/`KeycapSequence`) replace the
text ESC chip and footer hints. The panel material is now per-surface: the
placard glass renders only over the 3D world (`html[data-world]`); flat
pages get a plain frosted `bg-background/85` + 24px blur, and the overlay
blur is world-only. Exit animation works via `data-[state=closed]:animate-out`
(Radix waits for the CSS animation before unmounting; the old mount-only
`animate-in` classes never ran on close). Vertical padding tightened one
step across input, rows, headings, and footer. Width dropped 42rem → 30rem.
The glass got less gray (light `brightness(1.34)`, dark `bg-black/32` +
`brightness(0.52)`). Selection is a warm translucent tint with an inset ring
(AIC's accent-plus-ring treatment) instead of flat `bg-secondary`. Book
results show their covers (`cover_url` threaded through the provider,
`imageUrl` on `SearchResult`, sanitized to http(s), rendered via
`next/image`). Note-text matches carry an "In notes" provenance label and
all result text highlights query matches with `<mark>` (AIC platform's
highlighter, reimplemented with odd-index split matching).

The "12 → Books search unavailable" report was a provider deadline miss,
not a query bug: `ts_rank_cd` recomputed the full 500KB note vector per
matching row, and common tokens match 100+ books. The `EXPLAIN` the first
implementation left unproven now exists: the GIN expression index IS used
for `@@`; only ranking was expensive. Ranking now uses a bounded
`BOOK_SEARCH_RANK_SQL` (first 50KB of stripped notes; A/B title/author
weights dominate ordering anyway) while matching keeps the indexed
expression. The provider deadline widened 1.5s → 2.5s and the books
statement timeout 1.2s → 2s, which also absorbs cold Neon connections in
dev.

### 2026-08-28 round three: surface-consistent chrome

Light-mode glass over the world brightened again (white tint to 0.5 alpha,
`brightness(1.5)`); dark stays as tuned. The `Keycap` component is now
context-aware through pure CSS: flat bordered caps by default, upgraded to
the physical gradient cap only under `html[data-world]` via arbitrary
variants — so the palette, the theme/font tooltips, and all scene chrome
pick the right look with no per-callsite wiring and no hydration risk.
Selection tint rebuilt on the `primary` token (`bg-primary/10` +
`ring-primary/15`) so it carries the site's own neutral warmth in both
themes instead of a browner one-off hsl. Width 30rem → 36rem.

Public-writing results now carry thumbnails: `PublicSearchDocument` gained
an optional validated `image` (root-relative or https, never YouTube), the
generator emits Medium `thumbnail` URLs for musings and
`/images/projects/<file>` for linked projects, and the runtime maps it to
`SearchResult.imageUrl`. Books render portrait covers (26×39), articles and
projects render landscape captures (40×26). The committed index asset was
regenerated (58 documents, 16 with images) and stays covered by
`pnpm check:search-index`.

### Verification

- `pnpm verify` green end to end (2,500+ unit tests, types, lint, fresh
  search index, meadow).
- `node scripts/search-input-stress.mjs` against a dev server drives real
  Chromium over the live 3D scene: 26 checks covering fast bursts, typing
  across provider arrivals, mid-string insertion after idle pauses,
  keyboard and mouse selection, double-click word selection, copy/paste,
  slow human-cadence typing (the shape that reproduced the original bug),
  scene focus steals, fixed input Y through loading, list navigation,
  Escape/reopen, and Enter activation. All pass.
- Still required before merge: the owner typing in actual Arc over the 3D
  scene — insertion order, selection, deletion, caret movement, paste, and
  composition (IME) input, which no automated pass here exercises.

## TDD slices

- [x] Registry types, inventory, URL resolution, and ranking
- [x] Recent-result storage and privacy rules
- [x] Privacy-safe analytics contracts
- [x] Eager shortcut controller and lazy import boundary
- [x] Palette keyboard and focus behavior
- [x] Generated public-content index and freshness check
- [x] Server search contract and query validation
- [x] Book identity, tag, and note search
- [x] Weightlifting exercise search and destination serialization
- [x] Dad access gating, indexing, and excerpt safety
- [x] Progressive provider state, cancellation, caching, and stable selection
- [x] Empty, loading, error, and settled-zero states
- [x] Accessibility and theme-aware presentation
- [x] Initial-route bundle and full verification gates
- [x] Claude Code antagonistic review and remediation

## Decisions and judgment calls

### 2026-08-22: Keep the root provider boundary small

The root layout will mount only the shortcut controller. It will not gain `TRPCReactProvider` and will not read cookies. This avoids making every route dynamic and avoids overlapping the route-specific Query Client providers already used by Books, Weightlifting, and Dad.

### 2026-08-22: Use the existing Dad gate as the current authorization contract

Search must require the same `dad-access` cookie as the Dad layout. The existing cookie is a literal marker rather than a signed token. Strengthening that gate is outside this feature unless tests prove search would weaken the existing behavior. Dad results will never enter local storage, analytics payloads, or a public generated asset.

### 2026-08-22: Keep search data out of the idle preload

Idle work may download the palette UI chunk. It must not fetch the generated public index or call the search API. Content providers begin only after the palette is open and the normalized query has at least two characters.

### 2026-08-22: Avoid CSS backdrop sampling

The palette will use a near-opaque fill, scrim, border, and shadow. It will not use `backdrop-filter`, so it does not add a performance-sensitive effect that would need a Scene Diagnostics control.

### 2026-08-23: Supersede the no-blur treatment

The first rendered treatment looked pale behind the palette but left the page sharply visible. The scale animation also overwrote the panel's translate transform, making it enter from the side. The user asked for a centered entrance and real blur. The panel now centers through the independent CSS `translate` property, while the scrim and panel use approved backdrop filters. Scene Diagnostics exposes a reload-resetting live blur switch; its off path removes the backdrop-filter classes and does no backdrop sampling.

### 2026-08-22: Exclude YouTube-backed talks completely

This supersedes the earlier interpretation that authored talk metadata could remain searchable. The user's final direction was "except YouTube at all." Universal Search therefore excludes the YouTube route, private YouTube data, every YouTube destination, the speaking records whose destinations are YouTube, and the Featured Talks search destination.

### 2026-08-22: Make Dad authorization work across site subdomains

The existing `dad-access` cookie is host-only. That means a visitor who unlocks Dad on the root domain is not authorized when the same search endpoint runs on Books, Manual, Routine, or Weightlifting subdomains. The implementation must give the cookie the shared parent domain in production and cover that behavior with a focused test. This broadens the existing gate across the same site family but does not change what value grants access.

### 2026-08-22: Repair the Dad gate before adding protected search

This supersedes the earlier decision to trust the literal `authenticated` cookie. The current server action can be called directly and the layout, proxy, and tRPC middleware accept any nonempty cookie. Search will not expose Dad excerpts until the password is verified inside the server action and the cookie is a signed, password-bound token validated by every Dad boundary. The shared production cookie domain is required for authorized search on all site subdomains; localhost remains host-only.

## Known ambiguities

- The exact production URL shape for homepage section deep links must be derived from the current Stacks navigation helpers rather than invented in the registry.
- The generated public index format is not fixed. Tests should define deterministic extraction and freshness before choosing the serialized shape.
- Drizzle may not represent the planned Postgres expression index cleanly. A hand-authored SQL migration is acceptable if the schema file cannot express it without a misleading declaration.
- The plan names a 120 to 150 millisecond debounce. The implementation should choose one constant and test that value rather than expose a range.
- `cmdk` keyboard behavior must be checked against Radix Dialog before adding duplicate focus or active-descendant logic.
- Stable selection means preserving the selected result ID as groups arrive. Fixed group slots will prevent an earlier group from visually displacing the current row where practical.
- Node tests can prove synchronous static rendering, but they cannot prove an actual browser paint. The build and source boundary will be the non-browser evidence unless browser testing is explicitly authorized later.

## Shortcuts taken

- The current plan's full-text Postgres index can be proven by migration and query tests, but index use under production data requires a real Postgres `EXPLAIN`. If no representative database is available, that verification must remain explicitly unproven rather than inferred.

## Issues found

- Dad access is currently host-only and conflicts with the requirement that authorized Dad search work from every subdomain.
- The current Dad cookie is forgeable because its server action does not verify the password and downstream boundaries accept any nonempty value. This must be fixed before protected search ships.
- Stored Recent-result records previously accepted arbitrary schemes and stale YouTube URLs. URL validation now rejects non-HTTP navigation, protocol-relative links, and all YouTube hosts.
- Existing Books and Weightlifting dialogs own global focus and Escape handlers. They now yield whenever the root search marker is present so Command-K can safely layer over them.
- Vitest currently runs in Node and the repo has no Testing Library dependency. Controller and focus TDD will use pure state seams where possible; a lightweight DOM test dependency may still be needed for the Radix integration.

## Review findings

### Claude Code

Claude Code completed a read-only antagonistic review in an interactive session. It verified the hard YouTube exclusion, privacy boundaries, lazy split, canonical book paths, weightlifting serializer, and focused test coverage. It found four blockers: same-document homepage hashes did not move the 3D scene; the initial book query defeated its own GIN index; the custom Drizzle migration lacked a snapshot; and punctuation-normalized queries could not match punctuated canonical tags.

All four were remediated. `ScrollBridges` now owns direct `hashchange` travel, and same-document palette navigation notifies existing history owners. Book identity/tag matching is a cheap normalized branch; note full-text matching is a separate indexed branch joined with `UNION ALL`, so wildcard predicates cannot force the note vector into a sequential OR scan. Drizzle generated migration 0015 as a custom migration with a valid 0015 snapshot, and `pnpm db:generate` reports no schema drift. SQL normalizes both tag values and queries before comparison.

The review also found a stuck overlay marker after a failed palette chunk, production escapes from preview deployments, invalid duplicate live regions, a hard-coded zero-result provider count, a stale generated-index HTTP cache mode, and an unguarded URL parse. Those are fixed and covered by focused tests. Dad Markdown now compiles into an ignored private server index during prebuild, and `/api/search` explicitly traces that one artifact. This avoids both the symlink-tracing failure and hundreds of cold-start file reads. A signed preview request remains the final deployment-level proof.

### Independent agents

The test-matrix audit produced a requirement-to-evidence map for all eight slices. It also flagged cookie scope, stable selection, response limits, DOM-test setup, and build-manifest inspection as places where a passing narrow unit test would not prove the full requirement.

## Verification evidence

- Red run: five new test files failed because the contract modules and analytics builders did not exist.
- Green run: `pnpm vitest run src/lib/universal-search/{registry,urls,ranking,recents,analytics}.test.ts` passed 17 tests.
- Green run: the controller, palette, shell wiring, overlay coordination, actions, and contract suites pass 43 focused tests. `pnpm typecheck` and targeted ESLint also pass.
- Final `pnpm test`: 235 files and 1,935 tests passed.
- Final `pnpm typecheck`: passed after Next route-type generation.
- Final `pnpm lint`: passed with zero warnings.
- Final `pnpm check:search-index`: the 57-document public asset is fresh and contains no YouTube data or destinations.
- Final `pnpm db:generate`: Drizzle found no schema drift after custom migration 0015 and its snapshot.
- Final `pnpm build`: passed, including route budgets and the Universal Search boundary check. Homepage remained 259.0 KB gzip against a 275 KB budget; Books remained 255.5 KB against 350 KB.
- The palette is one 44,232-byte lazy chunk and appears in none of 53 initial client entries. The generated public corpus digest appears in no initial chunk. `/api/search` traces exactly one ignored private Dad index.
- `git diff --check`: passed.

## Next steps

1. Apply migration `0015_book_search_vector` through the normal production migration workflow before or with deployment.
2. Deploy separately when requested; deployment is not part of this implementation turn.
3. On a signed preview, verify the authorized Dad result path and characterize its cold parse latency. This is deployment evidence, not a source blocker.

## Palette material and shortcut focus follow-up

The palette now uses the homepage placards' material values instead of an opaque generic UI surface: a warm stone tint in light mode, a nearly clear black tint in dark mode, 80px backdrop blur, restrained saturation and brightness, fine translucent borders, and the same inset edge highlights and diffuse depth shadow. The scrim uses a lighter color wash with a 10px blur so the room remains legible as the source of the glass color. Scene Diagnostics still owns one live blur switch; its off path removes backdrop filtering from both layers.

A repeated Command-K or Control-K keydown previously toggled the palette closed immediately after opening. The controller now consumes shortcut auto-repeat without toggling, while a deliberate later shortcut still closes the palette. A second live report exposed separate homepage integration gaps: the scene's capture-phase wheel bridge continued to own wheel events while search was open, a deferred scene focus job could run one frame after the dialog autofocus, and free-roam pointer lock could continue suppressing movement-key input. The scene now yields wheel and navigation-key ownership whenever the root search marker is present, the result list is an explicit native scroll region, the controller reclaims input focus on the following animation frame, and opening search releases pointer lock. The palette test also verifies that autofocus, typing, outside-focus containment, and focus through result rerenders all hold.

Focused evidence covers shortcut auto-repeat, deferred scene focus, scene input ownership, native result scrolling, autofocus, typing, and the live visual-effects switch.

## Dad authorization hardening

### 2026-08-22: Replace the forgeable marker with a password-bound token

`dad-access=authenticated` no longer grants access. The server action now accepts the submitted password, checks it before writing a cookie, and stores an HMAC token derived from the current password. Rotating `DAD_CONTENT_PASSWORD` invalidates every existing Dad cookie without a separate revocation store.

The Dad layout, route proxy, and Dad tRPC middleware all call the same constant-time validator. Missing values, arbitrary strings, the old literal marker, and tokens signed with a previous password fail closed. The validator compares encoded byte lengths before calling `timingSafeEqual`, so a malformed 64-code-unit non-ASCII cookie returns false instead of throwing. Password checks in both the action and Dad tRPC mutation also compare fixed-length digests rather than raw strings.

### Cookie scope judgment

Canonical `chappyasel.com` hosts set `Domain=.chappyasel.com` so an unlock on one site subdomain authorizes Dad search on the others. Localhost and preview deployment hosts remain host-only. This widens where the browser sends the signed token within the controlled site family. It does not grant access without the current password.

### Evidence

- Red run: the access and action suites failed before the signed-token module existed; the proxy suite proved that the old literal marker still passed.
- Green run: `pnpm vitest run src/lib/dad/access.test.ts src/app/dad/actions.test.ts src/proxy.test.ts` passed 10 tests.
- `pnpm typecheck` passed.
- Targeted ESLint passed with zero warnings for the Dad access module, action, gate, layout, proxy, and tRPC middleware.

### Remaining issue outside this slice

`/api/dad-images` was previously identified as lacking the Dad gate. Universal Search must not index or return image paths. Hardening that separate image endpoint remains follow-up work unless it enters the search data path.

## Public-content index

### 2026-08-22: Index only records with usable, non-YouTube destinations

The generated asset contains Manual sections, Routine sections and items, cached Medium posts, and linked projects. Project cards without a link are omitted because search could not activate them. Following the final strict YouTube exclusion, `speaking.json` is not read or included in the digest. The generator and runtime parser also reject YouTube hosts if one appears in another public source.

Manual and Routine blocks flatten to plain text across paragraphs, headings, quotes, callouts, toggles, nested lists, tables, and image alt text. Search excerpts strip HTML-shaped markup and clip by Unicode code point to 220 characters.

The client API is `queryPublicSearchIndex(query, { location, signal?, fetcher? })`. It fetches `/data/universal-search-index.json` only when called, caches the parsed asset at module scope, and returns up to six `public-writing` results. Query cancellation does not cancel the shared first asset download. It rejects the stale caller before using the loaded data, which keeps one obsolete query from breaking a concurrent current query.

The committed asset is 51,616 bytes and contains 57 documents: 5 Manual, 37 Routine, 9 Musings, and 6 linked Projects. It contains no YouTube URL, route, record, or video ID.

### Public-index evidence

- Red runs failed because the generation, runtime, and artifact modules did not exist. The later client-API test also failed until the abort-aware wrapper replaced the initial pure-only API.
- Green run: `pnpm vitest run src/lib/universal-search/public-index-artifact.test.ts src/lib/universal-search/public-index-generation.test.ts src/lib/universal-search/public-index.test.ts` passed 13 tests.
- `pnpm generate:search-index` wrote the asset, and `pnpm check:search-index` passed against it.
- Targeted ESLint passed with zero warnings for `src/lib/universal-search/public-index*.ts`.
- Full typecheck was temporarily unavailable during this slice because concurrent server-provider TDD had added tests for modules that did not exist yet. Those errors were confined to `src/lib/universal-search/server/*.test.ts`.
- `pnpm verify:artifacts` reached the existing homepage OG check first and reported that artifact stale, so the combined command did not reach its search-index step. The search-specific freshness command passes independently. Regenerating the homepage OG image is outside this slice.

## Server providers and progressive loading

The server route validates normalized queries between two and eighty Unicode code points, runs Books, Weightlifting, and authorized Dad providers concurrently, caps each group at six results, clips excerpts to 220 code points, and returns fixed group states. It applies a 1.5-second provider deadline, 1.2-second database statement deadlines, `private, no-store, max-age=0`, and `Vary: Cookie`. Errors are logged on the server but reduced to provider status in the response.

Books preserve the website's visible-cache rule: a record must have `started` or `finished`. Identity, author, and canonical-tag matching use normalized SQL text. The note full-text branch is separate from wildcard identity matching, so its exact GIN expression remains indexable. The custom migration was generated through Drizzle's `--custom` workflow and has matching journal and snapshot metadata. `pnpm db:generate` reports “No schema changes, nothing to migrate.” Actual planner use after migration remains unproven until a representative deployed database can run `EXPLAIN`; this is not inferred from source alone.

Weightlifting reuses the chart-selectable exercise query and the existing `nuqs` serializer. Dad builds an ignored `content/dad-search-index.json` artifact during prebuild, reads it once per process, and never enters the public asset, browser cache, Recents, or analytics. `next.config.js` traces that single private file into `/api/search`; the production build trace is the local proof, while a signed preview request is still required to prove deployment packaging and cold-start behavior.

The browser renders registry matches synchronously, waits 140 ms before async work, aborts superseded requests, ignores stale responses, isolates provider failures, and keeps selected IDs stable as fixed-position groups settle. Public writing, Books, and Weightlifting results use a session cache. Dad results never do. The server request is intentionally repeated even when public groups are cached because the HTTP-only Dad authorization state may have changed after an unlock; skipping it would make newly authorized Dad results stale until reload.

## Remaining limitations and deferred work

- Pointer and mobile triggers remain TODO by explicit user direction. The dialog itself remains width-constrained at narrow viewports.
- There is no process-local search rate limiter. Query bounds, debounce, result limits, statement deadlines, and the now-indexable note branch bound application work; platform-level rate limiting remains the durable production option.
- `/api/dad-images` predates this feature and remains outside the Dad gate. Search does not index or return image paths.
- Dad's first authorized query on a cold server instance parses the 1.1 MB private artifact once. The promise stays warm per process, but only a deployed preview can characterize cold latency.
- `pnpm verify:artifacts` still encounters the unrelated stale homepage OG artifact before its search-index step. Search freshness is also a deterministic `pnpm verify` step and passes independently.
- Browser automation and network-panel paint evidence were not run because repository instructions prohibit browser automation unless explicitly requested. Synchronous DOM tests and production manifest checks are the non-browser evidence.

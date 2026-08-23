# Universal Search implementation plan

Status: implemented and verified on August 23, 2026. Shared product decisions were confirmed on August 22, with the centered blur treatment approved on August 23.

## Outcome

Add a keyboard-first Command palette that opens with Command-K on macOS and Control-K elsewhere from every route in the root layout. Static destinations and actions appear immediately. Search providers add books, public writing, weightlifting exercises, and authorized Dad writing without delaying static results.

The first release has no pointer trigger or dedicated mobile entry. Those remain follow-up work. Golf and YouTube are excluded.

The access decision is recorded in [ADR 0002](../adr/0002-universal-search-preserves-access-boundaries.md). Shared terms live in [`src/lib/universal-search/CONTEXT.md`](../../src/lib/universal-search/CONTEXT.md).

## Reference takeaways

- OpenLattice supplies the typed central registry, separate result groups, and explicit action IDs. Its in-window desktop-app treatment is not a visual match for this site.
- AIC Platform supplies the useful provider split and Recent-result behavior. Its pinned-item controls and eager data preload are out of scope.
- AIC Website supplies the closest Next.js root-provider pattern and grouped `cmdk` composition. This plan adds a stricter lazy boundary so its full palette component does not enter every route's initial bundle.

## Product behavior

### Opening and closing

- Command-K and Control-K toggle the palette, including when an input has focus.
- Escape closes it and restores focus to the prior element.
- Arrow keys move through results, Enter activates the selected result, and Tab stays inside the dialog.
- Closing clears the query but preserves provider caches for the browser session.
- The first release does not add a visible trigger. The controller should expose an imperative `openUniversalSearch()` function so a later trigger does not require a redesign.

### Empty query

- Show up to eight Recent results from versioned local storage.
- Follow with the promoted destinations and common Site actions.
- Do not fetch content data for an empty query.
- Offer actions for Light, Dark, and System themes; Georgia, Literata, and System fonts; and clearing Recent results.

### Non-empty query

- Match the Command registry synchronously on every keystroke.
- Start providers after two normalized characters and a 120 to 150 millisecond debounce.
- Keep Result groups in this order: destinations, books, public writing, weightlifting, authorized Dad writing, and Site actions.
- Never move the selected row when a provider finishes. New groups append in their fixed positions.
- Within a group, rank exact identity matches first, then prefixes, aliases and tags, then body text.
- Show at most six results per provider and a short highlighted excerpt for body matches.
- Show provider-specific loading and error rows. One failed provider must not blank the other groups.
- A zero-result message appears only after every eligible provider settles.

## Search corpus

| Provider         | Searchable fields                                                 | Destination                                                    |
| ---------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| Command registry | Labels, aliases, keywords                                         | Internal page, homepage section, external page, or Site action |
| Books            | Title, author, tags, note Markdown                                | Canonical book detail URL                                      |
| Manual           | Section title and rendered block text                             | Manual section hash                                            |
| Routine          | Section title, timeline item, supplement, and rendered block text | Routine section hash                                           |
| Musings          | Cached Medium title and description                               | Existing external article URL                                  |
| Projects         | Name, languages, and description                                  | Existing internal or external project URL                      |
| Weightlifting    | Exercise display name and category                                | Weightlifting URL with that exercise selected                  |
| Dad              | Journal and insight title plus Markdown body                      | Existing Dad route, only with Dad access                       |

Do not index navigation chrome, generated chart labels, analytics summaries, Golf, or any YouTube route, record, URL, or YouTube-backed talk. The Featured Talks homepage section is also excluded from search.

## Architecture

```text
Root layout
  -> eager shortcut controller
       -> idle preloads the palette chunk
       -> first Command-K mounts the palette

Lazy palette chunk
  -> typed Command registry and local matcher
  -> Recent result store
  -> Site action runners
  -> public-content provider
  -> server search provider
       -> books
       -> weightlifting exercises
       -> Dad index when the request has access
```

### Eager controller

Add `UniversalSearchController` inside the existing Theme and Font providers in `src/app/layout.tsx`. The controller owns only open state, the global key listener, focus restoration, and the lazy import boundary.

Use a shared import function with `React.lazy` or `next/dynamic`. Schedule that import with `requestIdleCallback` after first paint, with a short timeout fallback for browsers without the API. Pressing the shortcut before idle loading finishes starts the same import immediately. Do not import the registry, `cmdk`, icons, result components, or provider code from the eager controller.

The palette must stay a DOM overlay. It must not allocate WebGL resources or interact with the homepage scene render loop.

### Typed Command registry

Create one readonly registry in `src/lib/universal-search/registry.ts`. Define discriminated entry types for destinations and Site actions. Every entry has a stable ID, label, aliases, keywords, group, icon key, and target or action ID. Promoted entries also carry empty-state ordering.

The registry owns:

- Home, Book Notes, Manual, Routine, About, Weightlifting, Systems, Projects, Musings, and Liar's Dice
- Deep links to the corresponding homepage sections
- Theme, font, and Recent-result actions

Liar's Dice is searchable but not promoted. Golf and YouTube do not appear in the registry. Dynamic detail records never enter this file.

Keep URL construction in `src/lib/universal-search/urls.ts`. It must preserve the production subdomain URLs and local development subdomains already used by `proxy.ts` and `src/lib/util.ts`. Selection navigates in the current tab. New-tab commands are deferred.

### Local matching and stable ranking

Implement matching outside `cmdk` and set `shouldFilter={false}`. Normalize case, punctuation, apostrophes, and repeated whitespace once. Score exact, prefix, token-prefix, substring, alias, metadata, and body matches with explicit numeric tiers. Use the same score contract for registry and provider results so tests can state why one result wins.

The palette owns group order. Providers own ranking only within their group. When a provider returns, preserve the current selection by stable result ID rather than list index.

### Public-content provider

Create a build-time indexer that converts the existing Manual and Routine Notion blocks to plain text and reads `blog-posts.json` and `projects.json`. Emit a compact versioned JSON search asset under `public/data/`. Add a freshness check alongside the existing generated-artifact checks so source edits cannot leave the index stale. Do not read `speaking.json`; its records are YouTube-backed and excluded completely.

Fetch this asset only after the first qualifying query. Cache the parsed document list in module memory for the session. Search it locally so later queries do not make a request. Keep the generated asset out of the palette UI chunk.

The Medium cache contains titles and descriptions, not complete article bodies. Search only what the repository actually stores.

### Server search provider

Add `GET /api/search?q=...`. The proxy matcher already excludes `/api`, so the same endpoint works from the main domain and every rewritten subdomain without adding a global tRPC provider.

The handler should:

- Validate and normalize a bounded query.
- Search books and weightlifting exercises concurrently.
- Search Dad content only when the request has the existing `dad-access` cookie.
- Return fixed groups with stable IDs, labels, destinations, match kind, score, and excerpts capped at roughly 220 characters.
- Return no complete notes or Dad bodies.
- Set private, non-store caching because the response may vary by Dad access.
- Cap response size and execution time. Provider failure details stay on the server.

Use an `AbortController` in the browser to cancel stale queries. Keep a small session map keyed by normalized query so reopening the palette does not repeat work.

For books, add a Postgres full-text expression index over title, author, and notes through the next migration. Query tags through the existing `book_tags` relation and combine identity and full-text scores. Preserve Notion as the source of truth and treat the mirror as read-only outside normal application queries.

For weightlifting, query distinct visible exercise display names and categories. Build the destination with the existing `nuqs` serializer rather than hand-writing the `exercises` parameter.

For Dad, generate an ignored server-only index from the current Markdown during prebuild, trace that private artifact into `/api/search`, and parse it once per process. Use the same title, excerpt, and ranking contract as public writing. Match the existing gate exactly and never add Dad data to `public/`, browser caches, Recents, or analytics.

### Recent results

Store at most eight selections in `localStorage` under a versioned key. Save only stable result ID, kind, label, destination, and last-selected time. Never store query text, excerpts, or protected Dad results. Drop entries that no longer resolve against the current registry or provider response.

### Analytics

Extend `src/lib/analytics.ts` with typed events for:

- palette opened
- provider settled with duration and result count
- zero results after all providers settle
- result selected with kind, group, rank, and match kind

Do not send query text, excerpts, titles, destination URLs, result IDs, or protected-content identifiers to PostHog. Unit tests should assert the event payload allowlist.

### Visual and accessibility treatment

Build on Radix Dialog and add `cmdk` for listbox behavior. Keep the dependency inside the lazy chunk.

Use one theme-aware design on every route:

- warm background with restrained translucency and a fine border
- strong selected-row contrast in light and dark themes
- Georgia or Literata for editorial text and the existing sans face for compact controls
- Phosphor icons resolved inside the lazy chunk
- compact group labels, highlighted excerpts, and a keyboard-hint footer
- a short opacity and scale transition that becomes instant under reduced motion
- correct dialog naming, focus trap, active-descendant behavior, and status announcements for provider completion

Use the homepage placards' native-glass language rather than generic UI translucency: a warm stone tint in light mode, a nearly clear dark tint, restrained saturation and brightness, an 80px panel blur, inset edge highlights, and a diffuse depth shadow. Keep a lighter 10px blur on the scrim so the room remains visible as the material's color source. Keep the panel centered in the viewport with the independent CSS `translate` property so its scale animation cannot overwrite centering. The approved blur is live-switchable under Scene Diagnostics → Render → Optional rendering; switching it off removes both backdrop-filter classes and their sampling work until reload.

The desktop dialog should fit narrow laptop viewports and constrain long excerpts. Pointer and mobile triggers remain TODO, but the dialog itself should not break at narrow widths.

## File plan

Create:

- `src/components/universal-search/UniversalSearchController.tsx`
- `src/components/universal-search/UniversalSearchPalette.tsx`
- `src/lib/universal-search/types.ts`
- `src/lib/universal-search/registry.ts`
- `src/lib/universal-search/ranking.ts`
- `src/lib/universal-search/recents.ts`
- `src/lib/universal-search/urls.ts`
- `src/lib/universal-search/public-index.ts`
- `src/lib/universal-search/server/search.ts`
- `src/lib/universal-search/server/dad-index.ts`
- `src/app/api/search/route.ts`
- `scripts/generate/universal-search-index.ts`
- focused unit and route tests beside those modules

Modify:

- `src/app/layout.tsx` to mount the eager controller
- `src/lib/analytics.ts` for privacy-safe event helpers
- `package.json` and `pnpm-lock.yaml` for `cmdk` and index generation
- `scripts/verify.mjs` or the artifact checker to verify index freshness
- `.agents/skills/book-notes/references/schema.md` to document the indexed query workflow
- the next SQL migration for book full-text indexing

Do not move `TRPCReactProvider` to the root or make the root layout dynamic by reading cookies there. Keep `proxy.ts`, the Dad layout, tRPC, and server search on the same signed Dad-token validator.

## Delivery sequence

1. Add types, registry, URL builders, ranking, and tests.
2. Add the eager controller, lazy palette, keyboard behavior, actions, and Recent results.
3. Add the generated public-content index and its freshness check.
4. Add the server endpoint for books, weightlifting, and authorized Dad results.
5. Add stable progressive group state, cancellation, caching, excerpts, empty and error states.
6. Add privacy-safe analytics and accessibility checks.
7. Tune the theme-aware presentation against existing design tokens.
8. Run the full verification and build budget checks.

Each step should leave static registry search usable. Provider work can land independently after the shell and registry exist.

## Verification

Unit tests should cover:

- unique registry IDs, valid destinations, aliases, promotion order, and the explicit Golf and YouTube exclusions
- exact, prefix, alias, tag, and body ranking
- stable selection while provider groups arrive out of order
- query normalization, debounce, cancellation, stale-response rejection, and session caching
- Recent-result versioning, cap, clear action, malformed storage, and protected-result exclusion
- Manual and Routine block extraction, generated-index freshness, and safe excerpt highlighting
- Dad access checks and the absence of protected text from unauthorized responses
- server response limits, malformed queries, partial provider failure, and no raw content in errors
- theme and font action dispatch
- analytics payload allowlists
- focus restoration, Escape, keyboard selection, and accessible names

Run:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

The build must keep the existing route budgets green. Inspect the build manifest to confirm that `cmdk`, registry icons, generated content, and provider code do not enter initial route chunks. Before opening the palette, there must be no search-data request. Static matches should paint in the first committed palette frame, and superseded server queries must abort.

Browser automation is not part of this plan unless explicitly requested, per the repository instructions.

## Deferred work

- route-integrated pointer triggers
- a fallback trigger for routes without a header
- dedicated mobile entry and touch-specific layout tuning
- user-managed pinned results
- richer context-aware commands
- typo-tolerant or semantic retrieval if usage data shows the deterministic ranker is insufficient

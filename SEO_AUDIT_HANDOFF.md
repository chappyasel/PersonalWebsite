# SEO audit and friends handoff

Task: `personalwebsite-seo-friends`

Audit date: 2026-10-03. Worktree: `/Users/chappyasel/.superset/worktrees/PersonalWebsite/seo/friends-preparation`. Branch: `seo/friends-preparation`. Original audit base: `2e7433d8b75d147d2e3a97ed08698b861459a974`. Shipping preparation incorporated upstream `af0223432311538041fc687fadf607445e96fb38` by fast-forward in this worktree. The original base remains in its history.

## Scope and evidence

This is a source-code audit with isolated tests. The supplied production observations say that `www.chappyasel.com` already has metadata, canonical, WebPage and Person schema, bio HTML, robots, and sitemap, while `/friends` and `/now` return 404. I did not repeat those live checks. Neither route exists in this checkout.

The audit used no browser, production requests, submissions, database connections, private records, credential contents, or build content-fetch hooks. The later shipping request authorizes committing and pushing through the existing production workflow. The main checkout and other worktrees remain untouched. Local environment filenames were enumerated without reading their contents. The test configuration disables Vite's environment-file loading. Query/provider imports in the new metadata tests are mocked.

## Findings by priority

### P1: canonical hosts now follow the approved URL policy, fixed

The user chose `books.chappyasel.com` and `weightlifting.chappyasel.com` as the preferred public addresses. Other sections remain main-host paths. This supersedes the first audit's proposal to canonicalize all four entry pages to `www`.

The Books and Weightlifting layouts retain their original subdomain metadata bases and root canonicals. Their detail-page canonical overrides remain intact. Manual and Routine now use absolute main-host entry URLs for canonical and Open Graph URL, consistent with their existing production redirects. Their metadata bases still resolve icons and preview images on the existing origins.

`src/proxy.ts` no longer redirects Books and Weightlifting subdomain roots to `www`. It rewrites them internally to the existing Next routes while preserving the public host. Production full-page GET requests accepting HTML and HEAD requests to `/books` or `/weightlifting` on www or the apex now receive a permanent 308 redirect to the corresponding subdomain root. Query parameters survive. RSC requests and deep main-path aliases remain available for integrated previews and sheets. Development retains the existing shared-local-app routing.

The transition controller previously converted production subdomain links into main-site paths. It now leaves Books and Weightlifting links and scene navigation requests to normal cross-origin navigation. Manual and Routine retain the main-app transition. This means a full-page trip to Books or Weightlifting changes documents and does not preserve the live room through that trip. Browser tests remain outside this task's authorization.

Tests exercise the real proxy and metadata, root and deep subdomain URLs, old entry redirects, query preservation, RSC exemptions, link interception, and scene navigation. The touched subdomain rewrite branches now strip only complete section path segments, so a book slug beginning with `books-` is not mistaken for a `/books` prefix.

### P1: standalone sitemap discovery, fixed in code

The old proxy matcher excluded `/sitemap.xml`, so subdomain roots reached the main sitemap instead of a section sitemap. An explicit `/sitemap.xml` matcher now routes the Books and Weightlifting hosts to their own sitemap handlers. Other dotted files and static assets retain their existing exclusions.

`public/robots.txt`, shared across hosts, advertises all three canonical sitemap endpoints: www, books, and weightlifting. The Books sitemap lists its canonical root and book-detail URLs using the existing database query. Its root no longer claims a content edit on every regeneration. The new Weightlifting sitemap lists its canonical root without a fabricated timestamp. It does not enumerate exercise or workout records.

`src/app/standaloneSitemaps.test.ts` checks the actual matcher using Next's matcher utility, the rewrites, robots discovery lines, static-file exemptions, and emitted sitemap entries. The database module is replaced with a synthetic fixture. No live database or sitemap HTTP request was used; current book records and deployed responses remain unverified.

### P2: main sitemap destinations and timestamps, fixed

The main sitemap now contains only www canonicals. Books and Weightlifting belong to their own host sitemaps. Manual and Routine use `/manual` and `/routine`; existing `/projects` and `/talks` pages are now included. Article URLs still come from the authored musings catalog.

The manual and routine nested sitemaps also list their main-host canonicals. `/about` remains excluded because it canonicalizes to `/`. `/golf` is intentionally noindex and remains excluded. Private sections, `/site-index`, `/friends`, and `/now` remain excluded.

The homepage no longer uses the current time as `lastModified`. Manual and Routine use exported `lastUpdated` values, as Systems already did. Musings retain article `updatedAt` dates. Tests check expected entries, one host per sitemap, duplicate URLs, article/document canonical agreement, excluded destinations, and stable main sitemap output when the clock advances.

### P2: crawlable content exists; standalone room paths have weaker internal discovery

`src/app/page.tsx`, `homeMetadata.ts`, and `HomeStructuredData.tsx` already supply homepage metadata and WebPage/Person JSON-LD. `RoomHomePage.tsx` supplies an immediate `RoomDocument` fallback with real content slots, including `AboutMe`, while optional data loads. `About.tsx` contains authored bio paragraphs and anchors. The structured-data serializer escapes `<`. No replacement bio or duplicate schema was added.

`RoomDocument.tsx` renders section bodies into HTML and uses native fragment anchors. The existing static-render tests cover readable content and working fragment targets without a canvas. This is component-level evidence, not a fresh HTTP or search-index observation. CSS selects the active section; hidden sibling sections are still in the document.

`StacksSectionLink.tsx` uses fragment hrefs and updates history after interaction. `UnitRail.tsx` uses buttons. These are functional room controls but do not themselves advertise the standalone `/projects` and `/talks` URLs as ordinary crawlable links. Adding those routes to the sitemap improves discovery without altering the established room interaction. A later navigation change could add descriptive path links where they fit the UI; no rail rewrite is included here.

Manual, routine, and systems render exported content. `DaylightSection.tsx` keeps folded children in the DOM. Musings render article bodies, canonical metadata, BlogPosting JSON-LD, and previous/next anchors through `SheetLink`, which wraps Next Link. These patterns support a server-rendered friends page later.

### P3: small follow-ups, unchanged

- `src/app/liarsdice/layout.tsx` has title, description, Open Graph, and Twitter metadata but no explicit canonical. The root layout does not supply one. Consider a self-canonical `/liarsdice` and sitemap inclusion in a separate calculator-focused pass.
- Some authored internal links use historical subdomain forms. Books and Weightlifting links now match the preferred public hosts. Manual and Routine aliases still redirect to their main-site paths; no blanket rewrite of authored content was made.
- The apex-to-www deployment behavior and any cross-host sitemap authorization were not inspected. There is no claim here about actual indexing, rankings, traffic, or search-engine canonical selection.

## Exact friends proposal, blocked on content

No friends component, route, navigation item, sitemap entry, empty page, names, URLs, or endorsements were added. Current patterns support a document layout, but they do not determine the content, ordering, or editorial treatment of a friends directory well enough to justify an unused component now.

Required user inputs before implementation:

1. Each person's exact public display name and approved destination URL. Specify which destination to use when several exist.
2. Confirmation that each person should appear publicly. Supply exact optional relationship or recommendation copy, or explicitly choose names and links only. A supplied URL does not authorize an invented endorsement.
3. Approved page introduction, or permission to draft one for review. Confirm the list's order, or approve alphabetical ordering.
4. Confirm a single discovery link under the homepage About contact area, proposed label `Friends`. This avoids changing the room's shelf navigation. Choose a different placement if desired.

Implementation after those inputs arrive:

- Add `src/lib/friends.ts` with a static, typed, readonly list. Proposed fields are `id`, `name`, `url`, and optional `note`. Require at least one approved entry before enabling a route. IDs must be unique, names nonempty, and URLs explicit HTTPS destinations. No contact system, database, private imports, automatic enrichment, placeholder records, or invented descriptions.
- Add `src/app/friends/layout.tsx` using the existing daylight stylesheet and the same `daylight-root dl-ground-wash min-h-screen bg-background text-foreground` wrapper as musings.
- Add `src/app/friends/page.tsx` as a server component. Reuse `SkyHero` and `DaylightHeroMeta` with a home link, then the existing `dl-columns` / `dl-column` spacing and `SkyFooter`. Render a semantic list of names and approved notes. Use the existing shadcn `Card` / `CardContent` if cards are desired; do not invent a new control or card system. Use ordinary anchors for external destinations and an outlined Phosphor icon only if an external-link indicator is needed. No filters, categories, portraits, hover previews, new room stop, or sheet interception in the initial implementation.
- Set title `Friends | Chappy Asel`, canonical `https://www.chappyasel.com/friends`, and matching Open Graph URL. Derive the description from the approved introduction. Use the existing main-host share image initially unless a distinct card is requested. Do not add Person relationships or endorsement schema based on inference.
- Once approved content is present, add the agreed normal Next Link in `src/app/components/About.tsx` and one main sitemap entry. Omit `lastModified` until there is a real maintained content-edit date. Update the current sitemap exclusion test in that same change. Do not add `/now`.
- Add data validation tests, a static-render test confirming all approved names and hrefs are in the initial HTML, canonical/sitemap agreement tests, and a test that unavailable or empty data cannot publish an empty directory. Run targeted tests, TypeScript, and lint. Browser review requires a separate explicit request under repository instructions.

Field Notes: no new discovery ID is warranted for this SEO patch. It creates no visitor action or experience. A passive friends list does not yet establish a qualifying action with meaning beyond opening a page, quality-bar test 2 in `docs/research/2026-08-24-achievement-exploration-system.md`. Re-evaluate the final populated experience before implementing any achievement; do not award a raw outbound click.

## Changes and checks

Changed production files relative to the preserved base:

- `src/app/{manual,routine}/layout.tsx`
- `src/app/sitemap.ts` and `src/app/{books,manual,routine}/sitemap.ts`
- New `src/app/weightlifting/sitemap.ts`
- `src/proxy.ts` and `public/robots.txt`
- `src/app/components/route-transition-prototype/navigation.ts`

Tests and audit support:

- `src/app/sitemap.test.ts`, `src/proxy.test.ts`, and `src/lib/site/sectionMetadata.test.ts`
- New `src/app/sectionEntryMetadata.test.ts` and `src/app/standaloneSitemaps.test.ts`
- Transition `navigation.test.ts`, `documentNavigation.test.ts`, and `OriginNavigation.test.tsx`
- `vitest.seo.config.ts`, which extends the repository config with `envDir: false`
- This handoff

The Books and Weightlifting layout changes from the first audit were reverted to their original subdomain metadata. No dependency files changed. The initial offline frozen-lockfile, scripts-disabled install and toolchain declaration check passed. Final verification:

- 14 focused test files passed, 169 tests total. After the final lint-only assertion correction, the affected navigation suite passed again, 43 tests.
- Direct `tsc --noEmit --incremental false` passed.
- Full-source `pnpm lint` passed before the final navigation-test extension. Targeted lint of that test and the audit config passed after correcting an unbound-method assertion.
- `git diff --check` passed. The original audit base remains in the shipping branch history.
- 20 source, test, config, robots, and handoff files differ from the base or are new. These are the files prepared for the shipping commit.

The first expanded test run exposed an old assertion that production Books navigation should be rewritten to `/books`. That expectation was replaced with separate tests for main-host Manual navigation and native Books/Weightlifting navigation, matching the approved policy.

During the initial audit, the first typecheck found two typing errors in the new test and missing image declarations because this worktree lacked `next-env.d.ts`. The test errors were corrected. A local ignored `next-env.d.ts` was created with only the standard Next and image-type references. The first lint run's six errors were the same missing-image-type issue in existing About/Projects code. An initial-audit test run caught a URL-object/string assertion mismatch introduced during the typing correction; that assertion was corrected too.

No production build, `pnpm verify`, live server, or full test suite was run. The build's `prebuild` fetches Dad content, and broader workflows include tasks outside the authorized scope. `pnpm typecheck` was not used because it runs `next typegen`, which loads local environment files. Direct `tsc` checks the source, but fresh Next-generated route validators are not covered.

## Reproduce in this worktree

The exact verified executables are `/Users/chappyasel/.nvm/versions/node/v24.19.0/bin/node` and `/Users/chappyasel/.nvm/versions/node/v24.19.0/bin/pnpm`, reporting Node `v24.19.0` and pnpm `10.34.5`. The repository specifies Node `24.x`, `.nvmrc` = `24`, and `packageManager` / pnpm engine = `10.34.5`. Prepend this directory even over SSH; the default SSH PATH may select Node 25 or 26.

```sh
cd /Users/chappyasel/.superset/worktrees/PersonalWebsite/seo/friends-preparation
export PATH="/Users/chappyasel/.nvm/versions/node/v24.19.0/bin:$PATH"
command -v node
node --version
command -v pnpm
pnpm --version
git branch --show-current
git rev-parse HEAD
pnpm check:node-version
pnpm install --offline --frozen-lockfile --ignore-scripts
```

For a fresh worktree without Next's generated ambient references, create only these standard references. This file is ignored; do not overwrite an existing generated file.

```sh
if [ ! -f next-env.d.ts ]; then
  printf '%s\n' '/// <reference types="next" />' '/// <reference types="next/image-types/global" />' > next-env.d.ts
fi
pnpm exec vitest run --config vitest.seo.config.ts \
  src/app/sitemap.test.ts \
  src/app/sectionEntryMetadata.test.ts \
  src/app/standaloneSitemaps.test.ts \
  src/proxy.test.ts \
  src/app/homeMetadata.test.ts \
  src/lib/site/sectionMetadata.test.ts \
  src/lib/musings/publishing.test.ts \
  src/lib/musings/links.test.ts \
  src/app/components/stacks/illustration/RoomDocument.test.tsx \
  src/app/components/route-transition-prototype/navigation.test.ts \
  src/app/components/route-transition-prototype/documentNavigation.test.ts \
  src/app/components/route-transition-prototype/OriginNavigation.test.tsx \
  src/lib/universal-search/urls.test.ts \
  src/lib/universal-search/navigation.test.ts \
  src/lib/util.test.ts
pnpm exec tsc --noEmit --incremental false
pnpm lint
pnpm exec eslint --max-warnings 0 vitest.seo.config.ts
git diff --check
```

Do not substitute a build, invoke content generators, load `.env`, or run the book sitemap against a live database as part of this rerun.

## Shipping preparation

The user authorized shipping after approving the subdomain policy. The production workflow is a normal push to `main` from this isolated worktree, without changing the main checkout's working files.

An earlier attempt could not access the shared Git object store. Access was restored before shipping. A fetch found two new upstream commits affecting only `src/app/components/stacks/scene/aicChapters.ts` and `src/lib/util.test.ts`. A fast-forward incorporated upstream `af0223432311538041fc687fadf607445e96fb38` without conflicts. A concurrent upstream commit, `c918c836`, arrived before the push. The SEO commit was rebased onto it without conflicts, preserving the upstream YouTube worker changes. No force push is needed.

The final pre-ship test run passed 175 tests in 15 files, including the new upstream utility tests. Direct TypeScript checking passed. Final full-source lint and audit-config lint also passed. Delivery status is reported in the task response after checking Vercel's status for the pushed commit.

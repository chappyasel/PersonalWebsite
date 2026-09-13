# Personalities

This feature lives in the existing Personal Website Next.js app. Run `pnpm prototype:personality` and open `http://localhost:3016/personalities`.

The shared navigation links to eight routes: `/personalities`, `/personalities/compare`, `/personalities/changes`, `/personalities/matrix`, `/personalities/distance`, `/personalities/closest`, `/personalities/pca`, and `/personalities/history`. They share a layout, keeping the selected assessments while moving between views. Browser back and forward work normally. The old `/prototype/personality?variant=A` through `E` URLs redirect to the matching routes.

“Add results” opens a centered modal. Choose an existing person or create one, then import a code or enter scores. Add, edit, and delete use the shared dialog component’s centered variant. Dates can be exact days or months; a separate estimated flag appears in history and result selectors. Date evidence stays in each assessment’s source notes.

Personality data, sessions, and login counters live in dedicated `personality_*` Postgres tables. Development requires `PERSONALITIES_DATABASE_URL` so local edits cannot silently write to the hosted database used by Books. Production uses that override if provided, otherwise the existing `DATABASE_URL`. The legacy SQLite file, import plans, and backups stay under the gitignored `data/personalities/` directory. The directory is also excluded from deployment uploads and build tracing. The database module is server-only; unauthenticated API requests receive no records.

Production requires an explicit `PERSONALITIES_ORIGIN`, a canonical HTTPS origin with no path. Without it the route and API return 404. Vercel preview deployments always return 404. This configuration enables the existing `/personalities` route; it does not create another site or change hosting providers.

The login uses `DAD_CONTENT_PASSWORD` and the same constant-time password comparison as Dad. No password file is needed. Random session tokens last 24 hours; only their SHA-256 hashes are stored in Postgres. A cached, deterministic scrypt password version invalidates sessions after password rotation and remains stable across server instances. Production cookies are host-only, Secure, HttpOnly, and SameSite=Strict. Writes require the exact configured Origin, a JSON content type, and the application request header. Postgres atomically enforces a global login limit and an address limit. On Vercel, only its overwritten `x-vercel-forwarded-for` header identifies the client; other environments use a shared limit. See [Vercel's request-header contract](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for). Importing a Big Five code contacts bigfive-test.com from the server, validates its five totals and 30 facets, and adds a new dated assessment. Manual entry supports raw totals, percentages, and percentiles. Percentages and percentiles remain in history and are excluded from raw-score comparisons.

To import a private plan through the local API, run `node scripts/import-personalities.mjs data/personalities/import-plan.json http://localhost:3016`. Stable import keys make repeat imports idempotent. Never commit an import plan, password, source result code, or database file.

Comparisons use one assessment per person, initially their latest dated IPIP-120 result. Result dropdowns stay newest first, with undated results last, regardless of selection. Changes keeps both date menus complete; selecting a date beyond the other endpoint moves that endpoint to the selected date. Aggregate distance is `sqrt(mean(z²))`; closest-person distance is `sqrt(mean(((a-b)/SD)²))`. All five traits are required, signs do not cancel, and self matches are excluded. The inherited reference norms are unverified across providers. Displayed curve percentiles are normal-distribution estimates.

Validation uses typechecking, targeted lint, model/navigation tests, and `node scripts/check-personalities-api.mjs`. That script creates a disposable local Postgres database, runs the API with production settings, and removes the database afterward. It covers authentication, cookies, CSRF, preview isolation, password rotation, expiry, concurrent rate limiting, CRUD, code imports, duplicate rejection, transaction rollback, and import conflicts. The suite never connects to `DATABASE_URL`. Hosted migration and deployment still require an explicit request naming the environment. The Books mirror remains untouched.

Field Notes evaluation: this local private utility fails quality-bar test 1, a visitor-facing discovery, so it does not award an achievement.

The PCA map standardizes the five traits within the full cohort and diagonalizes their correlation matrix. One selected compatible result per person contributes to the fit. Group and visibility filters only hide points; selecting a different assessment refits the axes. The map uses equal scales, reports explained variance, and shows trait correlations with each displayed component. It is descriptive of the saved cohort, not a population model.

PCA also offers deterministic k-means clustering in all five standardized trait dimensions. Auto compares 2–6 clusters using mean Euclidean silhouette, subject to sample size and distinct-profile limits. Multiple deterministic farthest-point starts reduce initialization dependence. Group descriptions come from centroid differences, not an external AI service. Cluster numbers are ordered by centroids; adding people or changing scores may change membership and numbering.

The main tabs emphasize all five trait curves, two-person comparison, closest profiles, changes over time, and saved history. Advanced retains the matrix, aggregate distance, and PCA/clusters. Direct comparison uses selected compatible raw results. Changes includes only dated compatible results, uses elapsed time on the horizontal axis, and positions month-only dates at mid-month without altering stored dates. The exact order of tests within an estimated month is uncertain.

The default All traits view combines the five-curve overview and single-trait detail. Choose a trait to expand it and use “All five traits” to return. The former `/personalities/all-traits` route redirects to `/personalities`. Compare places both people on five reference bell curves, leads with signed SD differences, and also shows raw-point differences, estimated percentiles, and percentile-point gaps. Biggest difference is ranked by absolute SD gap. Every comparison curve uses the same horizontal SD scale. Percentile gaps are differences in estimated ranks, not proportional changes in personality.

## Database migration and recovery

The schema is in `src/server/db/personalities-schema.ts`, exported through the existing Drizzle schema. Migration `0019_personalities.sql` adds only personality tables, indexes, and constraints. Drizzle Kit 0.21 omits check constraints when generating SQL, so this migration includes them explicitly.

`pnpm personalities:db` requires an explicit `PERSONALITIES_TARGET_DATABASE_URL`; it never infers a write target from the website's `DATABASE_URL`. Load the destination from the appropriate local secret configuration. Do not paste connection strings into chat, commit them, or pass them as CLI arguments.

For the local rehearsal, the target is `postgresql://127.0.0.1/personalities_darkened_jodhpur`. The app uses the same value in its ignored `.env.local`. Run the following commands after setting the target environment variable:

```sh
pnpm personalities:db schema --apply
pnpm personalities:db import data/personalities/library.sqlite --apply
pnpm personalities:db verify data/personalities/library.sqlite
pnpm personalities:db backup data/personalities/backups/before-release.dump
```

The schema command applies only the personality migration, in a transaction. It is repeatable. The import reads SQLite without modifying it, preserves IDs and every content field, and verifies the destination inside the import transaction. Identical records are skipped; differing records fail and roll back the entire import. It does not copy passwords, sessions, or rate limits. Verification prints counts, never names, scores, codes, or connection strings.

Backups use `pg_dump` in custom format, contain only the personality tables, and omit session and rate-limit data. Files are owner-readable only. For recovery, point `PERSONALITIES_TARGET_DATABASE_URL` at a separate empty database, then run:

```sh
pnpm personalities:db restore data/personalities/backups/before-release.dump --apply
pnpm personalities:db verify data/personalities/library.sqlite
```

Restore refuses to overwrite existing personality tables, runs in one transaction, and clears authentication state. Verification against SQLite is appropriate at cutover; after new Postgres edits, compare a restored backup against its Postgres source instead. Keep backups outside the repo history and restrict access to the machine or storage holding them. Use a direct Postgres connection for backup and restore, with compatible PostgreSQL client tools.

For the hosted cutover, first approve the existing site's target environment. Apply the normal Drizzle migration, or the personality-only schema command, then import and verify against that destination. Remote CLI commands additionally require `--allow-remote`. Set the standard password and canonical HTTPS origin in that environment, keep previews disabled, and test login before inviting anyone. An import conflict requires investigation; the tool never resolves it by overwriting data. The production cutover uses the existing Personal Website Vercel project and database. Its canonical origin is `https://www.chappyasel.com`; the site index lists Personalities under password-protected pages. Keep deployment and migration verification records in the ignored private directory.

## Sharing selected results

Use **Share result** in History, **Share comparison** beside the two-person comparison, or **Share results** in the header. The dialog accepts one to six assessments, lets you rename each result and omit dates, and previews the recipient view before creating a link. Friends see the chosen score cards and can compare compatible IPIP-120 results within that snapshot. Shared comparisons show a dated legend, biggest and smallest gaps ranked by absolute SD difference, and five curves with stacked dots beneath the baseline. Each trait has a compact table of raw scores, estimated percentiles, and SD from the reference mean, plus raw, SD, and percentile-point gaps. Two-result shares have no person selectors; larger subsets retain selectors.

For new shares with a compatible IPIP-120 result, **Show unnamed friends and family** starts checked. It adds muted dots to each trait curve, including single-result shares. Uncheck it to share only the selected results. The preview shows the same dots as the recipient page. Each other person contributes their latest compatible IPIP-120 result. People already named in the share, the owner group, and incompatible results are excluded. Each person gets a dot. Nearby or repeated scores stack into separate rows below the curve.

The unnamed context combines Friends and Family. It contains only a count and five independently sorted arrays of trait totals. It carries no names, IDs, dates, group labels, or explicit links between traits. These are unnamed score distributions, not a guarantee that someone with outside knowledge cannot recognize a score. The server selects the context from the authenticated library and freezes it with the named results. Existing links do not gain context retroactively. The optional snapshot field needs no additional migration beyond the share table.

Links expire after 30 days by default, with 7-day, 90-day, and until-revoked options. Copy the link before closing the dialog. Manage links lists their display names, creation times, and expiry, and can revoke each link. Anyone holding a link can view and forward it without the site password. Revocation stops future requests but cannot remove saved copies.

The server builds each snapshot from an explicit field allowlist. It includes display labels, optional dates and estimated-date flags, test versions, score formats, scales, and the five trait totals. It excludes person and assessment IDs, group membership, notes, source references, external result codes, import keys, and facets. Snapshots are frozen. Editing or deleting an assessment does not change an existing share; revoke its link separately.

`/personalities/shared/<random-id>` loads only the snapshot endpoint and does not mount the private app. A 256-bit random capability travels in the URL fragment and then an Authorization header, outside server request URLs and referrers. Only its SHA-256 hash is stored in `personality_shares`. The random share ID in the path allows messaging apps to fetch the approved OG card, including the first two display names, main scores, comparison curves, and unnamed dots. It cannot access the snapshot API. Revocation and expiry also disable the OG endpoint, though messaging apps may retain cached previews. Older fragment-only links still work and show the generic Personalities card. The API checks expiry on every read. Creating, listing, and revoking links require the existing password session, with the existing CSRF checks on writes. Shared reads issue no session cookie. Existing origin, preview, no-store, noindex, and no-referrer restrictions also apply to shares.

Migration `0020_personality_shares.sql` creates the snapshot table in the existing Postgres database. The local schema command applies both personality migrations and backups include snapshots. Apply the migration to the intended environment before using sharing there. No hosted migration or deployment is implied by implementing this feature.

Field Notes evaluation: sharing fails quality-bar test 1. Access depends on someone deliberately sending private results; this is not a discovery that the general site visitor might otherwise miss.

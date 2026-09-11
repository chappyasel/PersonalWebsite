# Personalities

This feature lives in the existing Personal Website Next.js app. Run `pnpm prototype:personality` and open `http://localhost:3016/personalities`.

The shared navigation links to six routes: `/personalities`, `/personalities/all-traits`, `/personalities/matrix`, `/personalities/distance`, `/personalities/closest`, and `/personalities/history`. They share a layout, keeping the selected assessments while moving between views. Browser back and forward work normally. The old `/prototype/personality?variant=A` through `E` URLs redirect to the matching routes.

The local SQLite database is `data/personalities/library.sqlite`. Credentials, import plans, and backups stay in the same gitignored directory. No records are embedded in source, rendered into unauthenticated HTML, or copied into build output. The database module is server-only. These routes and APIs return 404 outside development. Nothing is deployed by the development command.

The login uses `DAD_CONTENT_PASSWORD`, the same standard password as the existing Dad and YouTube pages. Only a salted hash is cached in the local private directory. Changing the standard password invalidates personality sessions. Sessions, CSRF checks, input validation, and import limits protect the API. Importing a Big Five code contacts bigfive-test.com from the server, validates its five totals and 30 facets, and adds a new dated assessment. Manual entry supports raw totals, percentages, and percentiles. Percentages and percentiles remain in history and are excluded from raw-score comparisons.

To import a private plan through the local API, run `node scripts/import-personalities.mjs data/personalities/import-plan.json http://localhost:3016`. Stable import keys make repeat imports idempotent. Never commit an import plan, password, source result code, or database file.

Comparisons use one assessment per person, initially their latest dated IPIP-120 result. Aggregate distance is `sqrt(mean(z²))`; closest-person distance is `sqrt(mean(((a-b)/SD)²))`. All five traits are required, signs do not cancel, and self matches are excluded. The inherited reference norms are unverified across providers. Displayed curve percentiles are normal-distribution estimates.

Validation uses typechecking, targeted lint, model/navigation tests, and authenticated local API checks. A production database integration and deployment remain separate work requiring an explicit request. The website's existing Postgres mirror is untouched.

Field Notes evaluation: this local private utility fails quality-bar test 1, a visitor-facing discovery, so it does not award an achievement.

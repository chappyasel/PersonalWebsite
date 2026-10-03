# Private areas check access where their data is read

Dad's Journal and the YouTube Information Diet share one password, and a signed cookie proves a visitor passed it. The code that reads protected data checks that cookie itself: `dadContent()` before any Dad page reads a file, `/api/dad-images` before it reads an image, `cookieProtectedProcedure` before any YouTube query, the `/youtube` page before it renders the dashboard, and `/api/search` before it calls the Dad provider. The proxy redirect and the Dad layout's password gate still run first, but on 2026-10-02 neither was enough. The layout showed the gate over `/dad` while Next still sent the page's payload with every insight title, and `/api/dad-images` had no check at all because the proxy matcher skips `/api`.

## Considered options

- Proxy only. Its matcher skips `/api` and any path with a dot, and the Next.js authentication guide says proxy should not be the only check.
- A check at the top of each page. It holds until a new page forgets it. Keeping the file readers private to `src/app/dad/lib/content.ts` makes `dadContent()` the only way to reach them.

## Consequences

- A new Dad page gets its readers from `dadContent()` and renders nothing when that returns null. `src/app/dad/pages.test.tsx` fails until the page is listed there.
- A new YouTube procedure uses `cookieProtectedProcedure`. `src/server/api/routers/youtube.test.ts` fails otherwise.
- A response carrying private bytes sends `Cache-Control: private`, so no shared cache stores it, Vercel's CDN included. A refusal sends `private, no-store`.
- The checks overlap on purpose. Removing one because another exists reopens a path above.

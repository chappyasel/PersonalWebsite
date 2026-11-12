# Slice 1 report: Google sign-in and `ownerProcedure`

- PR: https://github.com/chappyasel/PersonalWebsite/pull/141 (closes #137, not merged)
- Branch: `worktree-agent-a0776e97748b772af`
- Head commit: `963e99d1` ("Weight Log: owner Google sign-in and ownerProcedure")

This file isn't committed. The isolation of my worktree blocked writes to the lead's checkout, so it sits at the same relative path in my worktree.

## What changed

- `auth.ts`:
  - Adds the Google provider only when `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `OWNER_EMAIL` are all set. Without them, `providers` is `[]`.
  - Adds a `signIn` callback that admits only a `google` account with `profile.email_verified === true` and an address equal to `OWNER_EMAIL`, compared trimmed and case-blind.
  - Points `pages.signIn` and `pages.error` at `/weight-log/edit`.
- `src/server/owner.ts` holds the shared rules: `isOwnerEmail`, `isOwnerGoogleSignIn`, and `isOwnerSignInConfigured`. The callback, `ownerProcedure`, and the page all use them.
- `src/env.js` adds the three variables as optional strings. `.env.example` documents them.
- `src/server/api/trpc.ts` renames `protectedProcedure` to `ownerProcedure`. No session gets `UNAUTHORIZED`. A session whose address isn't `OWNER_EMAIL` gets `FORBIDDEN`.
- Renamed callers:
  - `youtube.triggerSync`
  - `books.triggerSync`
  - `weightlifting.triggerSync`
  - `post.create`
  - `post.getSecretMessage`
  - the tRPC mocks in `youtube.coverage.test.ts` and `src/lib/books/bookLookup.test.ts` (the lead's list missed this second mock)
  - the API rule in `CLAUDE.md`
- `src/server/api/routers/weightLogOwnerOnly.test.ts` is the slice 0 guard. It checks every `appRouter` procedure under `weightLog.` structurally: `ownerProcedure`'s middleware chain must be a prefix of the procedure's chain. It also checks behaviour: an anonymous caller must get `UNAUTHORIZED` and a stranger must get `FORBIDDEN`, with a database mock that throws if anything touches it.
  - `PUBLIC_WEIGHT_LOG_QUERIES` exempts only queries, and it is empty.
  - The guard also flags a router mounted as `weight_log` or `weightlog`, which would otherwise dodge the prefix check.
  - Leaky and guarded fixture routers in the same file prove on every run that the guard can fail.
- `src/app/weight-log/edit/page.tsx` and `actions.ts`:
  - The page calls `auth()` first.
  - The owner sees a placeholder and a Sign out button.
  - Everyone else sees only "Sign in with Google", or "Sign-in isn't available on this deployment" when the variables are missing.
  - `?error=AccessDenied` shows "That Google account can't sign in here." The page never shows the owner's address.
- I confirmed that `next.config.js`'s `/weight-log/:path*` headers (`private, no-store`, `noindex`) cover `/weight-log/edit`. The pattern matches the bare path and every subpath. The dev server sent `X-Robots-Tag: noindex, nofollow, noarchive`.

## Verification

- **Touched tests.** `heavy -- pnpm exec vitest run` on the 8 touched or new test files: all pass.
- **Guard proof.** I temporarily mounted `weightLog: { upsertWeighIn: publicProcedure.mutation, weekTable: ownerProcedure.query }` in `root.ts` and ran `heavy -- pnpm exec vitest run src/server/api/routers/weightLogOwnerOnly.test.ts`. 2 tests failed with the rule message and `"weightLog.upsertWeighIn (mutation) does not use ownerProcedure"`. The second showed `"code": "fulfilled"` where `UNAUTHORIZED` was expected. I then restored `root.ts` and deleted the temporary router; `git status` confirmed both.
- **`heavy -- pnpm verify`.** typegen, tsc, eslint, artwork, search index, and meadow pass. Vitest: 6271 tests pass and 4 fail, all in `src/app/meet/MeetBooking.test.tsx`. Those 4 depend on the date and also fail on the base commit, as the lead confirmed. The PR body says so.
- **Production origin.** `curl https://www.chappyasel.com/api/auth/signout` renders `action="https://chappyasel.com/api/auth/signout"`, so production's `NEXTAUTH_URL` is the apex. `vercel env ls production` lists `NEXTAUTH_URL` for Development, Preview, and Production, with the value encrypted.
- **Apex redirect.** `curl -sI 'https://chappyasel.com/api/auth/callback/google?code=abc&state=xyz'` returns a 308 to `https://www.chappyasel.com/api/auth/callback/google?code=abc&state=xyz`, so the query survives.
- **Production-like dev server.** I ran `next dev -p 3017` with fake Google variables and `NEXTAUTH_URL=https://chappyasel.com`, sending `Host: www.chappyasel.com`:
  - `/weight-log/edit` renders the button.
  - `/api/auth/signin` redirects to `/weight-log/edit`.
  - `/api/auth/error?error=AccessDenied` redirects to `/weight-log/edit?error=AccessDenied`.
  - A CSRF-valid `POST /api/auth/signin/google` redirects to Google with `redirect_uri=https://chappyasel.com/api/auth/callback/google`, PKCE S256, and no `login_hint`.
  - The state cookies have no `Domain`, so they stay on `www`. That is where the 308 brings the callback.
- **Real client on the local env.** I copied the three keys from the main checkout's `.env.local` into my worktree's `.env.local` without printing them.
  - `/weight-log/edit` renders the button.
  - `/api/auth/providers` lists Google with callback `http://localhost:3000/api/auth/callback/google`.
  - I fetched Google's authorize URL with no sign-in. Google accepted the localhost URI, the apex URI, and the `www` URI. An unregistered control URI (`localhost:3999`) got `redirect_uri_mismatch`.
- I stopped every dev server I started. I ran no migrations and no database writes.

### How NextAuth v5 picks the redirect URI

`next-auth` 5.0.0-beta.30 with `@auth/core` 0.41.0 rewrites every auth request's origin to `AUTH_URL ?? NEXTAUTH_URL` (`reqWithEnvURL` and `createActionURL`). It uses the request host only when neither is set; on Vercel, `trustHost` is on because `VERCEL` is set.

- **Production:** `NEXTAUTH_URL` is the apex, so `redirect_uri` is the apex callback. The apex 308 brings it to `www`. The callback rebuilds the same apex URI for the token exchange, and the default `redirect` callback turns the relative `redirectTo` into `https://chappyasel.com/weight-log/edit`, which 308s to `www`. Every request lands on `www`, so the host-only cookies match.
- **Local:** `.env.development.local` sets `NEXTAUTH_URL=http://localhost:3000`, so `redirect_uri` is the localhost callback.

## Shortcuts

- I didn't run `pnpm build`. The plan's checks don't ask for it. The variables are optional in `src/env.js`, so a build without them can't fail validation.
- The page test renders with `renderToStaticMarkup` and mocks the server actions. It doesn't exercise a real form post.
- I didn't write the plan's Google Console wizard. The lead said the owner was already running one.

## Issues

- **Local sign-in writes to production.** Each local sign-in with the real client writes `users`, `accounts`, and `sessions` rows to the production database, because local `DATABASE_URL` points at production. The owner's first sign-in creates his user row either way, so the effect is small. Signing in on localhost then shares the user row with production but creates separate session rows.
- **Sign-in works locally only on port 3000.** Auth.js builds `redirect_uri` from `NEXTAUTH_URL`, so sign-in started on another port returns to `:3000`.
- **Preview builds have the apex `NEXTAUTH_URL`** but no Google variables. They show "Sign-in isn't available", which matches decision 17.
- **Outside this slice.** `MeetBooking.test.tsx` fails 4 tests today because it reads the real clock. The lead confirmed this and owns it.

## Ambiguities

- Decision 19 allows exactly one sign-in button, but Auth.js serves its own `/api/auth/signin` page. I pointed `pages.signIn` and `pages.error` at `/weight-log/edit`, so that URL now redirects to the owner page instead of offering a second button.
- The plan doesn't say what an unconfigured deployment should show. A button that always fails seemed worse than a one-line notice, so the page shows the notice.

## Judgment calls

- **Owner to confirm.** The signed-in placeholder has a Sign out button. It's the only way to test a refusal with a second Google account on the same browser.
- **Owner to confirm.** The page copy:
  - "Signed in. Weigh-in entry arrives with the cutover."
  - "That Google account can't sign in here."
  - "Sign-in didn't finish. Try again."
  - "Sign-in isn't available on this deployment."
  - The page inherits the `/weight-log` layout's metadata, title "Chappy's Weight Log".
- **Owner to confirm.** The address comparison trims whitespace and ignores case, so a stray capital in the Vercel value can't lock him out. `email_verified` must be the boolean `true`. A string `"true"` is refused.
- `OWNER_EMAIL` is a plain optional string, not `z.email()`. A malformed value refuses sign-in instead of failing the production build.
- `ownerProcedure` returns `UNAUTHORIZED` for no session and `FORBIDDEN` for a non-owner session.
- I left `.claude/agents/backend-engineer.md` alone. It mentions `protectedProcedure`, but it describes the AI Collective platform, not this repo.
- The guard identifies `ownerProcedure` by middleware identity, not by name. A procedure built as `ownerProcedure.input(...).mutation(...)` passes, and `publicProcedure` or `cookieProtectedProcedure` fails.

## Next steps

1. Review and merge PR #141 when the owner says so. It waits for the deep review, because it changes access control.
2. Owner, in Vercel Production. The three variables are already set, per the lead. One optional change: set `NEXTAUTH_URL` to `https://www.chappyasel.com`. That removes one apex-to-`www` hop at the callback and lets the `www` redirect URI do the work. Leaving it on the apex also works, as checked above. Don't remove `NEXTAUTH_URL` from Preview without a reason: previews have no Google variables either way.
3. After the deploy, the owner:
   - opens `https://www.chappyasel.com/weight-log/edit`;
   - clicks "Sign in with Google" and picks the owner account;
   - confirms he lands back on the page and sees the placeholder;
   - signs out, signs in with any other Google account, and confirms the page says "That Google account can't sign in here." Testing mode only allows listed test users, so Google may refuse that account first. Either outcome is a refusal.
4. Optional local check: run `pnpm dev` on port 3000 in a checkout that has the three keys in `.env.local`, then sign in at `http://localhost:3000/weight-log/edit`. This writes the rows described under Issues to the production database.
5. Slice 2b builds the `weightLog` router on `ownerProcedure`. If a query ever needs to be public, it goes in `PUBLIC_WEIGHT_LOG_QUERIES` with the owner's approval.

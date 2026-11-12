# Slice 1 deep review (Claude): PR #141

Reviewed `git diff origin/main...HEAD` at `963e99d1` in
`/Users/chappyasel/Desktop/Repos/PersonalWebsite/.claude/worktrees/agent-a0776e97748b772af`.
Installed versions: `next-auth` 5.0.0-beta.30, `@auth/core` 0.41.0,
`@trpc/server` 11.0.0-rc.502. I edited nothing, ran no database commands, and
didn't rerun the suite.

## Verdict

I found nothing serious. No path I could find gives a non-owner owner access
or an owner-only render, and no second sign-in button exists. Redirects stay
on the site's origin. Preview builds and the cookie-protected areas are
unaffected. The findings below are low severity: two gaps in what the guard
test can see, and one verification gap.

## Findings, by severity

### 1. Low: the guard checks only the first path segment

`src/server/api/routers/weightLogOwnerOnly.test.ts:75-81`

`ownerOnlyViolations` splits the path and looks only at `routerKey`, the first
segment. The test never inspects a Weight Log router mounted below the top
level.

Scenario: slice 3 adds an `admin` router and mounts the Weight Log router
inside it, as `admin: { weightLog: weightLogRouter }`. Then
`admin.weightLog.upsertWeighIn` on `publicProcedure` passes, because
`routerKey` is `"admin"`. The misspelling regex on line 78 also tests only the
first segment, so it misses `admin.weight_log.*` too. A Weight Log procedure
added to an existing router, such as `weightlifting.logWeighIn`, also passes.
The rule's wording (`weightLog.*`) arguably excludes that case, but it is the
easiest mistake for a later agent to make.

Fix: test every segment except the last. If any segment matches
`/^weight[-_]?log/i`, require `ownerProcedure`, or report the mount when the
segment isn't exactly `weightLog`. Add `nested: createTRPCRouter({ weightLog:
... publicProcedure ... })` to `leakyRouter` so the fixture shows the guard
failing on a nested mount.

### 2. Low: the guard can't see owner data that skips tRPC

`src/server/api/routers/weightLogOwnerOnly.test.ts` (scope),
`src/app/weight-log/edit/actions.ts`

The guard inspects only `appRouter`. Slice 2b builds the edit page, and the
page is a server component that already imports server actions from
`./actions`. The natural next step is a `"use server"` `saveWeighIn` in that
file, or a server component that reads the weekly table straight from `db`.
Either writes or renders owner data with no `ownerProcedure`, and this test
still passes. The plan says the router carries every operation, so this
breaks a plan rule rather than a test. The PR adds nothing that enforces it.

Fix (for the slice 2b brief, or now): add a check that fails when any file
under `src/app/weight-log/edit/` imports `~/server/db` or a Weight Log
storage module directly, or when `actions.ts` exports anything besides
`signInWithGoogle` and `signOutOwner`. Alternatively, write into the 2b brief
that the page reads and writes only through `api.weightLog.*`.

### 3. Low: no one has run the server-action sign-in end to end

`src/app/weight-log/edit/actions.ts:9-11`

The report checks the flow by posting to `/api/auth/signin/google` with a CSRF
token. The button doesn't take that path. It runs the server action, and
`next-auth/lib/actions.js` `signIn` builds an internal request to
`createActionURL(...)` (the apex). It skips CSRF and copies the state and PKCE
cookies onto the server action's response through `cookies()`. That response
goes to `www`, so the cookies should land where the 308ed callback arrives.
I traced the code and it agrees. No one has clicked the real button yet,
though, and `/weight-log/:path*` sends `Referrer-Policy: no-referrer`.
Next.js server actions tolerate a `null` or missing `Origin`, so I expect no
failure. Still, this is the one sign-in path no one has run.

Fix: nothing in code. The owner's post-deploy check in the report's "Next
steps" step 3 covers it. Make sure that check uses the button, not a direct
URL.

## Checked and fine

- **Gate order.** In `@auth/core/lib/actions/callback/index.js:63-70`,
  `handleAuthorized` (the `signIn` callback) runs before
  `handleLoginOrRegister`. A refused account never reaches `createUser`,
  `linkAccount`, or `createSession`. A throwing callback becomes
  `AccessDenied` (line 400).
- **`email_verified`.** Google is an `oidc` provider. `OAuthProfile` is the
  ID-token claims (`oauth/callback.js:169`), so `email_verified` is Google's
  boolean. Requiring `=== true` is correct.
- **Account linking.** A signed-in owner who signs in with a second Google
  account would get that account linked, but the callback refuses the second
  profile first. Nothing else in `src/` or `scripts/` writes `users` or
  `sessions`, so `session.user.email` (from `users.email` under database
  sessions) is only ever the owner's Google address.
- **`ownerProcedure`.** It rechecks the email on every call, so changing
  `OWNER_EMAIL` revokes existing sessions. An unset `OWNER_EMAIL` gives
  `FORBIDDEN` to every caller, which covers previews that share the
  production database. Middleware order puts the owner check before any
  `.input()` parser, so a bad input can't change an anonymous caller's error
  into `BAD_REQUEST`.
- **Guard identity check.** `usesOwnerProcedure` compares middleware
  references as a prefix. `.input()` and later `.use()` calls append to the
  chain, so a procedure built from `ownerProcedure` passes, and anything built
  from `publicProcedure`, `cookieProtectedProcedure`, or a second
  `initTRPC` fails. rc.502 has no `lazy()` routers, so `_def.procedures` is the
  complete flat list. The leaky and guarded fixtures prove that the test
  can fail.
- **Sign-in entry points.** With `pages.signIn` set, `GET /api/auth/signin`
  redirects to `/weight-log/edit`. A CSRF-valid `POST
  /api/auth/signin/google` starts the same OAuth flow as the button and
  renders no page, so it isn't a second button. On a deployment without the
  provider, `signIn("google")` redirects to the sign-in page
  (`next-auth/lib/actions.js`, "!foundProvider.id"). It doesn't throw.
- **Open redirects.** `redirectTo` is a constant. A `callbackUrl` supplied to
  `/api/auth/signin/google` or `/api/auth/signout` goes through the default
  `redirect` callback. That callback keeps only same-origin URLs and
  `/`-prefixed paths, which it joins to `baseUrl`, so `//evil.com` becomes a
  path. The page maps `?error=` to two fixed strings and never echoes the
  parameter.
- **Owner-only render.** `page.tsx` calls `auth()` before it renders
  anything. Only `isOwnerEmail` reaches the placeholder. `OWNER_EMAIL` never
  reaches the client. `/weight-log/:path*` sends `private, no-store`, and the
  page is `force-dynamic`.
- **Preview and CI.** The three variables are optional strings. Without them
  `providers` is `[]`, which is what `main` ships today. Previews keep the apex
  `NEXTAUTH_URL`. If someone ever gives Google variables to Preview, the
  callback would land on production without the preview's state cookie and
  fail with `InvalidCheck`, so even that mistake stays closed.
- **Renamed callers.** `youtube`, `books`, `weightlifting`, and `post` all
  compile against `ownerProcedure`. No client code calls any of the renamed
  procedures. Before this PR no one could sign in, so these procedures were
  unreachable. Now only the owner can call them, as decision 16 intends.
  `cookieProtectedProcedure`, `src/proxy.ts`, and the Dad and YouTube tokens
  are untouched.
- **Tests assert real behaviour.** `owner.test.ts` covers case and whitespace,
  a substring address, the string `"true"`, a missing flag, a non-Google
  provider, and a blank `OWNER_EMAIL`. `ownerProcedure.test.ts` asserts that
  the resolver never runs for a refused caller. `auth.test.ts` reloads
  `auth.ts` for each missing variable.

## Notes, not findings

- Identity is the email, not Google's `sub`. Gmail never reassigns an
  address, so this is fine for `chappyasel@gmail.com`. If `OWNER_EMAIL` ever
  becomes a custom-domain address, consider also pinning `providerAccountId`.
- The Drizzle adapter stores Google's `access_token` and `id_token` in
  `accounts`, in plaintext, in the production database. The only scopes are
  `openid email profile`, and the access token expires in an hour. The risk
  is low, but a later cleanup could drop those columns' values.

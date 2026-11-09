import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";

import { db } from "~/server/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "~/server/db/schema";
import { isOwnerGoogleSignIn, isOwnerSignInConfigured } from "~/server/owner";

import { env } from "~/env";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/** The owner's page holds the only sign-in button (decision 19 in
 * docs/plans/weight-log-migration.md), and refusals land back on it. */
const OWNER_SIGN_IN_PAGE = "/weight-log/edit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  callbacks: {
    // Only the owner's verified Google account signs in. Returning false
    // sends everyone else to the error page with `error=AccessDenied`
    // before the adapter creates a user.
    signIn: ({ account, profile }) => isOwnerGoogleSignIn({ account, profile }),
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
      },
    }),
  },
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    // The adapter bundles a newer Drizzle type identity than the app. The
    // table shapes are runtime-compatible, but their private type metadata
    // is not assignable across those package copies.
  } as never),
  // Replaces the built-in /api/auth/signin and /api/auth/error pages, so no
  // other page offers a sign-in button.
  pages: { signIn: OWNER_SIGN_IN_PAGE, error: OWNER_SIGN_IN_PAGE },
  // Without the Google variables (previews, CI, most local checkouts) there
  // is no provider, and the owner page says sign-in is unavailable.
  providers: isOwnerSignInConfigured()
    ? [
        Google({
          clientId: env.AUTH_GOOGLE_ID,
          clientSecret: env.AUTH_GOOGLE_SECRET,
        }),
      ]
    : [],
});

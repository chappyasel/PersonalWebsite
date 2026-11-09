import { env } from "~/env";

/**
 * The owner is the one Google account in `OWNER_EMAIL`. These checks back
 * the NextAuth `signIn` callback and `ownerProcedure`, so both compare the
 * same way. Dad's Journal and YouTube use their shared password instead
 * (ADR 0003).
 */

function normalize(email: string) {
  return email.trim().toLowerCase();
}

/** True only when both addresses are present and match. */
export function isOwnerEmail(
  email: string | null | undefined,
  ownerEmail: string | undefined = env.OWNER_EMAIL,
): boolean {
  if (!email || !ownerEmail?.trim()) return false;
  return normalize(email) === normalize(ownerEmail);
}

type SignInAttempt = {
  account?: { provider?: string } | null;
  profile?: { email?: string | null; email_verified?: unknown } | null;
};

/**
 * The `signIn` callback's rule: a Google account whose address Google has
 * verified and which matches `OWNER_EMAIL`. It runs before the adapter
 * writes anything, so a refused account leaves no user or account row.
 */
export function isOwnerGoogleSignIn(
  { account, profile }: SignInAttempt,
  ownerEmail: string | undefined = env.OWNER_EMAIL,
): boolean {
  return (
    account?.provider === "google" &&
    profile?.email_verified === true &&
    isOwnerEmail(profile.email, ownerEmail)
  );
}

/** Production sets all three. Previews and CI have none of them. */
export function isOwnerSignInConfigured(): boolean {
  return Boolean(
    env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET && env.OWNER_EMAIL?.trim(),
  );
}

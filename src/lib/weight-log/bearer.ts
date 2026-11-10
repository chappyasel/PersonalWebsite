import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The bearer check every route under `src/app/api/weight-log/` uses. Each
 * route has its own token in its own env var (`routes.guard.test.ts` lists
 * which), so revoking one leaves the others working.
 */

/**
 * Check a bearer token against the configured one in constant time. Both
 * sides are hashed first, so the comparison never depends on their lengths.
 * With no configured token, nothing is accepted.
 */
export function isBearerAuthorized(
  authorization: string | null,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  const match = /^Bearer (.+)$/i.exec(authorization ?? "");
  if (!match?.[1]) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(match[1]), digest(expected));
}

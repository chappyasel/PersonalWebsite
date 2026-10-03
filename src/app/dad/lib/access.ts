import { cookies } from "next/headers";

import {
  DAD_ACCESS_COOKIE_NAME,
  isValidDadAccessToken,
} from "~/lib/dad/access";

import { env } from "~/env";

/**
 * Whether this request carries a valid signed Dad access cookie.
 *
 * The layout uses this to choose the password gate, and dadContent() uses it
 * before any page can read a file. The layout's check alone cannot protect a
 * page: Next renders the page segment and sends its payload even when the
 * layout shows the gate in place of `children` (ADR 0003).
 */
export async function hasDadAccess() {
  return isValidDadAccessToken(
    (await cookies()).get(DAD_ACCESS_COOKIE_NAME)?.value,
    env.DAD_CONTENT_PASSWORD,
  );
}

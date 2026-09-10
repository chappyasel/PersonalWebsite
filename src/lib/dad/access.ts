import { createHmac, timingSafeEqual } from "node:crypto";

export const DAD_ACCESS_COOKIE_NAME = "dad-access";

const CANONICAL_DOMAIN = "chappyasel.com";

export function dadAccessToken(secret: string): string {
  return createHmac("sha256", secret)
    .update("personal-dad-access-v1")
    .digest("hex");
}

export function isValidDadAccessToken(
  value: string | undefined,
  secret: string,
): boolean {
  if (!value) return false;

  const expected = dadAccessToken(secret);
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  if (valueBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(valueBuffer, expectedBuffer);
}

export function isValidDadPassword(
  candidate: string,
  expected: string,
): boolean {
  if (typeof candidate !== "string" || !candidate || candidate.length > 256)
    return false;
  return isValidDadAccessToken(dadAccessToken(candidate), expected);
}

export interface DadAccessCookieOptions {
  domain?: string;
  httpOnly: true;
  maxAge: number;
  path: "/";
  sameSite: "lax";
  secure: boolean;
}

export function dadAccessCookieOptions(
  host: string | null | undefined,
  secure: boolean,
): DadAccessCookieOptions {
  const hostname = host?.split(":", 1)[0]?.toLowerCase();
  const isCanonicalHost =
    hostname === CANONICAL_DOMAIN || hostname?.endsWith(`.${CANONICAL_DOMAIN}`);

  return {
    ...(isCanonicalHost ? { domain: `.${CANONICAL_DOMAIN}` } : {}),
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  };
}

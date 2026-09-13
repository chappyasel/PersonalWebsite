import { createHash, randomBytes, scryptSync } from "node:crypto";
import { isIP } from "node:net";

import { requestOrigin } from "./config";

export function token() {
  return randomBytes(32).toString("base64url");
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

let cachedVersion: { password: string; version: string } | undefined;
export function passwordVersion(password: string) {
  if (!password)
    throw new Error("The standard site password is not configured.");
  if (cachedVersion?.password === password) return cachedVersion.version;
  // Stable across server instances, slow to guess from a stolen database, and
  // invalidated by password rotation. This value is never an access token.
  const version = scryptSync(password, "personalities-session-version-v1", 32, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  }).toString("hex");
  cachedVersion = { password, version };
  return version;
}

export function clientAddress(request: Request) {
  // Trust Vercel's overwritten edge header only when running on Vercel.
  // https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
  const address =
    process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for")?.trim()
      : undefined;
  return address && isIP(address) ? address : "shared";
}

function secureRequest(request: Request) {
  return (
    process.env.NODE_ENV === "production" ||
    requestOrigin(request)?.startsWith("https:") === true
  );
}
export function cookie(request: Request, value: string, maxAge: number) {
  const secure = secureRequest(request);
  return `${secure ? "__Host-" : ""}personality_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export function sessionToken(request: Request) {
  const name = secureRequest(request)
    ? "__Host-personality_session"
    : "personality_session";
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="))
    ?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

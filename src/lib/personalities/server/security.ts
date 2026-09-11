import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export function token() {
  return randomBytes(32).toString("base64url");
}
export function digest(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 32, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  }).toString("hex");
  return `scrypt$${salt}$${key}`;
}
export function verifyPassword(password: string, hash: string) {
  const parts = hash.split("$");
  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt" ||
    !/^[0-9a-f]{32}$/.test(parts[1]!) ||
    !/^[0-9a-f]{64}$/.test(parts[2]!)
  )
    return false;
  const key = scryptSync(password, parts[1]!, 32, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(key, Buffer.from(parts[2]!, "hex"));
}
export function cookie(request: Request, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:";
  return `${secure ? "__Host-" : ""}personality_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export function sessionToken(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  const name = secure ? "__Host-personality_session" : "personality_session";
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="))
    ?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

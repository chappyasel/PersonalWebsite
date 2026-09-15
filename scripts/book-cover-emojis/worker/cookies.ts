/**
 * Borrow the browser session, for one run, in memory.
 *
 * Arc stores cookies in a Chromium SQLite database with the values encrypted
 * under a key in the login keychain. This reads them, decrypts the Notion ones,
 * hands them to a headless context, and keeps nothing: no snapshot is written
 * to disk, and no cookie value is ever logged.
 *
 * The domain filter here is stricter than the reference script's, on purpose.
 * A SQL `LIKE '%notion.so'` also matches `evilnotion.so`, which would hand a
 * session cookie to whatever that is. Matching is exact, or against a dot
 * boundary for subdomains.
 */
import { execFileSync } from "node:child_process";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";

export const NOTION_DOMAINS = ["notion.so", "notion.com"] as const;

export type BrowserCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Lax" | "Strict" | "None";
  expires?: number;
};

/**
 * True only for the Notion domains themselves and their subdomains. A cookie
 * host may carry a leading dot, which is a domain-wide cookie, not a different
 * host.
 */
export function isNotionHost(hostKey: string): boolean {
  const host = hostKey.replace(/^\./, "").toLowerCase();
  return NOTION_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

const SAME_SITE: Record<number, BrowserCookie["sameSite"]> = {
  1: "Lax",
  2: "Strict",
  3: "None",
};

export function sameSiteOf(value: number | bigint): BrowserCookie["sameSite"] {
  return SAME_SITE[Number(value)] ?? "Lax";
}

/**
 * Chromium stores expiry in microseconds since 1601, which overflows a JS
 * number, so node:sqlite hands it back as a BigInt. Dividing before
 * converting keeps the value inside the safe range.
 */
export function chromiumExpiryToUnix(value: number | bigint): number | undefined {
  const micros = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
  if (micros <= 11644473600000000n) return undefined;
  return Number(micros / 1_000_000n) - 11644473600;
}

function safeStoragePassword(service: string): Buffer {
  // Never logged, never written; read straight into the key derivation.
  return Buffer.from(
    execFileSync("security", ["find-generic-password", "-w", "-s", service], {
      encoding: "utf8",
    }).trim(),
    "utf8",
  );
}

export function decryptCookie(
  encrypted: Uint8Array,
  host: string,
  key: Buffer,
): string | null {
  // node:sqlite hands back a Uint8Array, whose toString() joins byte numbers
  // rather than decoding text, so "v10" arrived as "118,49,48" and every
  // cookie was silently discarded. Wrap it before reading anything.
  const bytes = Buffer.from(encrypted);
  const prefix = bytes.subarray(0, 3).toString("utf8");
  if (prefix !== "v10" && prefix !== "v11") return null;
  try {
    const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, " "));
    decipher.setAutoPadding(true);
    let raw = Buffer.concat([decipher.update(bytes.subarray(3)), decipher.final()]);
    // Newer Chromium prepends a SHA-256 of the host to the plaintext.
    const digest = createHash("sha256").update(host).digest();
    if (raw.subarray(0, digest.length).equals(digest)) raw = raw.subarray(digest.length);
    return raw.toString("utf8");
  } catch {
    return null;
  }
}

export type CookieRow = {
  host_key: string;
  name: string;
  value: string | null;
  encrypted_value: Uint8Array | null;
  path: string | null;
  expires_utc: number | bigint;
  is_secure: number | bigint;
  is_httponly: number | bigint;
  samesite: number | bigint;
};

/** Pure, so the filtering and shaping can be tested without a keychain. */
export function shapeCookies(rows: readonly CookieRow[], key: Buffer): BrowserCookie[] {
  const cookies: BrowserCookie[] = [];
  for (const row of rows) {
    if (!isNotionHost(row.host_key)) continue;
    const value =
      row.value && row.value.length > 0
        ? row.value
        : row.encrypted_value && row.encrypted_value.length > 0
          ? decryptCookie(row.encrypted_value, row.host_key, key)
          : null;
    if (value === null) continue;
    const cookie: BrowserCookie = {
      name: row.name,
      value,
      domain: row.host_key,
      path: row.path ?? "/",
      secure: Boolean(Number(row.is_secure)),
      httpOnly: Boolean(Number(row.is_httponly)),
      sameSite: sameSiteOf(row.samesite),
    };
    const expires = chromiumExpiryToUnix(row.expires_utc);
    if (expires !== undefined) cookie.expires = expires;
    cookies.push(cookie);
  }
  return cookies;
}

/**
 * SQL that only ever returns Notion rows.
 *
 * Reading the whole cookie table and filtering in JavaScript means every
 * cookie for every site the operator has ever visited passes through this
 * process, which is a needless place for them to be. The query is scoped to
 * the exact hosts and their dot-subdomains, and `shapeCookies` applies the
 * same allowlist again, because a filter you only apply once is a filter you
 * eventually forget.
 */
export const COOKIE_QUERY = `SELECT host_key, name, value, encrypted_value, path,
         expires_utc, is_secure, is_httponly, samesite
    FROM cookies
   WHERE host_key IN ('notion.so', '.notion.so', 'notion.com', '.notion.com')
      OR host_key LIKE '%.notion.so'
      OR host_key LIKE '%.notion.com'`;

export function arcCookieKey(service = "Arc Safe Storage"): Buffer {
  return pbkdf2Sync(safeStoragePassword(service), "saltysalt", 1003, 16, "sha1");
}

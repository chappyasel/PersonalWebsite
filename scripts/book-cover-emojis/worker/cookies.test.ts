import {
  type CookieRow,
  chromiumExpiryToUnix,
  decryptCookie,
  isNotionHost,
  shapeCookies,
} from "./cookies";
import { createCipheriv, createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const KEY = Buffer.alloc(16, 7);

/**
 * Build a cookie blob the way Chromium does, and hand it back as a
 * Uint8Array, which is what node:sqlite actually returns for a BLOB. The bug
 * this guards against was reading the "v10" prefix off a Uint8Array, whose
 * toString() joins byte numbers ("118,49,48") instead of decoding text, so
 * every cookie was silently discarded and the bridge reported zero.
 */
function encryptLikeChromium(value: string, host: string): Uint8Array {
  const cipher = createCipheriv("aes-128-cbc", KEY, Buffer.alloc(16, " "));
  const digest = createHash("sha256").update(host).digest();
  const body = Buffer.concat([
    cipher.update(Buffer.concat([digest, Buffer.from(value, "utf8")])),
    cipher.final(),
  ]);
  const blob = Buffer.concat([Buffer.from("v10", "utf8"), body]);
  return new Uint8Array(blob);
}

describe("decrypting a real Uint8Array blob", () => {
  it("decodes a cookie that arrives as a Uint8Array, not a Buffer", () => {
    const blob = encryptLikeChromium("session-token-value", "notion.so");
    expect(blob).toBeInstanceOf(Uint8Array);
    expect(Buffer.isBuffer(blob)).toBe(false);
    expect(decryptCookie(blob, "notion.so", KEY)).toBe("session-token-value");
  });

  it("still works when the blob happens to be a Buffer", () => {
    const blob = Buffer.from(encryptLikeChromium("abc", "notion.so"));
    expect(decryptCookie(blob, "notion.so", KEY)).toBe("abc");
  });

  it("returns null for a blob with no version prefix", () => {
    expect(decryptCookie(new Uint8Array([1, 2, 3, 4]), "notion.so", KEY)).toBeNull();
  });

  it("shapes a row whose encrypted_value is a Uint8Array", () => {
    const rows: CookieRow[] = [
      {
        host_key: ".notion.so",
        name: "token_v2",
        value: "",
        encrypted_value: encryptLikeChromium("secret", ".notion.so"),
        path: "/",
        expires_utc: 13453559083268289n,
        is_secure: 1n,
        is_httponly: 1n,
        samesite: 3n,
      },
    ];
    const cookies = shapeCookies(rows, KEY);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({
      name: "token_v2",
      value: "secret",
      domain: ".notion.so",
      secure: true,
      httpOnly: true,
      sameSite: "None",
    });
  });

  it("drops a row it cannot decrypt rather than passing an empty cookie on", () => {
    const rows: CookieRow[] = [
      {
        host_key: ".notion.so",
        name: "bad",
        value: "",
        encrypted_value: new Uint8Array([0, 0, 0]),
        path: "/",
        expires_utc: 0n,
        is_secure: 1n,
        is_httponly: 0n,
        samesite: 1n,
      },
    ];
    expect(shapeCookies(rows, KEY)).toHaveLength(0);
  });
});

describe("domain confinement", () => {
  it("accepts the Notion hosts actually present in the cookie store", () => {
    for (const host of [
      "notion.so",
      ".notion.so",
      "www.notion.so",
      ".www.notion.so",
      "app.notion.com",
      ".app.notion.com",
      "calendar.notion.so",
      "msgstore-002.app.notion.com",
      ".identity.notion.com",
    ]) {
      expect(isNotionHost(host)).toBe(true);
    }
  });

  it("rejects a lookalike that a suffix match would have let through", () => {
    // The reference script's LIKE '%notion.so' matches all of these.
    for (const host of [
      "evilnotion.so",
      "notion.so.attacker.com",
      "mynotion.com",
      "notion.co",
      "fakenotion.com",
    ]) {
      expect(isNotionHost(host)).toBe(false);
    }
  });

  it("filters foreign hosts out of shaping even if the query returned them", () => {
    const rows: CookieRow[] = [
      {
        host_key: "evilnotion.so",
        name: "x",
        value: "plain",
        encrypted_value: null,
        path: "/",
        expires_utc: 0n,
        is_secure: 1n,
        is_httponly: 0n,
        samesite: 1n,
      },
    ];
    expect(shapeCookies(rows, KEY)).toHaveLength(0);
  });
});

describe("expiry conversion", () => {
  it("handles the BigInt microsecond value without overflowing", () => {
    const unix = chromiumExpiryToUnix(13453559083268289n);
    expect(unix).toBeGreaterThan(1_700_000_000);
    expect(Number.isFinite(unix)).toBe(true);
  });

  it("treats a session cookie as having no expiry", () => {
    expect(chromiumExpiryToUnix(0n)).toBeUndefined();
    expect(chromiumExpiryToUnix(0)).toBeUndefined();
  });
});

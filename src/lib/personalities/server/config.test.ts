import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configuredOrigin,
  personalitiesEnabled,
  requestOrigin,
} from "./config";
import { clientAddress } from "./security";

afterEach(() => vi.unstubAllEnvs());
describe("personality deployment configuration", () => {
  it("accepts localhost's external Host when Next uses an internal loopback URL", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("PERSONALITIES_ORIGIN", "");
    const request = new Request(
      "http://127.0.0.1:3016/api/personalities/login",
      { headers: { Host: "localhost:3016" } },
    );
    expect(requestOrigin(request)).toBe("http://localhost:3016");
    expect(
      requestOrigin(
        new Request(request, { headers: { Host: "evil.example:3016" } }),
      ),
    ).toBeNull();
    expect(
      requestOrigin(
        new Request(request, { headers: { Host: "localhost:4000" } }),
      ),
    ).toBeNull();
  });
  it("requires a plain HTTPS origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    for (const value of [
      "",
      "http://localhost:3016",
      "https://example.test/path",
      "https://user@example.test",
      "https://example.test?value=1",
    ]) {
      vi.stubEnv("PERSONALITIES_ORIGIN", value);
      expect(configuredOrigin()).toBeNull();
      expect(personalitiesEnabled()).toBe(false);
    }
    vi.stubEnv("PERSONALITIES_ORIGIN", "https://example.test/");
    expect(configuredOrigin()).toBe("https://example.test");
    expect(personalitiesEnabled()).toBe(true);
  });
  it("does not trust client-supplied IP headers outside Vercel", () => {
    vi.stubEnv("VERCEL", "");
    const request = new Request("http://localhost", {
      headers: {
        "x-vercel-forwarded-for": "192.0.2.1",
        "x-forwarded-for": "192.0.2.2",
        "cf-connecting-ip": "192.0.2.3",
      },
    });
    expect(clientAddress(request)).toBe("shared");
    vi.stubEnv("VERCEL", "1");
    expect(clientAddress(request)).toBe("192.0.2.1");
    expect(
      clientAddress(
        new Request(request, {
          headers: { "x-vercel-forwarded-for": "malformed, 192.0.2.4" },
        }),
      ),
    ).toBe("shared");
  });
});

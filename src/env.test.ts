import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `src/env.js` validates the environment when it is first imported, which
 * `next.config.js` does at the start of every build. Each test imports a
 * fresh copy against an invented environment. No value here is real.
 */

const REQUIRED = {
  DATABASE_URL: "postgres://invented:invented@localhost:5432/invented",
  NEXTAUTH_URL: "http://localhost:3000",
  NOTION_API_KEY: "invented",
  NOTION_BOOKS_DATABASE_ID: "invented",
  CRON_SECRET: "invented",
  AWS_BUCKET_NAME: "invented",
  AWS_KEY_NAME: "invented",
  YOUTUBE_API_KEY: "invented",
  DAD_CONTENT_PASSWORD: "invented",
  NEXT_PUBLIC_POSTHOG_KEY: "invented",
  NEXT_PUBLIC_POSTHOG_HOST: "https://invented.example",
};

const MIRROR = "invented-mirror-token-0123456789abcdef";
const ENTRY = "invented-entry-token-0123456789abcdef";

async function loadEnv(tokens: {
  WEIGHT_LOG_MIRROR_TOKEN?: string;
  WEIGHT_LOG_ENTRY_TOKEN?: string;
}) {
  for (const [name, value] of Object.entries({
    ...REQUIRED,
    SKIP_ENV_VALIDATION: undefined,
    VERCEL: undefined,
    VERCEL_URL: undefined,
    WEIGHT_LOG_MIRROR_TOKEN: undefined,
    WEIGHT_LOG_ENTRY_TOKEN: undefined,
    ...tokens,
  })) {
    vi.stubEnv(name, value);
  }
  vi.resetModules();
  return import("./env.js");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the Weight Log tokens", () => {
  it("accepts two different tokens, or either one alone", async () => {
    for (const tokens of [
      { WEIGHT_LOG_MIRROR_TOKEN: MIRROR, WEIGHT_LOG_ENTRY_TOKEN: ENTRY },
      { WEIGHT_LOG_MIRROR_TOKEN: MIRROR },
      { WEIGHT_LOG_ENTRY_TOKEN: ENTRY },
      {},
    ]) {
      const { env } = await loadEnv(tokens);
      expect(env.WEIGHT_LOG_ENTRY_TOKEN).toBe(tokens.WEIGHT_LOG_ENTRY_TOKEN);
    }
  });

  it("fails when the entry token is the mirror's, and never prints it", async () => {
    await expect(
      loadEnv({ WEIGHT_LOG_MIRROR_TOKEN: MIRROR, WEIGHT_LOG_ENTRY_TOKEN: MIRROR }),
    ).rejects.toThrow("Invalid environment variables");
    const printed = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(printed).toContain("WEIGHT_LOG_ENTRY_TOKEN");
    expect(printed).not.toContain(MIRROR);
  });
});

import { type EnvLike, REDACTED, redact, safeMessage } from "./redact";
import { describe, expect, it } from "vitest";

// A fake environment, so the suite never reads or depends on a real secret.
const env = {
  NOTION_API_KEY: "ntn_FAKEfake1234567890abcdefGHIJKL",
  DATABASE_URL: "postgres://user:hunter2@db.example.test/neondb",
  CRON_SECRET: "cron-secret-value-9876",
} satisfies EnvLike;

describe("redact", () => {
  it("masks a secret quoted back from the environment", () => {
    const line = `request failed with auth ${env.NOTION_API_KEY}`;
    expect(redact(line, env)).toBe(`request failed with auth ${REDACTED}`);
    expect(redact(line, env)).not.toContain("FAKEfake");
  });

  it("masks a Notion token the environment never held", () => {
    const stray = "ntn_SOMEOTHERtoken0987654321zyxw";
    expect(redact(`icon update: ${stray}`, {})).toBe(`icon update: ${REDACTED}`);
    expect(redact("legacy secret_abcdefghijklmnop", {})).toContain(REDACTED);
  });

  it("masks an Authorization header however it is quoted", () => {
    const dumped = 'headers: { authorization: "Bearer ntn_abcdefghijklmnop" }';
    const safe = redact(dumped, {});
    expect(safe).not.toContain("ntn_abcdefghijklmnop");
    expect(safe).toContain(REDACTED);
  });

  it("masks credentials inside a connection string", () => {
    const safe = redact("connect postgres://chappy:s3cret@host/db failed", {});
    expect(safe).not.toContain("s3cret");
    expect(safe).toContain(REDACTED);
  });

  it("masks an AWS access key id", () => {
    const safe = redact("key AKIAIOSFODNN7EXAMPLE denied", {});
    expect(safe).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("leaves ordinary log lines completely alone", () => {
    const line = "set book-the-mom-test.png -> page 2f1a-9c (The Mom Test)";
    expect(redact(line, env)).toBe(line);
  });

  it("does not blank the log over a short environment value", () => {
    // A two-character secret would otherwise match everywhere.
    const safe = redact("page ab set", { NOTION_API_KEY: "ab" });
    expect(safe).toBe("page ab set");
  });
});

describe("safeMessage", () => {
  it("flattens an Error to one redacted line", () => {
    const error = new Error(
      `APIResponseError: unauthorized\n  token=${env.NOTION_API_KEY}\n  at fetch`,
    );
    const safe = safeMessage(error, env);
    expect(safe).not.toContain("\n");
    expect(safe).not.toContain("FAKEfake");
    expect(safe).toContain("unauthorized");
  });

  it("handles a thrown non-Error without losing the secret check", () => {
    const safe = safeMessage({ auth: env.NOTION_API_KEY }, env);
    expect(safe).toContain(REDACTED);
    expect(safe).not.toContain("FAKEfake");
  });

  it("survives an empty or odd value", () => {
    expect(safeMessage("", env)).toBe("");
    expect(safeMessage(undefined, env)).toBe("");
  });
});

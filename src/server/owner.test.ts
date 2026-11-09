import { afterEach, describe, expect, it, vi } from "vitest";

import { isOwnerEmail, isOwnerGoogleSignIn } from "~/server/owner";

const mocks = vi.hoisted(() => ({
  env: { OWNER_EMAIL: "owner@example.test" } as { OWNER_EMAIL?: string },
}));
vi.mock("~/env", () => ({ env: mocks.env }));

afterEach(() => {
  mocks.env.OWNER_EMAIL = "owner@example.test";
});

it("refuses everyone when OWNER_EMAIL is unset", () => {
  delete mocks.env.OWNER_EMAIL;
  expect(
    isOwnerGoogleSignIn({
      account: { provider: "google" },
      profile: { email: "owner@example.test", email_verified: true },
    }),
  ).toBe(false);
  expect(isOwnerEmail("owner@example.test")).toBe(false);
});

const google = { provider: "google" };

describe("isOwnerGoogleSignIn", () => {
  it("allows the owner's verified Google account", () => {
    expect(
      isOwnerGoogleSignIn({
        account: google,
        profile: { email: "owner@example.test", email_verified: true },
      }),
    ).toBe(true);
  });

  it("ignores case and stray whitespace in either address", () => {
    expect(
      isOwnerGoogleSignIn(
        {
          account: google,
          profile: { email: "Owner@Example.test", email_verified: true },
        },
        "  owner@example.TEST ",
      ),
    ).toBe(true);
  });

  it.each([
    ["another Google account", "someone@example.test", true],
    ["an address that only contains the owner's", "xowner@example.test", true],
    ["an unverified owner address", "owner@example.test", false],
    ["a string 'true' verification flag", "owner@example.test", "true"],
    ["a missing verification flag", "owner@example.test", undefined],
  ])("refuses %s", (_, email, emailVerified) => {
    expect(
      isOwnerGoogleSignIn({
        account: google,
        profile: { email, email_verified: emailVerified },
      }),
    ).toBe(false);
  });

  it("refuses a provider other than Google", () => {
    expect(
      isOwnerGoogleSignIn({
        account: { provider: "github" },
        profile: { email: "owner@example.test", email_verified: true },
      }),
    ).toBe(false);
  });

  it("refuses everyone when OWNER_EMAIL is blank", () => {
    for (const ownerEmail of ["", "   "]) {
      expect(
        isOwnerGoogleSignIn(
          {
            account: google,
            profile: { email: "owner@example.test", email_verified: true },
          },
          ownerEmail,
        ),
      ).toBe(false);
    }
  });

  it("refuses a sign-in with no account or profile", () => {
    expect(isOwnerGoogleSignIn({})).toBe(false);
    expect(isOwnerGoogleSignIn({ account: google, profile: null })).toBe(false);
  });
});

describe("isOwnerEmail", () => {
  it("never matches a missing session address", () => {
    expect(isOwnerEmail(undefined)).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
  });
});

import type { NextAuthConfig } from "next-auth";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  config: null as NextAuthConfig | null,
}));

vi.mock("~/env", () => ({ env: mocks.env }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("@auth/drizzle-adapter", () => ({ DrizzleAdapter: () => ({}) }));
vi.mock("next-auth/providers/google", () => ({
  default: (options: Record<string, unknown>) => ({ id: "google", options }),
}));
vi.mock("next-auth", () => ({
  default: (config: NextAuthConfig) => {
    mocks.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));

/** Loads auth.ts fresh with the given variables and returns its config. */
async function configWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of Object.keys(mocks.env)) delete mocks.env[key];
  Object.assign(mocks.env, env);
  await import("~/server/auth");
  return mocks.config!;
}

const production = {
  AUTH_GOOGLE_ID: "client-id.example.test",
  AUTH_GOOGLE_SECRET: "client-secret",
  OWNER_EMAIL: "owner@example.test",
};

afterEach(() => {
  mocks.config = null;
});

describe("NextAuth config", () => {
  it("adds Google when all three variables are set", async () => {
    const config = await configWith(production);
    expect(config.providers).toEqual([
      {
        id: "google",
        options: {
          clientId: "client-id.example.test",
          clientSecret: "client-secret",
        },
      },
    ]);
  });

  it.each(["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "OWNER_EMAIL"])(
    "has no provider when %s is missing, as on previews and CI",
    async (missing) => {
      const config = await configWith({ ...production, [missing]: undefined });
      expect(config.providers).toEqual([]);
    },
  );

  it("sends sign-in and its errors to the owner page", async () => {
    const config = await configWith(production);
    expect(config.pages).toEqual({
      signIn: "/weight-log/edit",
      error: "/weight-log/edit",
    });
  });

  it("lets only the owner's verified Google account through signIn", async () => {
    const { callbacks } = await configWith(production);
    const signIn = (email: string, email_verified: boolean) =>
      callbacks!.signIn!({
        user: { email },
        account: {
          provider: "google",
          type: "oidc",
          providerAccountId: "1",
        },
        profile: { email, email_verified },
      });

    expect(await signIn("owner@example.test", true)).toBe(true);
    expect(await signIn("owner@example.test", false)).toBe(false);
    expect(await signIn("someone@example.test", true)).toBe(false);
  });
});

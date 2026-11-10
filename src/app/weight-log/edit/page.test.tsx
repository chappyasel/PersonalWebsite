import type { Session } from "next-auth";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WeightLogEditPage from "./page";

const mocks = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<Session | null>>(),
  env: {} as Record<string, string | undefined>,
}));

vi.mock("~/env", () => ({ env: mocks.env }));
vi.mock("~/server/auth", () => ({ auth: mocks.auth }));
vi.mock("~/trpc/react", () => ({
  TRPCReactProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./WeightLogEditor", () => ({
  WeightLogEditor: () => "Owner editor",
}));
vi.mock("./actions", () => ({
  signInWithGoogle: vi.fn(),
  signOutOwner: vi.fn(),
}));

const EDITOR = "Owner editor";
const SIGN_IN = "Sign in with Google";

function session(email: string): Session {
  return {
    user: { id: "user-1", email },
    expires: "2099-01-01T00:00:00.000Z",
  };
}

async function render(error?: string) {
  return renderToStaticMarkup(
    await WeightLogEditPage({
      searchParams: Promise.resolve(error ? { error } : {}),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mocks.env)) delete mocks.env[key];
  Object.assign(mocks.env, {
    AUTH_GOOGLE_ID: "client-id.example.test",
    AUTH_GOOGLE_SECRET: "client-secret",
    OWNER_EMAIL: "owner@example.test",
  });
});

describe("/weight-log/edit", () => {
  it("shows only the sign-in button without a session", async () => {
    mocks.auth.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain(SIGN_IN);
    expect(html).not.toContain(EDITOR);
    expect(html).not.toContain("Sign out");
  });

  it("treats another account's session as signed out", async () => {
    mocks.auth.mockResolvedValue(session("someone@example.test"));
    const html = await render();
    expect(html).toContain(SIGN_IN);
    expect(html).not.toContain(EDITOR);
    expect(html).not.toContain("someone@example.test");
  });

  it("shows the owner the editor and no sign-in button", async () => {
    mocks.auth.mockResolvedValue(session("owner@example.test"));
    const html = await render();
    expect(html).toContain(EDITOR);
    expect(html).toContain('aria-label="Sign out"');
    expect(html).not.toContain(SIGN_IN);
  });

  it("signs out from an icon button with a name but no visible text", async () => {
    mocks.auth.mockResolvedValue(session("owner@example.test"));
    const html = await render();
    const button =
      /<button[^>]*aria-label="Sign out"[^>]*>(.*?)<\/button>/.exec(html);
    expect(button).not.toBeNull();
    // Only the icon's markup, with no text between tags.
    expect(button![1]!.replace(/<[^>]+>/g, "").trim()).toBe("");
    expect(button![1]).toContain("<svg");
    // The hint is a Tooltip, never a native title.
    expect(button![0]).not.toContain("title=");
  });

  it("says sign-in is unavailable where Google is not configured", async () => {
    delete mocks.env.AUTH_GOOGLE_ID;
    mocks.auth.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Sign-in isn&#x27;t available on this deployment.");
    expect(html).not.toContain(SIGN_IN);
  });

  it("tells a refused account why, without naming the owner", async () => {
    mocks.auth.mockResolvedValue(null);
    const html = await render("AccessDenied");
    expect(html).toContain("That Google account can&#x27;t sign in here.");
    expect(html).not.toContain("owner@example.test");
  });

  it("reads the session before rendering", async () => {
    mocks.auth.mockResolvedValue(null);
    await render();
    expect(mocks.auth).toHaveBeenCalledTimes(1);
  });
});

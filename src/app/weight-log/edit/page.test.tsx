import type { Session } from "next-auth";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WEEKS_CONTROLS_ID } from "./headerSlot";
import WeightLogEditPage from "./page";
import WeightLogPlanPage from "./plan/page";
import WeightLogSetPointsPage from "./set-points/page";

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
  WeightLogEditor: ({ view }: { view: string }) => `Owner editor: ${view}`,
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

type Page = typeof WeightLogEditPage;

async function render(error?: string, page: Page = WeightLogEditPage) {
  return renderToStaticMarkup(
    await page({
      searchParams: Promise.resolve(error ? { error } : {}),
    }),
  );
}

/** Each nav link's opening tag, by its accessible name. */
function navLinks(html: string) {
  const nav = /<nav[^>]*>(.*?)<\/nav>/.exec(html)![1]!;
  return new Map(
    [...nav.matchAll(/<a[^>]*aria-label="([^"]+)"[^>]*>/g)].map((m) => [
      m[1]!,
      m[0],
    ]),
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

  it("keeps the title free of a standing back arrow", async () => {
    mocks.auth.mockResolvedValue(session("owner@example.test"));
    const html = await render();
    const title = /<h1[^>]*>(.*?)<\/h1>/.exec(html)![1]!;
    expect(title).toContain('href="/weight-log"');
    expect(title).toContain("Weight Log");
    // Like the chart's own title, the icon turns into an arrow only on
    // hover or focus.
    expect(title).toMatch(
      /class="[^"]*\bopacity-0\b[^"]*group-hover:opacity-100/,
    );
  });
});

describe("the editor's nav", () => {
  const pages: [string, Page, string, string][] = [
    ["/weight-log/edit", WeightLogEditPage, "weeks", "Weeks"],
    ["/weight-log/edit/plan", WeightLogPlanPage, "plan", "Plan"],
    [
      "/weight-log/edit/set-points",
      WeightLogSetPointsPage,
      "set-points",
      "Set points",
    ],
  ];

  it.each(pages)(
    "%s shows its own editor and marks its own link",
    async (href, page, view, label) => {
      mocks.auth.mockResolvedValue(session("owner@example.test"));
      const html = await render(undefined, page);
      expect(html).toContain(`${EDITOR}: ${view}`);
      const links = navLinks(html);
      expect([...links.keys()]).toEqual(["Weeks", "Plan", "Set points"]);
      for (const [name, tag] of links) {
        expect(tag.includes('aria-current="page"')).toBe(name === label);
        expect(tag).not.toContain("title=");
      }
      expect(links.get(label)).toContain(`href="${href}"`);
      expect(html).toContain('aria-label="Sign out"');
    },
  );

  it.each(pages)(
    "%s shows only the sign-in button without a session",
    async (_href, page) => {
      mocks.auth.mockResolvedValue(null);
      const html = await render(undefined, page);
      expect(html).toContain(SIGN_IN);
      expect(html).not.toContain(EDITOR);
      expect(html).not.toContain("<nav");
    },
  );

  it("gives only the Weeks page a slot for the table's controls", async () => {
    mocks.auth.mockResolvedValue(session("owner@example.test"));
    expect(await render()).toContain(`id="${WEEKS_CONTROLS_ID}"`);
    expect(await render(undefined, WeightLogPlanPage)).not.toContain(
      WEEKS_CONTROLS_ID,
    );
  });

  it("never uses a native title for a hint", async () => {
    mocks.auth.mockResolvedValue(session("owner@example.test"));
    expect(await render()).not.toContain("title=");
  });
});

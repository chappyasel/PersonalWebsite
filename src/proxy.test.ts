import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dadAccessToken } from "~/lib/dad/access";

import { proxy } from "./proxy";

vi.mock("~/env", () => ({
  env: { DAD_CONTENT_PASSWORD: "correct-password" },
}));

function dadRequest(cookie?: string) {
  return new NextRequest("https://chappyasel.com/dad/journal/entry", {
    headers: cookie ? { cookie: `dad-access=${cookie}` } : undefined,
  });
}

describe("Dad proxy authorization", () => {
  it("redirects missing and arbitrary Dad access cookies", async () => {
    const missing = await proxy(dadRequest());
    const arbitrary = await proxy(dadRequest("authenticated"));

    expect(missing.status).toBe(307);
    expect(missing.headers.get("location")).toBe("https://chappyasel.com/dad");
    expect(arbitrary.status).toBe(307);
  });

  it("accepts a Dad access cookie signed with the current password", async () => {
    const response = await proxy(
      dadRequest(dadAccessToken("correct-password")),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("local connected-site entry points", () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    [
      "http://weightlifting.localhost:3001/",
      "http://127.0.0.1:3001/weightlifting",
    ],
    [
      "http://books.localhost:3001/?tags=Psychology",
      "http://127.0.0.1:3001/books?tags=Psychology",
    ],
    [
      "http://manual.localhost:3001/?section=intro",
      "http://127.0.0.1:3001/manual?section=intro",
    ],
    ["http://routine.localhost:3001/", "http://127.0.0.1:3001/routine"],
    [
      "http://books.localhost:3001/behave",
      "http://127.0.0.1:3001/books/behave",
    ],
    [
      "http://books.localhost:3001/books/behave",
      "http://127.0.0.1:3001/books/behave",
    ],
    [
      "http://weightlifting.localhost:3001/weightlifting/squat",
      "http://127.0.0.1:3001/weightlifting/squat",
    ],
  ])("opens %s in the shared local app", async (href, expected) => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await proxy(
      new NextRequest(href, { headers: { accept: "text/html" } }),
    );
    expect(response.headers.get("location")).toBe(expected);
  });
  it.each(["books", "weightlifting", "manual", "routine"])(
    "opens the production %s entry point in the main app",
    async (site) => {
      vi.stubEnv("NODE_ENV", "production");
      const response = await proxy(
        new NextRequest(`https://${site}.chappyasel.com/?search=example`, {
          headers: { accept: "text/html" },
        }),
      );
      expect(response.headers.get("location")).toBe(
        `https://www.chappyasel.com/${site}?search=example`,
      );
    },
  );
  it("preserves deep production subdomain URLs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await proxy(
      new NextRequest("https://weightlifting.chappyasel.com/exercise/squat", {
        headers: { accept: "text/html" },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://weightlifting.chappyasel.com/weightlifting/exercise/squat",
    );
  });
  it("does not redirect a local RSC request", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await proxy(
      new NextRequest("http://books.localhost:3001/", {
        headers: { accept: "text/x-component", rsc: "1" },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
  });
});

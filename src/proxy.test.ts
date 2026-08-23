import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

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

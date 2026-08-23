import { beforeEach, describe, expect, it, vi } from "vitest";

import { dadAccessToken } from "~/lib/dad/access";

import { setDadAccessCookie } from "./actions";

const cookieSet = vi.fn();
const getHeader = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookieSet })),
  headers: vi.fn(async () => ({ get: getHeader })),
}));

vi.mock("~/env", () => ({
  env: {
    DAD_CONTENT_PASSWORD: "correct-password",
    NODE_ENV: "production",
  },
}));

describe("setDadAccessCookie", () => {
  beforeEach(() => {
    cookieSet.mockReset();
    getHeader.mockReset();
    getHeader.mockImplementation((name: string) =>
      name === "host" ? "books.chappyasel.com" : null,
    );
  });

  it("does not set a cookie for an invalid password", async () => {
    await expect(setDadAccessCookie("wrong-password")).resolves.toBe(false);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("sets a signed, parent-domain cookie after verifying the password", async () => {
    await expect(setDadAccessCookie("correct-password")).resolves.toBe(true);

    expect(cookieSet).toHaveBeenNthCalledWith(
      1,
      "dad-access",
      "",
      expect.objectContaining({ maxAge: 0, path: "/" }),
    );
    expect(cookieSet).toHaveBeenLastCalledWith(
      "dad-access",
      dadAccessToken("correct-password"),
      expect.objectContaining({
        domain: ".chappyasel.com",
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      }),
    );
  });
});

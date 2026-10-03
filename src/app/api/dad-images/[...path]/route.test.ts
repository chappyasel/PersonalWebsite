import { NextRequest } from "next/server";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { dadAccessToken } from "~/lib/dad/access";

import { GET } from "./route";

vi.mock("~/env", () => ({
  env: { DAD_CONTENT_PASSWORD: "correct-password" },
}));

const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "dad-images-"));
  const images = join(root, "content", "dad", "Journal", "images");
  mkdirSync(images, { recursive: true });
  writeFileSync(join(images, "2006-06-18-01.jpg"), IMAGE_BYTES);
  vi.spyOn(process, "cwd").mockReturnValue(root);
});

afterAll(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function requestImage(name: string, cookie?: string) {
  return GET(
    new NextRequest(`https://www.chappyasel.com/api/dad-images/${name}`, {
      headers: cookie ? { cookie: `dad-access=${cookie}` } : undefined,
    }),
    { params: Promise.resolve({ path: [name] }) },
  );
}

describe("GET /api/dad-images", () => {
  it.each([
    ["no cookie", undefined],
    ["an arbitrary cookie", "authenticated"],
    ["a token signed with another password", dadAccessToken("old-password")],
  ])("refuses %s without sending image bytes", async (_, cookie) => {
    const response = await requestImage("2006-06-18-01.jpg", cookie);
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).not.toMatch(/^image\//);
    expect(body.includes(IMAGE_BYTES)).toBe(false);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it("checks access before it reveals whether a file exists", async () => {
    const anonymous = await requestImage("1999-01-01-01.jpg");
    const signedIn = await requestImage(
      "1999-01-01-01.jpg",
      dadAccessToken("correct-password"),
    );

    expect(anonymous.status).toBe(401);
    expect(signedIn.status).toBe(404);
  });

  it("serves the image to a valid signed cookie with a private cache header", async () => {
    const response = await requestImage(
      "2006-06-18-01.jpg",
      dadAccessToken("correct-password"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(IMAGE_BYTES);

    const cacheControl = response.headers.get("cache-control") ?? "";
    expect(cacheControl.split(", ")).toContain("private");
    expect(cacheControl).not.toMatch(/\bpublic\b|s-maxage/);
  });
});

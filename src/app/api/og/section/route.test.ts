import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";

vi.mock("server-only", () => ({}));

describe("section OG images", () => {
  it.each(["deep-think-weeks", "dtw26-rapid-recap"])(
    "renders a PNG for %s",
    async (section) => {
      const response = await GET(
        new Request(
          `https://www.chappyasel.com/api/og/section?page=systems&section=${section}`,
        ),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(await sharp(bytes).metadata()).toMatchObject({
        width: 1200,
        height: 630,
        format: "png",
      });
    },
  );

  it.each([
    "page=systems&section=made-up",
    "page=books&section=morning",
    "page=systems",
    "page=systems&section=foundations&section=deep-think-weeks",
  ])("rejects unknown or ambiguous content: %s", async (query) => {
    const response = await GET(
      new Request(`https://www.chappyasel.com/api/og/section?${query}`),
    );
    expect(response.status).toBe(404);
  });
});

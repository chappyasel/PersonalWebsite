import { describe, expect, it, vi } from "vitest";

import { isCoverImageUrl, shouldRepairCover } from "./coverValidation";

describe("book cover validation", () => {
  it("marks an Amazon product page for repair", () => {
    expect(
      shouldRepairCover(
        "https://www.amazon.com/Right-Many-Ideas-Yours-Succeed/dp/0062958232",
      ),
    ).toBe(true);
  });

  it("keeps supported direct-image URLs out of the repair path", () => {
    expect(
      shouldRepairCover("https://m.media-amazon.com/images/I/71Sal58LoYL.jpg"),
    ).toBe(false);
    expect(
      shouldRepairCover(
        "https://books.google.com/books/content?id=abc&img=1&zoom=5",
      ),
    ).toBe(false);
  });

  it("requires the remote resource to identify itself as an image", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("<html>product page</html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    await expect(
      isCoverImageUrl("https://www.amazon.com/dp/0062958232", fetchImpl),
    ).resolves.toBe(false);
  });

  it("falls back to a ranged GET when HEAD is unsupported", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "HEAD") {
          return new Response(null, { status: 405 });
        }
        return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          headers: { "content-type": "image/jpeg" },
        });
      },
    );

    await expect(
      isCoverImageUrl(
        "https://example.com/cover-without-an-extension",
        fetchImpl,
      ),
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://example.com/cover-without-an-extension",
      expect.objectContaining({
        headers: { Range: "bytes=0-0" },
        method: "GET",
      }),
    );
  });
});

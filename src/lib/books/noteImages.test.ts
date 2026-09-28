import { describe, expect, it, vi } from "vitest";

import { imagePathname } from "./noteImages";

vi.mock("~/env", () => ({ env: {} }));

describe("imagePathname", () => {
  it("names a Notion file by its file id, ignoring the expiring signature", () => {
    const signed = (signature: string) =>
      `https://prod-files-secure.s3.us-west-2.amazonaws.com/859fbc85-7644-4498-88d8-e0229d8cea32/0A706D01-F59E-4B8F-A37D-47D811750CCA/Shackled%20Leviathan.jpeg?X-Amz-Signature=${signature}`;
    expect(imagePathname(signed("a"))).toBe(
      "book-notes/0a706d01-f59e-4b8f-a37d-47d811750cca/Shackled-Leviathan.jpeg",
    );
    expect(imagePathname(signed("b"))).toBe(imagePathname(signed("a")));
  });

  it("names any other image by its address", () => {
    const pathname = imagePathname("https://example.com/charts/growth.png");
    expect(pathname).toMatch(/^book-notes\/external\/[\da-f]{32}\.png$/);
    expect(imagePathname("https://example.com/charts/other.png")).not.toBe(
      pathname,
    );
  });
});

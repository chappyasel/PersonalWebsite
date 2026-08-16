import { describe, expect, it } from "vitest";

import { homepageMetadata } from "./homeMetadata";

describe("homepage launch metadata", () => {
  it("identifies the canonical page and social account", () => {
    expect(homepageMetadata.alternates?.canonical).toBe("/");
    expect(homepageMetadata.openGraph).toMatchObject({
      url: "/",
      siteName: "Chappy Asel",
      locale: "en_US",
      type: "website",
    });
    expect(homepageMetadata.twitter).toMatchObject({
      card: "summary_large_image",
      site: "@chappyasel",
      creator: "@chappyasel",
    });
  });
});

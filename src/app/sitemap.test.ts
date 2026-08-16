import { describe, expect, it } from "vitest";

import sitemap from "./sitemap";

describe("root sitemap", () => {
  it("publishes the homepage on its canonical www host", () => {
    expect(sitemap()[0]?.url).toBe("https://www.chappyasel.com/");
  });
});

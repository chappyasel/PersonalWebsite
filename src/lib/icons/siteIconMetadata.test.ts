import { describe, expect, it } from "vitest";

import { siteIconMetadata } from "./siteIconMetadata";

describe("siteIconMetadata", () => {
  it("links a subdomain site's SVG favicon and PNG touch icon by absolute origin", () => {
    const icons = siteIconMetadata("https://weightlifting.chappyasel.com");
    expect(icons).toEqual({
      icon: [
        {
          url: "https://weightlifting.chappyasel.com/tab-icon",
          type: "image/svg+xml",
          sizes: "any",
        },
      ],
      apple: [
        {
          url: "https://weightlifting.chappyasel.com/icon/app",
          sizes: "180x180",
          type: "image/png",
        },
      ],
    });
  });

  it("links a main-host section by its path prefix", () => {
    const icons = siteIconMetadata("/liarsdice") as {
      icon: Array<{ url: string }>;
      apple: Array<{ url: string }>;
    };
    expect(icons.icon[0]?.url).toBe("/liarsdice/tab-icon");
    expect(icons.apple[0]?.url).toBe("/liarsdice/icon/app");
  });

  it("tolerates a trailing slash on the base", () => {
    const icons = siteIconMetadata("http://routine.localhost:3000/") as {
      icon: Array<{ url: string }>;
    };
    expect(icons.icon[0]?.url).toBe("http://routine.localhost:3000/tab-icon");
  });
});

import { describe, expect, it } from "vitest";

import { resolveRegistryDestination, resolveSearchResultHref } from "./urls";

describe("Universal Search destination URLs", () => {
  it("uses the correct route or subdomain for each production section", () => {
    const location = {
      hostname: "books.chappyasel.com",
      port: "",
      protocol: "https:",
    };

    expect(resolveRegistryDestination("destination-home", location)).toBe(
      "https://www.chappyasel.com/",
    );
    expect(resolveRegistryDestination("destination-books", location)).toBe(
      "https://books.chappyasel.com/",
    );
    expect(resolveRegistryDestination("destination-manual", location)).toBe(
      "https://www.chappyasel.com/manual",
    );
    expect(resolveRegistryDestination("section-projects", location)).toBe(
      "https://www.chappyasel.com/projects",
    );
    expect(resolveRegistryDestination("section-books", location)).toBe(
      "https://www.chappyasel.com/#books",
    );
    expect(resolveRegistryDestination("destination-liars-dice", location)).toBe(
      "https://www.chappyasel.com/liarsdice",
    );
  });

  it("preserves section URL styles and the active localhost port", () => {
    const location = {
      hostname: "routine.localhost",
      port: "4310",
      protocol: "http:",
    };

    expect(resolveRegistryDestination("destination-home", location)).toBe(
      "http://localhost:4310/",
    );
    expect(resolveRegistryDestination("destination-books", location)).toBe(
      "http://books.localhost:4310/",
    );
    expect(resolveRegistryDestination("destination-routine", location)).toBe(
      "http://localhost:4310/routine",
    );
  });

  it("keeps preview and LAN navigation on the current host using route paths", () => {
    const preview = {
      hostname: "personal-website-git-search.vercel.app",
      port: "",
      protocol: "https:",
    };

    expect(resolveRegistryDestination("destination-home", preview)).toBe(
      "https://personal-website-git-search.vercel.app/",
    );
    expect(resolveRegistryDestination("destination-books", preview)).toBe(
      "https://personal-website-git-search.vercel.app/books",
    );
    expect(resolveRegistryDestination("section-projects", preview)).toBe(
      "https://personal-website-git-search.vercel.app/projects",
    );
  });

  it.each(["manual", "routine"])(
    "uses the /%s route on local, loopback, production, and preview hosts",
    (site) => {
      for (const origin of [
        "http://localhost:3000",
        "http://127.0.0.1:4310",
        "https://www.chappyasel.com",
        "https://preview.vercel.app",
      ]) {
        expect(
          resolveRegistryDestination(`destination-${site}`, new URL(origin)),
        ).toBe(`${origin}/${site}`);
      }
    },
  );

  it.each(["books", "weightlifting"])(
    "uses the %s subdomain locally and in production, with paths on preview hosts",
    (site) => {
      for (const [origin, expected] of [
        ["http://localhost:3000", `http://${site}.localhost:3000/`],
        ["http://routine.localhost:4310", `http://${site}.localhost:4310/`],
        ["https://www.chappyasel.com", `https://${site}.chappyasel.com/`],
        ["https://preview.vercel.app", `https://preview.vercel.app/${site}`],
      ] as const) {
        const location = new URL(origin);
        expect(
          resolveRegistryDestination(`destination-${site}`, location),
        ).toBe(expected);
        for (const href of [
          `https://${site}.chappyasel.com/detail?tab=notes#section`,
          `https://www.chappyasel.com/${site}/detail?tab=notes#section`,
          `http://localhost:3000/${site}/detail?tab=notes#section`,
        ]) {
          expect(resolveSearchResultHref(href, location)).toBe(
            `${expected.replace(/\/$/, "")}/detail?tab=notes#section`,
          );
        }
      }
    },
  );

  it.each(["manual", "routine"])(
    "normalizes old %s links while preserving detail paths, filters, and anchors",
    (site) => {
      const location = new URL("http://localhost:3000");
      for (const domain of ["localhost:4310", "chappyasel.com"]) {
        expect(
          resolveSearchResultHref(`https://${site}.${domain}/`, location),
        ).toBe(`http://localhost:3000/${site}`);
        for (const prefix of ["", `/${site}`]) {
          expect(
            resolveSearchResultHref(
              `https://${site}.${domain}${prefix}/detail?tab=notes#section`,
              location,
            ),
          ).toBe(`http://localhost:3000/${site}/detail?tab=notes#section`);
        }
      }
    },
  );

  it.each([
    "https://example.com/manual?x=1#section",
    "https://manual.chappyasel.com.example.com/",
    "https://www.chappyasel.com/manual#section",
    "/manual#section",
    "Set theme to Dark",
  ])("keeps other links and action labels unchanged: %s", (href) => {
    expect(
      resolveSearchResultHref(href, new URL("http://localhost:3000")),
    ).toBe(href);
  });

  it("throws for action IDs and unknown IDs", () => {
    const location = {
      hostname: "www.chappyasel.com",
      port: "",
      protocol: "https:",
    };

    expect(() =>
      resolveRegistryDestination("action-theme-light", location),
    ).toThrow(/not a destination/i);
    expect(() => resolveRegistryDestination("missing", location)).toThrow(
      /unknown/i,
    );
  });
});

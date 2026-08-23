import { describe, expect, it } from "vitest";

import { resolveRegistryDestination } from "./urls";

describe("Universal Search destination URLs", () => {
  it("uses canonical production domains from any current subdomain", () => {
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
      "https://manual.chappyasel.com/",
    );
    expect(resolveRegistryDestination("section-projects", location)).toBe(
      "https://www.chappyasel.com/#projects",
    );
    expect(resolveRegistryDestination("destination-liars-dice", location)).toBe(
      "https://www.chappyasel.com/liarsdice",
    );
  });

  it("preserves the active localhost port for development subdomains", () => {
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
      "http://routine.localhost:4310/",
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
      "https://personal-website-git-search.vercel.app/books/",
    );
    expect(resolveRegistryDestination("section-projects", preview)).toBe(
      "https://personal-website-git-search.vercel.app/#projects",
    );
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

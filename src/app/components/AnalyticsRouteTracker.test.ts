import { describe, expect, it } from "vitest";

import { deepPageForLocation } from "./AnalyticsRouteTracker";

describe("deep-page journey classification", () => {
  it("classifies only the bounded primary routes", () => {
    expect(deepPageForLocation("/books")).toBe("books");
    expect(deepPageForLocation("/books/a-public-slug")).toBe("books");
    expect(deepPageForLocation("/weightlifting/")).toBe("weightlifting");
    expect(deepPageForLocation("/manual")).toBe("manual");
    expect(deepPageForLocation("/routine")).toBe("routine");
    expect(deepPageForLocation("/systems")).toBe("systems");
    expect(deepPageForLocation("/liarsdice")).toBe("liars_dice");
    expect(deepPageForLocation("/golf")).toBe("golf");
  });

  it("recognizes public and local subdomain rewrites without a route path", () => {
    expect(deepPageForLocation("/", "books.chappyasel.com")).toBe("books");
    expect(deepPageForLocation("/slug", "books.localhost")).toBe("books");
    expect(deepPageForLocation("/", "manual.chappyasel.com")).toBe("manual");
    expect(deepPageForLocation("/", "routine.localhost")).toBe("routine");
    expect(deepPageForLocation("/", "weightlifting.chappyasel.com")).toBe(
      "weightlifting",
    );
  });

  it("does not classify arbitrary or private paths", () => {
    expect(deepPageForLocation("/")).toBeNull();
    expect(deepPageForLocation("/youtube")).toBeNull();
    expect(deepPageForLocation("/dad/journal")).toBeNull();
    expect(deepPageForLocation("/manual/private")).toBeNull();
    expect(deepPageForLocation("/", "books.example.com")).toBeNull();
  });
});

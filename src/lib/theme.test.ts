import { describe, expect, it } from "vitest";

import { oppositeTheme } from "./theme";

describe("oppositeTheme", () => {
  it("always changes the visible light or dark theme", () => {
    expect(oppositeTheme("light")).toBe("dark");
    expect(oppositeTheme("dark")).toBe("light");
  });

  it("falls back to dark until the resolved theme is available", () => {
    expect(oppositeTheme(undefined)).toBe("dark");
  });
});

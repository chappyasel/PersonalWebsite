import { describe, expect, it } from "vitest";

import { viewForPath, views } from "./navigation";

describe("personality navigation", () => {
  it("gives all six views a distinct route and resolves direct links", () => {
    expect(new Set(views.map((v) => v.href)).size).toBe(6);
    for (const view of views) {
      expect(viewForPath(view.href)).toEqual(view);
      expect(viewForPath(view.href + "/")).toEqual(view);
    }
  });
  it("preserves old variant links without overriding named routes", () => {
    expect(viewForPath("/personalities", "E").href).toBe(
      "/personalities/closest",
    );
    expect(viewForPath("/personalities/history", "E").id).toBe("history");
  });
});

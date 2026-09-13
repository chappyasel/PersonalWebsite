import { describe, expect, it } from "vitest";

import { advancedViews, mainViews, viewForPath, views } from "./navigation";

describe("personality navigation", () => {
  it("gives all eight views a distinct route and resolves direct links", () => {
    expect(new Set(views.map((v) => v.href)).size).toBe(8);
    for (const view of views) {
      expect(viewForPath(view.href)).toEqual(view);
      expect(viewForPath(view.href + "/")).toEqual(view);
    }
  });
  it("keeps direct comparison and changes in the main navigation and PCA under Advanced", () => {
    expect(mainViews.map((v) => v.id)).toEqual([
      "A",
      "compare",
      "E",
      "changes",
      "history",
    ]);
    expect(advancedViews.map((v) => v.id)).toContain("pca");
    expect(advancedViews.map((v) => v.id)).toContain("C");
    expect(mainViews[0]!.name).toBe("All traits");
    expect(advancedViews.map((v) => v.href)).not.toContain(
      "/personalities/all-traits",
    );
  });
  it("preserves old variant links without overriding named routes", () => {
    expect(viewForPath("/personalities", "E").href).toBe(
      "/personalities/closest",
    );
    expect(viewForPath("/personalities/history", "E").id).toBe("history");
    expect(viewForPath("/personalities/all-traits").href).toBe(
      "/personalities",
    );
    expect(viewForPath("/personalities", "B").href).toBe("/personalities");
  });
});

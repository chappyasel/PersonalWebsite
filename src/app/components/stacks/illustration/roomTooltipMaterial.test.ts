// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { afterEach, expect, it } from "vitest";

const stylesheet = postcss.parse(
  readFileSync("src/styles/globals.css", "utf8"),
);
afterEach(() => {
  document.documentElement.removeAttribute("data-world");
  document.documentElement.removeAttribute("data-room-view");
  document.documentElement.removeAttribute("data-overlay-open");
  document.documentElement.classList.remove("dark");
  document.body.replaceChildren();
});
function material() {
  const label = document.createElement("div");
  label.className = "field-notes-glass-tooltip";
  document.body.append(label);
  const declarations: Record<string, string> = {};
  stylesheet.walkRules((rule) => {
    if (
      rule.parent?.type !== "root" ||
      !rule.selectors.some(
        (selector) =>
          !selector.startsWith(":where(") &&
          !selector.includes("::") &&
          label.matches(selector.replace(/\s+/g, " ")),
      )
    )
      return;
    rule.walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value;
    });
  });
  return declarations;
}
it.each([false, true])(
  "keeps the same glass fill, blur, and edges in 2D and 3D, dark=%s",
  (dark) => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.world = "";
    const world = material();
    document.documentElement.removeAttribute("data-world");
    document.documentElement.dataset.roomView = "illustration";
    const illustration = material();
    for (const property of [
      "background-color",
      "color",
      "backdrop-filter",
      "box-shadow",
      "--placard-edge-top",
    ])
      expect(illustration[property], property).toEqual(world[property]);
  },
);
it("keeps reading overlay tooltips on paper in 2D", () => {
  const paper = material();
  document.documentElement.dataset.roomView = "illustration";
  document.documentElement.dataset.overlayOpen = "";
  expect(material()["background-color"]).toEqual(paper["background-color"]);
});

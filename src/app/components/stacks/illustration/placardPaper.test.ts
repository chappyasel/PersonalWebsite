// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { afterEach, expect, it } from "vitest";

const stylesheet = postcss.parse(
  readFileSync(
    "src/app/components/stacks/illustration/placardPaper.css",
    "utf8",
  ),
);
afterEach(() => {
  document.documentElement.removeAttribute("data-room-view");
  document.documentElement.classList.remove("dark");
  document.body.replaceChildren();
});
function surface(panel: string) {
  const shell = document.createElement("div");
  shell.className = "stacks-world-shell";
  shell.innerHTML = `<div data-stacks-glass-mode="native"><div ${panel}><a data-placard-surface=""></a></div></div>`;
  document.body.append(shell);
  return shell.querySelector("[data-placard-surface]")!;
}
function declarations(element: Element) {
  const found: Record<string, string> = {};
  stylesheet.walkRules((rule) => {
    if (rule.parent?.type !== "root") return;
    if (!rule.selectors.some((s) => element.matches(s.replace(/\s+/g, " "))))
      return;
    rule.walkDecls((declaration) => {
      found[declaration.prop] = declaration.important
        ? `${declaration.value} !important`
        : declaration.value;
    });
  });
  return found;
}

it.each([
  ["desktop", "data-stacks-desktop-panel"],
  ["mobile", "data-stacks-mobile-panel"],
])("puts %s cards on paper in 2D in both themes", (_, panel) => {
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.roomView = "illustrated";
    const paper = declarations(surface(panel));
    expect(paper["background-color"]).toBe("var(--placard-paper) !important");
    expect(paper["box-shadow"]).toBe("none !important");
    expect(paper["--placard-edge-top"]).toBe("transparent !important");
    expect(paper["--placard-paper-line"]).toBe("var(--placard-paper-ink-line)");
    document.body.replaceChildren();
  }
});

it.each(["dissolve", "travel", "live"])(
  "leaves the glass alone once the room view is %s",
  (view) => {
    document.documentElement.dataset.roomView = view;
    const glass = declarations(surface("data-stacks-desktop-panel"));
    for (const property of [
      "background-color",
      "box-shadow",
      "--placard-edge-top",
      "--placard-paper-line",
    ])
      expect(glass[property], property).toBeUndefined();
  },
);

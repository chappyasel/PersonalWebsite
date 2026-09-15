// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { afterEach, expect, it } from "vitest";

import { ILLUSTRATED_ENTRANCE } from "./useIllustratedEntrance";

const stylesheet = postcss.parse(
  readFileSync(
    "src/app/components/stacks/illustration/illustratedEntrance.css",
    "utf8",
  ),
);

afterEach(() => document.body.replaceChildren());

// Resolve matching desktop declarations without starting a browser or
// pretending jsdom can render CSS animations and custom properties.
function desktopDeclarations(element: Element) {
  const declarations: Record<string, string> = {};
  stylesheet.walkRules((rule) => {
    if (
      rule.parent?.type === "atrule" &&
      "params" in rule.parent &&
      rule.parent.params !== "(min-width: 1200px)"
    )
      return;
    const selectors = rule.selectors.flatMap((selector) => {
      // jsdom's selector engine cannot match :not() nested inside :is().
      const group = selector.lastIndexOf(":is(");
      if (group === -1 || !selector.endsWith(")")) return [selector];
      let end = group + 4;
      let depth = 1;
      for (; depth > 0; end++) {
        if (selector[end] === "(") depth++;
        if (selector[end] === ")") depth--;
      }
      return postcss.list
        .comma(selector.slice(group + 4, end - 1))
        .map(
          (member) => selector.slice(0, group) + member + selector.slice(end),
        );
    });
    if (
      !selectors.some((selector) =>
        element.matches(selector.replace(/\s+/g, " ")),
      )
    )
      return;
    rule.walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value;
    });
  });
  return declarations;
}

it.each(["shelf", "items", "placing", "complete"])(
  "keeps quotes on the card entrance timeline during %s",
  (phase) => {
    document.body.innerHTML = `
      <div class="stacks-world-shell" data-illustrated-entry data-room-entrance="${phase}">
        <div data-stacks-desktop-panel>
          <div class="placard-sections">
            <a data-placard-surface>System card</a>
          </div>
          <div class="stacks-quotes"><section>Favorite Quotes</section></div>
        </div>
      </div>`;
    const card = desktopDeclarations(
      document.querySelector("[data-placard-surface]")!,
    );
    const quotes = desktopDeclarations(
      document.querySelector(".stacks-quotes")!,
    );
    expect(card.animation).toBe("none");
    expect(quotes.animation).toBe(card.animation);
    for (const property of ["opacity", "translate", "transition"])
      expect(quotes[property], property).toBe(card[property]);
    if (phase !== "complete") {
      expect(quotes.opacity).toContain("var(--room-entry-content-opacity)");
    } else {
      expect(quotes.opacity).toBeUndefined();
    }
  },
);

it("fades desktop controls without making the blur's ancestor translucent", () => {
  document.body.innerHTML = `
    <div class="stacks-world-shell" data-illustrated-entry data-room-entrance="items">
      <nav class="stacks-unit-rail-desktop"><div class="stacks-hud-drift"></div></nav>
      <div class="stacks-wordmark"></div>
    </div>`;
  const shell = document.querySelector(".stacks-world-shell")!;
  const rail = document.querySelector("nav")!;
  const controls = rail.firstElementChild!;
  const search = document.querySelector(".stacks-wordmark")!;
  for (const phase of ["shelf", "items", "placing", "complete"]) {
    shell.setAttribute("data-room-entrance", phase);
    expect(desktopDeclarations(rail).opacity).toBeUndefined();
    expect(desktopDeclarations(controls).opacity).toBe(
      desktopDeclarations(search).opacity,
    );
    expect(desktopDeclarations(controls).transition).toBe(
      desktopDeclarations(search).transition,
    );
  }
  shell.setAttribute("data-room-entrance", "placing");
  const timing = desktopDeclarations(shell);
  const delay = parseFloat(timing["--room-entry-nav-delay"]!);
  const slide = parseFloat(timing["--room-entry-nav-slide-ms"]!);
  // Solve the name's easing at 75% travel, rather than 75% elapsed time.
  const t = 1 - Math.cbrt(0.25);
  const elapsed =
    3 * (1 - t) ** 2 * t * 0.22 + 3 * (1 - t) * t ** 2 * 0.36 + t ** 3;
  expect(delay / ILLUSTRATED_ENTRANCE.nameMs).toBeCloseTo(elapsed, 2);
  expect(delay + slide).toBeLessThanOrEqual(ILLUSTRATED_ENTRANCE.nameMs);
  const opacityTransition =
    desktopDeclarations(controls).transition!.split(",")[0]!;
  expect(opacityTransition).toContain("var(--room-entry-nav-delay)");
  const fade = Number(/opacity (\d+)ms/.exec(opacityTransition)![1]);
  expect(delay + fade).toBeLessThanOrEqual(ILLUSTRATED_ENTRANCE.nameMs);
});

it("keeps the navigation tint mounted through the room dissolve", () => {
  const material = postcss.parse(
    readFileSync(
      "src/app/components/stacks/illustration/roomBootShell.css",
      "utf8",
    ),
  );
  document.body.innerHTML = `
    <div class="stacks-world-shell" data-illustrated-entry data-room-entrance="placing">
      <nav class="stacks-unit-rail-desktop"></nav>
    </div>`;
  const rail = document.querySelector("nav")!;
  const html = document.documentElement;
  const previous = html.getAttribute("data-room-view");
  try {
    for (const view of ["illustrated", "dissolve", "travel", "live"]) {
      html.setAttribute("data-room-view", view);
      const tint: Record<string, string> = {};
      material.walkRules((rule) => {
        if (rule.parent?.type === "atrule") return;
        const matches = rule.selectors.some(
          (selector) =>
            selector.endsWith("::before") &&
            rail.matches(selector.slice(0, -8).replace(/\s+/g, " ")),
        );
        if (matches)
          rule.walkDecls((declaration) => {
            tint[declaration.prop] = declaration.value;
          });
      });
      expect(tint.content).toBe('""');
      expect(tint.transition).toContain("var(--room-entry-nav-delay, 0ms)");
      expect(tint.opacity).toBe(
        view === "illustrated"
          ? "calc(0.8 * var(--room-entry-nav-opacity, 1))"
          : "0",
      );
    }
  } finally {
    if (previous === null) html.removeAttribute("data-room-view");
    else html.setAttribute("data-room-view", previous);
  }
});

import { JSDOM } from "jsdom";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import tailwindcss, { type Config } from "tailwindcss";
import { describe, expect, it, vi } from "vitest";

import UnitRail from "./UnitRail";

const loadConfig = createRequire(import.meta.url)("tailwindcss/loadConfig") as (
  path: string,
) => Config;
const tailwindConfig = loadConfig(
  fileURLToPath(new URL("../../../../../tailwind.config.ts", import.meta.url)),
);

vi.mock("../input/RoomNavigation", () => ({
  useRoomNavigation: () => () => true,
}));

describe("rail pill visibility", () => {
  it.each(["desktop", "mobile"])(
    "renders the %s pill with both dimensions before animation",
    (layout) => {
      const document = new JSDOM(renderToStaticMarkup(<UnitRail />)).window
        .document;
      const marker = document.querySelector<HTMLElement>(
        `[data-stacks-rail-indicator="${layout}"]`,
      )!;
      expect(parseFloat(marker.style.width)).toBeGreaterThan(0);
      expect(parseFloat(marker.style.height)).toBeGreaterThan(0);
    },
  );

  it.each(["desktop", "mobile"])(
    "generates a background color for the %s pill",
    async (layout) => {
      const document = new JSDOM(renderToStaticMarkup(<UnitRail />)).window
        .document;
      const marker = document.querySelector<HTMLElement>(
        `[data-stacks-rail-indicator="${layout}"]`,
      )!;
      const result = await postcss([
        tailwindcss({
          ...tailwindConfig,
          content: [{ raw: marker.outerHTML, extension: "html" }],
        }),
      ]).process("@tailwind utilities;", { from: undefined });
      const backgrounds: string[] = [];
      result.root.walkDecls("background-color", (declaration) => {
        backgrounds.push(declaration.value);
      });
      expect(backgrounds.some((value) => value.includes("--foreground"))).toBe(
        true,
      );
    },
  );
});

// @vitest-environment jsdom
import { UNITS, initialScenePositionFromLocation } from "../data";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

import { roomFirstPaintSelectionScript } from "./RoomFirstPaintSelection";

it("selects the same stop as navigation before React for paths, hashes, aliases and unknown hashes", () => {
  for (const pathname of [
    "/",
    "/about",
    "/projects",
    "/musings/",
    "/talks",
    "/golf",
  ])
    for (const hash of [
      "",
      "#missing",
      "#__proto__",
      "#constructor",
      "#golf",
      ...UNITS.flatMap((unit) =>
        [unit.slug, unit.urlSlug, ...(unit.urlAliases ?? [])]
          .filter(Boolean)
          .map((slug) => `#${slug}`),
      ),
    ]) {
      const firstPaintDocument = {
        documentElement: document.createElement("html"),
      };
      runInNewContext(roomFirstPaintSelectionScript(0), {
        document: firstPaintDocument,
        location: { pathname, hash },
        setTimeout: () => 0,
      });
      expect(
        Number(firstPaintDocument.documentElement.dataset.roomFirstUnit),
        `${pathname}${hash}`,
      ).toBe(initialScenePositionFromLocation(pathname, hash));
    }
});

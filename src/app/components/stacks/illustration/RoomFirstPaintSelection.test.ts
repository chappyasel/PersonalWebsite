// @vitest-environment jsdom
import { UNITS, initialScenePositionFromLocation } from "../data";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

import { roomFirstPaintSelectionScript } from "./RoomFirstPaintSelection";
import { startLoadingNotice } from "./startLoadingNotice";

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

it("reveals the notice after one second without restarting at hydration", () => {
  vi.useFakeTimers();
  const root = document.documentElement;
  root.removeAttribute("data-room-loading-started");
  root.removeAttribute("data-room-loading-visible");
  try {
    runInNewContext(roomFirstPaintSelectionScript(6), {
      document,
      location: { pathname: "/talks", hash: "" },
      setTimeout,
    });
    vi.advanceTimersByTime(700);
    startLoadingNotice(); // Hydration adopts the parsing-time clock.
    vi.advanceTimersByTime(299);
    expect(root.hasAttribute("data-room-loading-visible")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(root.hasAttribute("data-room-loading-visible")).toBe(true);
    startLoadingNotice();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    root.removeAttribute("data-room-loading-started");
    root.removeAttribute("data-room-loading-visible");
    root.removeAttribute("data-room-first-unit");
    vi.useRealTimers();
  }
});

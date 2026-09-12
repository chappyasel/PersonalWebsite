import { describe, expect, it } from "vitest";

import { SITE_PAGES } from "~/lib/site/pages";
import { ROOM_SECTION_PATHNAMES, isRoomPathname } from "~/lib/site/roomRoutes";

import {
  GOLF_FOCUS_END,
  GOLF_FOCUS_START,
  GOLF_STOP_POSITION,
  GOLF_UNIT_INDEX,
  UNITS,
  defaultScenePositionForPathname,
  golfFocusedForScenePosition,
  initialScenePositionFromLocation,
  sceneHash,
  sceneUrl,
  unitIndexFromHash,
  unitUrl,
} from "./data";

describe("homepage 3D traverse order", () => {
  const orderedSlugs = [
    "about",
    "books",
    "training",
    "systems",
    "projects",
    "blog",
    "talks",
  ] as const;

  it("keeps the canonical seven-unit traverse", () => {
    expect(UNITS.map((unit) => unit.slug)).toEqual(orderedSlugs);
  });

  it("resolves every canonical slug hash to its traverse index", () => {
    for (const [index, slug] of orderedSlugs.entries()) {
      expect(unitIndexFromHash(`#${slug}`)).toBe(index);
      expect(unitIndexFromHash(slug)).toBe(index);
    }
    expect(unitIndexFromHash("#unknown")).toBeNull();
  });

  it("uses human-facing public hashes while retaining legacy aliases", () => {
    expect(unitIndexFromHash("#golf")).toBeNull();
    expect(unitIndexFromHash("#weightlifting")).toBe(2);
    expect(unitIndexFromHash("#training")).toBe(2);
    expect(unitIndexFromHash("#musings")).toBe(5);
    expect(unitIndexFromHash("#blog")).toBe(5);
    expect(unitUrl(2)).toBe("/#weightlifting");
    expect(unitUrl(5)).toBe("/musings");
  });

  it("shortens Talks only in the unit rail", () => {
    const talks = UNITS.find((unit) => unit.slug === "talks");

    expect(talks?.railLabel).toBe("Talks");
    expect(talks?.label).toBe("Featured Talks");
  });

  it("uses a distinct hidden stop between Books and Weightlifting", () => {
    expect(GOLF_UNIT_INDEX).toBe(2);
    expect(GOLF_STOP_POSITION).toBeGreaterThan(1);
    expect(GOLF_STOP_POSITION).toBeLessThan(2);
    expect(GOLF_FOCUS_START).toBeGreaterThan(1.35);
    expect(GOLF_FOCUS_START).toBeLessThan(GOLF_STOP_POSITION);
    expect(GOLF_FOCUS_END).toBeGreaterThan(GOLF_STOP_POSITION);
    expect(GOLF_FOCUS_END).toBeLessThan(2);
    // Golf lets go sooner on the Weightlifting side than it arrives on the
    // Books side: it must not reach into the Weightlifting section.
    expect(GOLF_FOCUS_END - GOLF_STOP_POSITION).toBeLessThan(
      GOLF_STOP_POSITION - GOLF_FOCUS_START,
    );
    expect(GOLF_FOCUS_END - GOLF_STOP_POSITION).toBeGreaterThan(0.05);
    expect(initialScenePositionFromLocation("/golf", "")).toBe(
      GOLF_STOP_POSITION,
    );
    expect(initialScenePositionFromLocation("/golf/", "")).toBe(
      GOLF_STOP_POSITION,
    );
    expect(initialScenePositionFromLocation("/golf", "#systems")).toBe(3);
    expect(initialScenePositionFromLocation("/", "#golf")).toBe(
      GOLF_STOP_POSITION,
    );
    expect(initialScenePositionFromLocation("/", "")).toBe(0);
    expect(initialScenePositionFromLocation("/", "#training")).toBe(2);
    expect(golfFocusedForScenePosition(GOLF_STOP_POSITION)).toBe(true);
    expect(golfFocusedForScenePosition(GOLF_FOCUS_START - 0.01)).toBe(false);
    expect(golfFocusedForScenePosition(GOLF_FOCUS_END + 0.01)).toBe(false);
    expect(golfFocusedForScenePosition(2)).toBe(false);
  });

  it("gives every stop one URL, whatever path the visitor arrived on", () => {
    // Shelves that own a path are that path.
    expect(unitUrl(4)).toBe("/projects");
    expect(unitUrl(5)).toBe("/musings");
    expect(unitUrl(6)).toBe("/talks");
    // About's stop is the homepage; the pages' shelves hang a hash off it.
    expect(unitUrl(0)).toBe("/");
    expect(unitUrl(1)).toBe("/#books");
    expect(unitUrl(2)).toBe("/#weightlifting");
    expect(unitUrl(3)).toBe("/#systems");
    // Owner modes ride along.
    expect(unitUrl(2, "?quality=2")).toBe("/?quality=2#weightlifting");
    expect(unitUrl(4, "?debug=1")).toBe("/projects?debug=1");
    // The golf window owns its own path.
    expect(sceneUrl(2, true)).toBe("/golf");
    expect(sceneUrl(1, true, "?debug=1")).toBe("/golf?debug=1");
    expect(sceneUrl(4, false)).toBe("/projects");
    // A return that must land on `/` gets the alias hash.
    expect(sceneHash(0, false)).toBe("");
    expect(sceneHash(4, false)).toBe("#projects");
    expect(sceneHash(1, true)).toBe("#golf");
  });

  it("opens a shelf's own path on that shelf and still reads every alias", () => {
    expect(defaultScenePositionForPathname("/projects")).toBe(4);
    expect(defaultScenePositionForPathname("/musings/")).toBe(5);
    expect(defaultScenePositionForPathname("/talks")).toBe(6);
    expect(defaultScenePositionForPathname("/about")).toBe(0);
    expect(defaultScenePositionForPathname("/golf")).toBe(GOLF_STOP_POSITION);
    expect(defaultScenePositionForPathname("/")).toBe(0);
    // An explicit hash outranks the path.
    expect(initialScenePositionFromLocation("/projects", "#books")).toBe(1);
    expect(initialScenePositionFromLocation("/talks", "#golf")).toBe(
      GOLF_STOP_POSITION,
    );
    // Every path in the table names a shelf, and none is a real page.
    const pagePaths = Object.values(SITE_PAGES).map((page) => page.path);
    for (const [slug, pathname] of Object.entries(ROOM_SECTION_PATHNAMES)) {
      expect(unitIndexFromHash(`#${slug}`)).not.toBeNull();
      expect(pagePaths).not.toContain(pathname);
      expect(isRoomPathname(pathname)).toBe(true);
    }
    for (const pathname of ["/", "/golf", "/golf/"])
      expect(isRoomPathname(pathname)).toBe(true);
    for (const pathname of [...pagePaths, "/liarsdice", "/weight-log", "/dad"])
      expect(isRoomPathname(pathname)).toBe(false);
  });
});

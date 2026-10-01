import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { searchParamsParsers as booksParsers } from "~/app/books/lib/searchParams";

import { UNIVERSAL_SEARCH_PARAM } from "./UniversalSearchController";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("universal search shell wiring", () => {
  it("keeps the controller mounted and enabled", () => {
    const layout = source("src/app/layout.tsx");

    expect(layout).toContain(
      'import { UniversalSearchController } from "~/components/universal-search/UniversalSearchController"',
    );
    expect(layout).toContain("<UniversalSearchController />");
  });

  // The controller adds and deletes this key on every open and close. When
  // the Books filter also lived at `?search`, typing in its box opened the
  // palette and closing the palette wiped the filter.
  it("keeps the palette's URL flag out of the Books shelf's own query state", () => {
    expect(Object.keys(booksParsers)).not.toContain(UNIVERSAL_SEARCH_PARAM);
    expect(source("src/app/books/components/BookSearch.tsx")).toContain(
      'useQueryState("q")',
    );
  });

  it("keeps the palette behind a dynamic import", () => {
    const controller = source(
      "src/components/universal-search/UniversalSearchController.tsx",
    );

    expect(controller).toContain('import("./UniversalSearchPalette")');
    expect(controller).not.toMatch(/from ["']\.\/UniversalSearchPalette["']/);
  });

  it("traces private Dad markdown into the server search function only", () => {
    const nextConfig = source("next.config.js");

    expect(nextConfig).toContain(
      '"/api/search": ["./content/dad-search-index.json"]',
    );
  });

  it("gives the semantic homepage fallback real deep-link targets", () => {
    const roomDocument = source(
      "src/app/components/stacks/illustration/RoomDocument.tsx",
    );
    const bridges = source(
      "src/app/components/stacks/input/RoomNavigation.tsx",
    );

    expect(roomDocument).toContain("id={section.urlSlug ?? section.slug}");
    expect(bridges).toContain(
      'window.addEventListener("hashchange", onHashChange)',
    );
  });

  it.each([
    "src/app/books/components/Modal.tsx",
    "src/app/books/[bookId]/BookPage.tsx",
    // The workout preview (and every other intercepted route) closes and
    // traps focus through the shared sheet chrome now.
    "src/components/modal-sheet/ModalSheet.tsx",
  ])("makes %s yield while universal search owns focus", (path) => {
    const contents = source(path);

    expect(contents).toContain("isUniversalSearchOpen");
    expect(contents).toMatch(
      /if \([^{};]*isUniversalSearchOpen\(\)[^{};]*\)\s*return;/,
    );
  });
});

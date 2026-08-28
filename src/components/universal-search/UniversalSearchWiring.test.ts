import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("universal search shell wiring", () => {
  it("keeps the controller mounted but explicitly disabled", () => {
    const layout = source("src/app/layout.tsx");

    expect(layout).toContain(
      'import { UniversalSearchController } from "~/components/universal-search/UniversalSearchController"',
    );
    expect(layout).toContain("<UniversalSearchController enabled={false} />");
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
    const flatHome = source("src/app/components/stacks/FlatHome.tsx");
    const bridges = source("src/app/components/stacks/input/ScrollBridges.tsx");

    expect(flatHome).toContain("id={unit.urlSlug ?? section}");
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
    expect(contents).toMatch(/if \(isUniversalSearchOpen\(\)\) return;/);
  });
});

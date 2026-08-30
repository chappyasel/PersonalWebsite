import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const modal = read("./modal/StacksBookModal.tsx");
const placard = read("./dom/PlacardLayer.tsx");
const canvas = read("./StacksCanvas.tsx");
const primitives = read("./scene/primitives.tsx");
const grabbable = read("./scene/Grabbable.tsx");

describe("Stacks book prefetch", () => {
  it("warms the same detail query used by the Books site", () => {
    expect(modal).toContain("subscribeBookPrefetch");
    expect(modal).toContain("utils.books.getById.prefetch({ bookId })");
  });

  it("warms sidebar books on hover, focus, and click", () => {
    expect(placard).toContain(
      "onMouseEnter={() => requestBookPrefetch(book.id)}",
    );
    expect(placard).toContain("onFocus={() => requestBookPrefetch(book.id)}");
    expect(placard).toContain("requestBookPrefetch(book.id);");
  });

  it("warms 3D books on hover and before click activation", () => {
    expect(grabbable).toContain("onHoverIntent?.();");
    expect(primitives).toContain("onHoverIntent={prefetchOwnNotes}");
    expect(canvas).toContain("requestBookPrefetch(id);");
  });
});

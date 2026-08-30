import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync(
  new URL("./Modal.tsx", import.meta.url),
  "utf8",
);
const detailSource = readFileSync(
  new URL("./BookDetailContent.tsx", import.meta.url),
  "utf8",
);
const contextSource = readFileSync(
  new URL("../contexts/BookPreviewContext.tsx", import.meta.url),
  "utf8",
);

describe("book modal presentation", () => {
  it("uses the full padded viewport height while a book resolves", () => {
    expect(modalSource).toContain("const fullHeight = !book || book.hasNotes;");
    expect(modalSource).toContain('fullHeight ? "h-full" : ""');
    expect(modalSource).not.toContain("max-h-[max(85dvh,1000px)]");
  });

  it("uses detail-shaped skeletons instead of loading spinners", () => {
    expect(modalSource).toContain("<BookDetailLoadingSkeleton />");
    expect(modalSource).not.toContain("Loading book details...");
    expect(detailSource).toContain("<BookNotesLoadingSkeleton />");
    expect(detailSource).not.toContain("Loading book details...");
  });

  it("never renders stale preview data for an ID-only launch", () => {
    expect(contextSource).toMatch(
      /openModalById[\s\S]*?setSelectedBookState\(null\)[\s\S]*?setSelectedBookId\(bookId\)/,
    );
    expect(modalSource).toContain(
      "selectedBook?.id === bookId ? selectedBook : fetchedBook",
    );
    expect(modalSource).toContain(
      "const fetchedBook = fullBook?.id === bookId ? fullBook : undefined;",
    );
    expect(modalSource).toContain("fullBook={fetchedBook}");
  });
});

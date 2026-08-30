import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const placard = readFileSync(
  new URL("./PlacardLayer.tsx", import.meta.url),
  "utf8",
);

describe("sidebar book preview", () => {
  it("opens the cover in the existing Stacks book modal", () => {
    expect(placard).toContain("aria-label={`Preview notes for ${book.title}");
    expect(placard).toContain(
      "recordModalOrigin(event.currentTarget.getBoundingClientRect())",
    );
    expect(placard).toContain("useStacks.getState().setPendingBookId(book.id)");
  });

  it("keeps the title and metadata as the full-page notes link", () => {
    expect(placard).toContain("href={bookNotesHref(book.id)}");
    expect(placard).toContain(
      "aria-label={`Read notes for ${book.title} by ${book.author}`}",
    );
  });
});

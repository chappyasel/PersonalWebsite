import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync(
  new URL("./Modal.tsx", import.meta.url),
  "utf8",
);

describe("book modal presentation", () => {
  it("uses the full padded viewport height for books with notes", () => {
    expect(modalSource).toContain('book?.hasNotes ? "h-full" : ""');
    expect(modalSource).not.toContain("max-h-[max(85dvh,1000px)]");
  });
});

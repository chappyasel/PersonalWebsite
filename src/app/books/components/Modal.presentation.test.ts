import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modal = readFileSync(new URL("./Modal.tsx", import.meta.url), "utf8");

describe("book modal presentation", () => {
  it("does not replay Framer fades after an origin-owned exit", () => {
    expect(modal).toContain("const [originExitRunning, setOriginExitRunning]");
    expect(modal).toContain(
      "const originOwnsExit = fromStacks && originExitRunning",
    );
    expect(modal).toContain("reduceMotion || originOwnsExit ? 0");
    expect(modal).toContain(
      "originOwnsExit\n                    ? { opacity: 0, scale: 1, y: 0 }",
    );
  });

  it("rewrites the modal's own history entry into the narrowed shelf on a tag press", () => {
    const handler = modal.slice(
      modal.indexOf("const handleTagSelect = ("),
      modal.indexOf("};", modal.indexOf("const handleTagSelect = (")),
    );
    expect(handler).toContain("if (fromStacks) return;");
    expect(handler).toContain("if (isClosingRef.current) return;");
    expect(handler).toContain("isClosingRef.current = true;");
    expect(handler).toContain(
      'window.history.replaceState(null, "", tagHref(tag));',
    );
    expect(handler).toContain("closeModal();");
    expect(handler).not.toContain("history.back()");
    expect(modal).toContain("onTagSelect={handleTagSelect}");
    expect(modal).toContain(
      "`${presentation.booksHref}/?${getBooksTagQuery(tag)}`",
    );
  });
});

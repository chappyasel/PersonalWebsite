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
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./BookPage.tsx", import.meta.url), "utf8");

describe("standalone book page presentation", () => {
  it("uses document scrolling so mobile browser chrome does not clip it", () => {
    expect(source).toContain(
      'className="-m-6 min-h-[100dvh] bg-background md:-m-8"',
    );
    expect(source).not.toContain('className="fixed');
    expect(source).not.toContain("overflow-hidden");
  });
});

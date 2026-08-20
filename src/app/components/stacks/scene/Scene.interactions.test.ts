import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./Scene.tsx", import.meta.url), "utf8");

describe("shared room interactions", () => {
  it("gives the fixed About–Books monstera Touch Focus from either unit", () => {
    expect(source).toContain(
      'import TouchFocusTarget from "./TouchFocusTarget"',
    );
    expect(source).toContain('id="focus:monstera:about-books"');
    expect(source).toContain("activeUnitIndexes={MONSTERA_ACTIVE_UNITS}");
    expect(source).toContain("const MONSTERA_ACTIVE_UNITS = [0, 1] as const");
  });
});

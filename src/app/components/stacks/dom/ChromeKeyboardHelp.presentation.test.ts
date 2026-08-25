import fs from "node:fs";
import { describe, expect, it } from "vitest";

const layerSource = fs.readFileSync(
  new URL("./ChromeLayer.tsx", import.meta.url),
  "utf8",
);
const capabilitySource = fs.readFileSync(
  new URL("../input/useCoarseTouchCapability.ts", import.meta.url),
  "utf8",
);

describe("keyboard help input policy", () => {
  it("removes the help sheet and affordances on tap-first screens", () => {
    expect(capabilitySource).toContain("(hover: none) and (pointer: coarse)");
    expect(layerSource).toContain(
      "const tapFirst = useCoarseTouchCapability();",
    );
    expect(layerSource).toContain("{!tapFirst && (");
    expect(layerSource).toContain(
      "<ChromeKeyboard open={keyboardOpen} onOpenChange={setKeyboardOpen} />",
    );
    expect(layerSource).toContain("tapFirst={tapFirst}");
  });
});

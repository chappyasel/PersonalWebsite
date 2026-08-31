import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./PlacardLayer.tsx", import.meta.url),
  "utf8",
);

describe("mobile sheet artifact transition", () => {
  it("animates the sheet away for artifact previews", () => {
    expect(source).toContain("if (modalOpen && !artifactPreviewOpen)");
    expect(source).toContain("const fade = animate(sheetOpacity, 0");
    expect(source).toContain("const travel = animate(y, restRef.current");
  });
});

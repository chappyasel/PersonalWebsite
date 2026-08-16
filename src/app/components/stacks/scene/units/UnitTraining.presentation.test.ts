import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./UnitTraining.tsx", import.meta.url),
  "utf8",
);

describe("Training shelf prop destinations", () => {
  it("keeps the protein powder grabbable without opening Weightlifting", () => {
    const start = source.indexOf('hoverKey="grab:protein"');
    const end = source.indexOf("</Grabbable>", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(source.slice(start, end)).not.toContain('to="weightlifting"');
  });
});

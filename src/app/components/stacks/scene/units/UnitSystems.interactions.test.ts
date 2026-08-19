import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./UnitSystems.tsx", import.meta.url),
  "utf8",
);

describe("Systems shelf movable props", () => {
  it("mounts the routine checklist through a draggable carrier", () => {
    const start = source.indexOf("<RoutineBoard");
    const carrier = source.slice(Math.max(0, start - 500), start + 200);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(carrier).toContain("<Grabbable");
    expect(carrier).toContain('hoverKey="link:routineboard"');
  });
});

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

  it("makes each board photo independently grabbable without waking the rest", () => {
    const start = source.indexOf("function TrainingBoard");
    const end = source.indexOf("export default function UnitTraining", start);
    const board = source.slice(start, end);

    expect(board).toContain("TRAINING_PINS.map");
    expect(board).toContain("<Grabbable");
    expect(board).toContain("physicsDetachOffset={[0, 0, 0.08]}");
    expect(board).not.toContain("physicsAfterPull");
    expect(board).not.toContain("collisionMode");
    expect(board).not.toContain("fallbackRest");
    expect(board).toContain("grab-surface:");
    expect(board).toContain("raycast={() => null}");
    expect(board).toContain("physicsIgnore: true");
    expect(board).not.toContain("<PhotoMount");
  });
});

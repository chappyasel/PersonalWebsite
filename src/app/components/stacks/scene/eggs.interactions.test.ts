import fs from "node:fs";
import { describe, expect, it } from "vitest";

const eggsSource = fs.readFileSync(
  new URL("./eggs.tsx", import.meta.url),
  "utf8",
);
const environmentSource = fs.readFileSync(
  new URL("./SceneEnvironment.tsx", import.meta.url),
  "utf8",
);

describe("edge-visible egg interactions", () => {
  it("does not reject desktop hover or activation by rounded active unit", () => {
    const start = eggsSource.indexOf("function EggTrigger");
    const end = eggsSource.indexOf("export function SpinProp", start);
    const trigger = eggsSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(trigger).not.toContain("ownsActiveUnit");
    expect(trigger).not.toContain("active === unitIndex");
  });

  it("does not reject a nearest-hit touch egg by rounded active unit", () => {
    const start = environmentSource.indexOf(
      "runSceneInteractionActivation(tappedEgg)",
    );
    const dispatcher = environmentSource.slice(start, start + 500);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(dispatcher).not.toContain("interaction.activeUnits.includes");
  });
});

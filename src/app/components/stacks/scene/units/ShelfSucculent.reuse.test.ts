import { MUSINGS_TOP_PLANT } from "../musingsShelfGeometry";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const readUnit = (name: string) =>
  fs.readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8");

describe("shared shelf succulent", () => {
  it("keeps About and Musings on the same rendered treatment", () => {
    expect(readUnit("UnitAbout")).toContain("<ShelfSucculent");
    expect(readUnit("UnitBlog")).toContain("<ShelfSucculent");
  });

  it("uses the approved About succulent asset and pose", () => {
    const source = readUnit("ShelfSucculent");

    expect(source).toContain('url="/models/succulent-pot.glb"');
    expect(source).toContain('variant="recolor"');
    expect(source).toContain(
      "rotation={[...ABOUT_MODEL_POSES.succulent.rotation]}",
    );
    expect(source).toContain(
      "scale={ABOUT_BOOT_LANDMARKS.succulent.sceneScale}",
    );
  });

  it("keeps the Musings bowl on the top plank, in front of the lamp's foot", () => {
    const source = readUnit("UnitBlog");

    expect(source).toContain("base={[...MUSINGS_TOP_PLANT.base]}");
    expect(MUSINGS_TOP_PLANT.base[0] - 0.27 / 2).toBeGreaterThan(
      -SHELF_GEOMETRY.width / 2,
    );
    // In front of the lamp root (x −1.12, z −0.07), not under its head.
    expect(MUSINGS_TOP_PLANT.base[2]).toBeGreaterThan(0.15);
    expect(MUSINGS_TOP_PLANT.base[2] + 0.27 / 2).toBeLessThan(
      SHELF_GEOMETRY.top.depth / 2,
    );
  });
});

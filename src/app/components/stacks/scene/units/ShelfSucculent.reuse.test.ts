import { MUSINGS_LOWER_LAYOUT } from "../musingsShelfGeometry";
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
    expect(source).toContain("rotation={[0, -0.4, 0]}");
    expect(source).toContain(
      "scale={ABOUT_BOOT_LANDMARKS.succulent.sceneScale}",
    );
  });

  it("keeps the Musings bowl inside the left end of the lower plank", () => {
    const source = readUnit("UnitBlog");

    expect(source).toContain("base={[MUSINGS_LOWER_LAYOUT.plantX, 0, -0.06]}");
    expect(MUSINGS_LOWER_LAYOUT.plantX - 0.27 / 2).toBeGreaterThan(
      -SHELF_GEOMETRY.width / 2,
    );
  });
});

import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { PROJECT_PHOTO_DIMENSIONS } from "./unitShelfLayout";

const source = fs.readFileSync(
  new URL("./UnitProjects.tsx", import.meta.url),
  "utf8",
);

describe("Projects shelf movable props", () => {
  it("replaces the framed project row with the agreed physical composition", () => {
    const order = [
      "topLampX",
      "topWeightliftingIconX",
      "<DicePyramid",
      "topHomeworkIconX",
      "topApplePhotoX",
      "topPlantX",
    ].map((token) => source.indexOf(token));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(source).not.toContain("<FrameRow");
    expect(source).toContain("<EggLamp");
    expect(source).toContain("projects-weightlifting-icon.webp");
    expect(source).toContain("projects-homework-icon.webp");
    expect(source).toContain('artifact="homework-app"');
    expect(source).toContain('hoverKey="grab:plant:projects-small"');
    expect(source).toContain('url="/models/potted-plant.glb"');
    expect(source).toContain('hoverKey="grab:notebook:projects"');
    expect(source).toContain('url="/models/notebook.glb"');
  });

  it("moves Apple upstairs and puts Facebook in its lower-shelf place", () => {
    const lower = source.indexOf('id="projects-facebook-v8"');
    const upper = source.indexOf('id="projects-wwdc-v8"');
    const topArtifacts = source.indexOf("topLampX");

    expect(lower).toBeGreaterThanOrEqual(0);
    expect(upper).toBeGreaterThan(topArtifacts);
    expect(lower).toBeLessThan(topArtifacts);
    expect(source).toContain('src="/images/stacks/v8/projects-facebook.webp"');
  });

  it("sizes the Facebook frame to the other lower-shelf photograph", () => {
    expect(source).toContain("const PROJECT_COUCH_W = 0.372");
    expect(source).toContain("PROJECT_PHOTO_DIMENSIONS.facebook.width");
    expect(PROJECT_PHOTO_DIMENSIONS.facebook.width).toBe(0.36);
  });

  it("mounts the compact Mac through a weighted draggable carrier", () => {
    const start = source.indexOf('hoverKey="link:projects:mac"');
    const carrier = source.slice(Math.max(0, start - 250), start + 250);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(carrier).toContain("<Grabbable");
    expect(carrier).toContain("massKg={7.5}");
  });
});

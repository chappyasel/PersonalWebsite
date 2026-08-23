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
    expect(source).toContain('hoverKey="grab:plant:projects-small"');
    expect(source).toContain('url="/models/potted-plant.glb"');
    // The notebook moved to the Systems shelf on 2026-08-23; the pixel-art
    // switches took the gap it left between the phone and the Mac.
    expect(source).not.toContain('hoverKey="grab:notebook:projects"');
    expect(source).not.toContain('url="/models/notebook.glb"');
  });

  it("stands the two pixel-art switches between the phone and the Mac", () => {
    const phone = source.indexOf('hoverKey="grab:phone:projects"');
    const arduino = source.indexOf('hoverKey="egg:pixel:arduino"');
    const card = source.indexOf('hoverKey="egg:pixel:card"');
    const mac = source.indexOf('hoverKey="link:projects:mac"');

    expect(phone).toBeGreaterThanOrEqual(0);
    expect(arduino).toBeGreaterThan(phone);
    expect(card).toBeGreaterThan(arduino);
    expect(mac).toBeGreaterThan(card);
    expect(source).toContain('url="/models/arduino.glb"');
    expect(source).toContain('url="/models/circuit-board.glb"');
    expect(source).toContain('look="levels"');
    expect(source).toContain('look="palette"');
    // Each is an action with a describing label, not a bare egg.
    expect(source).toContain("actionLabel={");
    expect(source).toContain('"8-bit mode"');
    expect(source).toContain('"16-bit mode"');
    expect(source).toContain('"Photo mode"');
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

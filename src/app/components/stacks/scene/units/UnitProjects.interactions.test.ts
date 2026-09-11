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
      "topAppleMarkX",
      "topPlantX",
    ].map((token) => source.indexOf(token));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(source).not.toContain("<FrameRow");
    expect(source).toContain("<EggLamp");
    expect(source).toContain("projects-weightlifting-icon.webp");
    expect(source).toContain("projects-homework-icon.webp");
    // The icon flies to the camera like the Mac and the globe (PropApproach)
    // instead of opening the retired second-canvas 3D inspector.
    expect(source).toContain('hoverKey="action:projects:homework"');
    expect(source).toContain("approach={homeworkApproach}");
    // The Weightlifting tile comes up the same way; its App Store link moved
    // from the tap into the caption under the near tile.
    expect(source).toContain('hoverKey="action:projects:weightlifting"');
    expect(source).toContain("approach={weightliftingApproach}");
    expect(source).not.toContain(
      'href="https://apps.apple.com/us/app/id1266077653"',
    );
    expect(source).not.toContain("MODEL_ARTIFACT_PREVIEWS_ENABLED");
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
    const mac = source.indexOf('hoverKey="action:projects:mac"');

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

  it("keeps the phone's screen for whoever picks it up", () => {
    // Face down at rest; a carry turns the glass (the model's −z) to the
    // camera, and the glass carries the Weightlifting App.
    const start = source.indexOf('hoverKey="grab:phone:projects"');
    const mount = source.slice(start, start + 1600);
    expect(mount).toContain("<HeldFacing");
    expect(mount).toContain("rest={[-Math.PI / 2, 0, 0.28]}");
    expect(mount).toContain("facingRotation={[0, Math.PI, 0]}");
    expect(mount).toContain('<PhoneScreen hoverKey="grab:phone:projects" />');
  });

  it("moves Apple upstairs and puts Facebook in its lower-shelf place", () => {
    const lower = source.indexOf('id="projects-facebook-v8"');
    const upper = source.indexOf('id="projects-wwdc-v8"');
    const topArtifacts = source.indexOf("topLampX");

    expect(lower).toBeGreaterThanOrEqual(0);
    expect(upper).toBeGreaterThan(topArtifacts);
    expect(lower).toBeLessThan(topArtifacts);
    expect(source).toContain('src="/images/stacks/v8/projects-facebook.webp"');
    expect(source).toContain('hoverKey="shimmer:apple"');
    expect(source.indexOf('id="projects-wwdc-v8"')).toBeLessThan(
      source.indexOf('hoverKey="shimmer:apple"'),
    );
    // The mark comes up to the camera on a tap; apple.com is the button
    // under it rather than the tap's destination.
    expect(source).toContain("usePropApproachNear(appleApproach)");
    expect(source).toContain("controller={appleApproach}");
    expect(source).not.toContain('href="https://www.apple.com/"');
  });

  it("sizes the Facebook frame to the other lower-shelf photograph", () => {
    expect(source).toContain("const PROJECT_COUCH_W = 0.372");
    expect(source).toContain("PROJECT_PHOTO_DIMENSIONS.facebook.width");
    expect(PROJECT_PHOTO_DIMENSIONS.facebook.width).toBe(0.36);
  });

  it("mounts the compact Mac through a weighted draggable carrier", () => {
    const start = source.indexOf('hoverKey="action:projects:mac"');
    const carrier = source.slice(Math.max(0, start - 250), start + 250);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(carrier).toContain("<Grabbable");
    expect(carrier).toContain("massKg={7.5}");
  });

  it("brings the Mac to the camera on a tap instead of leaving the room", () => {
    // The GitHub portal moved to the placard; the Mac's tap is the approach,
    // and it fires on the first touch so a phone does not dolly first.
    expect(source).not.toContain('href="https://github.com/chappyasel"');
    const start = source.indexOf('hoverKey="action:projects:mac"');
    const carrier = source.slice(start, start + 1800);
    expect(carrier).toContain("onTap={() => macApproach.approach()}");
    // A press anywhere puts it back, so only the way up is labelled.
    expect(carrier).toContain('actionLabel="Closer look"');
    expect(carrier).toContain("activateOnFirstTouch");
    expect(carrier).toContain("onDragIntent={() => macApproach.dismiss()}");
    // Projection caches a prop's box in its carrier's frame; this prop's
    // children fly away from the carrier, so it must opt out.
    expect(carrier).toContain("liveBounds");
    // A heavy box does not nod at the pointer.
    expect(carrier).toContain("tiltOnHover={false}");
    expect(carrier).toContain("<MacApproach");
    // The screen is one canvas for both distances: nearest up close,
    // mipmapped from the shelf.
    expect(source).toContain(
      "texture.minFilter = THREE.LinearMipmapLinearFilter",
    );
    expect(source).toContain("texture.magFilter = THREE.NearestFilter");
  });
});

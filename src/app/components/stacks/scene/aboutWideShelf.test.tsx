// @vitest-environment jsdom
import { BootScreenArtwork } from "../dom/BootScreen";
import { renderToStaticMarkup } from "react-dom/server";
import { PerspectiveCamera, Vector3 } from "three";
import { expect, it } from "vitest";

import {
  aboutBootRestCamera,
  projectAboutBootPoint,
} from "./aboutBootPerspective";
import { aboutBootShelfSupportProjection } from "./aboutBootSupportProjection";
import { SHELF_GEOMETRY, SHELF_PLANKS } from "./shelfGeometry";
import {
  RAIL_SHELF_MARGIN_PX,
  cameraForAspect,
  desktopDockLeftPx,
} from "./worldLayout";

it.each([
  [2048, 844],
  [2560, 1080],
  [3440, 1440],
])("centers About between desktop chrome at %i x %i", (width, height) => {
  const railRight = 190;
  const pose = aboutBootRestCamera(width, height, railRight);
  const camera = new PerspectiveCamera(
    cameraForAspect(width / height).fov,
    width / height,
    0.1,
    200,
  );
  camera.position.fromArray(pose.eye);
  camera.lookAt(new Vector3().fromArray(pose.aim));
  camera.updateMatrixWorld();
  const pixels = SHELF_PLANKS.flatMap((plank) =>
    [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) =>
        [-1, 1].map((z) => {
          const point = new Vector3(
            (x * plank.width) / 2,
            plank.centerY + (y * plank.thickness) / 2,
            plank.centerZ + (z * plank.depth) / 2,
          );
          point
            .applyAxisAngle(new Vector3(0, 1, 0), pose.unitYaw)
            .project(camera);
          return ((point.x + 1) * width) / 2;
        }),
      ),
    ),
  );
  const left = Math.min(...pixels),
    right = Math.max(...pixels);
  expect(left).toBeGreaterThanOrEqual(railRight + RAIL_SHELF_MARGIN_PX);
  expect(right).toBeLessThan(desktopDockLeftPx(width));
  // Framing centers the shelf's reference plane. Its turned front edge is
  // naturally asymmetric, so test the plane center separately from clearance.
  const origin = new Vector3().project(camera);
  expect(
    Math.abs(
      ((origin.x + 1) * width) / 2 -
        (railRight + RAIL_SHELF_MARGIN_PX + desktopDockLeftPx(width)) / 2,
    ),
  ).toBeLessThan(3);
});

it.each([-3, 3])("closes only the visible plank ends from eye x=%i", (x) => {
  const camera = {
    eye: [x, 0.25, 5.8],
    aim: [x, -0.08, -0.2],
    unitYaw: 0.1,
  } as const;
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <BootScreenArtwork shelfOnly camera={camera} />,
  );
  const exposed = x < 0 ? "left" : "right";
  const hidden = x < 0 ? "right" : "left";
  expect(
    root.querySelectorAll(
      `[data-boot-plank-side="${exposed}"][visibility="visible"]`,
    ),
  ).toHaveLength(2);
  expect(
    root.querySelectorAll(
      `[data-boot-plank-side="${hidden}"][visibility="hidden"]`,
    ),
  ).toHaveLength(2);
  for (const side of [-1, 1]) {
    const upright = root.querySelector(
      `[data-boot-support-upright="${side}"]`,
    )!;
    expect(upright.tagName.toLowerCase()).toBe("g");
    expect(
      upright.querySelectorAll('polygon[visibility="visible"]'),
    ).toHaveLength(3);
    // A rectangle loses the slant between the top and bottom of each face.
    const points = upright
      .querySelector('[data-boot-box-face="front"]')!
      .getAttribute("points")!
      .split(" ")
      .map((p) => p.split(",").map(Number));
    expect(points[0]![0]).not.toBe(points[3]![0]);
  }
});

it.each([-3, 0, 3])(
  "seats each post on its foot without painting over the joint at eye x=%i",
  (x) => {
    const camera = {
      eye: [x, 0.25, 5.8],
      aim: [x, -0.08, -0.2],
      unitYaw: 0.1,
    } as const;
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <BootScreenArtwork shelfOnly camera={camera} />,
    );
    for (const side of [-1, 1] as const) {
      const support = root.querySelector(`[data-boot-support="${side}"]`)!;
      // The foot's rear/top surfaces are behind the post at the join.
      expect(
        support.firstElementChild?.hasAttribute("data-boot-support-foot"),
      ).toBe(true);
      const post = aboutBootShelfSupportProjection(side, camera).upright;
      const centerX =
        side * (SHELF_GEOMETRY.width / 2 - SHELF_GEOMETRY.strapInsetX);
      for (const [index, dx] of [
        [2, 1],
        [3, -1],
      ] as const) {
        const join = projectAboutBootPoint(
          [
            centerX + (dx * SHELF_GEOMETRY.support.width) / 2,
            SHELF_GEOMETRY.groundY + SHELF_GEOMETRY.support.footHeight,
            SHELF_GEOMETRY.strapZ + SHELF_GEOMETRY.support.width / 2,
          ],
          camera,
        );
        expect(post.faces.front.points[index]).toEqual([join.x, join.y]);
      }
    }
  },
);

// @vitest-environment jsdom
import { ABOUT_BOOT_PAINT_COMPOSITION } from "../scene/aboutBootComposition";
import {
  ABOUT_BOOT_CAMERA,
  type AboutBootCamera,
  aboutBootRestCamera,
} from "../scene/aboutBootPerspective";
import { SHELF_PLANKS, SHELF_SURFACE } from "../scene/shelfGeometry";
import { renderToStaticMarkup } from "react-dom/server";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { BootScreenArtwork } from "./BootScreen";

const books = [
  { id: "thin", coverSrc: "/covers/thin.webp", thickness: 0.04 },
  { id: "thick", coverSrc: "/covers/thick.webp", thickness: 0.085 },
];

function markup(camera?: AboutBootCamera) {
  return renderToStaticMarkup(
    <BootScreenArtwork camera={camera} readingBooks={books} />,
  );
}

/** Three's view transform provides an independent reference for SVG plane units. */
function referenceProjector(pose: AboutBootCamera) {
  const camera = new PerspectiveCamera();
  camera.position.fromArray(pose.eye);
  camera.lookAt(...pose.aim);
  camera.updateMatrixWorld(true);
  const origin = new Vector3().applyMatrix4(camera.matrixWorldInverse);
  return (point: readonly [number, number, number]) => {
    const view = new Vector3(...point)
      .applyAxisAngle(new Vector3(0, 1, 0), pose.unitYaw)
      .applyMatrix4(camera.matrixWorldInverse);
    const scale = origin.z / view.z;
    return {
      x: (view.x * scale - origin.x) * 100,
      y: -(view.y * scale - origin.y) * 100,
      scale,
    };
  };
}

describe("About artwork viewport camera", () => {
  it("keeps the canonical default markup identical to an explicit canonical camera", () => {
    expect(markup()).toBe(markup(ABOUT_BOOT_CAMERA));
  });

  it.each([
    [1366, 768],
    [1920, 1080],
    [390, 844],
    [820, 1180],
  ])("projects shelf corners and anchors for %i×%i", (width, height) => {
    const camera = aboutBootRestCamera(width, height);
    const project = referenceProjector(camera);
    const document = new DOMParser().parseFromString(
      markup(camera),
      "text/html",
    );
    for (const plank of SHELF_PLANKS) {
      const points = document
        .querySelector(`[data-boot-plank-top][data-shelf-id="${plank.id}"]`)!
        .getAttribute("points")!
        .split(" ")
        .map((pair) => pair.split(",").map(Number));
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      for (const [index, [x, z]] of corners.entries()) {
        const expected = project([
          (x! * plank.width) / 2,
          plank.centerY + plank.thickness / 2,
          plank.centerZ + (z! * plank.depth) / 2,
        ]);
        expect(points[index]![0]).toBeCloseTo(expected.x, 2);
        expect(points[index]![1]).toBeCloseTo(expected.y, 2);
      }
    }
    for (const { landmark } of ABOUT_BOOT_PAINT_COMPOSITION) {
      const style = document
        .querySelector(`[data-landmark-id="${landmark.id}"]`)!
        .getAttribute("style")!;
      const placement =
        /translate\(calc\(([-\d.]+)px.*?\), ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(
          style,
        )!;
      const expected = project([
        landmark.x,
        SHELF_SURFACE[landmark.shelf],
        landmark.z,
      ]);
      expect(Number(placement[1])).toBeCloseTo(expected.x, 2);
      expect(Number(placement[2])).toBeCloseTo(expected.y, 2);
      expect(Number(placement[3])).toBeCloseTo(expected.scale, 4);
    }
  });

  it("preserves approved glyph paths and cover sources while reprojecting the reading fan", () => {
    const before = new DOMParser().parseFromString(markup(), "text/html");
    const after = new DOMParser().parseFromString(
      markup(aboutBootRestCamera(390, 844)),
      "text/html",
    );
    const paths = (document: Document) =>
      [...document.querySelectorAll("path")].map((node) => node.outerHTML);
    const covers = (document: Document) =>
      [...document.querySelectorAll("image")].map((node) =>
        node.getAttribute("href"),
      );
    expect(paths(after)).toEqual(paths(before));
    expect(covers(after)).toEqual(covers(before));
    for (let index = 0; index < books.length; index++) {
      for (const role of ["cover", "image", "page-core"]) {
        const selector = `[data-boot-reading-${role}="${index}"]`;
        expect(after.querySelector(selector)!.getAttribute("points")).not.toBe(
          before.querySelector(selector)!.getAttribute("points"),
        );
      }
    }
    for (const book of books) {
      const selector = `[data-reading-book="${book.id}"]`;
      expect(after.querySelector(selector)!.getAttribute("style")).toBe(
        before.querySelector(selector)!.getAttribute("style"),
      );
      const cover = `[data-boot-book-face="${book.id}"]`;
      expect(after.querySelector(cover)!.getAttribute("transform")).not.toBe(
        before.querySelector(cover)!.getAttribute("transform"),
      );
    }
  });
});

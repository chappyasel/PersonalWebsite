import {
  ABOUT_BOOT_STAGE_GEOMETRY,
  aboutBootStageForViewport,
} from "../boot/aboutBootStage";
import { UNIT_COUNT } from "../data";
import {
  mobileSheetCameraCoverage,
  mobileSheetPeekHeight,
} from "../dom/mobileSheetGeometry";
import {
  RAIL_RIGHT_PX_FALLBACK,
  STACKS_DESKTOP_MIN_WIDTH,
  cameraCompositionForViewport,
  cameraDepthOffsetsForViewport,
  scrollOffsetForUnit,
  unitPose,
  unitProgressForScrollOffset,
} from "../scene/worldLayout";
import { runInNewContext } from "node:vm";
import { PerspectiveCamera, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { getRoomArtwork } from "./artwork/getRoomArtwork";
import type { RoomArtworkMetadata, RoomArtworkTheme } from "./artwork/types";
import { artworkFrame } from "./artworkFrame";

const viewports = [
  [1440, 900],
  [1920, 1080],
  [390, 844],
  [375, 667],
] as const;
const themes: RoomArtworkTheme[] = ["light", "dark"];

/** Assemble the ordinary rest pose from CameraRig's helpers, independently of the inline solver. */
function ordinaryCamera(
  width: number,
  height: number,
  unit: number,
  rail: number,
) {
  const narrow = width < STACKS_DESKTOP_MIN_WIDTH;
  const position =
    unit === 0
      ? unitProgressForScrollOffset(scrollOffsetForUnit(0)) * (UNIT_COUNT - 1)
      : unit;
  const composition = cameraCompositionForViewport(
    width,
    height,
    position,
    narrow ? undefined : rail,
  );
  const depth = cameraDepthOffsetsForViewport(
    width,
    height,
    position,
    ABOUT_BOOT_STAGE_GEOMETRY.depthEnabled,
  );
  const x = unitPose(unit).position[0] + composition.lateralOffset;
  const y = composition.y + depth.eyeHeight;
  const distance = composition.z - composition.lookZ;
  const pitch =
    Math.atan2(composition.lookY - composition.y, distance) -
    depth.pitchRadians;
  const aim = new Vector3(x, y + Math.tan(pitch) * distance, composition.lookZ);
  const camera = new PerspectiveCamera(
    composition.fov,
    width / height,
    0.1,
    1000,
  );
  camera.position.set(x, y, composition.z);
  camera.lookAt(aim);
  const peek = mobileSheetPeekHeight(width, height);
  const imageShiftUp = narrow
    ? (height * mobileSheetCameraCoverage(peek, 0, peek, height)) / 2
    : 0;
  if (imageShiftUp)
    camera.setViewOffset(width, height, 0, imageShiftUp, width, height);
  camera.updateMatrixWorld(true);
  return { camera, aim, imageShiftUp };
}

function pixel(
  point: readonly number[],
  camera: PerspectiveCamera,
  width: number,
  height: number,
) {
  const projected = new Vector3().fromArray(point).project(camera);
  return new Vector2(
    ((projected.x + 1) * width) / 2,
    ((1 - projected.y) * height) / 2,
  );
}

function projectedPairs(
  source: RoomArtworkMetadata,
  camera: PerspectiveCamera,
  width: number,
  height: number,
) {
  const captured = new PerspectiveCamera();
  captured.matrixWorld.fromArray(source.camera.world);
  captured.matrixWorldInverse.copy(captured.matrixWorld).invert();
  captured.projectionMatrix.fromArray(source.camera.projection);
  return source.layoutPoints.map((point) => ({
    from: pixel(point, captured, source.raster[0]!, source.raster[1]!),
    to: pixel(point, camera, width, height),
  }));
}

function referenceFit(
  source: RoomArtworkMetadata,
  camera: PerspectiveCamera,
  width: number,
  height: number,
) {
  const pairs = projectedPairs(source, camera, width, height);
  const fromMean = pairs
    .reduce((sum, pair) => sum.add(pair.from), new Vector2())
    .divideScalar(pairs.length);
  const toMean = pairs
    .reduce((sum, pair) => sum.add(pair.to), new Vector2())
    .divideScalar(pairs.length);
  let covariance = 0;
  let variance = 0;
  for (const pair of pairs) {
    const from = pair.from.clone().sub(fromMean);
    covariance += from.dot(pair.to.clone().sub(toMean));
    variance += from.lengthSq();
  }
  const scale = covariance / variance;
  const translation = toMean.clone().addScaledVector(fromMean, -scale);
  return {
    x: translation.x + source.viewBox[0]! * scale,
    y: translation.y + source.viewBox[1]! * scale,
    width: source.viewBox[2]! * scale,
    height: source.viewBox[3]! * scale,
    residual: Math.max(
      ...pairs.map(({ from, to }) =>
        from.clone().multiplyScalar(scale).add(translation).distanceTo(to),
      ),
    ),
  };
}

describe("ordinary-camera artwork framing", () => {
  it.each([...viewports, [820, 1180], [844, 390]] as const)(
    "matches all seven ordinary rest cameras at %i×%i",
    (width, height) => {
      for (let unit = 0; unit < UNIT_COUNT; unit++) {
        for (const rail of [150, RAIL_RIGHT_PX_FALLBACK, 210]) {
          const stage = aboutBootStageForViewport(
            width,
            height,
            rail,
            ABOUT_BOOT_STAGE_GEOMETRY,
            unit,
          );
          const reference = ordinaryCamera(width, height, unit, rail);
          expect(stage.camera).toBeDefined();
          for (let axis = 0; axis < 3; axis++) {
            expect(stage.camera!.eye[axis]).toBeCloseTo(
              reference.camera.position.getComponent(axis),
              8,
            );
            expect(stage.camera!.aim[axis]).toBeCloseTo(
              reference.aim.getComponent(axis),
              8,
            );
          }
          expect(stage.camera!.fov).toBe(reference.camera.fov);
          expect(stage.camera!.imageShiftUp).toBeCloseTo(
            reference.imageShiftUp,
            8,
          );
          const origin = pixel(
            unitPose(unit).position,
            reference.camera,
            width,
            height,
          );
          expect(stage.originX).toBeCloseTo(origin.x, 7);
          expect(stage.originY).toBeCloseTo(origin.y, 7);
          const right = pixel(
            new Vector3(...unitPose(unit).position)
              .add(new Vector3(1, 0, 0))
              .toArray(),
            reference.camera,
            width,
            height,
          );
          expect(stage.unitPx).toBeCloseTo(right.x - origin.x, 7);
        }
      }
    },
  );

  it.each(viewports)(
    "fits both themes of all six captured shelves at %i×%i",
    (width, height) => {
      for (let unit = 1; unit < UNIT_COUNT; unit++) {
        const stage = aboutBootStageForViewport(
          width,
          height,
          RAIL_RIGHT_PX_FALLBACK,
          ABOUT_BOOT_STAGE_GEOMETRY,
          unit,
        );
        const { camera } = ordinaryCamera(
          width,
          height,
          unit,
          RAIL_RIGHT_PX_FALLBACK,
        );
        for (const theme of themes) {
          const source = getRoomArtwork(
            unit,
            theme,
            width < 600 ? "phone" : "desktop",
          )!;
          expect(source.layoutPoints.length).toBeGreaterThanOrEqual(7);
          const actual = artworkFrame(source, stage, width, height);
          const expected = referenceFit(source, camera, width, height);
          for (const key of ["x", "y", "width", "height", "residual"] as const)
            expect(actual[key]).toBeCloseTo(expected[key], 7);
          expect(actual.residual).toBeLessThan(3);
          expect(actual.width).toBeGreaterThan(0);
          expect(actual.height).toBeGreaterThan(0);
        }
      }
    },
  );

  it.each([
    [600, 900],
    [820, 1180],
    [1024, 1366],
  ])(
    "keeps both frozen variants outside the honest registration gate at %i×%i",
    (width, height) => {
      for (let unit = 1; unit < UNIT_COUNT; unit++) {
        const stage = aboutBootStageForViewport(
          width,
          height,
          RAIL_RIGHT_PX_FALLBACK,
          ABOUT_BOOT_STAGE_GEOMETRY,
          unit,
        );
        const { camera } = ordinaryCamera(
          width,
          height,
          unit,
          RAIL_RIGHT_PX_FALLBACK,
        );
        for (const theme of themes)
          for (const viewport of ["desktop", "phone"] as const) {
            const source = getRoomArtwork(unit, theme, viewport)!;
            const actual = artworkFrame(source, stage, width, height);
            expect(actual.residual).toBeGreaterThan(3);
            expect(actual.residual).toBeCloseTo(
              referenceFit(source, camera, width, height).residual,
              7,
            );
          }
      }
    },
  );

  it("places About at its ordinary projected origin and scale", () => {
    for (const [width, height] of viewports) {
      const stage = aboutBootStageForViewport(
        width,
        height,
        RAIL_RIGHT_PX_FALLBACK,
        ABOUT_BOOT_STAGE_GEOMETRY,
      );
      const frame = artworkFrame(null, stage, width, height);
      const { camera } = ordinaryCamera(
        width,
        height,
        0,
        RAIL_RIGHT_PX_FALLBACK,
      );
      const origin = pixel([0, 0, 0], camera, width, height);
      expect(frame.x + frame.width / 2).toBeCloseTo(origin.x, 7);
      expect(frame.y + (frame.height * 108) / 230).toBeCloseTo(origin.y, 7);
      expect(frame.width / frame.height).toBeCloseTo(300 / 230, 10);
    }
  });

  it("runs both serialized functions in an isolated prepaint scope", () => {
    const isolatedStage = runInNewContext(
      `(${aboutBootStageForViewport.toString()})`,
    ) as typeof aboutBootStageForViewport;
    const isolatedFrame = runInNewContext(
      `(${artworkFrame.toString()})`,
    ) as typeof artworkFrame;
    for (const [width, height] of viewports)
      for (let unit = 0; unit < UNIT_COUNT; unit++) {
        const source = getRoomArtwork(
          unit,
          "dark",
          width < 600 ? "phone" : "desktop",
        );
        const hydratedStage = aboutBootStageForViewport(
          width,
          height,
          RAIL_RIGHT_PX_FALLBACK,
          ABOUT_BOOT_STAGE_GEOMETRY,
          unit,
        );
        const prepaintStage = isolatedStage(
          width,
          height,
          RAIL_RIGHT_PX_FALLBACK,
          JSON.parse(
            JSON.stringify(ABOUT_BOOT_STAGE_GEOMETRY),
          ) as typeof ABOUT_BOOT_STAGE_GEOMETRY,
          unit,
        );
        expect(JSON.stringify(prepaintStage)).toBe(
          JSON.stringify(hydratedStage),
        );
        expect(
          JSON.stringify(isolatedFrame(source, prepaintStage, width, height)),
        ).toBe(
          JSON.stringify(artworkFrame(source, hydratedStage, width, height)),
        );
      }
  });
});

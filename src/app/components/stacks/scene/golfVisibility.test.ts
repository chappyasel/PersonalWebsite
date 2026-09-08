import { GOLF_FOCUS_END, GOLF_FOCUS_START, GOLF_STOP_POSITION } from "../data";
import { describe, expect, it } from "vitest";

import { GOLF_CUP_WORLD_CENTER } from "./golf/golfCourse";
import { GOLF_MODE_DEFAULT } from "./golfMode";
import {
  GOLF_GREEN_SIGHTLINE,
  type GolfViewPose,
  golfGreenCoverage,
  golfInGolfPose,
  golfModeCoverage,
  golfStopViewPose,
  golfVisibilityRelevantForScenePosition,
  normalisedGolfCoverage,
  projectedNdcX,
} from "./golfVisibility";
import {
  RAIL_RIGHT_PX_FALLBACK,
  cameraCompositionForViewport,
  cameraXForScrollOffset,
  golfDollyForViewport,
  scrollOffsetForUnit,
} from "./worldLayout";

/** The rig's pre-golf pose at a scroll position: the viewport's composition,
 * the stop's dolly inside the stop window, and an optional sidestep of the
 * eye alone, which is what the pointer's orbit does. */
function poseAt(
  position: number,
  options: Readonly<{
    width?: number;
    height?: number;
    eyeStep?: number;
  }> = {},
): GolfViewPose {
  const width = options.width ?? 1440;
  const height = options.height ?? 900;
  const composition = cameraCompositionForViewport(
    width,
    height,
    position,
    RAIL_RIGHT_PX_FALLBACK,
  );
  const eyeX =
    cameraXForScrollOffset(scrollOffsetForUnit(position)) +
    composition.lateralOffset;
  const inWindow = position >= GOLF_FOCUS_START && position <= GOLF_FOCUS_END;
  return {
    eye: [
      eyeX + (options.eyeStep ?? 0),
      composition.y,
      composition.z - (inWindow ? golfDollyForViewport(width, true) : 0),
    ],
    look: [eyeX, composition.lookY, composition.lookZ],
    fovDegrees: composition.fov,
    aspect: width / height,
  };
}

const desktopStop = golfStopViewPose(1440, 900, RAIL_RIGHT_PX_FALLBACK);
const desktopReference = golfGreenCoverage(desktopStop);
const desktopCoverage = (position: number, eyeStep = 0) =>
  normalisedGolfCoverage(
    golfGreenCoverage(poseAt(position, { eyeStep })),
    desktopReference,
  );
/** The mode's coverage for a position and a pointer run, the rig's way:
 * the same composition is both the pre-golf pose and the pivot's base. */
const modeCoverage = (position: number, run: number) => {
  const pose = poseAt(position);
  return golfModeCoverage({
    scenePosition: position,
    preGolf: pose,
    inGolfBase: pose,
    stop: desktopStop,
    stopCoverage: desktopReference,
    run,
  });
};

describe("projectedNdcX", () => {
  const ahead: GolfViewPose = {
    eye: [0, 0, 0],
    look: [0, 0, -1],
    fovDegrees: 90,
    aspect: 1,
  };

  it("maps straight ahead to the centre and the frame's edge to one", () => {
    expect(projectedNdcX(ahead, [0, 0, -5])).toBeCloseTo(0, 12);
    expect(projectedNdcX(ahead, [1, 0, -1])).toBeCloseTo(1, 12);
    expect(projectedNdcX(ahead, [-2, 0, -1])).toBeCloseTo(-2, 12);
    // A wider frame puts the same point nearer the centre.
    expect(projectedNdcX({ ...ahead, aspect: 2 }, [1, 0, -1])).toBeCloseTo(
      0.5,
      12,
    );
  });

  it("returns null for points at or behind the eye", () => {
    expect(projectedNdcX(ahead, [1, 0, 1])).toBeNull();
    expect(projectedNdcX(ahead, [0, 0, 0])).toBeNull();
  });

  it("follows a turned aim", () => {
    const turned: GolfViewPose = { ...ahead, look: [1, 0, -1] };
    expect(projectedNdcX(turned, [5, 0, -5])).toBeCloseTo(0, 12);
    expect(projectedNdcX(turned, [0, 0, -5])).toBeLessThan(0);
  });
});

describe("golf green coverage", () => {
  it("sees the green from the desktop golf stop, the flag near the centre", () => {
    const stop = golfStopViewPose(1440, 900, RAIL_RIGHT_PX_FALLBACK);
    for (const end of GOLF_GREEN_SIGHTLINE) {
      const x = projectedNdcX(stop, end);
      expect(x).not.toBeNull();
      expect(Math.abs(x!)).toBeLessThan(0.5);
    }
    const flag = projectedNdcX(stop, [
      GOLF_CUP_WORLD_CENTER.x,
      stop.eye[1] - 1,
      GOLF_CUP_WORLD_CENTER.z,
    ]);
    expect(Math.abs(flag!)).toBeLessThan(0.3);
    // The whole opening is clear of both shelves at the stop.
    expect(desktopReference).toBe(1);
  });

  it("is the Books shelf, not the frame, that hides the green at Books", () => {
    const books = poseAt(1);
    expect(golfGreenCoverage(books)).toBeLessThan(0.3);
    expect(golfGreenCoverage(books, { occluders: false })).toBeGreaterThan(
      0.95,
    );
  });

  it("is the Weightlifting shelf that hides it at Weightlifting", () => {
    expect(golfGreenCoverage(poseAt(2))).toBeLessThan(0.1);
    expect(golfGreenCoverage(poseAt(2), { occluders: false })).toBeGreaterThan(
      0.9,
    );
  });

  it("rises steadily from Books to the tee and falls beyond it", () => {
    let previous = 0;
    for (let position = 0.9; position <= 1.4; position += 0.05) {
      const coverage = golfGreenCoverage(poseAt(position));
      expect(coverage).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = coverage;
    }
    previous = 1;
    for (let position = 1.45; position <= 1.9; position += 0.05) {
      const coverage = golfGreenCoverage(poseAt(position));
      expect(coverage).toBeLessThanOrEqual(previous + 1e-9);
      previous = coverage;
    }
  });

  it("is zero when the green is behind the camera", () => {
    expect(
      golfGreenCoverage({
        eye: [GOLF_CUP_WORLD_CENTER.x, 0, GOLF_CUP_WORLD_CENTER.z - 30],
        look: [GOLF_CUP_WORLD_CENTER.x, 0, GOLF_CUP_WORLD_CENTER.z - 40],
        fovDegrees: 33,
        aspect: 1.6,
      }),
    ).toBe(0);
  });

  it("is on at the stop and off at both ends of the old scroll window", () => {
    // The rule replaces the window (data.ts) as the mode's source; the
    // window still keys the dolly and the URL. Golf is on at the stop, on
    // no later than the window used to open, and off before the window used
    // to close: the shelf is already over the green at 1.62.
    expect(desktopCoverage(GOLF_STOP_POSITION)).toBeGreaterThanOrEqual(
      GOLF_MODE_DEFAULT.enterAbove,
    );
    expect(desktopCoverage(GOLF_FOCUS_START)).toBeGreaterThanOrEqual(
      GOLF_MODE_DEFAULT.enterAbove,
    );
    expect(desktopCoverage(GOLF_FOCUS_END)).toBeLessThan(
      GOLF_MODE_DEFAULT.leaveBelow,
    );
    // And the whole of Books and Weightlifting are out.
    expect(desktopCoverage(1)).toBeLessThan(GOLF_MODE_DEFAULT.blendFrom);
    expect(desktopCoverage(2)).toBeLessThan(GOLF_MODE_DEFAULT.blendFrom);
  });

  it("lets the pointer's orbit bring the green in from the Books side", () => {
    // Between Books and the tee the green is emerging from behind the Books
    // shelf; where it is half out, a step of the eye toward it uncovers
    // more of it and a step away covers more. The orbit preset steps the
    // eye AWAY from the green for a rightward mouse (it orbits the aim), so
    // there the mouse at the right covers more, not less.
    let position = 1;
    while (position < 1.5 && desktopCoverage(position) < 0.5) position += 0.01;
    expect(desktopCoverage(position)).toBeGreaterThanOrEqual(0.5);
    expect(desktopCoverage(position)).toBeLessThan(1);
    expect(desktopCoverage(position, 0.3)).toBeGreaterThan(
      desktopCoverage(position),
    );
    expect(desktopCoverage(position, -0.3)).toBeLessThan(
      desktopCoverage(position),
    );
  });

  it("counts a phone's cropped stop as the whole green", () => {
    const reference = golfGreenCoverage(
      golfStopViewPose(390, 844, RAIL_RIGHT_PX_FALLBACK),
    );
    expect(reference).toBeGreaterThan(0.4);
    expect(reference).toBeLessThanOrEqual(1);
    const atStop = golfGreenCoverage(
      poseAt(GOLF_STOP_POSITION, { width: 390, height: 844 }),
    );
    expect(normalisedGolfCoverage(atStop, reference)).toBeGreaterThanOrEqual(
      GOLF_MODE_DEFAULT.enterAbove,
    );
    expect(
      normalisedGolfCoverage(
        golfGreenCoverage(poseAt(1, { width: 390, height: 844 })),
        reference,
      ),
    ).toBeLessThan(GOLF_MODE_DEFAULT.blendFrom);
  });

  it("normalises against the reference with a floor and a cap", () => {
    expect(normalisedGolfCoverage(0.8, 0.8)).toBe(1);
    expect(normalisedGolfCoverage(0.4, 0.8)).toBeCloseTo(0.5, 12);
    expect(normalisedGolfCoverage(0.9, 0.8)).toBe(1);
    expect(normalisedGolfCoverage(0.1, 0)).toBeCloseTo(0.4, 12);
  });
});

describe("golf mode coverage: the green in both worlds", () => {
  it("does not evaluate the projected green outside the Golf bay", () => {
    const width = 4112;
    const height = 2580;
    const about = poseAt(0, { width, height });
    const stop = golfStopViewPose(width, height, RAIL_RIGHT_PX_FALLBACK);
    const stopCoverage = golfGreenCoverage(stop);

    for (const run of [-1, -0.5, 0, 0.5, 1]) {
      expect(
        golfModeCoverage({
          scenePosition: 0,
          preGolf: about,
          inGolfBase: about,
          stop,
          stopCoverage,
          run,
        }),
      ).toBe(0);
    }

    expect(golfVisibilityRelevantForScenePosition(0)).toBe(false);
    expect(golfVisibilityRelevantForScenePosition(1)).toBe(true);
    expect(golfVisibilityRelevantForScenePosition(GOLF_STOP_POSITION)).toBe(
      true,
    );
    expect(golfVisibilityRelevantForScenePosition(2)).toBe(true);
    expect(golfVisibilityRelevantForScenePosition(3)).toBe(false);
  });

  it("keeps the cup's bearing and steps the eye with the run", () => {
    const base = poseAt(GOLF_STOP_POSITION);
    const bearing = (pose: GolfViewPose) =>
      projectedNdcX(pose, [
        GOLF_CUP_WORLD_CENTER.x,
        pose.eye[1],
        GOLF_CUP_WORLD_CENTER.z,
      ]);
    const right = golfInGolfPose(base, 1);
    expect(right.eye[0]).toBeGreaterThan(base.eye[0]);
    expect(bearing(right)).toBeCloseTo(bearing(base)!, 6);
    expect(golfInGolfPose(base, 0)).toMatchObject({
      eye: base.eye,
      look: base.look,
    });
  });

  it("is on at the stop whatever the pointer does", () => {
    for (const run of [-1, -0.5, 0, 0.5, 1])
      expect(modeCoverage(GOLF_STOP_POSITION, run)).toBeGreaterThanOrEqual(
        GOLF_MODE_DEFAULT.enterAbove,
      );
  });

  it("drops out at the window's far edge with the mouse to the right", () => {
    // The owner's screenshot: the pre-golf pose still sees the green there,
    // but golf's own pivot sweeps the Weightlifting shelf across it.
    expect(desktopCoverage(1.6)).toBeGreaterThanOrEqual(
      GOLF_MODE_DEFAULT.leaveBelow,
    );
    expect(modeCoverage(1.6, 1)).toBeLessThan(GOLF_MODE_DEFAULT.leaveBelow);
    expect(modeCoverage(1.6, 0)).toBeGreaterThanOrEqual(
      GOLF_MODE_DEFAULT.leaveBelow,
    );
  });

  it("lets the mouse to the right bring golf in from the Books side", () => {
    // The other screenshot: at the Books side the pivot for a rightward
    // pointer steps the eye toward the green, past the Books shelf; for a
    // leftward pointer it steps behind it.
    expect(modeCoverage(1.3, 1)).toBeGreaterThanOrEqual(
      GOLF_MODE_DEFAULT.enterAbove,
    );
    expect(modeCoverage(1.3, -1)).toBeLessThan(GOLF_MODE_DEFAULT.leaveBelow);
  });

  it("never exceeds either world's own coverage", () => {
    for (const position of [1.2, 1.3, 1.5, 1.6, 1.7])
      for (const run of [-1, 0, 1]) {
        const mode = modeCoverage(position, run);
        expect(mode).toBeLessThanOrEqual(desktopCoverage(position) + 1e-9);
        expect(mode).toBeGreaterThanOrEqual(0);
        expect(mode).toBeLessThanOrEqual(1);
      }
  });
});

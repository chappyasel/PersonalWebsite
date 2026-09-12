// The boot stage is a self-contained re-statement of the camera's About rest
// pose, because the pre-paint script cannot import the camera. This proves the
// re-statement against the live helpers over a viewport matrix, then proves the
// shipped script is that same function and writes what hydration writes.
import { UNIT_COUNT, initialScenePositionFromLocation } from "../data";
import {
  mobileSheetCameraCoverage,
  mobileSheetPeekHeight,
} from "../dom/mobileSheetGeometry";
import { ABOUT_BOOT_CAMERA } from "../scene/aboutBootPerspective";
import {
  RAIL_RIGHT_PX_FALLBACK,
  STACKS_DESKTOP_MIN_WIDTH,
  aboutStopShift,
  cameraCompositionForViewport,
  cameraDepthOffsetsForViewport,
  scrollOffsetForUnit,
  unitProgressForScrollOffset,
} from "../scene/worldLayout";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ABOUT_BOOT_STAGE_ATTRIBUTE,
  ABOUT_BOOT_STAGE_GEOMETRY,
  ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY,
  ABOUT_BOOT_STAGE_LOCATION_ROUTING,
  ABOUT_BOOT_STAGE_VARS,
  type AboutBootStage,
  aboutBootStageEnabledForLocation,
  aboutBootStageForViewport,
  aboutBootStageLayout,
  aboutBootStageScript,
  publishAboutBootStage,
  setAboutBootStagePhase,
} from "./aboutBootStage";

/** CameraRig's rest pose, assembled from the exported camera helpers exactly
 * the way the frame loop assembles it (no pointer, no idle bob, no zoom), then
 * a textbook lookAt projection of unit 0's origin. */
function referenceStage(vw: number, vh: number, railRightPx: number) {
  const shift =
    vw < STACKS_DESKTOP_MIN_WIDTH ? 0 : aboutStopShift(vw, vh, railRightPx);
  const offset = scrollOffsetForUnit(0, shift);
  const scenePosition = unitProgressForScrollOffset(offset) * (UNIT_COUNT - 1);
  // With the rail, as the rig passes it: the composition then carries the
  // lateral truck the desktop stops make beside the dock, lerped toward unit
  // 1 by the About shift's own blend.
  const composition = cameraCompositionForViewport(
    vw,
    vh,
    scenePosition,
    railRightPx,
  );
  const depth = cameraDepthOffsetsForViewport(
    vw,
    vh,
    scenePosition,
    ABOUT_BOOT_STAGE_GEOMETRY.depthEnabled,
  );

  const eyeY = composition.y + depth.eyeHeight;
  const horizontal = composition.z - composition.lookZ;
  const baselinePitch = Math.atan2(
    composition.lookY - composition.y,
    horizontal,
  );
  const lookY =
    eyeY + Math.tan(baselinePitch - depth.pitchRadians) * horizontal;

  const peek = mobileSheetPeekHeight(vw, vh);
  const coverage =
    vw < STACKS_DESKTOP_MIN_WIDTH
      ? mobileSheetCameraCoverage(peek, 0, peek, vh)
      : 0;
  const imageShiftUp = (vh * coverage) / 2;

  const eyeX = shift + composition.lateralOffset;
  const eye = [eyeX, eyeY, composition.z];
  const target = [eyeX, lookY, composition.lookZ];
  const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]!);
  const dot = (a: number[], b: number[]) =>
    a.reduce((sum, v, i) => sum + v * b[i]!, 0);
  const cross = (a: number[], b: number[]) => [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
  const normalize = (a: number[]) => {
    const length = Math.hypot(...a);
    return a.map((v) => v / length);
  };
  const zAxis = normalize(sub(eye, target));
  const xAxis = normalize(cross([0, 1, 0], zAxis));
  const yAxis = cross(zAxis, xAxis);
  const p = sub([0, 0, 0], eye);
  const distance = -dot(p, zAxis);
  const focal = vh / 2 / Math.tan((composition.fov * Math.PI) / 360);
  return {
    originX: vw / 2 + (dot(p, xAxis) / distance) * focal,
    originY: vh / 2 - (dot(p, yAxis) / distance) * focal - imageShiftUp,
    unitPx: focal / distance,
    eyeX,
  };
}

const VIEWPORTS: Array<[number, number]> = [
  [1200, 700],
  [1200, 1100],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1680, 1050],
  [1920, 1080],
  [2560, 1440],
  [3440, 1440],
  [1199, 800],
  [1024, 768],
  [1024, 1366],
  [820, 1180],
  [768, 1024],
  [744, 1133],
  [430, 932],
  [412, 915],
  [390, 844],
  [375, 667],
  [360, 780],
  [932, 430],
  [844, 390],
  [1000, 560],
];
const RAIL_WIDTHS = [0, 150, RAIL_RIGHT_PX_FALLBACK, 210, 260];

function expectStageClose(actual: AboutBootStage, expected: AboutBootStage) {
  expect(actual.originX).toBeCloseTo(expected.originX, 6);
  expect(actual.originY).toBeCloseTo(expected.originY, 6);
  expect(actual.unitPx).toBeCloseTo(expected.unitPx, 6);
  expect(actual.eyeX).toBeCloseTo(expected.eyeX, 6);
}

describe("aboutBootStageForViewport", () => {
  it("matches the camera helpers' About rest pose over the viewport matrix", () => {
    for (const [vw, vh] of VIEWPORTS) {
      for (const rail of RAIL_WIDTHS) {
        expectStageClose(
          aboutBootStageForViewport(vw, vh, rail, ABOUT_BOOT_STAGE_GEOMETRY),
          referenceStage(vw, vh, rail),
        );
      }
    }
  });

  it("lands on the shelf the live camera rendered at 1440×900", () => {
    // Measured from the running scene on 2026-09-07 with the rail at 179px
    // and the pointer at its rest: camera rest at x 0.7241 (the About shift
    // plus its share of the dock truck), z 5.7228; unit 0's origin projected
    // to (528, 433) through `__stacks.project`, and a scene unit spanned
    // 265px on the shelf's centre plane. Before the truck and the depth
    // default were mirrored here the stage sat 28px right and 4px low of it.
    const stage = aboutBootStageForViewport(
      1440,
      900,
      179,
      ABOUT_BOOT_STAGE_GEOMETRY,
    );
    expect(stage.originX).toBeGreaterThan(525);
    expect(stage.originX).toBeLessThan(531);
    expect(stage.originY).toBeGreaterThan(430);
    expect(stage.originY).toBeLessThan(437);
    expect(stage.unitPx).toBeGreaterThan(262);
    expect(stage.unitPx).toBeLessThan(268);
  });

  it("reports the eye it stands at, and the layout hands the drawables its shift from the canonical eye", () => {
    const canonical = aboutBootStageForViewport(
      1440,
      900,
      RAIL_RIGHT_PX_FALLBACK,
      ABOUT_BOOT_STAGE_GEOMETRY,
    );
    // The same eye the projector every drawable uses stands at.
    expect(canonical.eyeX).toBeCloseTo(ABOUT_BOOT_CAMERA.eye[0], 9);
    expect(ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY.canonicalEyeX).toBe(canonical.eyeX);
    expect(
      aboutBootStageLayout(
        1440,
        900,
        canonical,
        ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY,
      ).eyeShift,
    ).toBeCloseTo(0, 9);
    // Wider windows stand the eye farther right; the shift is in SVG units.
    const wide = aboutBootStageForViewport(
      2056,
      1290,
      179,
      ABOUT_BOOT_STAGE_GEOMETRY,
    );
    expect(wide.eyeX).toBeCloseTo(0.9526, 3);
    expect(
      aboutBootStageLayout(2056, 1290, wide, ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY)
        .eyeShift,
    ).toBeCloseTo((wide.eyeX - canonical.eyeX) * 100, 9);
    // No shift, and no eye at all, below the desktop seam.
    const narrow = aboutBootStageForViewport(
      390,
      844,
      0,
      ABOUT_BOOT_STAGE_GEOMETRY,
    );
    expect(narrow.eyeX).toBe(0);
  });

  it("keeps the shelf on the centre line below the desktop seam", () => {
    for (const rail of RAIL_WIDTHS) {
      expect(
        aboutBootStageForViewport(1199, 800, rail, ABOUT_BOOT_STAGE_GEOMETRY)
          .originX,
      ).toBeCloseTo(1199 / 2, 9);
    }
  });

  it("is self-contained: its own source runs with no module scope", () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const detach = new Function(
      `return (${aboutBootStageForViewport.toString()});`,
    ) as () => typeof aboutBootStageForViewport;
    const detached = detach();
    for (const [vw, vh] of VIEWPORTS) {
      expectStageClose(
        detached(vw, vh, RAIL_RIGHT_PX_FALLBACK, ABOUT_BOOT_STAGE_GEOMETRY),
        aboutBootStageForViewport(
          vw,
          vh,
          RAIL_RIGHT_PX_FALLBACK,
          ABOUT_BOOT_STAGE_GEOMETRY,
        ),
      );
    }
  });
});

function layoutFor(vw: number, vh: number, rail = RAIL_RIGHT_PX_FALLBACK) {
  return aboutBootStageLayout(
    vw,
    vh,
    aboutBootStageForViewport(vw, vh, rail, ABOUT_BOOT_STAGE_GEOMETRY),
    ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY,
  );
}

describe("aboutBootStageLayout", () => {
  const L = ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY;
  const bootComponent = readFileSync(
    new URL("../dom/BootScreen.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../../../../styles/globals.css", import.meta.url),
    "utf8",
  );

  it("describes the SVG viewBox and the centred fallback the CSS still ships", () => {
    const { viewBox } = L;
    expect(bootComponent).toContain(
      `viewBox="${Math.round(-viewBox.originX * 100)} ${Math.round(-viewBox.originY * 100)} ${Math.round(viewBox.width * 100)} ${Math.round(viewBox.height * 100)}"`,
    );
    expect(css).toContain(
      `width: min(${L.startWidthFraction * 100}vw, ${L.startMaxWidth}px);`,
    );
    expect(css).toContain(
      `font-size: clamp(${L.wordmarkFont.min}px, ${(L.wordmarkFont.perViewportWidth * 100).toFixed(3)}vw, ${L.wordmarkFont.max}px);`,
    );
    expect(css).toContain(`margin: ${L.wordmarkGap}px 0 0;`);
  });

  it("puts the placed box over the projected shelf", () => {
    for (const [vw, vh] of VIEWPORTS) {
      const stage = aboutBootStageForViewport(
        vw,
        vh,
        RAIL_RIGHT_PX_FALLBACK,
        ABOUT_BOOT_STAGE_GEOMETRY,
      );
      const layout = layoutFor(vw, vh);
      expect(layout.width).toBeCloseTo(3 * stage.unitPx, 9);
      expect(layout.left + 1.5 * stage.unitPx).toBeCloseTo(stage.originX, 9);
      expect(layout.top + 1.08 * stage.unitPx).toBeCloseTo(stage.originY, 9);
    }
  });

  it("opens on the centred box the bookcase has always used", () => {
    for (const [vw, vh] of VIEWPORTS) {
      const layout = layoutFor(vw, vh);
      const startWidth = Math.min(0.88 * vw, 560);
      const startLeft = layout.left + layout.shiftX;
      const startTop = layout.top + layout.shiftY;
      const wordmarkLine = Math.min(44.88, Math.max(28.56, 0.03162 * vw));
      const blockHeight = (startWidth * 230) / 300 + 28 + wordmarkLine;
      expect(layout.width * layout.shiftScale).toBeCloseTo(startWidth, 9);
      expect(startLeft).toBeCloseTo((vw - startWidth) / 2, 9);
      expect(startTop).toBeCloseTo((vh - blockHeight) / 2, 9);
      // The wordmark's start pose is 28px under the centred bookcase, centred.
      const placedWordmarkTop =
        layout.top + (layout.width * 230) / 300 + layout.wordmarkGap;
      const placedWordmarkCenter = layout.left + layout.width / 2;
      expect(placedWordmarkTop + layout.wordmarkShiftY).toBeCloseTo(
        startTop + (startWidth * 230) / 300 + 28,
        9,
      );
      expect(placedWordmarkCenter + layout.wordmarkShiftX).toBeCloseTo(
        vw / 2,
        9,
      );
    }
  });

  it("keeps the placed wordmark clear of the loading strip on short viewports", () => {
    for (const [vw, vh] of VIEWPORTS) {
      const layout = layoutFor(vw, vh);
      const wordmarkLine = Math.min(44.88, Math.max(28.56, 0.03162 * vw));
      const bottom =
        layout.top +
        (layout.width * 230) / 300 +
        layout.wordmarkGap +
        wordmarkLine;
      expect(layout.wordmarkGap).toBeGreaterThanOrEqual(8);
      expect(layout.wordmarkGap).toBeLessThanOrEqual(28);
      if (layout.wordmarkGap > 8)
        expect(bottom).toBeLessThanOrEqual(vh - 72 + 1e-6);
    }
    expect(layoutFor(1920, 1080).wordmarkGap).toBe(28);
    expect(layoutFor(1280, 720).wordmarkGap).toBeLessThan(28);
    expect(layoutFor(1280, 720).wordmarkGap).toBeGreaterThanOrEqual(8);
  });

  it("is self-contained: its own source runs with no module scope", () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const detach = new Function(
      `return (${aboutBootStageLayout.toString()});`,
    ) as () => typeof aboutBootStageLayout;
    const detached = detach();
    for (const [vw, vh] of VIEWPORTS) {
      const stage = aboutBootStageForViewport(
        vw,
        vh,
        RAIL_RIGHT_PX_FALLBACK,
        ABOUT_BOOT_STAGE_GEOMETRY,
      );
      expect(detached(vw, vh, stage, L)).toEqual(
        aboutBootStageLayout(vw, vh, stage, L),
      );
    }
  });
});

describe("aboutBootStageEnabledForLocation", () => {
  it("matches the camera's initial destination across public entry URLs", () => {
    const locations = [
      { pathname: "/", hash: "" },
      { pathname: "/", hash: "#about" },
      { pathname: "/", hash: "#book-example" },
      { pathname: "/", hash: "#books" },
      { pathname: "/", hash: "#weightlifting" },
      { pathname: "/", hash: "#training" },
      { pathname: "/", hash: "#golf" },
      { pathname: "/golf", hash: "" },
      { pathname: "/golf/", hash: "" },
      { pathname: "/golf", hash: "#about" },
      { pathname: "/golf", hash: "#systems" },
      { pathname: "/about", hash: "" },
      { pathname: "/projects", hash: "" },
      { pathname: "/musings/", hash: "" },
      { pathname: "/talks", hash: "#about" },
      { pathname: "/projects", hash: "#golf" },
    ];

    for (const location of locations) {
      expect(
        aboutBootStageEnabledForLocation(
          location.pathname,
          location.hash,
          ABOUT_BOOT_STAGE_LOCATION_ROUTING,
        ),
      ).toBe(
        initialScenePositionFromLocation(location.pathname, location.hash) ===
          0,
      );
    }
  });
});

describe("hydrated About boot stage", () => {
  afterEach(() => vi.unstubAllGlobals());

  function installLocation(pathname: string, hash: string) {
    const properties = new Map<string, string>();
    const attributes = new Map<string, string>();
    const location = { pathname, hash };
    const documentElement = {
      style: {
        setProperty: (name: string, value: string) =>
          properties.set(name, value),
        removeProperty: (name: string) => properties.delete(name),
      },
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string, value: string) =>
        attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
    };
    vi.stubGlobal("window", {
      innerWidth: 1440,
      innerHeight: 900,
      location,
    });
    vi.stubGlobal("document", { documentElement });
    return { attributes, location, properties };
  }

  it("publishes and advances the stage only when the world opens on About", () => {
    const about = installLocation("/", "");
    expect(publishAboutBootStage()).toBe(true);
    expect(about.attributes.get(ABOUT_BOOT_STAGE_ATTRIBUTE)).toBe("start");
    expect(about.properties.size).toBe(
      Object.keys(ABOUT_BOOT_STAGE_VARS).length,
    );
    expect(setAboutBootStagePhase("placed")).toBe(true);
    expect(about.attributes.get(ABOUT_BOOT_STAGE_ATTRIBUTE)).toBe("placed");

    about.location.hash = "#books";
    expect(publishAboutBootStage()).toBe(false);
    expect(setAboutBootStagePhase("placed")).toBe(false);
    expect(about.attributes.has(ABOUT_BOOT_STAGE_ATTRIBUTE)).toBe(false);
    expect(about.properties.size).toBe(0);
  });
});

describe("aboutBootStageScript", () => {
  function run(
    vw: number,
    vh: number,
    script = aboutBootStageScript(),
    location = { pathname: "/", hash: "" },
  ) {
    const properties = new Map<string, string>();
    const attributes = new Map<string, string>();
    const documentElement = {
      style: {
        setProperty: (name: string, value: string) =>
          properties.set(name, value),
        removeProperty: (name: string) => properties.delete(name),
      },
      setAttribute: (name: string, value: string) =>
        attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
    };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compiled = new Function("window", "document", script) as (
      ...args: unknown[]
    ) => void;
    compiled(
      { innerWidth: vw, innerHeight: vh, location },
      { documentElement },
    );
    return { properties, attributes };
  }

  it("writes the same variables hydration would, and opens in the start phase", () => {
    for (const [vw, vh] of VIEWPORTS) {
      const { properties, attributes } = run(vw, vh);
      const layout = layoutFor(vw, vh);
      const px = (value: number) => `${value.toFixed(2)}px`;
      expect(properties.get(ABOUT_BOOT_STAGE_VARS.left)).toBe(px(layout.left));
      expect(properties.get(ABOUT_BOOT_STAGE_VARS.top)).toBe(px(layout.top));
      expect(properties.get(ABOUT_BOOT_STAGE_VARS.width)).toBe(
        px(layout.width),
      );
      expect(properties.get(ABOUT_BOOT_STAGE_VARS.shiftX)).toBe(
        px(layout.shiftX),
      );
      expect(properties.get(ABOUT_BOOT_STAGE_VARS.shiftY)).toBe(
        px(layout.shiftY),
      );
      expect(properties.get(ABOUT_BOOT_STAGE_VARS.shiftScale)).toBe(
        layout.shiftScale.toFixed(4),
      );
      expect(properties.get(ABOUT_BOOT_STAGE_VARS.wordmarkGap)).toBe(
        px(layout.wordmarkGap),
      );
      expect(properties.get(ABOUT_BOOT_STAGE_VARS.wordmarkShiftX)).toBe(
        px(layout.wordmarkShiftX),
      );
      expect(properties.get(ABOUT_BOOT_STAGE_VARS.wordmarkShiftY)).toBe(
        px(layout.wordmarkShiftY),
      );
      expect(attributes.get(ABOUT_BOOT_STAGE_ATTRIBUTE)).toBe("start");
    }
  });

  it("fails closed to the centred stage when the window is unusable", () => {
    const properties = new Map<string, string>();
    const attributes = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compiled = new Function(
      "window",
      "document",
      aboutBootStageScript(),
    ) as (...args: unknown[]) => void;
    expect(() =>
      compiled(undefined, {
        documentElement: {
          style: {
            setProperty: (n: string, v: string) => properties.set(n, v),
          },
          setAttribute: (n: string, v: string) => attributes.set(n, v),
        },
      }),
    ).not.toThrow();
    expect(properties.size).toBe(0);
    expect(attributes.size).toBe(0);
  });

  it("leaves deep-linked shelves on the centred boot stage", () => {
    for (const location of [
      { pathname: "/", hash: "#books" },
      { pathname: "/", hash: "#golf" },
      { pathname: "/golf", hash: "" },
      { pathname: "/projects", hash: "" },
      { pathname: "/talks", hash: "" },
    ]) {
      const { properties, attributes } = run(
        1440,
        900,
        aboutBootStageScript(),
        location,
      );

      expect(properties.size).toBe(0);
      expect(attributes.has(ABOUT_BOOT_STAGE_ATTRIBUTE)).toBe(false);
    }
  });

  it("carries the geometry it was generated with", () => {
    const script = aboutBootStageScript({
      ...ABOUT_BOOT_STAGE_GEOMETRY,
      railShelfMarginPx: 200,
    });
    const { properties } = run(1440, 900, script);
    const shifted = aboutBootStageLayout(
      1440,
      900,
      aboutBootStageForViewport(1440, 900, RAIL_RIGHT_PX_FALLBACK, {
        ...ABOUT_BOOT_STAGE_GEOMETRY,
        railShelfMarginPx: 200,
      }),
      ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY,
    );
    expect(properties.get(ABOUT_BOOT_STAGE_VARS.left)).toBe(
      `${shifted.left.toFixed(2)}px`,
    );
    expect(shifted.left).not.toBeCloseTo(layoutFor(1440, 900).left, 0);
  });
});

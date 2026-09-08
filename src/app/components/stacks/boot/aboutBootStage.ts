// Where the About shelf will be on screen, worked out before the world exists.
//
// The boot screen draws unit 0 as a front elevation in a centred box capped at
// 560px. That is nowhere near where the camera puts the real shelf: the desktop
// rest pose slides the room right to clear the rail, and one scene unit spans
// a quarter of the viewport height rather than 187px. So the bookcase opens
// where it always has. When the URL opens the world on About, it then glides
// onto the live shelf at the origin and scale the camera will render. Only then
// may the handoff dissolve it. A deep link to another stop keeps the centred
// stage. This module resolves the About rest pose for a viewport, projects unit
// 0 to CSS pixels, and lays out both boxes.
//
// `aboutBootStageForViewport` and `aboutBootStageLayout` are deliberately
// self-contained — parameters and `Math` only, every scene constant handed in
// as an argument. The pre-paint inline script is their own source, so the
// first paint and the hydrated updates cannot drift; `aboutBootStage.test.ts`
// proves the projection against the live camera helpers over a viewport
// matrix and the layout against the boot CSS.
import { GOLF_PATHNAME, GOLF_STOP_POSITION, UNITS, UNIT_COUNT } from "../data";
import { SCENE_TO_BOOT_SVG } from "../dom/bootVignette";
import { MOBILE_SHEET_PEEK } from "../dom/mobileSheetGeometry";
import {
  cameraDepthDiagnosticsController,
  cameraDepthEffectEnabled,
} from "../scene/cameraDepthDiagnostics";
import { SHELF_GEOMETRY } from "../scene/shelfGeometry";
import {
  ABOUT_SHELF_LEFT,
  ABOUT_STOP_MAX_SHIFT,
  CAMERA,
  CAMERA_DEPTH_KNOTS,
  CAMERA_DEPTH_MAX_EYE_HEIGHT,
  CAMERA_DEPTH_MAX_PITCH_DEGREES,
  CAMERA_LOOK_Y,
  CAMERA_LOOK_Z_OFFSET,
  CAMERA_NARROW,
  CAMERA_PHONE,
  DESKTOP_DOCK_GEOMETRY,
  DOCK_SHELF_MARGIN_PX,
  PHONE_ASPECT,
  PORTRAIT_FOV,
  RAIL_RIGHT_PX_FALLBACK,
  RAIL_SHELF_MARGIN_PX,
  SHELF_OVERVIEW_MARGIN,
  SHELF_OVERVIEW_MAX_DISTANCE,
  SHELF_OVERVIEW_MIN_DISTANCE,
  STACKS_DESKTOP_MIN_WIDTH,
  STOP_LATERAL_MAX,
  TABLET_PORTRAIT_ASPECT,
  TRAVEL_LEAD_IN,
  UNIT_SPACING,
  unitPose,
} from "../scene/worldLayout";

export type AboutBootStage = {
  /** Screen x of unit 0's origin, CSS px from the viewport's left edge. */
  originX: number;
  /** Screen y of unit 0's origin, CSS px from the viewport's top edge. */
  originY: number;
  /** CSS px spanned by one scene unit on the shelf's centre plane. */
  unitPx: number;
  /** Where the eye stands, world x: the About shift plus its share of the
   * dock truck. The drawables are projected for the canonical desktop eye,
   * and `eyeShift` in the layout carries the difference to them. */
  eyeX: number;
};

/** CSS custom properties the stage is published through. The boot CSS reads
 * them from the document element; `data-boot-stage` carries the phase — "start"
 * while the bookcase stands in its centred opening box, "placed" once it has
 * glided onto the live shelf. Its absence keeps the centred fallback, either
 * because the URL opens elsewhere or because the script could not run. */
export const ABOUT_BOOT_STAGE_ATTRIBUTE = "data-boot-stage";
export const ABOUT_BOOT_STAGE_VARS = {
  left: "--stacks-boot-stage-left",
  top: "--stacks-boot-stage-top",
  width: "--stacks-boot-stage-width",
  shiftX: "--stacks-boot-stage-shift-x",
  shiftY: "--stacks-boot-stage-shift-y",
  shiftScale: "--stacks-boot-stage-shift-scale",
  wordmarkGap: "--stacks-boot-stage-wordmark-gap",
  wordmarkShiftX: "--stacks-boot-stage-wordmark-shift-x",
  wordmarkShiftY: "--stacks-boot-stage-wordmark-shift-y",
  eyeShift: "--stacks-boot-eye-shift",
} as const;

export type AboutBootStageLocationRouting = {
  aboutPosition: number;
  fallbackPosition: number;
  hashPositions: Record<string, number>;
  pathnamePositions: Record<string, number>;
};

/** The same public and legacy section slugs used by the camera's initial URL
 * resolver, serialized so the pre-paint script can make the decision before
 * React exists. Unknown hashes retain the pathname's default stop. */
export const ABOUT_BOOT_STAGE_LOCATION_ROUTING: AboutBootStageLocationRouting =
  {
    aboutPosition: 0,
    fallbackPosition: 0,
    hashPositions: Object.fromEntries([
      ...UNITS.flatMap((unit, index) =>
        [unit.slug, unit.urlSlug, ...(unit.urlAliases ?? [])]
          .filter((slug): slug is string => Boolean(slug))
          .map((slug) => [slug, index] as const),
      ),
      ["golf", GOLF_STOP_POSITION] as const,
    ]),
    pathnamePositions: { [GOLF_PATHNAME]: GOLF_STOP_POSITION },
  };

/** Whether the live world will open on the shelf drawn by the boot vignette.
 * SELF-CONTAINED BY CONTRACT: the generated pre-paint script ships this
 * function's source with the routing record above. */
export function aboutBootStageEnabledForLocation(
  pathname: string,
  hash: string,
  routing: AboutBootStageLocationRouting = ABOUT_BOOT_STAGE_LOCATION_ROUTING,
): boolean {
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const slug = hash.replace(/^#/, "");
  const hashPosition = Object.prototype.hasOwnProperty.call(
    routing.hashPositions,
    slug,
  )
    ? routing.hashPositions[slug]
    : undefined;
  const pathnamePosition = Object.prototype.hasOwnProperty.call(
    routing.pathnamePositions,
    normalizedPathname,
  )
    ? routing.pathnamePositions[normalizedPathname]
    : routing.fallbackPosition;
  return (hashPosition ?? pathnamePosition) === routing.aboutPosition;
}

type DepthKnot = {
  eyeHeight: number;
  pitchDegrees: number;
  arcPeak: { eyeHeight: number; pitchDegrees: number } | null;
};

export type AboutBootStageGeometry = {
  desktopMinWidth: number;
  phoneAspect: number;
  tabletPortraitAspect: number;
  shortLandscapeMaxHeight: number;
  camera: { z: number; y: number; fov: number };
  cameraNarrow: { z: number; y: number; fov: number };
  phoneFov: number;
  lookY: number;
  lookZOffset: number;
  unitOneZ: number;
  unitCount: number;
  unitSpacing: number;
  travelLeadIn: number;
  shelfLeft: { x: number; z: number };
  railShelfMarginPx: number;
  maxShift: number;
  /** The desktop reading dock's two clamps, for the lateral truck the
   * stops make to sit in the gap beside it (`desktopStopFraming`). */
  dock: {
    rem: number;
    widthMinRem: number;
    widthMaxRem: number;
    widthBaseRem: number;
    widthFraction: number;
    gutterMinRem: number;
    gutterMaxRem: number;
    gutterBaseRem: number;
    gutterFraction: number;
  };
  dockShelfMarginPx: number;
  stopLateralMax: number;
  /** Whether the camera depth offsets (raised eye, authored pitch) are on
   * for a visitor who has touched nothing. They are a console toggle. */
  depthEnabled: boolean;
  portraitFov: number;
  shelfWidth: number;
  overviewMargin: number;
  overviewMinDistance: number;
  overviewMaxDistance: number;
  depthKnots: [DepthKnot, DepthKnot];
  depthMaxEyeHeight: number;
  depthMaxPitchDegrees: number;
  peek: {
    shortLandscape: number;
    min: number;
    max: number;
    fraction: number;
  };
};

function depthKnot(position: number): DepthKnot {
  const knot = CAMERA_DEPTH_KNOTS.find((entry) => entry.position === position);
  if (!knot) throw new Error(`No camera depth knot at ${position}`);
  return {
    eyeHeight: knot.eyeHeight,
    pitchDegrees: knot.pitchDegrees,
    arcPeak: knot.arcPeak ? { ...knot.arcPeak } : null,
  };
}

/** Every scene constant the stage depends on, as one JSON-serializable record
 * so the pre-paint script can be handed the same numbers the camera uses. */
export const ABOUT_BOOT_STAGE_GEOMETRY: AboutBootStageGeometry = {
  desktopMinWidth: STACKS_DESKTOP_MIN_WIDTH,
  phoneAspect: PHONE_ASPECT,
  tabletPortraitAspect: TABLET_PORTRAIT_ASPECT,
  shortLandscapeMaxHeight: 600,
  camera: { ...CAMERA },
  cameraNarrow: { ...CAMERA_NARROW },
  phoneFov: CAMERA_PHONE.fov,
  lookY: CAMERA_LOOK_Y,
  lookZOffset: CAMERA_LOOK_Z_OFFSET,
  unitOneZ: unitPose(1).position[2],
  unitCount: UNIT_COUNT,
  unitSpacing: UNIT_SPACING,
  travelLeadIn: TRAVEL_LEAD_IN,
  shelfLeft: { ...ABOUT_SHELF_LEFT },
  railShelfMarginPx: RAIL_SHELF_MARGIN_PX,
  maxShift: ABOUT_STOP_MAX_SHIFT,
  dock: { ...DESKTOP_DOCK_GEOMETRY },
  dockShelfMarginPx: DOCK_SHELF_MARGIN_PX,
  stopLateralMax: STOP_LATERAL_MAX,
  // Read once at module load, which is before any console toggle: the
  // server's copy ships in the pre-paint script and the client's copy is
  // what hydration recomputes with, and both see the untouched default.
  depthEnabled: cameraDepthEffectEnabled(
    cameraDepthDiagnosticsController.getSnapshot().enabled,
    false,
    false,
  ),
  portraitFov: PORTRAIT_FOV,
  shelfWidth: SHELF_GEOMETRY.width,
  overviewMargin: SHELF_OVERVIEW_MARGIN,
  overviewMinDistance: SHELF_OVERVIEW_MIN_DISTANCE,
  overviewMaxDistance: SHELF_OVERVIEW_MAX_DISTANCE,
  depthKnots: [depthKnot(0), depthKnot(1)],
  depthMaxEyeHeight: CAMERA_DEPTH_MAX_EYE_HEIGHT,
  depthMaxPitchDegrees: CAMERA_DEPTH_MAX_PITCH_DEGREES,
  peek: { ...MOBILE_SHEET_PEEK },
};

/** The camera's About rest pose for a viewport, projected to the screen.
 *
 * Mirrors, in order: `cameraForAspect`, `aboutStopShift`, the scroll offset
 * the About stop rests at, `cameraCompositionForViewport` between units 0 and
 * 1 WITH the rail (so the desktop stops' lateral truck, lerped by the shift's
 * blend), `cameraDepthOffsetsForViewport` on the first knot span at the
 * shipped default, CameraRig's authored-pitch look target, the resident Peek
 * Sheet's frustum offset, and a `lookAt` projection of unit 0's origin. The
 * reference plane is the shelf's centre (unit-local z = 0): the planks' front
 * edges sit nearer the camera and the wall frames farther, so this is where
 * a flat elevation fits best.
 *
 * Two of those went missing once and cost 46 px and 7 px at 2056×1290: the
 * truck arrived after this function was written, and the depth offsets were
 * later put behind a console toggle that ships off. The reference test now
 * builds the composition with the rail and the depth at the default, so the
 * next such drift fails there rather than on the first live frame.
 *
 * SELF-CONTAINED BY CONTRACT: parameters and `Math` only. Its source text is
 * shipped as the pre-paint script, where no module scope exists. */
export function aboutBootStageForViewport(
  vw: number,
  vh: number,
  railRightPx: number,
  g: AboutBootStageGeometry,
): AboutBootStage {
  const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, value));
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const safeHeight = Math.max(1, vh);
  const aspect = vw / safeHeight;
  const narrow = vw < g.desktopMinWidth;
  const portrait = narrow && aspect <= g.tabletPortraitAspect;
  const shortLandscape = narrow && aspect > 1 && vh < g.shortLandscapeMaxHeight;

  // cameraForAspect.
  let cam = g.camera;
  if (aspect <= g.tabletPortraitAspect) {
    const blend = clamp(
      (aspect - g.phoneAspect) / (g.tabletPortraitAspect - g.phoneAspect),
      0,
      1,
    );
    cam = {
      z: g.cameraNarrow.z,
      y: g.cameraNarrow.y,
      fov:
        aspect <= g.phoneAspect
          ? g.phoneFov
          : g.phoneFov + (g.cameraNarrow.fov - g.phoneFov) * blend,
    };
  }

  // aboutStopShift, desktop only: the camera slides right until the shelf's
  // left edge clears the rail by the authored margin.
  let shift = 0;
  if (!narrow) {
    const tanH = Math.tan(radians(cam.fov / 2)) * aspect;
    const frac = (railRightPx + g.railShelfMarginPx) / vw;
    const camX =
      g.shelfLeft.x - (frac - 0.5) * (cam.z - g.shelfLeft.z) * 2 * tanH;
    shift = clamp(camX, 0, g.maxShift);
  }

  // The stop's scroll offset, read back as scene position between units 0
  // and 1. The shift drags the composition a little toward unit 1's depth.
  const travelX = (g.unitCount - 1) * g.unitSpacing;
  const travelRange = travelX + g.travelLeadIn;
  const offset = (shift + g.travelLeadIn) / travelRange;
  const travelled = clamp(
    (offset * travelRange - g.travelLeadIn) / travelX,
    0,
    1,
  );
  const scenePosition = travelled * (g.unitCount - 1);
  const blend = clamp(scenePosition, 0, 1);

  // desktopStopFraming's lateral truck: stops 1..6 slide the eye and the aim
  // together so the shelf sits in the gap between the rail and the dock.
  // About itself does not truck, but the composition is lerped toward unit
  // 1 by the shift's own blend, so the About rest carries that share of it.
  let lateral = 0;
  if (!narrow) {
    const tanH = Math.tan(radians(cam.fov / 2)) * aspect;
    const pxPerWorld = vw / (2 * tanH * cam.z);
    const halfShelfPx = (g.shelfWidth / 2) * pxPerWorld;
    const railEdge = railRightPx + g.railShelfMarginPx;
    const d = g.dock;
    const dockWidth = Math.min(
      d.widthMaxRem * d.rem,
      Math.max(d.widthMinRem * d.rem, d.widthFraction * vw + d.widthBaseRem * d.rem),
    );
    const dockGutter = Math.min(
      d.gutterMaxRem * d.rem,
      Math.max(
        d.gutterMinRem * d.rem,
        d.gutterBaseRem * d.rem + d.gutterFraction * vw,
      ),
    );
    const dockEdge = vw - dockWidth - dockGutter;
    const mid = (railEdge + dockEdge) / 2;
    const centrePx = Math.min(mid, dockEdge - g.dockShelfMarginPx - halfShelfPx);
    const lateralOffset = clamp(
      (vw / 2 - centrePx) / pxPerWorld,
      0,
      g.stopLateralMax,
    );
    lateral = lateralOffset * blend;
  }

  // cameraCompositionForViewport, lerped between stop 0 and stop 1.
  let overview = cam.z;
  if (portrait) {
    const halfHorizontalFov =
      Math.tan(radians(g.portraitFov / 2)) * Math.max(0.01, aspect);
    overview = clamp(
      (g.shelfWidth * g.overviewMargin) / (2 * halfHorizontalFov),
      g.overviewMinDistance,
      g.overviewMaxDistance,
    );
  }
  const stopY = portrait ? 0.25 : cam.y;
  const fov = portrait ? g.portraitFov : cam.fov;
  const unitZ = g.unitOneZ * blend;
  const camZ = unitZ + overview;
  const lookZ = unitZ + g.lookZOffset;

  // cameraDepthOffsetsForViewport on the 0→1 knot span.
  const [lower, upper] = g.depthKnots;
  const t = blend;
  const stopBlend = t * t * t * (t * (t * 6 - 15) + 10);
  let eyeHeight =
    lower.eyeHeight + (upper.eyeHeight - lower.eyeHeight) * stopBlend;
  let pitchDegrees =
    lower.pitchDegrees + (upper.pitchDegrees - lower.pitchDegrees) * stopBlend;
  if (lower.arcPeak) {
    const arc = 16 * t * t * (1 - t) * (1 - t);
    eyeHeight += (lower.arcPeak.eyeHeight - eyeHeight) * arc;
    pitchDegrees += (lower.arcPeak.pitchDegrees - pitchDegrees) * arc;
  }
  let depthScale = 1;
  if (shortLandscape) depthScale = 0.85;
  else if (portrait) {
    const portraitBlend = clamp((aspect - 0.5) / 0.25, 0, 1);
    depthScale = 0.6 + portraitBlend * 0.2;
  }
  eyeHeight = clamp(
    eyeHeight * depthScale,
    -g.depthMaxEyeHeight,
    g.depthMaxEyeHeight,
  );
  pitchDegrees = clamp(
    pitchDegrees * depthScale,
    -g.depthMaxPitchDegrees,
    g.depthMaxPitchDegrees,
  );
  // cameraDepthEffectEnabled: a visitor who has not opened the console
  // gets the flat rest pose, so the stage lands there too.
  if (!g.depthEnabled) {
    eyeHeight = 0;
    pitchDegrees = 0;
  }

  // CameraRig's rest pose: the baseline look vector, then the authored pitch
  // applied around the raised eye.
  const eyeY = stopY + eyeHeight;
  const horizontal = camZ - lookZ;
  const basePitch = Math.atan2(g.lookY - stopY, horizontal);
  const lookY = eyeY + Math.tan(basePitch - radians(pitchDegrees)) * horizontal;

  // The resident Peek Sheet shifts the whole image up by half its discounted
  // coverage (CameraRig's setViewOffset).
  let imageShiftUp = 0;
  if (narrow) {
    const peek = shortLandscape
      ? g.peek.shortLandscape
      : Math.round(clamp(safeHeight * g.peek.fraction, g.peek.min, g.peek.max));
    const coverage = clamp((peek - peek * 0.5) / safeHeight, 0, 1);
    imageShiftUp = (safeHeight * coverage) / 2;
  }

  // lookAt projection of unit 0's origin. The camera and its target share an
  // x, so the view basis is a pure pitch: right = +x, and up/forward live in
  // the y–z plane.
  const dy = eyeY - lookY;
  const dz = camZ - lookZ;
  const length = Math.hypot(dy, dz);
  const zy = dy / length;
  const zz = dz / length;
  const depth = eyeY * zy + camZ * zz;
  const up = -eyeY * zz + camZ * zy;
  const focal = safeHeight / 2 / Math.tan(radians(fov / 2));
  const unitPx = focal / depth;
  return {
    originX: vw / 2 - (shift + lateral) * unitPx,
    eyeX: shift + lateral,
    originY: safeHeight / 2 - up * unitPx - imageShiftUp,
    unitPx,
  };
}

/** The boxes the stage moves between, in CSS px. `start` is the bookcase as
 * it has always opened — a centred box capped at 560px with the wordmark 28px
 * beneath — and `placed` is the box whose origin and scale coincide with the
 * live shelf. The shift is the transform that shows the placed box at the start
 * box, so the glide is one composited transition from that transform to none. */
export type AboutBootStageLayout = {
  left: number;
  top: number;
  width: number;
  shiftX: number;
  shiftY: number;
  shiftScale: number;
  /** Space between the placed bookcase's feet and the wordmark. */
  wordmarkGap: number;
  wordmarkShiftX: number;
  wordmarkShiftY: number;
  /** How far the live eye stands from the canonical desktop eye the SVG's
   * drawables were projected for, in SVG units. Each drawable slides by
   * this times (1 - its depth ratio), which is exactly the parallax the
   * canonical projection left out (scene/aboutBootPerspective.ts). */
  eyeShift: number;
};

export type AboutBootStageLayoutGeometry = {
  /** The SVG viewBox in scene units: 300×230 around an origin at (150, 108). */
  viewBox: { width: number; height: number; originX: number; originY: number };
  /** The centred opening box: min(88vw, 560px). */
  startWidthFraction: number;
  startMaxWidth: number;
  /** The wordmark's margin above it, its floor on short viewports, and its
   * `clamp(28.56px, 3.162vw, 44.88px)` line. */
  wordmarkGap: number;
  wordmarkGapMin: number;
  wordmarkFont: { min: number; perViewportWidth: number; max: number };
  /** The loading strip at the bottom plus breathing room. */
  waitStrip: number;
  /** The eye x every drawable in the SVG was projected for, and the SVG
   * units in one scene unit, so `eyeShift` can be handed to the drawables. */
  canonicalEyeX: number;
  sceneToSvg: number;
};

export const ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY: AboutBootStageLayoutGeometry = {
  viewBox: { width: 3, height: 2.3, originX: 1.5, originY: 1.08 },
  startWidthFraction: 0.88,
  startMaxWidth: 560,
  wordmarkGap: 28,
  wordmarkGapMin: 8,
  wordmarkFont: { min: 28.56, perViewportWidth: 0.03162, max: 44.88 },
  waitStrip: 72,
  // The same canonical desktop pose ABOUT_BOOT_CAMERA stands at
  // (scene/aboutBootPerspective.ts), read off this module's own maths so
  // the pre-paint script and the drawables can never disagree about it.
  canonicalEyeX: aboutBootStageForViewport(
    1440,
    900,
    RAIL_RIGHT_PX_FALLBACK,
    ABOUT_BOOT_STAGE_GEOMETRY,
  ).eyeX,
  sceneToSvg: SCENE_TO_BOOT_SVG,
};

/** Lay the placed box over the projected shelf and measure the centred start
 * box against it. SELF-CONTAINED BY CONTRACT, like the projection. */
export function aboutBootStageLayout(
  vw: number,
  vh: number,
  stage: AboutBootStage,
  l: AboutBootStageLayoutGeometry,
): AboutBootStageLayout {
  const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, value));
  const wordmarkLine = clamp(
    vw * l.wordmarkFont.perViewportWidth,
    l.wordmarkFont.min,
    l.wordmarkFont.max,
  );

  const width = l.viewBox.width * stage.unitPx;
  const left = stage.originX - l.viewBox.originX * stage.unitPx;
  const top = stage.originY - l.viewBox.originY * stage.unitPx;
  const height = l.viewBox.height * stage.unitPx;
  const wordmarkGap = clamp(
    vh - l.waitStrip - (top + height) - wordmarkLine,
    l.wordmarkGapMin,
    l.wordmarkGap,
  );

  const startWidth = Math.min(vw * l.startWidthFraction, l.startMaxWidth);
  const startHeight = (startWidth * l.viewBox.height) / l.viewBox.width;
  const startLeft = (vw - startWidth) / 2;
  const startTop = (vh - (startHeight + l.wordmarkGap + wordmarkLine)) / 2;

  return {
    left,
    top,
    width,
    shiftX: startLeft - left,
    shiftY: startTop - top,
    shiftScale: startWidth / width,
    wordmarkGap,
    wordmarkShiftX: vw / 2 - stage.originX,
    wordmarkShiftY:
      startTop + startHeight + l.wordmarkGap - (top + height + wordmarkGap),
    eyeShift: (stage.eyeX - l.canonicalEyeX) * l.sceneToSvg,
  };
}

export type AboutBootStagePhase = "start" | "placed";

/** How the placed bookcase arrives: the delay after the reveal pass, then the
 * glide's CSS transition. The reveal gate waits for it, so the handoff can
 * never catch the bookcase in flight. */
export const ABOUT_BOOT_STAGE_GLIDE = {
  durationSeconds: 0.6,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

function stageDeclarations(layout: AboutBootStageLayout) {
  const px = (value: number) => `${value.toFixed(2)}px`;
  return [
    [ABOUT_BOOT_STAGE_VARS.left, px(layout.left)],
    [ABOUT_BOOT_STAGE_VARS.top, px(layout.top)],
    [ABOUT_BOOT_STAGE_VARS.width, px(layout.width)],
    [ABOUT_BOOT_STAGE_VARS.shiftX, px(layout.shiftX)],
    [ABOUT_BOOT_STAGE_VARS.shiftY, px(layout.shiftY)],
    [ABOUT_BOOT_STAGE_VARS.shiftScale, layout.shiftScale.toFixed(4)],
    [ABOUT_BOOT_STAGE_VARS.wordmarkGap, px(layout.wordmarkGap)],
    [ABOUT_BOOT_STAGE_VARS.wordmarkShiftX, px(layout.wordmarkShiftX)],
    [ABOUT_BOOT_STAGE_VARS.wordmarkShiftY, px(layout.wordmarkShiftY)],
    [ABOUT_BOOT_STAGE_VARS.eyeShift, layout.eyeShift.toFixed(3)],
  ] as const;
}

let knownRailRightPx = 0;

function clearAboutBootStage(root: HTMLElement): void {
  root.removeAttribute(ABOUT_BOOT_STAGE_ATTRIBUTE);
  for (const name of Object.values(ABOUT_BOOT_STAGE_VARS)) {
    root.style.removeProperty(name);
  }
}

/** Write the stage for the live viewport onto the document element. UnitRail
 * passes its measured right edge; everyone else reuses the last one it saw,
 * falling back to the same stand-in the camera solves its first frames with.
 * The phase is left alone: a nudge from the rail must not restart the glide. */
export function publishAboutBootStage(railRightPx?: number): boolean {
  if (typeof window === "undefined" || typeof document === "undefined")
    return false;
  if (railRightPx !== undefined) knownRailRightPx = railRightPx;
  const root = document.documentElement;
  if (
    !aboutBootStageEnabledForLocation(
      window.location.pathname,
      window.location.hash,
    )
  ) {
    clearAboutBootStage(root);
    return false;
  }
  const stage = aboutBootStageForViewport(
    window.innerWidth,
    window.innerHeight,
    knownRailRightPx || RAIL_RIGHT_PX_FALLBACK,
    ABOUT_BOOT_STAGE_GEOMETRY,
  );
  const layout = aboutBootStageLayout(
    window.innerWidth,
    window.innerHeight,
    stage,
    ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY,
  );
  for (const [name, value] of stageDeclarations(layout)) {
    root.style.setProperty(name, value);
  }
  if (!root.hasAttribute(ABOUT_BOOT_STAGE_ATTRIBUTE)) {
    root.setAttribute(ABOUT_BOOT_STAGE_ATTRIBUTE, "start");
  }
  return true;
}

export function setAboutBootStagePhase(phase: AboutBootStagePhase): boolean {
  if (typeof window === "undefined" || typeof document === "undefined")
    return false;
  const root = document.documentElement;
  if (
    !aboutBootStageEnabledForLocation(
      window.location.pathname,
      window.location.hash,
    )
  ) {
    clearAboutBootStage(root);
    return false;
  }
  root.setAttribute(ABOUT_BOOT_STAGE_ATTRIBUTE, phase);
  return true;
}

/** The inline script body that positions the boot stage before first paint.
 * It is the projection and layout functions' own source applied to the live
 * window, so it cannot disagree with what hydration later recomputes. Failure
 * leaves the attribute unset and the CSS falls back to the centred stage. */
export function aboutBootStageScript(
  geometry: AboutBootStageGeometry = ABOUT_BOOT_STAGE_GEOMETRY,
  layoutGeometry: AboutBootStageLayoutGeometry = ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY,
  railRightPx: number = RAIL_RIGHT_PX_FALLBACK,
): string {
  const q = (value: string | number) => JSON.stringify(value);
  // The same declarations `publishAboutBootStage` writes, as source text.
  const writes: ReadonlyArray<readonly [string, string]> = [
    [ABOUT_BOOT_STAGE_VARS.left, 'layout.left.toFixed(2) + "px"'],
    [ABOUT_BOOT_STAGE_VARS.top, 'layout.top.toFixed(2) + "px"'],
    [ABOUT_BOOT_STAGE_VARS.width, 'layout.width.toFixed(2) + "px"'],
    [ABOUT_BOOT_STAGE_VARS.shiftX, 'layout.shiftX.toFixed(2) + "px"'],
    [ABOUT_BOOT_STAGE_VARS.shiftY, 'layout.shiftY.toFixed(2) + "px"'],
    [ABOUT_BOOT_STAGE_VARS.shiftScale, "layout.shiftScale.toFixed(4)"],
    [ABOUT_BOOT_STAGE_VARS.wordmarkGap, 'layout.wordmarkGap.toFixed(2) + "px"'],
    [
      ABOUT_BOOT_STAGE_VARS.wordmarkShiftX,
      'layout.wordmarkShiftX.toFixed(2) + "px"',
    ],
    [
      ABOUT_BOOT_STAGE_VARS.wordmarkShiftY,
      'layout.wordmarkShiftY.toFixed(2) + "px"',
    ],
    [ABOUT_BOOT_STAGE_VARS.eyeShift, "layout.eyeShift.toFixed(3)"],
  ];
  const writeSource = writes
    .map(([name, value]) => `  root.style.setProperty(${q(name)}, ${value});`)
    .join("\n");
  const clearSource = Object.values(ABOUT_BOOT_STAGE_VARS)
    .map((name) => `    root.style.removeProperty(${q(name)});`)
    .join("\n");
  return `
try {
  var root = document.documentElement;
  var enabled = (${aboutBootStageEnabledForLocation.toString()})(
    window.location.pathname,
    window.location.hash,
    ${JSON.stringify(ABOUT_BOOT_STAGE_LOCATION_ROUTING)}
  );
  if (!enabled) {
    root.removeAttribute(${q(ABOUT_BOOT_STAGE_ATTRIBUTE)});
${clearSource}
  } else {
    var stage = (${aboutBootStageForViewport.toString()})(
      window.innerWidth,
      window.innerHeight,
      ${q(railRightPx)},
      ${JSON.stringify(geometry)}
    );
    var layout = (${aboutBootStageLayout.toString()})(
      window.innerWidth,
      window.innerHeight,
      stage,
      ${JSON.stringify(layoutGeometry)}
    );
${writeSource}
    root.setAttribute(${q(ABOUT_BOOT_STAGE_ATTRIBUTE)}, "start");
  }
} catch (_) {}
`;
}

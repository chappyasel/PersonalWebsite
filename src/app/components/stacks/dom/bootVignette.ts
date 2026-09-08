// Pure presentation maths for the boot vignette: the reveal cadence, the CSS
// keyframes generated from it, the dust drift, and the constants both the
// component and its tests read.
//
// This lives beside BootScreen.tsx rather than inside it so that file exports
// nothing but components. React Fast Refresh only treats a module as a refresh
// boundary when every one of its exports is a component; one exported constant
// and a saved edit reloads the whole document, which tears the live world down
// and replays the entire boot behind the very screen you were tuning.
import { type WorldBootWaitStage } from "../boot/worldBootMachine";
import { type AboutLandmarkId } from "../scene/aboutBootComposition";
import {
  ABOUT_BOOT_CAMERA,
  type AboutBootQuad,
  projectAboutBootPoint,
} from "../scene/aboutBootPerspective";
import {
  ABOUT_LANDMARK_X,
  ABOUT_LOWER_LANDMARK_Z,
} from "../scene/aboutScenePose";
import { SHELF_SURFACE } from "../scene/shelfGeometry";
import { type ReadingBookProjector } from "../scene/units/aboutReadingStack";
import { proxied } from "../theme";

export const SCENE_TO_BOOT_SVG = 100;
export const BOOT_CADENCE_STEP_SECONDS = 0.12;
export const BOOT_CADENCE_SETTLE_SECONDS = 0.32;

export function projectSceneY(sceneY: number) {
  return -sceneY * SCENE_TO_BOOT_SVG;
}

/** The one placement every boot drawable uses: its unit-local anchor
 * projected through the About rest camera (scene/aboutBootPerspective.ts),
 * at the anchor's depth scale, plus the live eye's parallax. Glyphs draw
 * bottom-centred about the group origin, so the scale grows them in place.
 *
 * A CSS transform rather than the attribute because the parallax term reads
 * a custom property: the drawables are projected for the canonical desktop
 * eye, and on the live viewport the eye stands `--stacks-boot-eye-shift`
 * SVG units to one side (the boot stage writes it before first paint, from
 * the same maths). A point off the shelf plane slides by that times
 * (1 - its depth ratio), which is the projector's
 * `x = eyeX + (worldX - eyeX) * scale` with only eyeX changed, so the
 * placement is exact at every width rather than only at 1440. */
/** Every projected number is rounded before it reaches markup. The projector
 * runs through sin, cos, hypot and atan2, and Node and the browser disagree
 * in the last bit of those often enough that the server's SVG and the
 * client's differed in a dozen attributes and React refused to hydrate them.
 * A thousandth of an SVG unit is a hundredth of a pixel at any width. */
export function bootFixed(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function bootPlacementStyle(anchor: readonly [number, number, number]) {
  const placed = projectAboutBootPoint(anchor, ABOUT_BOOT_CAMERA);
  const share = bootFixed(1 - placed.scale, 5);
  return {
    transform: `translate(calc(${bootFixed(placed.x * SCENE_TO_BOOT_SVG)}px + var(--stacks-boot-eye-shift, 0) * ${share}px), ${bootFixed(-placed.y * SCENE_TO_BOOT_SVG)}px) scale(${bootFixed(placed.scale, 5)})`,
  };
}

/** A projected quad as an SVG points list, y down. */
export function bootPoints(quad: AboutBootQuad) {
  return quad
    .map(
      ([x, y]) =>
        `${bootFixed(x * SCENE_TO_BOOT_SVG)},${bootFixed(-y * SCENE_TO_BOOT_SVG)}`,
    )
    .join(" ");
}

/** The reading fan's corners through the projector, relative to the stack's
 * anchor in the anchor's own scale. The fan's 3D corners are unit-local in
 * x and z with y above the plank, and the group they draw in is placed at
 * the anchor and scaled by its depth ratio, so this is what lands them where
 * the camera draws the books: seen from 1.1 units above the lower plank and
 * a little to their left, not from a level eye at the unit's origin. */
export function bootReadingProjector(): ReadingBookProjector {
  const anchor = projectAboutBootPoint(
    [
      ABOUT_LANDMARK_X["reading-stack"],
      SHELF_SURFACE.lower,
      ABOUT_LOWER_LANDMARK_Z["reading-stack"],
    ],
    ABOUT_BOOT_CAMERA,
  );
  return ([x, y, z]) => {
    const placed = projectAboutBootPoint(
      [x, SHELF_SURFACE.lower + y, z],
      ABOUT_BOOT_CAMERA,
    );
    return [
      bootFixed((placed.x - anchor.x) / anchor.scale, 6),
      bootFixed((placed.y - anchor.y) / anchor.scale, 6),
    ];
  };
}

/** The parallax term alone, for drawables that carry their own geometry
 * (a projected polygon, a circle at its canonical centre): they keep their
 * canonical shape and slide by their anchor's share of the eye shift. */
export function bootParallaxStyle(anchor: readonly [number, number, number]) {
  const placed = projectAboutBootPoint(anchor, ABOUT_BOOT_CAMERA);
  const share = bootFixed(1 - placed.scale, 5);
  return {
    transform: `translate(calc(var(--stacks-boot-eye-shift, 0) * ${share}px))`,
  };
}

export function bootCadence(itemCount: number) {
  const lastSlot = Math.max(0, itemCount - 1);
  const revealDuration =
    lastSlot * BOOT_CADENCE_STEP_SECONDS + BOOT_CADENCE_SETTLE_SECONDS;
  return {
    delays: Array.from(
      { length: itemCount },
      (_, index) => index * BOOT_CADENCE_STEP_SECONDS,
    ),
    revealDuration,
  };
}

/** The room's supporting lines, grouped under the gate each one is true of.
 *
 * These used to run on a twenty-second CSS carousel, which meant the room
 * announced that it was growing the meadow at nine seconds whether or not a
 * single blade had been placed, and announced that it was opening at nineteen
 * whatever it was really stuck on. The copy is unchanged. What changed is
 * which lines are eligible to show: only the ones belonging to the gate the
 * boot is actually still waiting on.
 *
 * Within a gate they still take turns, and they should. A compile that takes
 * eleven seconds really is warming the room, lighting the lamp, and turning on
 * the lighthouse, so cycling through those three is both livelier than one
 * frozen line and true the whole time. The old carousel's lie was that it
 * advanced through the *stages* on a timer; taking turns inside one stage
 * claims nothing the boot is not doing. */
export const BOOT_WAIT_NOTES: Record<WorldBootWaitStage, readonly string[]> = {
  starting: [
    "Waiting for first light.",
    "Waking up the room.",
    "Turning the first key.",
    "Finding the light switch.",
    "Lifting the dust cover.",
    "Getting the room on its feet.",
  ],
  assets: [
    "Setting out the books.",
    "Unfolding the map.",
    "Hanging the photographs.",
    "Putting the plants in place.",
    "Setting up the desk.",
    "Placing the artifacts.",
  ],
  firstFrame: [
    "Warming the room.",
    "Lighting the little lamp.",
    "Turning on the lighthouse.",
    "Drawing the first frame.",
    "Finding the right shadows.",
    "Bringing the walls into view.",
  ],
  meadow: [
    "Growing the meadow.",
    "Letting the moths wander.",
    "Planting the last few blades.",
    "Stirring the tall grass.",
    "Scattering the wildflowers.",
    "Giving the grass some wind.",
  ],
  opening: [
    "Giving the globe a turn.",
    "Opening the room.",
    "Straightening the shelves.",
    "Taking one last look.",
    "Clearing the doorway.",
    "Handing you the key.",
  ],
};

export const BOOT_WAIT_STAGES: readonly WorldBootWaitStage[] = [
  "starting",
  "assets",
  "firstFrame",
  "meadow",
  "opening",
];

/** How long one line holds before the next in its gate takes over. */
export const BOOT_WAIT_NOTE_INTERVAL_MS = 1_200;

/** Every line, in gate order, for the stacked spans the boot screen renders.
 * One is marked active and the rest cross-fade out behind it. */
export const BOOT_WAIT_NOTE_LINES: readonly {
  stage: WorldBootWaitStage;
  index: number;
  text: string;
}[] = BOOT_WAIT_STAGES.flatMap((stage) =>
  BOOT_WAIT_NOTES[stage].map((text, index) => ({ stage, index, text })),
);

/** Cross-fade between two notes. Slow enough to read as one line replacing
 * another rather than a flicker, short enough that a fast ladder still shows
 * the visitor it moved. */
export const BOOT_WAIT_NOTE_FADE_MS = 420;
export const BOOT_DUST_COUNTS = {
  light: { initial: 8, maximum: 12 },
  dark: { initial: 3, maximum: 7 },
} as const;
export const BOOT_DUST_SPAWN_WINDOW_MS = 30_000;
export const BOOT_DUST_SPAWN_DELAY_MS = { minimum: 2_000, maximum: 4_000 };
export const BOOT_DUST_TRAVEL_MULTIPLIER = 2;

type BootMotePosition = { x: number; y: number };

export type BootDustDrift = {
  durationMs: number;
  keyframes: Keyframe[];
};

/** Samples the same low-frequency current, individual eddies, and intermittent
 * shimmer used by the WebGL room dust. The path loops analytically, so motes
 * drift rather than choosing conspicuous waypoint-to-waypoint routes. */
export function createBootDustDrift(
  origin: BootMotePosition,
  phase: number,
  speed: number,
  shaftMote = false,
): BootDustDrift {
  const sampleCount = 32;
  const durationMs = Math.round(22_000 / speed);
  const travel = BOOT_DUST_TRAVEL_MULTIPLIER;
  return {
    durationMs,
    keyframes: Array.from({ length: sampleCount + 1 }, (_, index) => {
      const progress = index / sampleCount;
      const time = progress * Math.PI * 2;
      const current = Math.sin(time + origin.y * 0.018);
      const x =
        origin.x +
        current * 4.2 * travel +
        Math.sin(time * 2 + phase) * 7.4 * travel +
        Math.sin(time + phase * 2.7) * 3.2 * travel;
      const y =
        origin.y +
        Math.sin(time * 2 + phase * 1.4) * 5.8 * travel +
        Math.sin(time + origin.x * 0.012) * 3.4 * travel;
      const envelope = 0.5 + 0.5 * Math.sin(time * 2 + phase * 3.1);
      const glint = 0.5 + 0.5 * Math.sin(time * 5 + phase * 5.7);
      const shaftWave =
        0.5 +
        0.5 *
          Math.sin(time + phase * 2.3 + 0.34 * Math.sin(time + phase * 4.1));
      const opacity = shaftMote
        ? 0.08 + 0.92 * Math.max(0, Math.min(1, (shaftWave - 0.22) / 0.56))
        : 0.64 + 0.28 * envelope + 0.08 * glint;
      return {
        offset: progress,
        opacity: Number(opacity.toFixed(2)),
        transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(0.84 + glint * 0.22).toFixed(2)})`,
      };
    }),
  };
}

export function bootItemPose(
  progress: number,
  index: number,
  cadence: ReturnType<typeof bootCadence>,
) {
  const start = cadence.delays[index]! / cadence.revealDuration;
  const linear = Math.min(
    1,
    Math.max(
      0,
      (progress - start) *
        (cadence.revealDuration / BOOT_CADENCE_SETTLE_SECONDS),
    ),
  );
  const visible = linear * linear * (3 - 2 * linear);
  return { opacity: visible, offsetY: (1 - visible) * 7 };
}

export function bootItemKeyframes(
  index: number,
  cadence: ReturnType<typeof bootCadence>,
): Keyframe[] {
  const hidden = {
    opacity: 0,
    transform: "translate3d(0, 7px, 0)",
  };
  const visible = {
    opacity: 1,
    transform: "translate3d(0, 0, 0)",
  };
  const revealStart = cadence.delays[index]! / cadence.revealDuration;
  const revealEnd =
    (cadence.delays[index]! + BOOT_CADENCE_SETTLE_SECONDS) /
    cadence.revealDuration;

  return [
    { ...hidden, offset: 0 },
    {
      ...hidden,
      offset: revealStart,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    },
    { ...visible, offset: revealEnd },
    { ...visible, offset: 1 },
  ];
}

function cssKeyframes(name: string, frames: Keyframe[]) {
  const body = frames
    .map(({ offset, opacity, transform, easing }) => {
      const percentage = Number((Number(offset) * 100).toFixed(5));
      const alpha = opacity === undefined ? "" : `opacity:${String(opacity)};`;
      const translation =
        transform === undefined ? "" : `transform:${String(transform)};`;
      const timing = easing
        ? `animation-timing-function:${String(easing)};`
        : "";
      return `${percentage}%{${alpha}${translation}${timing}}`;
    })
    .join("");
  return `@keyframes ${name}{${body}}`;
}

export function bootCssKeyframes(
  itemCount: number,
  cadence: ReturnType<typeof bootCadence>,
) {
  return Array.from({ length: itemCount }, (_, index) => {
    return cssKeyframes(
      `stacks-boot-reveal-${index}`,
      bootItemKeyframes(index, cadence),
    );
  }).join("");
}

export function bootRevealComplete(
  timelineTime: number,
  animationTime: number,
  revealDuration: number,
): boolean {
  const cssDurationMs = Number(revealDuration.toFixed(2)) * 1000;
  return timelineTime >= cssDurationMs || animationTime >= cssDurationMs;
}

export type BootFramePhoto = {
  src: string;
  preserveAspectRatio: "xMidYMid slice" | "xMidYMin slice";
};

/** Small loading-screen sources paint opportunistically. They are not part of
 * the WebGL reveal gate; the live scene owns its own preview readiness. */
export const BOOT_FRAME_PHOTOS = {
  portrait: {
    src: proxied("/images/about/profile.jpg", 384),
    preserveAspectRatio: "xMidYMin slice",
  },
  "family-frame": {
    src: "/images/stacks/v8/512/about-family.jpg",
    preserveAspectRatio: "xMidYMid slice",
  },
  "profile-frame": {
    src: "/images/stacks/v8/256/about-profile-full.jpg",
    preserveAspectRatio: "xMidYMid slice",
  },
} as const satisfies Partial<Record<AboutLandmarkId, BootFramePhoto>>;

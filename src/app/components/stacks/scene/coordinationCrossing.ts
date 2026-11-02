import { lastPointerPosition } from "~/lib/originFlight";

/** The experimental same-tab exit from the coordination orb: the shared
 * timeline and session state, free of Three so the diagnostics registry and
 * the DOM overlay can read them. */

export const COORDINATION_HREF = "https://coordination.sh/";
/** coordination.sh ignores the fragment until it ships its arrival rule. */
export const COORDINATION_ARRIVAL_HREF = `${COORDINATION_HREF}#room`;
export const CROSSING_BLOCK_ID = "coordination-crossing-block";
/** The orb's blinker and grains, which the crossing takes over from the scene. */
export const COORDINATION_BLINKER_NAME = "coordination-blinker";
export const COORDINATION_DUST_NAME = "coordination-dust";

/** Milliseconds from the click. A spread delays a pixel by its distance from
 * the orb, as a fraction of the distance to the farthest corner. */
const T = Object.freeze({
  chromeFade: 900,
  jitter: 220,
  backgroundStart: 0,
  backgroundSpan: 1600,
  backgroundSpread: 1400,
  wireStart: 1400,
  wireSpan: 1100,
  wireSpread: 1700,
  blinkPeriod: 1100,
  travelStart: 300,
  travelSpan: 5600,
  orbLightRise: 900,
  orbLightFadeStart: 1200,
  orbLightFadeEnd: 3200,
  flareStart: 600,
  flareRise: 2400,
  flareFadeStart: 4400,
  flareFadeEnd: 7200,
  halftoneStart: 4500,
  halftoneSpan: 900,
  halftoneSpread: 700,
  shrinkStart: 6000,
  shrinkSpan: 900,
  shrinkJitter: 240,
  orangeOutStart: 6100,
  orangeOutSpread: 900,
  dustFadeStart: 5800,
  dustFadeEnd: 7400,
  gridOutStart: 6400,
  gridOutSpan: 1700,
  handoff: 240,
  hold: 8400,
  previewRest: 900,
});

export const CROSSING_TIMELINE = T;

/** coordination.sh's `intro-grow` starts its mark here and eases to 1. The
 * blinker sits at the mark's left, so this is what puts it on the page's first
 * frame: smaller, and pulled in toward the middle. */
export const CROSSING_MARK_SCALE = 0.85;

export type CrossingTheme = "light" | "dark";
type Rgb = readonly [number, number, number];

/** coordination.sh's page tokens, so the last frame is its first. `tone` is the
 * stage's ink: the page's ink in light, a gray on its near-black ground. */
export const CROSSING_TOKENS: Readonly<
  Record<
    CrossingTheme,
    Readonly<{
      ground: Rgb;
      dot: Rgb;
      tone: Rgb;
      accent: Rgb;
      grains: readonly [Rgb, Rgb, Rgb];
    }>
  >
> = Object.freeze({
  light: {
    ground: [247, 247, 244],
    dot: [217, 217, 211],
    tone: [26, 26, 26],
    accent: [209, 66, 26],
    grains: [
      [13, 79, 251],
      [169, 61, 14],
      [58, 58, 58],
    ],
  },
  dark: {
    ground: [12, 12, 13],
    dot: [34, 34, 37],
    tone: [150, 150, 154],
    accent: [245, 115, 47],
    grains: [
      [99, 142, 252],
      [255, 154, 82],
      [200, 200, 204],
    ],
  },
});

type Keyframes = readonly (readonly [number, number])[];

/** coordination.sh's `blink` and `bloom` keyframes. */
const BLINK_KEYFRAMES: Keyframes = [
  [0, 1],
  [0.36, 1],
  [0.5, 0],
  [0.86, 0],
  [1, 1],
];
const BLOOM_KEYFRAMES: Keyframes = [
  [0, 0.74],
  [0.05, 1],
  [0.22, 0.9],
  [0.41, 0.97],
  [0.5, 0.84],
  [0.6, 0.36],
  [0.8, 0.16],
  [0.94, 0.2],
  [1, 0.74],
];

function sampleKeyframes(keyframes: Keyframes, phase: number) {
  let previous = keyframes[0]!;
  for (const frame of keyframes) {
    if (phase <= frame[0]) {
      const span = frame[0] - previous[0];
      const progress = span > 0 ? (phase - previous[0]) / span : 1;
      return previous[1] + (frame[1] - previous[1]) * progress;
    }
    previous = frame;
  }
  return previous[1];
}

const smooth = (edge0: number, edge1: number, value: number) => {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
};

/** coordination.sh's blinker on its own 1.1 s clock: `block` is its opacity
 * and `bloom` its glow's. */
export function coordinationBlinker(time: number) {
  const phase = (time % T.blinkPeriod) / T.blinkPeriod;
  return {
    block: sampleKeyframes(BLINK_KEYFRAMES, phase),
    bloom: sampleKeyframes(BLOOM_KEYFRAMES, phase),
  };
}

/** How much further the press drives the orb's real light past rest. */
const ORB_LIGHT_SURGE = 5;

/** The orb's real light as a multiple of its rest: it swells on the press, then
 * goes out as the blinker leaves. The glow that travels is the crossing's. */
export const crossingOrbLight = (time: number) =>
  (1 + ORB_LIGHT_SURGE * smooth(0, T.orbLightRise, time)) *
  (1 - smooth(T.orbLightFadeStart, T.orbLightFadeEnd, time));

/** Where the orb's blinker is in its cycle at a moment of its clock. */
export const blinkerPhase = (now: number) =>
  (now % T.blinkPeriod) / T.blinkPeriod;

/** The blinker at a moment of the crossing, plus `flare`, the extra light it
 * throws across the scene. It picks up the orb's cycle at `startPhase` and runs
 * a touch fast or slow, so a whole cycle lands on the page's first frame. */
export function crossingBlinker(time: number, startPhase = 0) {
  const flare =
    smooth(T.flareStart, T.flareStart + T.flareRise, time) *
    (1 - smooth(T.flareFadeStart, T.flareFadeEnd, time));
  if (time >= T.hold) return { ...coordinationBlinker(0), flare };
  const cycles =
    Math.max(1, Math.round(T.hold / T.blinkPeriod + startPhase)) - startPhase;
  const phase = startPhase + (cycles * Math.max(0, time)) / T.hold;
  return { ...coordinationBlinker(phase * T.blinkPeriod), flare };
}

/** Where a blinker sits on the screen, in CSS pixels. */
export type BlinkerSpot = Readonly<{ x: number; y: number; em: number }>;

/** The one blinker on its way from the orb to the page's mark. `from` can move,
 * so it stays on the orb through anything that nudges the room. */
export function crossingBlinkerSpot(
  time: number,
  from: BlinkerSpot,
  to: BlinkerSpot,
): BlinkerSpot {
  const travel = smooth(T.travelStart, T.travelStart + T.travelSpan, time);
  const along = (start: number, end: number) => start + (end - start) * travel;
  return {
    x: along(from.x, to.x),
    y: along(from.y, to.y),
    em: along(from.em, to.em),
  };
}

/** The scattered grains' brightness. It starts on the page's flare and is gone
 * before the hold frame, which has no dust: the page's own rises after it. */
export const crossingDustGain = (time: number) =>
  (1 + 1.5 * Math.exp(-time * 0.0009)) *
  (1 - smooth(T.dustFadeStart, T.dustFadeEnd, time));

/** The page's `intro-grid` easing, as a curve simple enough to run backwards:
 * within 3.5% of its cubic-bezier(0.25, 0.6, 0.2, 1). */
const introGridEase = (progress: number) => 1 - (1 - progress) ** 3.4;

/** coordination.sh's grid intro played in reverse. The page opens on a bare
 * ground and fades its dots in at 3x, tightening them to 1x, so this leaves the
 * dots where its own will appear and the blinker alone for the cut. `scale` is
 * about the window's centre, and both halves of the page's keyframes hold: the
 * zoom takes the whole span, the fade the half nearest the page. */
export function crossingGrid(time: number) {
  const left = Math.min(
    1,
    Math.max(0, (T.gridOutStart + T.gridOutSpan - time) / T.gridOutSpan),
  );
  return {
    scale: 3 - 2 * introGridEase(left),
    fade: introGridEase(Math.min(1, left * 2)),
  };
}

export type CrossingRun = Readonly<{
  id: number;
  startedAt: number;
  origin: Readonly<{ x: number; y: number }>;
  theme: CrossingTheme;
}>;

export type CoordinationCrossingSnapshot = Readonly<{
  enabled: boolean;
  leaveRoom: boolean;
  dustOrb: boolean;
  hdrBlinker: boolean;
  run: CrossingRun | null;
}>;

/** On for every visitor. Scene Diagnostics can switch it off for a session. */
export const CROSSING_DEFAULT_ON = true;

const INITIAL: CoordinationCrossingSnapshot = Object.freeze({
  enabled: CROSSING_DEFAULT_ON,
  leaveRoom: CROSSING_DEFAULT_ON,
  dustOrb: CROSSING_DEFAULT_ON,
  hdrBlinker: CROSSING_DEFAULT_ON,
  run: null,
});

export function createCoordinationCrossingController() {
  let snapshot = INITIAL;
  let nextId = 1;
  const listeners = new Set<() => void>();
  const publish = (next: CoordinationCrossingSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEnabled: (enabled: boolean) => {
      if (enabled !== snapshot.enabled) publish({ ...snapshot, enabled });
    },
    setLeaveRoom: (leaveRoom: boolean) => {
      if (leaveRoom !== snapshot.leaveRoom) publish({ ...snapshot, leaveRoom });
    },
    setDustOrb: (dustOrb: boolean) => {
      if (dustOrb !== snapshot.dustOrb) publish({ ...snapshot, dustOrb });
    },
    setHdrBlinker: (hdrBlinker: boolean) => {
      if (hdrBlinker !== snapshot.hdrBlinker)
        publish({ ...snapshot, hdrBlinker });
    },
    begin: (start: Omit<CrossingRun, "id">) => {
      if (!snapshot.enabled || snapshot.run) return false;
      publish({ ...snapshot, run: { ...start, id: nextId++ } });
      return true;
    },
    finish: () => {
      if (snapshot.run) publish({ ...snapshot, run: null });
    },
  };
}

/** Session memory only. A reload returns to the defaults above. */
export const coordinationCrossing = createCoordinationCrossingController();

/** The stage takes coordination.sh's theme rather than the room's or the
 * system's, so the last frame is its first. That page is dark for every visitor
 * (`SITE_THEME` in its src/brand.ts). The light tokens and plate stay for the day
 * that switch flips, and this one with it. */
const CROSSING_THEME: CrossingTheme = "dark";

export function beginCoordinationCrossing() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return false;
  return coordinationCrossing.begin({
    startedAt: performance.now(),
    origin: lastPointerPosition() ?? {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    },
    theme: CROSSING_THEME,
  });
}

/** The orb's tap while the switch is on. It stands in for the portal path, so
 * it records no portal analytics. */
export function openCoordinationWithCrossing() {
  if (beginCoordinationCrossing()) return;
  window.open(COORDINATION_HREF, "_blank", "noopener,noreferrer");
}

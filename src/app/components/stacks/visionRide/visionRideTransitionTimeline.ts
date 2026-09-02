/**
 * Pure presentation timeline for the Vision Ride entry/exit performance.
 *
 * The transition component evaluates these per frame; keeping them pure is
 * what makes every checkpoint (flight, static fill, flicker, aperture,
 * bright-line collapse, dot, black hold, curtain reveal) assertable in tests
 * without a renderer.
 *
 * Entry, an old set switching on: the headset lifts, turns, and approaches
 * the face while still visible. The last seating beat closes quickly to
 * black. Only once the headset is on does static appear, followed by a dot,
 * a bright horizontal line, and the vertical opening onto the ride.
 *
 * Exit, the same set switching off: static pulses over the full picture,
 * the picture collapses vertically to a bright line, the line holds, then
 * shrinks sideways to a dot that dies into black. The room's post effects
 * and camera life are restored under that black; the headset starts its
 * flight back to the freshly measured shelf anchor under a short opaque hold.
 * The curtain then retreats with the headset from the first part of the
 * removal, rather than hiding the removal. Reduced motion replaces the whole
 * performance with short dissolves.
 */
export const VISION_RIDE_TIMELINE = {
  entry: {
    flightSeconds: 1.6,
    reducedFlightSeconds: 0.16,
    /** Flight progress where the black visor starts/finishes covering. The
     * turn is complete before this begins, leaving one short seating beat. */
    curtainStartProgress: 0.93,
    curtainFullProgress: 0.995,
    /** Full-frame static warm-up before the aperture opens. */
    flickerSeconds: 0.5,
    apertureSeconds: 0.85,
    reducedApertureSeconds: 0.2,
  },
  exit: {
    /** Short, full-frame static burst. It starts on the first frame after the
     * exit request so the screen answers the visitor before it collapses. */
    flickerSeconds: 0.3,
    /** Vertical collapse of the picture to a line. */
    collapseSeconds: 0.34,
    /** The bright line holds before shrinking. */
    lineHoldSeconds: 0.08,
    /** Horizontal shrink of the line to a dot. */
    dotSeconds: 0.18,
    /** Black with the dot's afterglow dying. */
    blackHoldSeconds: 0.12,
    reducedCollapseSeconds: 0.14,
    /** Opaque hold at the start of the return, long enough for the room's
     * post effects to remount before the headset pulls away. */
    returnHoldSeconds: 0.18,
    returnFlightSeconds: 1.25,
    reducedReturnSeconds: 0.16,
    /** Begin revealing almost as soon as the return moves. The shrinking
     * visor follows the headset, exposing the room from the face outward. */
    revealDelaySeconds: 0.01,
    curtainRevealSeconds: 0.48,
  },
} as const;

export const VISION_RIDE_HEADSET_PITCH = {
  travel: -0.09,
  wearing: 0.34,
} as const;

function smooth(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export type HeadsetFlightChoreography = Readonly<{
  travelProgress: number;
  turnProgress: number;
  /** Unitless arch applied along camera-up. Zero at both anchors. */
  arc: number;
  /** Late pitch from display-forward to strap-up wearing orientation. */
  seatProgress: number;
  /** Early return pitch from wearing orientation back to travel. */
  faceClearanceProgress: number;
}>;

/**
 * Break one flight into readable physical beats. The headset first leaves its
 * anchor without turning, rotates through the middle, and holds its finished
 * orientation for the final approach. The same curve reads in reverse on
 * removal: pull away first, turn after clearing the face, then land.
 */
export function headsetFlightChoreography(
  progress: number,
): HeadsetFlightChoreography {
  const travelProgress = Math.max(0, Math.min(1, progress));
  const turnProgress = smooth((travelProgress - 0.18) / 0.54);
  const seatProgress = smooth((travelProgress - 0.72) / 0.28);
  const faceClearanceProgress = smooth(travelProgress / 0.22);
  const arc =
    travelProgress === 0 || travelProgress === 1
      ? 0
      : Math.sin(Math.PI * travelProgress);
  return {
    travelProgress,
    turnProgress,
    arc,
    seatProgress,
    faceClearanceProgress,
  };
}

/** Deterministic per-tick noise (30 Hz) for irregular CRT flicker. */
export function flickerNoise(elapsed: number) {
  const step = Math.floor(elapsed * 30);
  const sine = Math.sin(step * 12.9898 + 78.233) * 43_758.5453;
  return sine - Math.floor(sine);
}

export type FlightPresentation = Readonly<{
  progress: number;
  curtainAmount: number;
  /** Static legibility over the curtain, 0..1. */
  staticAmount: number;
  complete: boolean;
}>;

export type CrtPresentation = Readonly<{
  /** Scalar openness kept for callers that only need one number. */
  crtOpen: number;
  /** Horizontal aperture, 0 = dot width, 1 = full frame. */
  apertureWidth: number;
  /** Vertical aperture, 0 = a line, 1 = full frame. */
  apertureHeight: number;
  /** Bright-line strength along the aperture edge. */
  beam: number;
  staticAmount: number;
  complete: boolean;
}>;

/**
 * Shared CRT geometry for a single openness scalar: the first 28 % stretches
 * the dot into a line, the height then opens with a soft power curve.
 */
export function crtAperture(open: number) {
  const clamped = Math.max(0, Math.min(1, open));
  return {
    width: smooth(clamped / 0.28),
    height: Math.pow(clamped, 0.62),
  };
}

export function donningPresentation(
  elapsed: number,
  reducedMotion: boolean,
): FlightPresentation {
  const { flightSeconds, reducedFlightSeconds } = VISION_RIDE_TIMELINE.entry;
  const flight = reducedMotion ? reducedFlightSeconds : flightSeconds;
  const progress = smooth(elapsed / flight);
  const { curtainStartProgress, curtainFullProgress } =
    VISION_RIDE_TIMELINE.entry;
  const curtainAmount = reducedMotion
    ? progress
    : smooth(
        (progress - curtainStartProgress) /
          (curtainFullProgress - curtainStartProgress),
      );
  return {
    progress,
    curtainAmount,
    // This is the visor seating onto the face, so it closes to black. The
    // television snow starts on the first cruising frame after the flight.
    staticAmount: 0,
    complete: elapsed >= flight,
  };
}

export function cruisingPresentation(
  elapsed: number,
  reducedMotion: boolean,
): CrtPresentation {
  const { flickerSeconds, apertureSeconds, reducedApertureSeconds } =
    VISION_RIDE_TIMELINE.entry;
  if (reducedMotion) {
    const open = smooth(elapsed / reducedApertureSeconds);
    const aperture = crtAperture(open);
    return {
      crtOpen: open,
      apertureWidth: aperture.width,
      apertureHeight: aperture.height,
      beam: 0,
      staticAmount: 0,
      complete: open >= 1,
    };
  }
  if (elapsed < flickerSeconds) {
    const noise = flickerNoise(elapsed);
    const pop = noise > 0.6 ? (noise - 0.6) * 0.3 : 0;
    const aperture = crtAperture(pop);
    return {
      crtOpen: pop,
      apertureWidth: aperture.width,
      apertureHeight: aperture.height,
      beam: pop > 0 ? 1 : 0,
      staticAmount: 0.7 + noise * 0.3,
      complete: false,
    };
  }
  const open = smooth((elapsed - flickerSeconds) / apertureSeconds);
  const aperture = crtAperture(open);
  return {
    crtOpen: open,
    apertureWidth: aperture.width,
    apertureHeight: aperture.height,
    beam: 1 - open,
    staticAmount: (1 - open) * 0.55,
    complete: open >= 1,
  };
}

export function doffingPresentation(
  elapsed: number,
  reducedMotion: boolean,
): CrtPresentation {
  const {
    flickerSeconds,
    collapseSeconds,
    lineHoldSeconds,
    dotSeconds,
    blackHoldSeconds,
  } = VISION_RIDE_TIMELINE.exit;
  if (reducedMotion) {
    const { reducedCollapseSeconds } = VISION_RIDE_TIMELINE.exit;
    const progress = smooth(elapsed / reducedCollapseSeconds);
    const aperture = crtAperture(1 - progress);
    return {
      crtOpen: 1 - progress,
      apertureWidth: aperture.width,
      apertureHeight: aperture.height,
      beam: 0,
      staticAmount: 0,
      complete: elapsed >= reducedCollapseSeconds,
    };
  }
  if (elapsed < flickerSeconds) {
    const noise = flickerNoise(elapsed);
    const dip = noise > 0.45 ? (noise - 0.45) * 0.18 : 0;
    return {
      crtOpen: 1 - dip,
      apertureWidth: 1,
      apertureHeight: 1 - dip,
      beam: dip > 0 ? 0.6 : 0,
      staticAmount: 0.88 + noise * 0.12,
      complete: false,
    };
  }
  const collapseEnd = flickerSeconds + collapseSeconds;
  if (elapsed < collapseEnd) {
    const collapse = smooth((elapsed - flickerSeconds) / collapseSeconds);
    return {
      crtOpen: 1 - collapse * 0.72,
      apertureWidth: 1,
      apertureHeight: 1 - collapse,
      beam: collapse,
      staticAmount: 0.45 + collapse * 0.4,
      complete: false,
    };
  }
  const lineEnd = collapseEnd + lineHoldSeconds;
  if (elapsed < lineEnd) {
    return {
      crtOpen: 0.28,
      apertureWidth: 1,
      apertureHeight: 0,
      beam: 1,
      staticAmount: 0.8,
      complete: false,
    };
  }
  const dotEnd = lineEnd + dotSeconds;
  if (elapsed < dotEnd) {
    const shrink = smooth((elapsed - lineEnd) / dotSeconds);
    return {
      crtOpen: 0.28 * (1 - shrink),
      apertureWidth: 1 - shrink,
      apertureHeight: 0,
      beam: 1 - shrink * 0.35,
      staticAmount: 0.8 * (1 - shrink),
      complete: false,
    };
  }
  const afterglow = 1 - smooth((elapsed - dotEnd) / (blackHoldSeconds * 0.7));
  return {
    crtOpen: 0,
    apertureWidth: 0,
    apertureHeight: 0,
    beam: 0.65 * afterglow,
    staticAmount: 0,
    complete: elapsed >= dotEnd + blackHoldSeconds,
  };
}

export function returningPresentation(
  elapsed: number,
  reducedMotion: boolean,
): FlightPresentation {
  const {
    returnHoldSeconds,
    returnFlightSeconds,
    reducedReturnSeconds,
    revealDelaySeconds,
    curtainRevealSeconds,
  } = VISION_RIDE_TIMELINE.exit;
  const flight = reducedMotion ? reducedReturnSeconds : returnFlightSeconds;
  const sinceHold = elapsed - returnHoldSeconds;
  const progress = smooth(sinceHold / flight);
  // Reduced motion dissolves with the short flight. Normal motion holds only
  // long enough to remount the room, then the visor retreats with the headset.
  const curtainAmount = reducedMotion
    ? 1 - progress
    : 1 - smooth((sinceHold - revealDelaySeconds) / curtainRevealSeconds);
  return {
    progress,
    curtainAmount,
    // Switch-off already ended in black. Do not bring the static back while
    // the headset is coming off the face.
    staticAmount: 0,
    complete: elapsed >= returnHoldSeconds + flight,
  };
}

export type LensCurtain = Readonly<{
  /** Iris size: 0 is no lens at all, 1 is grown past the frame corners. */
  coverage: number;
  /** Alpha of the pixels inside the iris. */
  opacity: number;
}>;

/**
 * Coverage and opacity are separate on purpose. Under normal motion the
 * lens is an opaque iris that grows over the room (and shrinks off it on
 * the way back): every pixel inside it is solid, so the room is never seen
 * through a tinted veil. Reduced motion is the one case that dissolves,
 * and it dissolves the full frame rather than a growing disc.
 */
export function lensCurtain(
  curtainAmount: number,
  reducedMotion: boolean,
): LensCurtain {
  const amount = Math.max(0, Math.min(1, curtainAmount));
  if (reducedMotion) return { coverage: 1, opacity: amount };
  return { coverage: amount, opacity: amount > 0 ? 1 : 0 };
}

export type VisionRideRoomPhase =
  | "idle"
  | "donning"
  | "cruising"
  | "doffing"
  | "returning";

/**
 * Whether the room should keep its post effects (bokeh, shadows, ambient
 * occlusion, tilt shift) and ambient camera life. True through the visible
 * part of the donning flight, false only once the curtain is opaque and
 * while the room is unmounted, and true again from the first frame of the
 * return, which starts under an opaque hold precisely so the effects can
 * remount out of sight.
 */
export function roomEffectsActive(
  phase: VisionRideRoomPhase,
  elapsed: number,
  reducedMotion: boolean,
) {
  if (phase === "idle" || phase === "returning") return true;
  if (phase === "donning")
    return donningPresentation(elapsed, reducedMotion).curtainAmount < 0.999;
  return false;
}

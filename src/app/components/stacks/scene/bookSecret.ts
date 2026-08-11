// Transient state for the Book Notes hidden-room easter egg.
//
// This deliberately mirrors `seated.ts` rather than entering the React store:
// pull distance and reveal progress change every frame, while React only needs
// discrete application state. CameraRig owns the clock; UnitBooks reads the
// same ref later in the render frame, so the bookcase, light, and camera stay
// on a single delta-time timeline.

export type BookSecretPhase =
  | "closed"
  | "pulling-open"
  | "opening"
  | "open"
  | "pulling-close"
  | "closing";

export type BookSecretEvidence = {
  event: "before" | "trigger" | "mid" | "settled" | "return" | "closed";
  phase: BookSecretPhase;
  progress: number;
  pull: number;
  at: number;
};

export type BookSecretChoreography = {
  /** Bookcase latch release and hinged travel. */
  door: number;
  /** Brass threshold / practical lights waking behind the moving case. */
  threshold: number;
  /** The hidden room resolving from silhouette into a readable place. */
  room: number;
  /** Final camera settle after the room is already legible. */
  arrival: number;
};

export type BookSecretRendered = {
  doorAngle: number;
  thresholdZ: number;
  thresholdOpacity: number;
  roomZ: number;
  roomOpacity: number;
  shelfOpacity: number;
  keyLight: number;
  fillLight: number;
  dustOpacity: number;
  shelfVisible: boolean;
  portalVisible: boolean;
  cameraScore: number;
  cameraZ: number;
};

export type BookSecretRenderScore = Omit<
  BookSecretRendered,
  "cameraScore" | "cameraZ" | "portalVisible"
> & {
  visual: BookSecretChoreography;
};

const smootherstep = (value: number) => {
  const x = Math.min(1, Math.max(0, value));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

const windowed = (progress: number, start: number, end: number) =>
  smootherstep((progress - start) / (end - start));

/**
 * One reversible, continuous score shared by the bookcase, practical lights,
 * hidden room, and camera. Keeping the channels separate is intentional: the
 * old reveal switched a fully lit room on as soon as the case moved, which
 * read as a pop. Running this same score backwards gives closing the exact
 * inverse choreography instead of a second set of drifting magic numbers.
 */
export function bookSecretChoreography(
  rawProgress: number,
): BookSecretChoreography {
  const progress = Math.min(1, Math.max(0, rawProgress));
  return {
    door: windowed(progress, 0.015, 0.66),
    threshold: windowed(progress, 0.12, 0.58),
    room: windowed(progress, 0.24, 0.82),
    arrival: windowed(progress, 0.62, 1),
  };
}

/** The actual authored output channels, kept pure so continuity tests measure
 * the same score UnitBooks renders rather than a parallel approximation. */
export function bookSecretRenderScore(
  visualProgress: number,
  reducedMotion: boolean,
): BookSecretRenderScore {
  const progress = Math.min(1, Math.max(0, visualProgress));
  const visual = bookSecretChoreography(progress);
  const { door, threshold, room, arrival } = visual;
  const dissolve = smootherstep(progress);
  const thresholdOpacity = reducedMotion ? dissolve : threshold;
  const roomOpacity = reducedMotion ? dissolve : room;
  return {
    visual,
    doorAngle: reducedMotion ? 0 : -Math.PI * 0.485 * door,
    thresholdZ: reducedMotion ? 0.08 : -0.35 + threshold * 0.43,
    thresholdOpacity,
    roomZ: reducedMotion ? 0 : -0.65 * (1 - room),
    roomOpacity,
    shelfOpacity: reducedMotion ? 1 - dissolve : 1,
    keyLight:
      thresholdOpacity * 0.72 +
      roomOpacity * 3.4 +
      arrival * roomOpacity * 0.95,
    fillLight: roomOpacity * 4.2 + arrival * roomOpacity * 1.2,
    dustOpacity: roomOpacity * 0.48,
    shelfVisible: !reducedMotion || dissolve < 0.999,
  };
}

export const bookSecretRef: {
  phase: BookSecretPhase;
  progress: number;
  /** Render playhead. Usually identical to progress; reduced motion uses a
   * short masked dissolve so the shelf never teleports across the frame. */
  visualProgress: number;
  pull: number;
  /** 0 when idle, otherwise the 0→1 shelf-discovery clue timeline. */
  hintProgress: number;
  reducedMotion: boolean;
  /** Projected trigger centre in canvas CSS pixels, written by its mesh. */
  screen: [number, number] | null;
  returnScreen: [number, number] | null;
  /** Actual last-rendered outputs for continuity/runtime evidence. */
  rendered: BookSecretRendered;
} = {
  phase: "closed",
  progress: 0,
  visualProgress: 0,
  pull: 0,
  hintProgress: 0,
  reducedMotion: false,
  screen: null,
  returnScreen: null,
  rendered: {
    doorAngle: 0,
    thresholdZ: -0.35,
    thresholdOpacity: 0,
    roomZ: -0.65,
    roomOpacity: 0,
    shelfOpacity: 1,
    keyLight: 0,
    fillLight: 0,
    dustOpacity: 0,
    shelfVisible: true,
    portalVisible: false,
    cameraScore: 0,
    cameraZ: 0,
  },
};

let target = 0;
let crossedMid = false;
const REVEAL_SECONDS = 1.72;
const REDUCED_DISSOLVE_SECONDS = 0.28;
const listeners = new Set<() => void>();
const evidence: BookSecretEvidence[] = [];

function now() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function record(event: BookSecretEvidence["event"]) {
  evidence.push({
    event,
    phase: bookSecretRef.phase,
    progress: bookSecretRef.progress,
    pull: bookSecretRef.pull,
    at: now(),
  });
  if (evidence.length > 24) evidence.shift();
}

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeBookSecret(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginBookSecretPull(direction: "open" | "close") {
  if (direction === "open" && bookSecretRef.phase !== "closed") return false;
  if (direction === "close" && bookSecretRef.phase !== "open") return false;
  bookSecretRef.pull = 0;
  bookSecretRef.hintProgress = 0;
  bookSecretRef.phase = direction === "open" ? "pulling-open" : "pulling-close";
  record("before");
  emit();
  return true;
}

/** Empty bookcase wood gives a small, non-spoiling clue toward the odd spine.
 * It never opens the room: discovery and the deliberate pull latch remain two
 * separate actions. */
export function requestBookSecretHint() {
  if (bookSecretRef.phase !== "closed" || bookSecretRef.progress !== 0)
    return false;
  bookSecretRef.hintProgress = 0.001;
  return true;
}

/** Pointer recovery may supersede our own background clue, but no real prop.
 * This explicit priority is what lets the broad shelf surface coexist with a
 * narrow pull handle without bringing back adjacent-cover theft. */
export function allowsBookSecretProjectedRecovery(
  hovered: string | null,
  shelfAffordanceKey: string,
) {
  return hovered === null || hovered === shelfAffordanceKey;
}

/** Once pointer-down has claimed the projected return medallion, commit from
 * pointer travel alone. The camera can still be settling by a few pixels, so
 * re-projecting the moving target on pointer-up makes a stationary tap miss. */
export function commitsBookSecretReturnTap(
  start: { x: number; y: number } | null,
  end: { x: number; y: number },
) {
  return !!start && Math.hypot(end.x - start.x, end.y - start.y) < 6;
}

export function setBookSecretPull(value: number) {
  if (
    bookSecretRef.phase !== "pulling-open" &&
    bookSecretRef.phase !== "pulling-close"
  )
    return;
  bookSecretRef.pull = Math.min(1, Math.max(0, value));
}

export function openBookSecret() {
  if (bookSecretRef.phase === "open" || bookSecretRef.phase === "opening")
    return;
  target = 1;
  crossedMid = false;
  bookSecretRef.pull = 1;
  bookSecretRef.phase = "opening";
  record("trigger");
  emit();
}

export function closeBookSecret() {
  if (bookSecretRef.phase === "closed" || bookSecretRef.phase === "closing")
    return;
  target = 0;
  crossedMid = false;
  bookSecretRef.pull = 0;
  bookSecretRef.phase = "closing";
  record("return");
  emit();
}

/** Release the physical book. Only a deliberate pull beyond the latch wins. */
export function releaseBookSecretPull(commit: boolean) {
  if (bookSecretRef.phase === "pulling-open") {
    if (commit) openBookSecret();
    else {
      bookSecretRef.pull = 0;
      bookSecretRef.phase = "closed";
      emit();
    }
  } else if (bookSecretRef.phase === "pulling-close") {
    if (commit) closeBookSecret();
    else {
      bookSecretRef.pull = 0;
      bookSecretRef.phase = "open";
      emit();
    }
  }
}

/** Advance once per rendered frame. A hidden tab cannot skip the reveal. */
export function tickBookSecret(rawDelta: number) {
  const dt = Math.min(rawDelta, 1 / 30);
  if (bookSecretRef.hintProgress > 0) {
    bookSecretRef.hintProgress += dt / 1.1;
    if (bookSecretRef.hintProgress >= 1) bookSecretRef.hintProgress = 0;
  }
  const moving =
    bookSecretRef.phase === "opening" || bookSecretRef.phase === "closing";
  const visualMoving =
    Math.abs(bookSecretRef.visualProgress - bookSecretRef.progress) > 0.0001;
  if (!moving && !visualMoving) return;

  const previous = bookSecretRef.progress;
  if (moving && bookSecretRef.reducedMotion) {
    bookSecretRef.progress = target;
  } else if (moving) {
    // A fixed-duration linear playhead feeds the eased stage windows above.
    // The previous exponential raced through 81% in 0.48 s, then spent a full
    // second invisibly approaching 1 — technically smooth, visually a pop.
    // This remains delta-time driven while giving every authored beat time to
    // be read, and reversing the target retraces the same score exactly.
    const direction = Math.sign(target - bookSecretRef.progress);
    bookSecretRef.progress = Math.min(
      1,
      Math.max(0, bookSecretRef.progress + (direction * dt) / REVEAL_SECONDS),
    );
  }

  if (bookSecretRef.reducedMotion) {
    const visualDirection = Math.sign(
      bookSecretRef.progress - bookSecretRef.visualProgress,
    );
    bookSecretRef.visualProgress = Math.min(
      1,
      Math.max(
        0,
        bookSecretRef.visualProgress +
          (visualDirection * dt) / REDUCED_DISSOLVE_SECONDS,
      ),
    );
  } else {
    bookSecretRef.visualProgress = bookSecretRef.progress;
  }

  if (
    !crossedMid &&
    ((target === 1 && previous < 0.5 && bookSecretRef.progress >= 0.5) ||
      (target === 0 && previous > 0.5 && bookSecretRef.progress <= 0.5))
  ) {
    crossedMid = true;
    record("mid");
  }

  if (target === 1 && bookSecretRef.progress >= 1) {
    bookSecretRef.progress = 1;
    bookSecretRef.phase = "open";
    record("settled");
    emit();
  } else if (target === 0 && bookSecretRef.progress <= 0) {
    bookSecretRef.progress = 0;
    bookSecretRef.phase = "closed";
    record("closed");
    emit();
  }
}

export function setBookSecretReducedMotion(reduced: boolean) {
  bookSecretRef.reducedMotion = reduced;
}

/** Route/HMR cleanup. Unlike close, this has no animation owner left to tick. */
export function resetBookSecret() {
  target = 0;
  crossedMid = false;
  bookSecretRef.phase = "closed";
  bookSecretRef.progress = 0;
  bookSecretRef.visualProgress = 0;
  bookSecretRef.pull = 0;
  bookSecretRef.hintProgress = 0;
  bookSecretRef.screen = null;
  bookSecretRef.returnScreen = null;
  Object.assign(bookSecretRef.rendered, {
    doorAngle: 0,
    thresholdZ: -0.35,
    thresholdOpacity: 0,
    roomZ: -0.65,
    roomOpacity: 0,
    shelfOpacity: 1,
    keyLight: 0,
    fillLight: 0,
    dustOpacity: 0,
    shelfVisible: true,
    portalVisible: false,
    cameraScore: 0,
    cameraZ: 0,
  });
  emit();
}

export function bookSecretSnapshot() {
  return {
    phase: bookSecretRef.phase,
    progress: bookSecretRef.progress,
    visualProgress: bookSecretRef.visualProgress,
    pull: bookSecretRef.pull,
    hintProgress: bookSecretRef.hintProgress,
    reducedMotion: bookSecretRef.reducedMotion,
    visual: bookSecretChoreography(bookSecretRef.progress),
    rendered: { ...bookSecretRef.rendered },
    screen: bookSecretRef.screen ? [...bookSecretRef.screen] : null,
    returnScreen: bookSecretRef.returnScreen
      ? [...bookSecretRef.returnScreen]
      : null,
    evidence: evidence.map((item) => ({ ...item })),
  };
}

declare global {
  interface Window {
    __bookSecret?: {
      snapshot: typeof bookSecretSnapshot;
      pull: (value: number) => void;
      release: () => void;
      open: typeof openBookSecret;
      close: typeof closeBookSecret;
      hint: typeof requestBookSecretHint;
      step: (seconds: number, frames?: number) => void;
    };
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.__bookSecret = {
    snapshot: bookSecretSnapshot,
    pull: (value: number) => {
      if (bookSecretRef.phase === "closed") beginBookSecretPull("open");
      setBookSecretPull(value);
    },
    release: () => releaseBookSecretPull(bookSecretRef.pull >= 0.7),
    open: openBookSecret,
    close: closeBookSecret,
    hint: requestBookSecretHint,
    step: (seconds, frames = 60) => {
      const count = Math.max(1, Math.round(frames));
      const delta = Math.max(0, seconds) / count;
      for (let i = 0; i < count; i++) tickBookSecret(delta);
    },
  };
}

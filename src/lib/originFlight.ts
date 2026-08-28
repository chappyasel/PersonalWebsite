// The site's one origin-pop vocabulary: a modal records where it was launched
// from (a card's real box, or a small rect around the pointer for a 3D prop,
// which has no DOM box), then flies in from that rect and back to it on
// close. Shared by the daylight sheet, the books modal over the 3D world, and
// the weightlifting sheets, so the motion — and any future fix to it — lands
// everywhere at once.

const KEY = "modal-flight-origin";
const FRESH_MS = 3000;

// One flight tune for every modal. Entrance/exit pair: a springy grow-in, a
// quicker accelerating return.
const SCALE_FLOOR = 0.08;
const ENTRANCE_MS = 460;
const ENTRANCE_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const ENTRANCE_FROM_OPACITY = 0.3;
const EXIT_MS = 340;
const EXIT_EASE = "cubic-bezier(0.7, 0, 0.84, 0)";
const EXIT_TO_OPACITY = 0.2;
const BACKDROP_FADE_MS = 300;

// The module tracks the pointer itself: callers live in gesture systems with
// their own private state (links.tsx's `down`, Grabbable's `gesture`), and
// borrowing any one of them silently fails for the others. One capture-phase
// listener, installed when this module first loads on the client.
const pointer = { x: 0, y: 0 };
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    },
    { capture: true, passive: true },
  );
}

export type ModalOrigin = { l: number; t: number; w: number; h: number };

/** Record a source rect centered on the last pointer-down — the stand-in for
 * launchers with no DOM box (3D props, doors, covers). */
export function recordModalOriginAtPointer(width = 140, height = 180) {
  if (!pointer.x && !pointer.y) return;
  recordModalOrigin({
    left: pointer.x - width / 2,
    top: pointer.y - height / 2,
    width,
    height,
  });
}

// sessionStorage because the record has to survive the soft navigation into
// an intercepted route.
export function recordModalOrigin(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        l: rect.left,
        t: rect.top,
        w: rect.width,
        h: rect.height,
        ts: Date.now(),
      }),
    );
  } catch {
    // Storage blocked: the modal falls back to its centered entrance.
  }
}

export function takeModalOrigin(): ModalOrigin | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const origin = JSON.parse(raw) as ModalOrigin & { ts: number };
    if (Date.now() - origin.ts > FRESH_MS) return null;
    return origin;
  } catch {
    return null;
  }
}

function flightDelta(shell: HTMLElement, origin: ModalOrigin) {
  const final = shell.getBoundingClientRect();
  if (final.width === 0) return null;
  return {
    scale: Math.max(origin.w / final.width, SCALE_FLOOR),
    dx: origin.l + origin.w / 2 - (final.left + final.width / 2),
    dy: origin.t + origin.h / 2 - (final.top + final.height / 2),
  };
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Fly the shell in from its origin rect. WAAPI over the framer transition —
 * the final rect can be measured untransformed, and while the animation runs
 * WAAPI owns transform/opacity, so the two never fight (both land on
 * identity). Call before paint (useLayoutEffect) so the shell never flashes
 * at rest first. Returns false — reduced motion, or an unmeasurable shell —
 * when the caller's own entrance should stand.
 */
export function originEntrance(shell: HTMLElement, origin: ModalOrigin) {
  if (reducedMotion()) return false;
  const delta = flightDelta(shell, origin);
  if (!delta) return false;
  shell.animate(
    [
      {
        transform: `translate(${delta.dx}px, ${delta.dy}px) scale(${delta.scale})`,
        opacity: ENTRANCE_FROM_OPACITY,
      },
      { transform: "none", opacity: 1 },
    ],
    { duration: ENTRANCE_MS, easing: ENTRANCE_EASE },
  );
  return true;
}

/**
 * Reverse of the entrance: the shell returns to its source rect while the
 * backdrop fades, then `onFinish` runs (typically the history pop). Both
 * animations fill forwards so nothing snaps back before teardown. Returns
 * false when the caller should close its own way instead.
 */
export function originExit(
  shell: HTMLElement,
  origin: ModalOrigin,
  backdrop: HTMLElement | null,
  onFinish: () => void,
) {
  if (reducedMotion()) return false;
  const delta = flightDelta(shell, origin);
  if (!delta) return false;
  backdrop?.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: BACKDROP_FADE_MS,
    easing: "ease",
    fill: "forwards",
  });
  const flight = shell.animate(
    [
      { transform: "none", opacity: 1 },
      {
        transform: `translate(${delta.dx}px, ${delta.dy}px) scale(${delta.scale})`,
        opacity: EXIT_TO_OPACITY,
      },
    ],
    { duration: EXIT_MS, easing: EXIT_EASE, fill: "forwards" },
  );
  flight.onfinish = onFinish;
  return true;
}

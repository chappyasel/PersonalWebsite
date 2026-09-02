export const VISION_RIDE_TOUCH = {
  dragThresholdPx: 10,
  /** Drag this fraction of the viewport to reach full camera travel. */
  fullTravelViewportFraction: 0.32,
  /** Ignore the synthetic click browsers emit after a completed drag. */
  suppressClickMs: 500,
} as const;

type TouchSnapshot = Readonly<{
  engaged: boolean;
  active: boolean;
  dragged: boolean;
  x: number;
  y: number;
}>;

const neutralSnapshot: TouchSnapshot = Object.freeze({
  engaged: false,
  active: false,
  dragged: false,
  x: 0,
  y: 0,
});

let startX = 0;
let startY = 0;
let snapshot = neutralSnapshot;

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export function visionRideTouchAxes(input: {
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  width: number;
  height: number;
}) {
  const dx = input.clientX - input.startX;
  const dy = input.clientY - input.startY;
  const dragged = Math.hypot(dx, dy) >= VISION_RIDE_TOUCH.dragThresholdPx;
  if (!dragged || input.width <= 0 || input.height <= 0)
    return { dragged, x: 0, y: 0 } as const;
  const travel = VISION_RIDE_TOUCH.fullTravelViewportFraction;
  const x = clamp(dx / (input.width * travel));
  const y = clamp(-dy / (input.height * travel));
  return {
    dragged,
    x: x === 0 ? 0 : x,
    y: y === 0 ? 0 : y,
  } as const;
}

/**
 * Mutable input handoff between the DOM control and the lazily mounted ride
 * world. Pointer moves must not publish through React or Zustand at 60 Hz.
 */
export const visionRideTouchRuntime = {
  begin(clientX: number, clientY: number) {
    startX = clientX;
    startY = clientY;
    snapshot = {
      engaged: true,
      active: true,
      dragged: false,
      x: 0,
      y: 0,
    };
  },
  move(clientX: number, clientY: number, width: number, height: number) {
    if (!snapshot.active) return snapshot;
    const axes = visionRideTouchAxes({
      startX,
      startY,
      clientX,
      clientY,
      width,
      height,
    });
    snapshot = {
      engaged: true,
      active: true,
      dragged: snapshot.dragged || axes.dragged,
      x: axes.x,
      y: axes.y,
    };
    return snapshot;
  },
  end() {
    const dragged = snapshot.dragged;
    snapshot = {
      engaged: snapshot.engaged,
      active: false,
      dragged: false,
      x: 0,
      y: 0,
    };
    return dragged;
  },
  abandon() {
    snapshot = neutralSnapshot;
  },
  getSnapshot: () => snapshot,
  reset() {
    startX = 0;
    startY = 0;
    snapshot = neutralSnapshot;
  },
};

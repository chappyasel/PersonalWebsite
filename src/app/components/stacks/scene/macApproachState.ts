// The Mac's approach, on the shared prop-approach controller
// (propApproachState.ts). This module keeps the Mac's names so its screen,
// its carrier and its tests read as they always did.
import {
  PROP_APPROACH_DISMISS_GRACE_MS,
  PROP_APPROACH_FILL,
  PROP_APPROACH_FOLLOW,
  PROP_APPROACH_LAMBDA,
  PROP_APPROACH_MIN_DISTANCE,
  PROP_APPROACH_RELEASE_TRAVEL,
  createPropApproach,
  propApproachDistance,
  propApproachReleased,
  usePropApproachNear,
} from "./propApproachState";

export const MAC_APPROACH_FILL = PROP_APPROACH_FILL;
export const MAC_APPROACH_MIN_DISTANCE = PROP_APPROACH_MIN_DISTANCE;
export const MAC_APPROACH_RELEASE_TRAVEL = PROP_APPROACH_RELEASE_TRAVEL;
export const MAC_APPROACH_LAMBDA = PROP_APPROACH_LAMBDA;
export const MAC_APPROACH_FOLLOW = PROP_APPROACH_FOLLOW;
export const MAC_APPROACH_DISMISS_GRACE_MS = PROP_APPROACH_DISMISS_GRACE_MS;

// Keyed by the carrier's hover key: while the Mac is up, only it may hover.
export const macApproach = createPropApproach("action:projects:mac");

export function useMacApproachNear(): boolean {
  return usePropApproachNear(macApproach);
}

export const macApproachDistance = propApproachDistance;
export const macApproachReleased = propApproachReleased;

// The Weightlifting icon's approach, on the shared prop-approach controller
// (propApproachState.ts), exactly as the Homework icon's. Keyed by the
// carrier's hover key: while the tile is up, only it may hover. A drag on the
// near tile turns it by hand through `weightliftingTurn` (beginPropTurn).
//
// The tile used to be a Portal straight to the App Store. Up close the tap
// is spoken for, so the store is offered as a button under the tile instead
// (the controller's `link`, drawn by dom/PropCaption.tsx). No caption: the
// owner wanted the link alone, not a description (2026-09-11).
import { createPropApproach, createPropTurn } from "./propApproachState";

export const weightliftingApproach = createPropApproach(
  "action:projects:weightlifting",
  {
    link: {
      href: "https://apps.apple.com/us/app/id1266077653",
      label: "App Store",
    },
  },
);
export const weightliftingTurn = createPropTurn();

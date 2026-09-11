// The Projects Apple mark's approach, on the shared prop-approach controller
// (propApproachState.ts). Keyed by the carrier's hover key so only the near
// mark may hover and shimmer. A drag on the near mark turns it by hand
// through `appleTurn`. It used to be a Portal to apple.com; that link is now
// the button under the mark while it is up (the controller's `link`).
import { createPropApproach, createPropTurn } from "./propApproachState";

export const appleApproach = createPropApproach("shimmer:apple", {
  link: { href: "https://www.apple.com/", label: "apple.com" },
});
export const appleTurn = createPropTurn();

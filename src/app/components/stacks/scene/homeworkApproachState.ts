// The Homework icon's approach, on the shared prop-approach controller
// (propApproachState.ts). Keyed by the carrier's hover key: while the tile is
// up, only it may hover. A drag on the near tile turns it by hand through
// `homeworkTurn` (beginPropTurn).
import { createPropApproach, createPropTurn } from "./propApproachState";

export const homeworkApproach = createPropApproach("action:projects:homework");
export const homeworkTurn = createPropTurn();

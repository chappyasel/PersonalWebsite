export const TRAINING_BOARD_SIZE = {
  width: 1.128,
  height: 0.792,
  frameInset: 0.03,
} as const;

export type TrainingBoardCard = {
  x: number;
  y: number;
  width: number;
  height: number;
  roll: number;
};

export type TrainingBoardPin = TrainingBoardCard & {
  id:
    | "training-trophy-side-v8"
    | "training-stage-kneeling-v8"
    | "training-stage-side-v8"
    | "training-trophy-front-v8";
  src: string;
};

/** The portrait anchors the left side. The smaller prints wander a little in
 * height and angle, while retaining enough space for their white mounts and
 * the board frame. Coordinates are local to the center of the corkboard. */
export const TRAINING_PINS: readonly TrainingBoardPin[] = [
  {
    id: "training-trophy-side-v8",
    src: "/images/stacks/v8/training-trophy-side.webp",
    x: -0.325,
    y: -0.006,
    width: 0.36,
    height: 0.64,
    roll: -0.024,
  },
  {
    id: "training-stage-kneeling-v8",
    src: "/images/stacks/v8/training-stage-kneeling.webp",
    x: -0.02,
    y: 0.184,
    width: 0.17,
    height: 0.25,
    roll: 0.036,
  },
  {
    id: "training-stage-side-v8",
    src: "/images/stacks/v8/training-stage-side.webp",
    x: 0.18,
    y: 0.162,
    width: 0.17,
    height: 0.25,
    roll: -0.028,
  },
  {
    id: "training-trophy-front-v8",
    src: "/images/stacks/v8/training-trophy-front.webp",
    x: 0.41,
    y: 0.181,
    width: 0.17,
    height: 0.25,
    roll: 0.044,
  },
];

export const TRAINING_FIGURE_CARD_LAYOUT = [
  {
    x: 0.02,
    top: 0.012,
    width: 0.26,
    heightRatio: 579 / 972,
    roll: -0.012,
  },
  {
    x: 0.33,
    top: 0.012,
    width: 0.26,
    heightRatio: 568 / 964,
    roll: 0.015,
  },
  {
    x: 0.175,
    top: -0.166,
    width: 0.225,
    heightRatio: 1600 / 2000,
    roll: -0.01,
  },
] as const;

/** Axis-aligned bounds of a card after its authored roll. */
export function trainingBoardCardBounds(
  card: TrainingBoardCard,
  mountBorder = 0.018,
) {
  const outerWidth = card.width + mountBorder;
  const outerHeight = card.height + mountBorder;
  const cosine = Math.abs(Math.cos(card.roll));
  const sine = Math.abs(Math.sin(card.roll));
  const halfWidth = (outerWidth * cosine + outerHeight * sine) / 2;
  const halfHeight = (outerWidth * sine + outerHeight * cosine) / 2;

  return {
    left: card.x - halfWidth,
    right: card.x + halfWidth,
    bottom: card.y - halfHeight,
    top: card.y + halfHeight,
  };
}

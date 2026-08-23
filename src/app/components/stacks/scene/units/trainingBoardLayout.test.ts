import { describe, expect, it } from "vitest";

import {
  TRAINING_BOARD_SIZE,
  TRAINING_FIGURE_CARD_LAYOUT,
  TRAINING_PINS,
  trainingBoardCardBounds,
} from "./trainingBoardLayout";

describe("training board layout", () => {
  it("keeps every photo and figure card inside the frame inset", () => {
    const cards = [
      ...TRAINING_PINS,
      ...TRAINING_FIGURE_CARD_LAYOUT.map((placement) => {
        const height = placement.width * placement.heightRatio;
        return {
          ...placement,
          y: placement.top - height / 2,
          height,
        };
      }),
    ];
    const horizontalLimit =
      TRAINING_BOARD_SIZE.width / 2 - TRAINING_BOARD_SIZE.frameInset;
    const verticalLimit =
      TRAINING_BOARD_SIZE.height / 2 - TRAINING_BOARD_SIZE.frameInset;

    for (const card of cards) {
      const bounds = trainingBoardCardBounds(card);
      expect(bounds.left).toBeGreaterThanOrEqual(-horizontalLimit);
      expect(bounds.right).toBeLessThanOrEqual(horizontalLimit);
      expect(bounds.bottom).toBeGreaterThanOrEqual(-verticalLimit);
      expect(bounds.top).toBeLessThanOrEqual(verticalLimit);
    }
  });

  it("gives the photo row varied height and angle", () => {
    expect(new Set(TRAINING_PINS.map((pin) => pin.y)).size).toBeGreaterThan(2);
    expect(new Set(TRAINING_PINS.map((pin) => pin.roll)).size).toBe(
      TRAINING_PINS.length,
    );
  });

  it("keeps coplanar cards from overlapping", () => {
    const cards = [
      ...TRAINING_PINS,
      ...TRAINING_FIGURE_CARD_LAYOUT.map((placement) => {
        const height = placement.width * placement.heightRatio;
        return {
          ...placement,
          y: placement.top - height / 2,
          height,
        };
      }),
    ].map((card) => trainingBoardCardBounds(card));

    for (let index = 0; index < cards.length; index += 1) {
      for (let other = index + 1; other < cards.length; other += 1) {
        const first = cards[index]!;
        const second = cards[other]!;
        const overlaps =
          first.left < second.right &&
          first.right > second.left &&
          first.bottom < second.top &&
          first.top > second.bottom;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("stacks the graphs as two larger cards above one", () => {
    const [upperLeft, upperRight, lower] = TRAINING_FIGURE_CARD_LAYOUT;
    expect(upperLeft.top).toBe(upperRight.top);
    expect(lower.top).toBeLessThan(upperLeft.top);
    expect(upperLeft.width).toBeGreaterThan(0.188);
    expect(upperRight.width).toBeGreaterThan(0.188);
    expect(lower.width).toBeGreaterThan(0.188);
  });
});

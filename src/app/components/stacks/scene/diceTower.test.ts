import { describe, expect, it } from "vitest";

import {
  DICE_PROP_KEY_PREFIX,
  type DiceTowerCandidate,
  isDiceTower,
} from "./diceTower";

const DIE = 0.16;
const IDS = [
  "bottom-left",
  "bottom-center",
  "bottom-right",
  "middle-left",
  "middle-right",
  "top",
] as const;

function die(
  index: number,
  overrides: Partial<DiceTowerCandidate> = {},
): DiceTowerCandidate {
  return {
    key: `${DICE_PROP_KEY_PREFIX}${IDS[index]!}`,
    x: 0,
    y: index * DIE,
    z: 0,
    size: DIE,
    resting: true,
    ...overrides,
  };
}

function tower(overrides: ReadonlyMap<number, Partial<DiceTowerCandidate>>) {
  return IDS.map((_, index) => die(index, overrides.get(index)));
}

describe("dice tower detection", () => {
  it("accepts a straight six-die column at rest", () => {
    expect(isDiceTower(tower(new Map()))).toBe(true);
  });

  it("rejects a column with too much horizontal drift to be supported", () => {
    expect(isDiceTower(tower(new Map([[3, { x: 0.14 }]])))).toBe(false);
  });

  it("accepts small drift within one die of support", () => {
    expect(
      isDiceTower(
        tower(
          new Map([
            [1, { x: 0.03, z: -0.02 }],
            [3, { x: 0.05 }],
          ]),
        ),
      ),
    ).toBe(true);
  });

  it("rejects the authored pyramid", () => {
    const positions = [
      { x: -DIE, y: 0 },
      { x: 0, y: 0 },
      { x: DIE, y: 0 },
      { x: -DIE / 2, y: DIE },
      { x: DIE / 2, y: DIE },
      { x: 0, y: 2 * DIE },
    ];
    expect(
      isDiceTower(IDS.map((_, index) => die(index, positions[index]))),
    ).toBe(false);
  });

  it("rejects a tower while any die is held or settling", () => {
    expect(isDiceTower(tower(new Map([[5, { resting: false }]])))).toBe(false);
  });

  it("rejects five dynamic dice stacked on an untouched base", () => {
    expect(isDiceTower(tower(new Map()).slice(1))).toBe(false);
  });

  it("rejects a column that skips a level", () => {
    expect(isDiceTower(tower(new Map([[5, { y: 7 * DIE }]])))).toBe(false);
  });

  it("ignores props that are not dice", () => {
    expect(
      isDiceTower([
        ...tower(new Map()),
        { key: "grab:mug", x: 0, y: 6 * DIE, z: 0, size: DIE, resting: true },
      ]),
    ).toBe(true);
  });
});

import { Group } from "three";
import { describe, expect, it } from "vitest";

import {
  MASS_HANDLING,
  cursorForInteraction,
  destinationFor,
  doorDisplayLabel,
  doorLabelActivation,
  getSceneInteraction,
  massClassFor,
  registerSceneInteraction,
} from "./interactionRegistry";

describe("scene interaction registry", () => {
  it("derives route labels, hrefs, and external treatment together", () => {
    expect(destinationFor("weightlifting").label).toBe("Open Weightlifting");
    expect(destinationFor("blog").label).toBe("Open Medium");
    expect(destinationFor("manual")).toMatchObject({
      href: "/manual",
      external: false,
    });
    expect(
      doorDisplayLabel({
        kind: "door",
        label: "View on LinkedIn ↗",
        external: true,
      }),
    ).toBe("View on LinkedIn ↗");
  });

  it("gives a movable Door its higher-priority click cursor", () => {
    const release = registerSceneInteraction({
      id: "test:movable-door",
      root: new Group(),
      activeUnits: [2],
      movable: { massKg: 0.9, massClass: "light" },
      activation: {
        kind: "door",
        label: "Open Weightlifting",
        external: false,
      },
    });
    expect(cursorForInteraction("test:movable-door", null)).toBe("pointer");
    expect(cursorForInteraction("test:movable-door", "test:movable-door")).toBe(
      "grabbing",
    );
    release();
    expect(cursorForInteraction("test:movable-door", null)).toBe("");
  });

  it("gives local actions the same label and cursor priority as clicks", () => {
    const release = registerSceneInteraction({
      id: "test:action",
      root: new Group(),
      activeUnits: [0],
      movable: { massKg: 0.62, massClass: "light" },
      activation: {
        kind: "action",
        label: "Launch golf ball",
        run: () => undefined,
      },
    });
    expect(getSceneInteraction("test:action")?.activation?.kind).toBe("action");
    expect(cursorForInteraction("test:action", null)).toBe("pointer");
    expect(
      doorLabelActivation(getSceneInteraction("test:action")),
    ).toMatchObject({ kind: "action", label: "Launch golf ball" });
    release();
  });

  it("allows physical controls to suppress their redundant label", () => {
    const release = registerSceneInteraction({
      id: "test:quiet-action",
      root: new Group(),
      activeUnits: [2],
      showLabel: false,
      activation: {
        kind: "action",
        label: "Swing club",
        run: () => undefined,
      },
    });
    expect(
      doorLabelActivation(getSceneInteraction("test:quiet-action")),
    ).toBeNull();
    release();
  });

  it("gives golf controls a cursor without registering a label capability", () => {
    expect(cursorForInteraction("golf-club:strike", null)).toBe("pointer");
    expect(cursorForInteraction("golf-ball:one", null)).toBe("pointer");
    expect(getSceneInteraction("golf-club:strike")).toBeNull();
    expect(getSceneInteraction("golf-ball:one")).toBeNull();
  });

  it("merges capabilities registered by nested scene components", () => {
    const carrier = new Group();
    const releaseMovable = registerSceneInteraction({
      id: "test:nested-clock",
      root: carrier,
      activeUnits: [3],
      movable: { massKg: 0.45, massClass: "light" },
    });
    const releaseEgg = registerSceneInteraction({
      id: "test:nested-clock",
      root: new Group(),
      activeUnits: [3],
      activation: {
        kind: "egg",
        run: () => undefined,
        reducedMotion: "state-only",
      },
    });
    expect(getSceneInteraction("test:nested-clock")).toMatchObject({
      root: carrier,
      movable: { massKg: 0.45 },
      activation: { kind: "egg" },
    });
    releaseEgg();
    expect(
      getSceneInteraction("test:nested-clock")?.activation,
    ).toBeUndefined();
    releaseMovable();
  });

  it("makes handling monotonically heavier across the mass classes", () => {
    expect([0.25, 2, 12, 60].map(massClassFor)).toEqual([
      "light",
      "medium",
      "heavy",
      "massive",
    ]);
    const handling = [
      MASS_HANDLING.light,
      MASS_HANDLING.medium,
      MASS_HANDLING.heavy,
      MASS_HANDLING.massive,
    ];
    for (let index = 1; index < handling.length; index += 1) {
      expect(handling[index]!.followLambda).toBeLessThan(
        handling[index - 1]!.followLambda,
      );
      expect(handling[index]!.maxRaise).toBeLessThan(
        handling[index - 1]!.maxRaise,
      );
      expect(handling[index]!.throwTilt).toBeLessThan(
        handling[index - 1]!.throwTilt,
      );
    }
    expect(
      handling.map(({ maxRaise, minDrop }) => [maxRaise, minDrop]),
    ).toEqual([
      [1.5, -1.5],
      [1, -1.5],
      [0.6, -1.2],
      [0.25, -0.5],
    ]);
  });
});

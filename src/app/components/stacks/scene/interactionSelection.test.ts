import { recordFieldNoteEvent } from "../fieldNotes/progress";
import { useStacks } from "../store";
import { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type SceneInteractionSpec,
  registerSceneInteraction,
} from "./interactionRegistry";
import {
  activateTouchSceneInteraction,
  selectOrActivateSceneInteraction,
} from "./interactionSelection";

vi.mock("../fieldNotes/progress", () => ({ recordFieldNoteEvent: vi.fn() }));

const releases: Array<() => void> = [];
let now = 1_000;

function register(id: string, overrides: Partial<SceneInteractionSpec> = {}) {
  const run = vi.fn();
  releases.push(
    registerSceneInteraction({
      id,
      root: new Group(),
      activeUnits: [0],
      activation: { kind: "portal", label: id, external: true, run },
      ...overrides,
    }),
  );
  return run;
}

beforeEach(() => {
  now = 1_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  useStacks.setState({
    focusedInteraction: null,
    focusedInteractionAt: 0,
    hovered: null,
  });
  vi.mocked(recordFieldNoteEvent).mockClear();
});

afterEach(() => {
  releases.splice(0).forEach((release) => release());
  vi.restoreAllMocks();
});

describe("shelf selection", () => {
  it.each([true, false])(
    "previews a portal before activating, external=%s",
    (external) => {
      const run = vi.fn();
      register("link", {
        activation: { kind: "portal", label: "Link", external, run },
      });
      useStacks.getState().setHovered("link");
      expect(selectOrActivateSceneInteraction("link")).toBe(true);
      expect(useStacks.getState().focusedInteraction).toBe("link");
      expect(run).not.toHaveBeenCalled();
      expect(recordFieldNoteEvent).not.toHaveBeenCalled();
      now += 500;
      expect(selectOrActivateSceneInteraction("link")).toBe(true);
      expect(run).toHaveBeenCalledOnce();
      expect(recordFieldNoteEvent).toHaveBeenCalledOnce();
    },
  );

  it("keeps a rapid double-click selected and allows a later click", () => {
    const run = register("link");
    selectOrActivateSceneInteraction("link");
    now += 180;
    selectOrActivateSceneInteraction("link");
    expect(run).not.toHaveBeenCalled();
    now += 500;
    selectOrActivateSceneInteraction("link");
    expect(run).toHaveBeenCalledOnce();
  });

  it("transfers selection without activating and ignores intervening hover", () => {
    const first = register("first");
    const second = register("second");
    selectOrActivateSceneInteraction("first");
    now += 500;
    useStacks.getState().setHovered("second");
    expect(useStacks.getState().focusedInteraction).toBe("first");
    selectOrActivateSceneInteraction("second");
    expect(useStacks.getState().focusedInteraction).toBe("second");
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it("requires fresh selection after dismissal without expiring an undisturbed selection", () => {
    const run = register("link");
    selectOrActivateSceneInteraction("link");
    now += 60_000;
    useStacks.getState().setFocusedInteraction(null);
    selectOrActivateSceneInteraction("link");
    expect(run).not.toHaveBeenCalled();
    now += 60_000;
    selectOrActivateSceneInteraction("link");
    expect(run).toHaveBeenCalledOnce();
  });

  it.each(["artifact", "action", "egg"] as const)(
    "preserves immediate desktop %s behavior",
    (kind) => {
      const run = vi.fn();
      register("local", {
        activation: {
          kind,
          label: "Inspect",
          reducedMotion: "state-only",
          run,
        },
      });
      useStacks.getState().setFocusedInteraction("old");
      selectOrActivateSceneInteraction("local");
      expect(run).toHaveBeenCalledOnce();
      expect(useStacks.getState().focusedInteraction).toBeNull();
    },
  );

  it("previews an immersive action before starting it", () => {
    const run = vi.fn();
    register("ride", {
      previewBeforeActivation: true,
      activation: { kind: "action", label: "Start ride", run },
    });
    selectOrActivateSceneInteraction("ride");
    expect(run).not.toHaveBeenCalled();
    now += 500;
    selectOrActivateSceneInteraction("ride");
    expect(run).toHaveBeenCalledOnce();
  });

  it("selects a bare movable while allowing the hittable-ball fallback", () => {
    register("ball", {
      activation: undefined,
      movable: { massKg: 1, massClass: "light" },
    });
    expect(selectOrActivateSceneInteraction("ball")).toBe(false);
    expect(useStacks.getState().focusedInteraction).toBe("ball");
    expect(activateTouchSceneInteraction("ball")).toBe(false);
  });

  it("guards rapid second touch taps without blocking later activation", () => {
    const run = register("link");
    useStacks.getState().setFocusedInteraction("link");
    now += 150;
    expect(activateTouchSceneInteraction("link")).toBe(true);
    expect(run).not.toHaveBeenCalled();
    now += 500;
    activateTouchSceneInteraction("link");
    expect(run).toHaveBeenCalledOnce();
  });

  it("keeps authored immediate touch inspections immediate", () => {
    const run = register("photo", { activateOnFirstTouch: true });
    activateTouchSceneInteraction("photo");
    expect(run).toHaveBeenCalledOnce();
  });
});

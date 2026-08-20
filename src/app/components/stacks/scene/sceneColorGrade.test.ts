import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CINEMATIC_PLUS_SCENE_COLOR_GRADE,
  DEFAULT_SCENE_COLOR_GRADE,
  sceneColorGradeController,
  sceneColorGradeFor,
} from "./sceneColorGrade";

describe("scene color grade diagnostics", () => {
  afterEach(() => sceneColorGradeController.reset());

  it("starts from the production light and dark grade", () => {
    expect(sceneColorGradeController.getSnapshot()).toBe(
      DEFAULT_SCENE_COLOR_GRADE,
    );
    expect(DEFAULT_SCENE_COLOR_GRADE.light).toMatchObject({
      exposure: 1.1,
      curve: 0.22,
      toeTint: 0,
      chromaBoost: 0.4,
      vignette: 0.45,
    });
    expect(DEFAULT_SCENE_COLOR_GRADE.dark.exposure).toBe(1.32);
    expect(DEFAULT_SCENE_COLOR_GRADE.dark.curve).toBe(0.16);
  });

  it("updates one theme without changing the other", () => {
    const original = sceneColorGradeController.getSnapshot();

    sceneColorGradeController.update("dark", {
      vignette: 0.35,
    });

    const updated = sceneColorGradeController.getSnapshot();
    expect(updated.dark.vignette).toBe(0.35);
    expect(updated.light).toBe(original.light);
  });

  it("notifies live consumers and resets every override", () => {
    const listener = vi.fn();
    const unsubscribe = sceneColorGradeController.subscribe(listener);

    sceneColorGradeController.update("light", { chromaBoost: 0.1 });
    sceneColorGradeController.reset();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(sceneColorGradeController.getSnapshot()).toBe(
      DEFAULT_SCENE_COLOR_GRADE,
    );
    unsubscribe();
  });

  it("keeps the brighter Cinematic+ print session-local", () => {
    const production = sceneColorGradeController.getSnapshot();

    expect(sceneColorGradeFor(production, true)).toBe(
      CINEMATIC_PLUS_SCENE_COLOR_GRADE,
    );
    expect(sceneColorGradeFor(production, false)).toBe(production);
    expect(sceneColorGradeController.getSnapshot()).toBe(production);
  });
});

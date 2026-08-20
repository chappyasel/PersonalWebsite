"use client";

import { useSyncExternalStore } from "react";

export type SceneColorGradeThemeSettings = Readonly<{
  exposure: number;
  curve: number;
  toeTint: number;
  chromaBoost: number;
  vignette: number;
}>;

export type SceneColorGradeSettings = Readonly<{
  light: SceneColorGradeThemeSettings;
  dark: SceneColorGradeThemeSettings;
}>;

export type SceneColorGradeTheme = keyof SceneColorGradeSettings;

/**
 * The shipped grade. Diagnostics edits never mutate this object and are not
 * persisted, so reloading always restores the production treatment.
 */
export const DEFAULT_SCENE_COLOR_GRADE: SceneColorGradeSettings = Object.freeze(
  {
    light: Object.freeze({
      exposure: 1.1,
      curve: 0.22,
      toeTint: 0,
      chromaBoost: 0.4,
      vignette: 0.45,
    }),
    dark: Object.freeze({
      exposure: 1.32,
      curve: 0.16,
      toeTint: 0.032,
      chromaBoost: 0.16,
      vignette: 0.5,
    }),
  },
);

/** A brighter, gentler print inspired by the late-morning OG comparison.
 * Scene Diagnostics applies it only while Cinematic+ is selected. */
export const CINEMATIC_PLUS_SCENE_COLOR_GRADE: SceneColorGradeSettings =
  Object.freeze({
    light: Object.freeze({
      exposure: 1.24,
      curve: 0.12,
      toeTint: 0.018,
      chromaBoost: 0.24,
      vignette: 0.28,
    }),
    dark: Object.freeze({
      exposure: 1.4,
      curve: 0.14,
      toeTint: 0.038,
      chromaBoost: 0.18,
      vignette: 0.4,
    }),
  });

export function sceneColorGradeFor(
  settings: SceneColorGradeSettings,
  cinematicPlus: boolean,
): SceneColorGradeSettings {
  return cinematicPlus ? CINEMATIC_PLUS_SCENE_COLOR_GRADE : settings;
}

class SceneColorGradeController {
  private snapshot = DEFAULT_SCENE_COLOR_GRADE;
  private listeners = new Set<() => void>();

  readonly getSnapshot = () => this.snapshot;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(
    theme: SceneColorGradeTheme,
    patch: Partial<SceneColorGradeThemeSettings>,
  ) {
    const nextTheme = { ...this.snapshot[theme], ...patch };
    if (
      Object.keys(nextTheme).every((key) =>
        Object.is(
          nextTheme[key as keyof SceneColorGradeThemeSettings],
          this.snapshot[theme][key as keyof SceneColorGradeThemeSettings],
        ),
      )
    )
      return;

    this.snapshot = { ...this.snapshot, [theme]: nextTheme };
    for (const listener of this.listeners) listener();
  }

  reset() {
    if (this.snapshot === DEFAULT_SCENE_COLOR_GRADE) return;
    this.snapshot = DEFAULT_SCENE_COLOR_GRADE;
    for (const listener of this.listeners) listener();
  }
}

export const sceneColorGradeController = new SceneColorGradeController();

export function useSceneColorGradeSettings() {
  return useSyncExternalStore(
    sceneColorGradeController.subscribe,
    sceneColorGradeController.getSnapshot,
    sceneColorGradeController.getSnapshot,
  );
}

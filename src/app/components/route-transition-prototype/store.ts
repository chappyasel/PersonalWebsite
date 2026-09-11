import { create } from "zustand";

export const VARIANTS = [
  "origin",
  "shutters",
  "swipe",
  "cards",
  "bookshelf",
] as const;
export type TransitionVariant = (typeof VARIANTS)[number];

// Source zoom is the shipped effect. Comparison variants remain local-only.
export const useRouteTransitionPrototype = create<{
  enabled: boolean;
  variant: TransitionVariant;
  deferSceneStartup: boolean;
}>(() => ({
  enabled: true,
  variant: "origin",
  deferSceneStartup: false,
}));

export function setPrototypeEnabled(enabled: boolean) {
  useRouteTransitionPrototype.setState({
    enabled,
    ...(!enabled ? { deferSceneStartup: false } : {}),
  });
}

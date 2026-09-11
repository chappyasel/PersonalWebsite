import { create } from "zustand";

export const VARIANTS = [
  "origin",
  "shutters",
  "swipe",
  "cards",
  "bookshelf",
] as const;
export type TransitionVariant = (typeof VARIANTS)[number];

// Throwaway comparison on the real routes. No persisted debug overrides.
export const useRouteTransitionPrototype = create<{
  enabled: boolean;
  variant: TransitionVariant;
  deferSceneStartup: boolean;
}>(() => ({
  enabled: process.env.NODE_ENV === "development",
  variant: "origin",
  deferSceneStartup: false,
}));

export function setPrototypeEnabled(enabled: boolean) {
  useRouteTransitionPrototype.setState({
    enabled,
    ...(!enabled ? { deferSceneStartup: false } : {}),
  });
}

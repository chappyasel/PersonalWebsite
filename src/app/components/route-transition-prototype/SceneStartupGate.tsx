"use client";

import { type ReactNode } from "react";

import { useRouteTransitionPrototype } from "./store";

// Do not mount or import the WebGL scene while the incoming snapshot moves.
// The ordinary boot screen and its readiness gates remain in charge afterward.
export function SceneStartupGate({ children }: { children: ReactNode }) {
  const deferred = useRouteTransitionPrototype(
    (state) => state.enabled && state.deferSceneStartup,
  );
  return deferred ? null : children;
}

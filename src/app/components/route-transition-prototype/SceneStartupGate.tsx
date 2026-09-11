"use client";

import { type ReactNode, useEffect, useState } from "react";

import { useRouteTransitionPrototype } from "./store";

// Do not mount or import the WebGL scene while the incoming snapshot moves.
// The ordinary boot screen and its readiness gates remain in charge afterward.
export function SceneStartupGate({ children }: { children: ReactNode }) {
  const deferred = useRouteTransitionPrototype(
    (state) => state.enabled && state.deferSceneStartup,
  );
  const [started, setStarted] = useState(!deferred);
  useEffect(() => {
    if (!deferred) setStarted(true);
  }, [deferred]);
  // Deferral only delays a new canvas. A parked room must stay mounted.
  return started || !deferred ? children : null;
}

"use client";

import { useStore } from "@react-three/fiber";
import { useLayoutEffect } from "react";

import { preserveSceneClock } from "./sceneClock";

/** Attach to an existing canvas too, including after a development update. */
export default function SceneClockBoundary() {
  const store = useStore();
  useLayoutEffect(() => preserveSceneClock(store.getState()), [store]);
  return null;
}

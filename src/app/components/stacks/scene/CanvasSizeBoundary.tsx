"use client";

import { useStore } from "@react-three/fiber";
import { useLayoutEffect } from "react";

import { preserveCanvasSize } from "./sceneCanvasSize";

export default function CanvasSizeBoundary() {
  const store = useStore();
  useLayoutEffect(() => preserveCanvasSize(store.getState()), [store]);
  return null;
}

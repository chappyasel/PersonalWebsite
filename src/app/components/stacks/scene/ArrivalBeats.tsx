"use client";

import { browserStorage, claimArrivalBeat } from "../mobile/liveness";
import { arrivalBeatRef, useStacks } from "../store";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

export function arrivalBeatDuration(unit: number) {
  if (unit === 0) return 900;
  if (unit === 1) return 700;
  return 0;
}

export default function ArrivalBeats() {
  const settledUnit = useStacks((state) => state.settledUnit);
  const running = useRef<{
    unit: number;
    elapsed: number;
    duration: number;
  } | null>(null);
  const previous = useRef<number | null>(null);

  useFrame((_, delta) => {
    if (settledUnit !== null && settledUnit !== previous.current) {
      previous.current = settledUnit;
      const duration = arrivalBeatDuration(settledUnit);
      if (
        duration > 0 &&
        claimArrivalBeat(browserStorage("sessionStorage"), settledUnit)
      ) {
        running.current = { unit: settledUnit, elapsed: 0, duration };
        if (settledUnit === 1) arrivalBeatRef.booksCoverProgress = 0;
      }
    }
    const beat = running.current;
    if (!beat) return;
    beat.elapsed += delta * 1000;
    const t = Math.min(1, beat.elapsed / beat.duration);
    const eased = 1 - Math.pow(1 - t, 3);
    if (beat.unit === 0) arrivalBeatRef.aboutLampBloom = Math.sin(Math.PI * t);
    if (beat.unit === 1) arrivalBeatRef.booksCoverProgress = eased;
    if (t >= 1) {
      arrivalBeatRef.aboutLampBloom = 0;
      arrivalBeatRef.booksCoverProgress = 1;
      running.current = null;
    }
  });
  return null;
}

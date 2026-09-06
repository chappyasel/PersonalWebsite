"use client";

import { useSyncExternalStore } from "react";

import { skyEventDiagnosticsController } from "~/lib/skyEventDiagnostics";

export default function ShootingStar() {
  const revision = useSyncExternalStore(
    skyEventDiagnosticsController.subscribe,
    () => skyEventDiagnosticsController.getSnapshot().shootingStarRevision,
    () => 0,
  );

  return (
    <div
      key={revision}
      className={
        revision > 0
          ? "dl-shooting-star dl-shooting-star-triggered"
          : "dl-shooting-star"
      }
    />
  );
}

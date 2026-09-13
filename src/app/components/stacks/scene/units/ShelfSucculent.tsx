"use client";

import ModelProp from "../ModelProp";
import { ABOUT_BOOT_LANDMARKS } from "../aboutBootComposition";
import { ABOUT_MODEL_POSES } from "../aboutScenePose";
import React from "react";

export function ShelfSucculent({
  unitIndex,
  dark,
  hoverKey,
}: {
  unitIndex: number;
  dark: boolean;
  hoverKey: string;
}) {
  return (
    <group name="room-sway">
      <React.Suspense fallback={null}>
        <ModelProp
          url="/models/succulent-pot.glb"
          plantWind={{ kind: "succulent-pot", unitIndex, hoverKey }}
          dark={dark}
          variant="recolor"
          rotation={[...ABOUT_MODEL_POSES.succulent.rotation]}
          scale={ABOUT_BOOT_LANDMARKS.succulent.sceneScale}
        />
      </React.Suspense>
    </group>
  );
}

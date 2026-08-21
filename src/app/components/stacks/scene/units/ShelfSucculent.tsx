"use client";

import ModelProp from "../ModelProp";
import { ABOUT_BOOT_LANDMARKS } from "../aboutBootComposition";
import { Sway } from "../eggs";
import React from "react";

export function ShelfSucculent({
  unitIndex,
  dark,
}: {
  unitIndex: number;
  dark: boolean;
}) {
  return (
    <Sway unitIndex={unitIndex} amount={0.012} rate={0.28} phase={0.4}>
      <React.Suspense fallback={null}>
        <ModelProp
          url="/models/succulent-pot.glb"
          dark={dark}
          variant="recolor"
          rotation={[0, -0.4, 0]}
          scale={ABOUT_BOOT_LANDMARKS.succulent.sceneScale}
        />
      </React.Suspense>
    </Sway>
  );
}

"use client";

// Scene graph: atmosphere + camera rig + the seven shelf units + the baked
// ground shadows that ground them.
import { type ComponentType } from "react";

import { UNITS, type StacksData, type UnitSlug } from "../data";
import { type Palette } from "../theme";
import CameraRig from "./CameraRig";
import GroundPool from "./GroundPool";
import SceneEnvironment from "./SceneEnvironment";
import UnitAbout from "./units/UnitAbout";
import UnitBlog from "./units/UnitBlog";
import UnitBooks from "./units/UnitBooks";
import UnitProjects from "./units/UnitProjects";
import UnitSystems from "./units/UnitSystems";
import UnitTalks from "./units/UnitTalks";
import UnitTraining from "./units/UnitTraining";
import { type UnitProps } from "./units/types";
import { unitPose } from "./worldLayout";

const UNIT_COMPONENTS: Record<UnitSlug, ComponentType<UnitProps>> = {
  about: UnitAbout,
  books: UnitBooks,
  training: UnitTraining,
  talks: UnitTalks,
  projects: UnitProjects,
  blog: UnitBlog,
  systems: UnitSystems,
};

export default function Scene({
  data,
  palette,
  dark,
  coverWidth,
  dustOff,
  shadowsOff,
  skySimplify,
  onOpenBook,
  onOpenUrl,
}: {
  data: StacksData;
  palette: Palette;
  dark: boolean;
  coverWidth: 256 | 384;
  dustOff?: boolean;
  shadowsOff?: boolean;
  skySimplify?: boolean;
  onOpenBook?: (bookId: string) => void;
  onOpenUrl?: (url: string) => void;
}) {
  return (
    <>
      <SceneEnvironment
        palette={palette}
        dark={dark}
        dustOff={dustOff}
        skySimplify={skySimplify}
      />
      <CameraRig />
      {UNITS.map((unit, i) => {
        const Unit = UNIT_COMPONENTS[unit.slug];
        return (
          <group key={unit.slug} {...unitPose(i)}>
            <Unit
              data={data}
              palette={palette}
              index={i}
              coverWidth={coverWidth}
              onOpenBook={onOpenBook}
              onOpenUrl={onOpenUrl}
            />
            {/* Soft analytic ground pool — replaces the per-frame 2048²
                directional shadow map (the scene is static; only the camera
                moves). */}
            {!shadowsOff && (
              <GroundPool
                color={palette.shadow}
                opacity={dark ? 0.5 : 0.34}
              />
            )}
          </group>
        );
      })}
    </>
  );
}

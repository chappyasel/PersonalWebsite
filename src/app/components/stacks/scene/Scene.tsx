"use client";

// Scene graph: atmosphere + camera rig + the seven shelf units + the invisible
// shadow catcher that grounds them.
import { type ComponentType } from "react";

import { UNITS, type StacksData, type UnitSlug } from "../data";
import { type Palette } from "../theme";
import CameraRig from "./CameraRig";
import SceneEnvironment from "./SceneEnvironment";
import UnitAbout from "./units/UnitAbout";
import UnitBlog from "./units/UnitBlog";
import UnitBooks from "./units/UnitBooks";
import UnitProjects from "./units/UnitProjects";
import UnitSystems from "./units/UnitSystems";
import UnitTalks from "./units/UnitTalks";
import UnitTraining from "./units/UnitTraining";
import { type UnitProps } from "./units/types";
import { MID_X, unitPose } from "./worldLayout";

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
  onOpenBook,
  onOpenUrl,
}: {
  data: StacksData;
  palette: Palette;
  dark: boolean;
  coverWidth: 256 | 384;
  dustOff?: boolean;
  shadowsOff?: boolean;
  onOpenBook?: (bookId: string) => void;
  onOpenUrl?: (url: string) => void;
}) {
  return (
    <>
      <SceneEnvironment
        palette={palette}
        dark={dark}
        dustOff={dustOff}
        shadowsOff={shadowsOff}
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
          </group>
        );
      })}
      {!shadowsOff && (
        <mesh
          receiveShadow
          rotation-x={-Math.PI / 2}
          position={[MID_X, -1.12, -0.3]}
        >
          <planeGeometry args={[MID_X * 2 + 20, 18]} />
          <shadowMaterial
            transparent
            opacity={dark ? 0.32 : 0.22}
            color={palette.shadow}
          />
        </mesh>
      )}
    </>
  );
}

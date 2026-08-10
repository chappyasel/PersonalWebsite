"use client";

// Scene graph: atmosphere + camera rig + the seven shelf units + the baked
// ground shadows that ground them.
import { type ComponentType, useEffect } from "react";
import { useTexture } from "@react-three/drei";
import { type ThreeEvent } from "@react-three/fiber";

import { UNITS, type StacksData, type UnitSlug } from "../data";
import { openStacksPanel, useStacks } from "../store";
import { type Palette, proxied } from "../theme";
import CameraRig from "./CameraRig";
import GroundPool from "./GroundPool";
import { preloadModels } from "./ModelProp";
import SceneEnvironment from "./SceneEnvironment";
import UnitAbout, { PORTRAIT_SRC } from "./units/UnitAbout";
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

// Tap anywhere on a unit: mobile opens the panel for the active unit,
// otherwise travel there (same pushState + travelTo as the rail). Desktop
// active unit is a no-op — the placard is already resident.
function onUnitTap(index: number, e: ThreeEvent<MouseEvent>) {
  if ((e.delta ?? 0) > 6) return; // swipe, not a tap
  e.stopPropagation();
  const state = useStacks.getState();
  if (state.panelState !== "closed" || state.modalOpen) return;
  const isMobile = window.matchMedia("(max-width: 767px)").matches;
  if (index === state.activeUnit) {
    if (isMobile) openStacksPanel();
    return;
  }
  if (!state.travelTo) return;
  const slug = UNITS[index]!.slug;
  window.history.pushState(
    null,
    "",
    index === 0 ? window.location.pathname : `#${slug}`,
  );
  state.travelTo(index);
}

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
  // Prefetch the full GLB prop set once the world has committed — props pop
  // in together instead of gating the first paint or trickling per-unit.
  useEffect(() => {
    preloadModels();
  }, []);
  // Warm every unit's image textures a beat after first paint. The sticky
  // LOD latch (useUnitLod) then mounts pre-decoded textures instead of
  // fetching mid-travel — the two halves of the §1.3 blank-slab fix.
  useEffect(() => {
    const t = setTimeout(() => {
      const urls = [
        proxied(PORTRAIT_SRC, coverWidth),
        ...data.shelfBooks
          .filter((b) => b.coverUrl)
          .map((b) => proxied(b.coverUrl!, coverWidth)),
        ...data.talks.map((talk) => proxied(talk.still, coverWidth)),
        ...data.projects.map((p) => proxied(p.image, coverWidth)),
        // Photo props load raw — already pipeline-capped per placement.
        "/images/stacks/gym-mirror.jpg",
        "/images/stacks/beach-sunset.jpg",
        "/images/stacks/bros.jpg",
        "/images/stacks/postcard-budapest.jpg",
        "/images/stacks/postcard-arches.jpg",
        "/images/stacks/talk-stanford.jpg",
        "/images/stacks/talk-summit.jpg",
        "/images/stacks/pin-dunes.jpg",
        "/images/stacks/pin-trail.jpg",
        "/images/stacks/pin-creek.jpg",
        "/images/stacks/musings-walk.jpg",
        "/images/stacks/golf-flag.jpg",
      ];
      for (const url of urls) useTexture.preload(url);
    }, 2500);
    return () => clearTimeout(t);
  }, [data, coverWidth]);
  return (
    <>
      {/* CameraRig FIRST. r3f runs useFrame callbacks in registration order,
          which is mount order, so anything reading camera.position must
          mount after the rig that writes it. With the environment first, the
          sky dome tracked the camera one frame late — at radius 34 that is
          nearly a degree of parallax during fast travel, i.e. sky jitter.
          Every other camera-reading effect (hover lift easing, carried
          props) was a frame stale for the same reason. */}
      <CameraRig />
      <SceneEnvironment
        palette={palette}
        dark={dark}
        dustOff={dustOff}
        skySimplify={skySimplify}
      />
      {UNITS.map((unit, i) => {
        const Unit = UNIT_COMPONENTS[unit.slug];
        return (
          <group key={unit.slug} {...unitPose(i)}>
            <Unit
              data={data}
              palette={palette}
              dark={dark}
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
                opacity={dark ? 0.55 : 0.4}
              />
            )}
            {/* Invisible raycast plane BEHIND the interactive props (covers
                sit at z 0.06+ and stopPropagation first) — tap-a-unit target
                for the mobile panel and lateral travel. */}
            <mesh position={[0, 0.1, -0.3]} onClick={(e) => onUnitTap(i, e)}>
              <planeGeometry args={[3.4, 2.6]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

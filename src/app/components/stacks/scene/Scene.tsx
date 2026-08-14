"use client";

// Scene graph: atmosphere + camera rig + the seven shelf units + the baked
// ground shadows that ground them.
import { type StacksData, UNITS, UNIT_COUNT, type UnitSlug } from "../data";
import { openStacksPanel, useStacks } from "../store";
import { type Palette, proxied } from "../theme";
import { useTexture } from "@react-three/drei";
import { type ThreeEvent } from "@react-three/fiber";
import { type ComponentType, Suspense, memo, useEffect } from "react";

import CameraRig from "./CameraRig";
import GroundPool, { FootPool } from "./GroundPool";
import ModelProp, { preloadModels } from "./ModelProp";
import SceneEnvironment from "./SceneEnvironment";
import { Sway } from "./eggs";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import UnitAbout, { PORTRAIT_SRC } from "./units/UnitAbout";
import UnitBlog from "./units/UnitBlog";
import UnitBooks from "./units/UnitBooks";
import UnitProjects from "./units/UnitProjects";
import UnitSystems from "./units/UnitSystems";
import UnitTalks from "./units/UnitTalks";
import UnitTraining from "./units/UnitTraining";
import { type UnitProps } from "./units/types";
import { STACKS_MOBILE_QUERY, unitPose } from "./worldLayout";

const UNIT_COMPONENTS: Record<UnitSlug, ComponentType<UnitProps>> = {
  about: UnitAbout,
  books: UnitBooks,
  training: UnitTraining,
  talks: UnitTalks,
  projects: UnitProjects,
  blog: UnitBlog,
  systems: UnitSystems,
};

// Per-instance atlas transforms must be referentially stable. ModelProp owns
// the cloned material/texture lifecycle; rebuilding this object on every
// Scene render used to rebuild and dispose the monstera clone with it.
const MONSTERA_ATLAS_LIGHT = {
  colorSwaps: [{ from: "#4c6d90", to: "#648b4c", tolerance: 6 }] as const,
} as const;
const MONSTERA_ATLAS_DARK = {
  colorSwaps: [{ from: "#334d68", to: "#4e713d", tolerance: 6 }] as const,
} as const;

const V8_PHOTOS_BY_UNIT: Record<UnitSlug, readonly string[]> = {
  about: [
    "about-collective-group",
    "about-delicate-arch",
    "about-family",
    "about-profile-full",
    "about-speaking-candid",
  ],
  books: [],
  training: [
    "training-bench",
    "training-deadlift",
    "training-golf-flag",
    "training-golf-group",
    "training-gym-pose",
    "training-stage-kneeling",
    "training-stage-side",
    "training-trophy-front",
    "training-trophy-side",
  ],
  talks: [
    "talk-ann-interview",
    "talk-consensus-phone",
    "talk-dc-policy",
    "talk-demo-night",
    "talk-panel",
  ],
  projects: ["projects-coding-couch", "projects-wwdc"],
  blog: [],
  systems: [
    "systems-home-office",
    "systems-lake",
    "systems-lighthouse",
    "systems-sf-dusk",
    "systems-supplements",
    "systems-working-session",
  ],
};

// Tap anywhere on a unit: mobile opens the panel for the active unit,
// otherwise travel there (same pushState + travelTo as the rail). Desktop
// active unit is a no-op — the placard is already resident.
function onUnitTap(index: number, e: ThreeEvent<MouseEvent>) {
  if ((e.delta ?? 0) > 6) return; // swipe, not a tap
  e.stopPropagation();
  const state = useStacks.getState();
  if (state.panelState !== "closed" || state.modalOpen) return;
  const isMobile = window.matchMedia(STACKS_MOBILE_QUERY).matches;
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

function Scene({
  data,
  palette,
  dark,
  coverWidth,
  dustOff,
  shadowsOff,
  skySimplify,
  degrade,
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
  /** Raw performance-ladder rung — SceneEnvironment maps it onto the
   * meadow's density dial; the existing booleans stay authoritative for
   * dust/sky/shadows. */
  degrade?: number;
  onOpenBook?: (bookId: string) => void;
  onOpenUrl?: (url: string) => void;
}) {
  // Prefetch the full GLB prop set once the world has committed — props pop
  // in together instead of gating the first paint or trickling per-unit.
  useEffect(() => {
    preloadModels();
  }, []);
  // Warm the current/adjacent units immediately, then trickle the rest by
  // unit during idle time. The old single 2.5 s timer launched every cover,
  // talk still, project image, and all 26 physical photos at once. That made
  // a short but needless decode/network spike. The sticky LOD latch still
  // receives pre-decoded textures before ordinary lateral travel, while a
  // direct rail/deep-link jump promotes its destination and neighbours to the
  // front of the queue synchronously.
  useEffect(() => {
    const byUnit = Object.fromEntries(
      UNITS.map(({ slug }) => [
        slug,
        V8_PHOTOS_BY_UNIT[slug].map((name) => `/images/stacks/v8/${name}.webp`),
      ]),
    ) as Record<UnitSlug, string[]>;
    byUnit.about.unshift(proxied(PORTRAIT_SRC, coverWidth));
    byUnit.books.push(
      ...data.shelfBooks
        .filter((b) => b.coverUrl)
        .map((b) => proxied(b.coverUrl!, coverWidth)),
    );
    byUnit.talks.push(
      ...data.talks.map((talk) => proxied(talk.still, coverWidth)),
    );
    byUnit.projects.push(
      ...data.projects.map((project) => proxied(project.image, coverWidth)),
    );

    const warmed = new Set<UnitSlug>();
    const warmSlug = (slug: UnitSlug) => {
      if (warmed.has(slug)) return;
      warmed.add(slug);
      for (const url of byUnit[slug]) useTexture.preload(url);
    };
    const warmUnit = (index: number) => {
      if (index < 0 || index >= UNIT_COUNT) return;
      warmSlug(UNITS[index]!.slug);
    };
    const warmNear = (index: number) => {
      warmUnit(index);
      warmUnit(index - 1);
      warmUnit(index + 1);
    };
    warmNear(useStacks.getState().activeUnit);

    const unsubscribe = useStacks.subscribe((state, previous) => {
      if (state.activeUnit !== previous.activeUnit) warmNear(state.activeUnit);
    });

    // Follow the canonical traverse. Already-warmed current/adjacent units
    // are cheap no-ops, and even media-empty units remain in the queue so the
    // scheduler never acquires its own ordering knowledge.
    const idleQueue = UNITS.map((unit) => unit.slug);
    let queueIndex = 0;
    let idleHandle = 0;
    let delayHandle = 0;
    let cancelled = false;
    const idleApi = window as unknown as {
      requestIdleCallback?: Window["requestIdleCallback"];
      cancelIdleCallback?: Window["cancelIdleCallback"];
    };
    const scheduleNext = () => {
      if (cancelled || queueIndex >= idleQueue.length) return;
      const run = () => {
        if (cancelled) return;
        warmSlug(idleQueue[queueIndex++]!);
        delayHandle = window.setTimeout(scheduleNext, 650);
      };
      if (idleApi.requestIdleCallback) {
        idleHandle = idleApi.requestIdleCallback(run, { timeout: 1200 });
      } else {
        delayHandle = window.setTimeout(run, 250);
      }
    };
    delayHandle = window.setTimeout(scheduleNext, 1200);

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(delayHandle);
      if (idleHandle && idleApi.cancelIdleCallback) {
        idleApi.cancelIdleCallback(idleHandle);
      }
    };
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
        degrade={degrade}
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
              <GroundPool color={palette.shadow} opacity={dark ? 0.55 : 0.4} />
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
      {/* A shared-room object rather than About furniture: the large plant
          marks the transition between the portrait desk and the library. */}
      <group
        name="stacks-monstera-anchor"
        position={[2.2, SHELF_GEOMETRY.groundY, -1.72]}
        rotation={[0, -0.25, 0]}
      >
        {/* Position outside Sway: its rotation now happens at the pot's local
            floor contact instead of orbiting the whole plant around world 0.
            FootPool stays fixed under that same contact point. */}
        <Sway unitIndex={0} amount={0.016} rate={0.3} phase={0.7}>
          <group name="stacks-monstera-sway-body">
            <Suspense fallback={null}>
              <ModelProp
                url="/models/monstera.glb"
                dark={dark}
                variant="recolor"
                atlasOverride={
                  dark ? MONSTERA_ATLAS_DARK : MONSTERA_ATLAS_LIGHT
                }
                scale={0.92}
              />
            </Suspense>
          </group>
        </Sway>
      </group>
      <FootPool
        color={palette.shadow}
        opacity={dark ? 0.45 : 0.28}
        size={[1.25, 0.8]}
        position={[2.2, SHELF_GEOMETRY.groundY, -1.72]}
      />
    </>
  );
}

// Panel and modal ownership re-render StacksCanvas, but do not alter the
// physical room. Keeping this boundary resident avoids rebuilding every GLB
// clone/material merely because ScrollControls was enabled or disabled.
export default memo(Scene);

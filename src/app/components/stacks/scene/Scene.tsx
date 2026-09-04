"use client";

// Scene graph: atmosphere + camera rig + the seven shelf units + the baked
// ground shadows that ground them.
import {
  type StacksData,
  UNITS,
  UNIT_COUNT,
  type UnitSlug,
  unitUrlForLocation,
} from "../data";
import { useStacks } from "../store";
import { type Palette, proxied } from "../theme";
import { useTexture } from "@react-three/drei";
import { type ThreeEvent } from "@react-three/fiber";
import {
  type ComponentType,
  type ReactNode,
  Suspense,
  memo,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type * as THREE from "three";

import ArrivalBeats from "./ArrivalBeats";
import CameraRig from "./CameraRig";
import GroundPool, { FootPool } from "./GroundPool";
import InsectPerchDiagnostics from "./InsectPerchDiagnostics";
import ModelProp, { preloadModels } from "./ModelProp";
import PhysicsDiagnosticsOverlay from "./PhysicsDiagnosticsOverlay";
import {
  PhysicsSceneFrameDriver,
  PhysicsSceneProvider,
  usePhysicsScene,
} from "./PhysicsSceneProvider";
import SceneEnvironment from "./SceneEnvironment";
import TouchFocusTarget from "./TouchFocusTarget";
import { proxiedBookCover } from "./bookCoverTexture";
import { Sway } from "./eggs";
import { registerInsectCollisionRoot } from "./insectFlightWorld";
import { UnitInsectPerches } from "./insectPerches";
import { V8_PHOTOS_BY_UNIT, scenePhotoManifestUrl } from "./photoTextures";
import type { SceneQualityPlan } from "./quality";
import {
  SceneMeadowVisibilityContext,
  scenePerformanceController,
  scenePrewarmDeferred,
  useScenePerformanceSettings,
} from "./scenePerformance";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import {
  SceneUnitActivityDriver,
  UnitActivityProvider,
  useUnitActivityRoot,
} from "./unitActivity";
import UnitAbout, { PORTRAIT_SRC } from "./units/UnitAbout";
import UnitBlog from "./units/UnitBlog";
import UnitBooks, { featuredBookPerchDefinitions } from "./units/UnitBooks";
import UnitProjects from "./units/UnitProjects";
import UnitSystems from "./units/UnitSystems";
import UnitTalks from "./units/UnitTalks";
import UnitTraining from "./units/UnitTraining";
import { type UnitProps } from "./units/types";
import { captureHeadOnFromSearch, unitPoseForCapture } from "./worldLayout";

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
const MONSTERA_ACTIVE_UNITS = [0, 1] as const;

// Tap the room behind a unit to travel there. Tapping the active unit is a
// no-op on every viewport: mobile scene taps belong to the 3D interactions,
// while the sheet's grabber, header, and chip are its explicit controls.
function onUnitTap(index: number, e: ThreeEvent<MouseEvent>) {
  if ((e as unknown as { pointerType?: string }).pointerType === "touch")
    return;
  if ((e.delta ?? 0) > 6) return; // swipe, not a tap
  e.stopPropagation();
  const state = useStacks.getState();
  if (
    state.panelState !== "closed" ||
    state.modalOpen ||
    state.visionRidePhase !== "idle"
  )
    return;
  // Golf occupies the physical gap between Books and Weightlifting, directly
  // over both units' invisible travel planes. A near-miss on the club or a
  // ball must stay in Golf instead of activating whichever plane is behind it.
  if (state.golfFocused) return;
  if (index === state.activeUnit) return;
  if (!state.travelTo) return;
  window.history.pushState(
    null,
    "",
    unitUrlForLocation(window.location.pathname, window.location.search, index),
  );
  state.travelTo(index);
}

function CollisionIndexedUnit({
  index,
  headOnCapture,
  children,
}: {
  index: number;
  headOnCapture: boolean;
  children: ReactNode;
}) {
  const root = useRef<THREE.Group>(null);
  const physicsScene = usePhysicsScene();
  useUnitActivityRoot(index, root);
  useEffect(() => {
    if (!root.current) return;
    const unregisterInsects = registerInsectCollisionRoot(index, root.current);
    const unregisterPhysics = physicsScene.registerRoot({
      id: `unit:${index}`,
      kind: "unit",
      unitIndex: index,
      root: root.current,
    });
    return () => {
      unregisterInsects();
      unregisterPhysics();
    };
  }, [index, physicsScene]);
  return (
    <group ref={root} {...unitPoseForCapture(index, headOnCapture)}>
      <UnitActivityProvider index={index}>{children}</UnitActivityProvider>
    </group>
  );
}

function SharedPhysicsRoot({ children }: { children: ReactNode }) {
  const root = useRef<THREE.Group>(null);
  const physicsScene = usePhysicsScene();
  useEffect(() => {
    if (!root.current) return;
    return physicsScene.registerRoot({
      id: "shared:monstera",
      kind: "shared",
      root: root.current,
    });
  }, [physicsScene]);
  return <group ref={root}>{children}</group>;
}

const SceneContent = memo(function SceneContent({
  data,
  palette,
  dark,
  coverWidth,
  headOnCapture,
  onOpenBook,
  onOpenBookId,
  onOpenUrl,
}: {
  data: StacksData;
  palette: Palette;
  dark: boolean;
  coverWidth: 256 | 384;
  headOnCapture: boolean;
  onOpenBook?: (bookId: string) => void;
  onOpenBookId?: (bookId: string) => void;
  onOpenUrl?: (url: string) => void;
}) {
  const bookPerches = useMemo(
    () => featuredBookPerchDefinitions(data.featuredBooks),
    [data.featuredBooks],
  );
  // Prefetch the compact GLB set only when it cannot compete with travel. The
  // callback checks again when it fires because it may have been queued while
  // still and become eligible only after a traverse began.
  useEffect(() => {
    let cancelled = false;
    let timeout = 0;
    let idle = 0;
    const idleApi = window as Window & {
      requestIdleCallback?: Window["requestIdleCallback"];
      cancelIdleCallback?: Window["cancelIdleCallback"];
    };
    const run = () => {
      if (cancelled) return;
      if (scenePrewarmDeferred()) {
        timeout = window.setTimeout(schedule, 250);
        return;
      }
      preloadModels();
    };
    const schedule = () => {
      if (cancelled) return;
      if (scenePrewarmDeferred()) {
        timeout = window.setTimeout(schedule, 250);
      } else if (idleApi.requestIdleCallback) {
        idle = idleApi.requestIdleCallback(run, { timeout: 1200 });
      } else {
        timeout = window.setTimeout(run, 250);
      }
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (idle && idleApi.cancelIdleCallback) idleApi.cancelIdleCallback(idle);
    };
  }, []);
  // Warm role-sized previews for the current unit and its neighbours. Local
  // photographs stay on these right-sized assets; loading all 27 masters in
  // the background added decode work and texture uploads without helping the
  // quality controller.
  useEffect(() => {
    const previewsByUnit = Object.fromEntries(
      UNITS.map(({ slug }) => [
        slug,
        V8_PHOTOS_BY_UNIT[slug].map(scenePhotoManifestUrl),
      ]),
    ) as Record<UnitSlug, string[]>;
    previewsByUnit.about.unshift(proxied(PORTRAIT_SRC, coverWidth));
    previewsByUnit.books.push(
      ...data.shelfBooks
        .filter((b) => b.coverUrl)
        .map((b) => proxiedBookCover(b.coverUrl!, coverWidth)),
    );
    previewsByUnit.projects.push(
      ...data.projects.map((project) => proxied(project.image, coverWidth)),
    );
    const warmed = new Set<UnitSlug>();
    const warmSlug = (slug: UnitSlug) => {
      if (warmed.has(slug)) return;
      warmed.add(slug);
      for (const url of previewsByUnit[slug]) useTexture.preload(url);
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
    let cancelled = false;
    let nearDelayHandle = 0;
    let pendingNear = useStacks.getState().activeUnit;
    const flushNear = () => {
      if (cancelled) return;
      if (scenePrewarmDeferred()) {
        nearDelayHandle = window.setTimeout(flushNear, 250);
        return;
      }
      warmNear(pendingNear);
    };
    flushNear();

    const unsubscribe = useStacks.subscribe((state, previous) => {
      if (state.activeUnit === previous.activeUnit) return;
      pendingNear = state.activeUnit;
      window.clearTimeout(nearDelayHandle);
      flushNear();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(nearDelayHandle);
    };
  }, [data, coverWidth]);
  return (
    <>
      {UNITS.map((unit, i) => {
        const Unit = UNIT_COMPONENTS[unit.slug];
        return (
          <CollisionIndexedUnit
            key={unit.slug}
            index={i}
            headOnCapture={headOnCapture}
          >
            <UnitInsectPerches
              unitIndex={i}
              definitions={i === 1 ? bookPerches : undefined}
            />
            <Unit
              data={data}
              palette={palette}
              dark={dark}
              index={i}
              headOnCapture={headOnCapture}
              coverWidth={coverWidth}
              onOpenBook={onOpenBook}
              onOpenBookId={onOpenBookId}
              onOpenUrl={onOpenUrl}
            />
            {/* Invisible raycast plane BEHIND the interactive props (covers
                sit at z 0.06+ and stopPropagation first) — a lateral travel
                target only. The active unit deliberately does nothing. */}
            <mesh
              position={[0, 0.1, -0.3]}
              userData={{ physicsIgnore: true }}
              onClick={(e) => onUnitTap(i, e)}
            >
              <planeGeometry args={[3.4, 2.6]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </CollisionIndexedUnit>
        );
      })}
      {/* A shared-room object rather than About furniture: the large plant
          marks the transition between the portrait desk and the library. */}
      <SharedPhysicsRoot>
        <group
          name="stacks-monstera-anchor"
          position={[2.2, SHELF_GEOMETRY.groundY, -1.72]}
          rotation={[0, -0.25, 0]}
        >
          {/* Position outside Sway: its rotation now happens at the pot's local
              floor contact instead of orbiting the whole plant around world 0.
              FootPool stays fixed under that same contact point. */}
          <TouchFocusTarget
            id="focus:monstera:about-books"
            unitIndex={0}
            activeUnitIndexes={MONSTERA_ACTIVE_UNITS}
          >
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
                    // Opted out of ADR 0020 entirely. This is the seam plant
                    // between About and Books: it is scenery holding a corner
                    // of the world together, it is the largest thing on screen
                    // at 2.71 units, and it is the one prop whose atlasOverride
                    // gives it a PRIVATE material — so it was the only piece of
                    // furniture actually receiving the emissive half of glow
                    // while the shared-atlas ones got only the swell. A tree
                    // brightening because a pointer crossed it reads as a bug
                    // rather than as an answer. Owner call, 2026-08-20.
                    hover={false}
                  />
                </Suspense>
              </group>
            </Sway>
          </TouchFocusTarget>
        </group>
      </SharedPhysicsRoot>
      <FootPool
        color={palette.shadow}
        opacity={dark ? 0.45 : 0.28}
        size={[1.25, 0.8]}
        position={[2.2, SHELF_GEOMETRY.groundY, -1.72]}
      />
    </>
  );
});

function QualityLayer({
  palette,
  dark,
  quality,
  headOnCapture,
}: {
  palette: Palette;
  dark: boolean;
  quality: SceneQualityPlan;
  headOnCapture: boolean;
}) {
  return (
    <>
      <SceneEnvironment palette={palette} dark={dark} quality={quality} />
      {quality.environment.grounding &&
        UNITS.map((unit, i) => (
          <group
            key={`pool-${unit.slug}`}
            {...unitPoseForCapture(i, headOnCapture)}
          >
            {/* Soft analytic grounding, isolated from the content units so a
                quality transition cannot rebuild their private materials. */}
            <GroundPool color={palette.shadow} opacity={dark ? 0.55 : 0.4} />
          </group>
        ))}
    </>
  );
}

function Scene({
  data,
  palette,
  dark,
  coverWidth,
  quality,
  diagnosticsRequested,
  onOpenBook,
  onOpenBookId,
  onOpenUrl,
}: {
  data: StacksData;
  palette: Palette;
  dark: boolean;
  coverWidth: 256 | 384;
  quality: SceneQualityPlan;
  diagnosticsRequested: boolean;
  onOpenBook?: (bookId: string) => void;
  onOpenBookId?: (bookId: string) => void;
  onOpenUrl?: (url: string) => void;
}) {
  const headOnCapture = useMemo(
    () =>
      typeof window !== "undefined" &&
      captureHeadOnFromSearch(window.location.search),
    [],
  );
  const performanceSettings = useScenePerformanceSettings();
  const meadowVisible = scenePerformanceController.isOverridden("meadow")
    ? performanceSettings.meadow
    : quality.environment.meadow;
  return (
    <SceneMeadowVisibilityContext.Provider value={meadowVisible}>
      {/* CameraRig FIRST. r3f executes useFrame callbacks in mount order; the
          environment and interactive content must read the camera after it
          has moved for this frame. */}
      <CameraRig />
      <SceneUnitActivityDriver />
      <ArrivalBeats />
      <PhysicsSceneProvider>
        <QualityLayer
          palette={palette}
          dark={dark}
          quality={quality}
          headOnCapture={headOnCapture}
        />
        <SceneContent
          data={data}
          palette={palette}
          dark={dark}
          coverWidth={coverWidth}
          headOnCapture={headOnCapture}
          onOpenBook={onOpenBook}
          onOpenBookId={onOpenBookId}
          onOpenUrl={onOpenUrl}
        />
        <PhysicsSceneFrameDriver />
      </PhysicsSceneProvider>
      {process.env.NODE_ENV === "development" && diagnosticsRequested ? (
        <>
          <InsectPerchDiagnostics />
          <PhysicsDiagnosticsOverlay />
        </>
      ) : null}
    </SceneMeadowVisibilityContext.Provider>
  );
}

// Panel and modal ownership re-render StacksCanvas, but do not alter the
// physical room. Keeping this boundary resident avoids rebuilding every GLB
// clone/material merely because ScrollControls was enabled or disabled.
export default memo(Scene);

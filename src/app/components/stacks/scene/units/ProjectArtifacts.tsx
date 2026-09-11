"use client";

import { type SceneArtifactId } from "../../sceneArtifacts";
import { type Palette } from "../../theme";
import Grabbable from "../Grabbable";
import PropApproach from "../PropApproach";
import { RoundedBox } from "../RoundedBox";
import { useMetalShimmer } from "../objects";
import {
  projectIconBody,
  traceProjectIconOutline,
} from "../projectIconGeometry";
import {
  createProjectIconSlabGeometry,
  projectIconCapSize,
} from "../projectIconSlab";
import {
  type PropApproach as PropApproachController,
  type PropTurn,
  beginPropTurn,
  createPropApproach,
  usePropApproachNear,
} from "../propApproachState";
import { useLoader } from "@react-three/fiber";
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";

import {
  PROJECT_ARTIFACT_DIMENSIONS,
  PROJECT_DICE_LAYOUT,
  REVIEWED_SHELF_LAYOUT,
} from "./unitShelfLayout";

export { PROJECT_ICON_BODY, projectIconBody } from "../projectIconGeometry";
const PIP_GEOMETRY = new THREE.CircleGeometry(0.0105, 12);
const PIP_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#25231f",
  roughness: 0.48,
});

function roundedFaceGeometry(size: number, radius: number) {
  const shape = new THREE.Shape();
  traceProjectIconOutline(shape, size, radius);
  const geometry = new THREE.ShapeGeometry(shape, 12);
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(
      index,
      geometry.attributes.position!.getX(index) / size + 0.5,
      geometry.attributes.position!.getY(index) / size + 0.5,
    );
  }
  uv.needsUpdate = true;
  return geometry;
}

function ProjectIconArtwork({
  artwork,
  interactionKey,
  unitIndex,
  body,
  slab,
}: {
  artwork: string;
  interactionKey: string;
  unitIndex: number;
  body: ReturnType<typeof projectIconBody>;
  slab: THREE.BufferGeometry;
}) {
  const iconSize = body.size;
  const ICON_DEPTH = body.depth;
  const capSize = projectIconCapSize(body);
  const artworkTexture = useLoader(THREE.TextureLoader, artwork);
  artworkTexture.colorSpace = THREE.SRGBColorSpace;
  // The artwork is the slab's front cap material, not a plane in front of
  // it: flush by construction (projectIconSlab.ts).
  const artworkMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        map: artworkTexture,
        metalness: 0.14,
        roughness: 0.28,
        envMapIntensity: 2.9,
        clearcoat: 0.82,
        clearcoatRoughness: 0.1,
        reflectivity: 1,
      }),
    [artworkTexture],
  );
  // The back is viewed from the opposite side, so reverse its horizontal
  // UV transform to show the same upright icon rather than mirrored text.
  const backTexture = useMemo(() => {
    const texture = artworkTexture.clone();
    texture.repeat.x = -1;
    texture.offset.x = 1;
    texture.needsUpdate = true;
    return texture;
  }, [artworkTexture]);
  const backMaterial = useMemo(() => {
    const material = artworkMaterial.clone();
    material.map = backTexture;
    return material;
  }, [artworkMaterial, backTexture]);
  useEffect(
    () => () => {
      backMaterial.dispose();
      backTexture.dispose();
    },
    [backMaterial, backTexture],
  );
  // The slab's wall UVs project from the front, preserving its edge colours.
  const materials = useMemo(
    () => [artworkMaterial, artworkMaterial, backMaterial],
    [artworkMaterial, backMaterial],
  );
  // The shimmer band sweeps a transparent plane laid on the cap; invisible
  // until a hover, so its own edge never shows.
  const shimmer = useMemo(() => {
    const geometry = roundedFaceGeometry(
      capSize,
      Math.max(0.0005, body.radius - body.edgeRadius),
    );
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      uv.setXY(index, position.getX(index), position.getY(index));
    }
    uv.needsUpdate = true;
    return geometry;
  }, [body.edgeRadius, body.radius, capSize]);
  useEffect(() => () => shimmer.dispose(), [shimmer]);
  const {
    band,
    mark,
    texture: shimmerTexture,
  } = useMetalShimmer({
    unitIndex,
    hoverKey: interactionKey,
    idleRoughness: 0.28,
    idleEnv: 2.9,
  });
  useEffect(() => {
    mark.current = artworkMaterial;
    return () => {
      if (mark.current === artworkMaterial) mark.current = null;
      artworkMaterial.dispose();
    };
  }, [artworkMaterial, mark]);
  return (
    <>
      <mesh
        castShadow
        geometry={slab}
        material={materials}
        dispose={null}
        position={[0, iconSize / 2, 0]}
      />
      <mesh
        geometry={shimmer}
        dispose={null}
        position={[0, iconSize / 2, ICON_DEPTH / 2 + 0.0005]}
        renderOrder={2}
      >
        <meshBasicMaterial
          ref={band}
          map={shimmerTexture}
          color="#fff8ec"
          transparent
          opacity={0}
          visible={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

export function ProjectIconVisual({
  unitIndex,
  hoverKey,
  artwork,
  fallbackColor,
  textured,
  yaw,
  size = PROJECT_ARTIFACT_DIMENSIONS.icon,
}: {
  unitIndex: number;
  dark: boolean;
  hoverKey: string;
  artwork: string;
  fallbackColor: string;
  textured: boolean;
  yaw: number;
  size?: number;
}) {
  const body = useMemo(() => projectIconBody(size), [size]);
  const iconSize = body.size;
  const slab = useMemo(() => createProjectIconSlabGeometry(body), [body]);
  useEffect(() => () => slab.dispose(), [slab]);
  const wallMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: fallbackColor,
        metalness: 0.14,
        roughness: 0.28,
        envMapIntensity: 2.9,
        clearcoat: 0.55,
        clearcoatRoughness: 0.14,
        reflectivity: 1,
      }),
    [fallbackColor],
  );
  useEffect(() => () => wallMaterial.dispose(), [wallMaterial]);
  const fallbackMaterials = useMemo(
    () => [
      new THREE.MeshPhysicalMaterial({
        color: fallbackColor,
        metalness: 0.28,
        roughness: 0.32,
        clearcoat: 0.48,
      }),
      wallMaterial,
      wallMaterial,
    ],
    [fallbackColor, wallMaterial],
  );
  useEffect(() => () => fallbackMaterials[0]!.dispose(), [fallbackMaterials]);
  const plain = (
    <mesh
      castShadow
      geometry={slab}
      material={textured ? wallMaterial : fallbackMaterials}
      dispose={null}
      position={[0, iconSize / 2, 0]}
    />
  );
  return (
    <group rotation={[0, yaw, 0]}>
      {textured ? (
        // The bare slab stands in while the artwork downloads, then the same
        // slab comes back with the artwork on its cap.
        <React.Suspense fallback={plain}>
          <ProjectIconArtwork
            artwork={artwork}
            interactionKey={hoverKey}
            unitIndex={unitIndex}
            body={body}
            slab={slab}
          />
        </React.Suspense>
      ) : (
        plain
      )}
    </group>
  );
}

/** Backward lean of a tile at the camera, in radians (about 10 degrees). */
const PROJECT_ICON_NEAR_LEAN = 0.17;
/** A stand-in controller for tiles that never approach, so the near hook
 * stays unconditional. */
const NO_APPROACH = createPropApproach("project-icon:none");

export function ProjectIcon({
  unitIndex,
  palette,
  dark,
  hoverKey,
  base,
  artwork,
  fallbackColor,
  textured,
  yaw,
  href,
  portalLabel,
  portalDetail,
  size = PROJECT_ARTIFACT_DIMENSIONS.icon,
  massKg = 0.62,
  artifact,
  approach,
  turn,
}: {
  unitIndex: number;
  palette: Palette;
  dark: boolean;
  hoverKey: string;
  base: [number, number, number];
  artwork: string;
  fallbackColor: string;
  textured: boolean;
  yaw: number;
  href?: string;
  portalLabel?: string;
  /** Lines under the Portal Label title; see Grabbable. */
  portalDetail?: string | readonly string[];
  /** Billet edge. Defaults to the Projects shelf icon. */
  size?: number;
  /** Real mass; a half-edge tile is an eighth of the volume. */
  massKg?: number;
  artifact?: SceneArtifactId;
  /** A tap flies the tile up to the camera and a second press anywhere puts
   * it back, the same PropApproach the Mac and the globe use. The controller
   * is keyed by this prop's hover key so only the near tile may hover. */
  approach?: PropApproachController;
  /** With `approach`: a drag on the near tile turns it by hand instead of
   * carrying it (the carrier goes tap-only while the tile is up). */
  turn?: PropTurn;
}) {
  const body = projectIconBody(size);
  const iconSize = body.size;
  const near = usePropApproachNear(approach ?? NO_APPROACH);
  const visual = (
    <ProjectIconVisual
      unitIndex={unitIndex}
      dark={dark}
      hoverKey={hoverKey}
      artwork={artwork}
      fallbackColor={fallbackColor}
      textured={textured}
      // Authored yaw goes on the approach group when there is one, so the
      // near pose can square the face to the camera.
      yaw={approach ? 0 : yaw}
      size={size}
    />
  );
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={iconSize * 1.08}
      shape="box"
      massKg={massKg}
      metal
      href={href}
      portalLabel={portalLabel}
      portalDetail={portalDetail}
      // Only the way up needs a label: once the tile is near, the interface
      // has stepped aside and any press puts it back.
      actionLabel={approach ? "Closer look" : undefined}
      // Up close, a press on the tile is kept (PropApproach keepPressesOnProp)
      // so a drag can turn it; a tap there puts it back.
      onTap={
        approach
          ? () => (approach.near ? approach.dismiss() : approach.approach())
          : undefined
      }
      activateOnFirstTouch={Boolean(approach)}
      draggable={!(approach && near)}
      onDragIntent={
        approach
          ? () => {
              if (approach.near && turn) beginPropTurn(turn);
              else approach.dismiss();
            }
          : undefined
      }
      // The tile leaves its carrier when it approaches; the label and touch
      // hit-test must follow it, not the empty shelf spot.
      liveBounds={Boolean(approach)}
      external
      artifact={artifact}
    >
      {approach ? (
        <PropApproach
          controller={approach}
          unitIndex={unitIndex}
          height={iconSize}
          width={iconSize}
          restRotation={[0, yaw, 0]}
          // Lean the tile back a touch so its top face shows: squared to a
          // camera that looks slightly down, the top was edge-on and a
          // butterfly perched there stood hidden behind the front lip.
          facePitch={PROJECT_ICON_NEAR_LEAN}
          keepPressesOnProp={Boolean(turn)}
          turn={turn}
        >
          {visual}
        </PropApproach>
      ) : (
        visual
      )}
    </Grabbable>
  );
}

const PIP_LAYOUTS: Record<number, readonly [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-1, 1],
    [1, -1],
  ],
  3: [
    [-1, 1],
    [0, 0],
    [1, -1],
  ],
  4: [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ],
  5: [
    [-1, 1],
    [1, 1],
    [0, 0],
    [-1, -1],
    [1, -1],
  ],
  6: [
    [-1, 1],
    [1, 1],
    [-1, 0],
    [1, 0],
    [-1, -1],
    [1, -1],
  ],
};

function DieFace({
  face,
  value,
}: {
  face: "front" | "right" | "top";
  value: number;
}) {
  const size = PROJECT_ARTIFACT_DIMENSIONS.die;
  const half = size / 2 + 0.0008;
  const gap = size * 0.23;
  return (PIP_LAYOUTS[value] ?? []).map(([column, row], index) => {
    const x = column * gap;
    const y = row * gap;
    const position: [number, number, number] =
      face === "front"
        ? [x, y, half]
        : face === "top"
          ? [x, half, -y]
          : [half, y, -x];
    const rotation: [number, number, number] =
      face === "front"
        ? [0, 0, 0]
        : face === "top"
          ? [-Math.PI / 2, 0, 0]
          : [0, Math.PI / 2, 0];
    return (
      <mesh
        key={`${face}:${index}`}
        geometry={PIP_GEOMETRY}
        material={PIP_MATERIAL}
        dispose={null}
        position={position}
        rotation={rotation}
      />
    );
  });
}

function Die({
  dark,
  front,
  right,
  top,
  yaw,
}: {
  dark: boolean;
  front: number;
  right: number;
  top: number;
  yaw: number;
}) {
  const size = PROJECT_ARTIFACT_DIMENSIONS.die;
  return (
    <group position={[0, size / 2, 0]} rotation={[0, yaw, 0]}>
      <RoundedBox
        castShadow
        args={[size, size, size]}
        radius={size * 0.12}
        smoothness={5}
      >
        <meshPhysicalMaterial
          color={dark ? "#d8d0c1" : "#f4edde"}
          roughness={0.26}
          clearcoat={0.48}
          clearcoatRoughness={0.16}
        />
      </RoundedBox>
      <DieFace face="front" value={front} />
      <DieFace face="right" value={right} />
      <DieFace face="top" value={top} />
    </group>
  );
}

export function DicePyramid({
  unitIndex,
  palette,
  dark,
}: {
  unitIndex: number;
  palette: Palette;
  dark: boolean;
}) {
  const center = REVIEWED_SHELF_LAYOUT.projects.topDiceCenterX;
  return PROJECT_DICE_LAYOUT.map((die) => (
    <Grabbable
      key={die.id}
      unitIndex={unitIndex}
      hoverKey={`link:projects:dice:${die.id}`}
      base={[center + die.x, die.y, die.z]}
      shadeColor={palette.shadow}
      shadeWidth={PROJECT_ARTIFACT_DIMENSIONS.die * 0.86}
      shape="box"
      massKg={0.025}
      restitution={0.24}
      maxThrowSpeed={2.8}
      to="liarsdice"
    >
      <Die
        dark={dark}
        front={die.front}
        right={die.right}
        top={die.top}
        yaw={die.yaw}
      />
    </Grabbable>
  ));
}

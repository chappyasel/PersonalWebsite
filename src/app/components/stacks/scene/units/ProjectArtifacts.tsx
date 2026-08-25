"use client";

import { type SceneArtifactId } from "../../sceneArtifacts";
import { type Palette } from "../../theme";
import Grabbable from "../Grabbable";
import { RoundedBox } from "../RoundedBox";
import { useMetalShimmer } from "../objects";
import { projectIconBody } from "../projectIconGeometry";
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
  const half = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half + radius, -half);
  shape.lineTo(half - radius, -half);
  shape.quadraticCurveTo(half, -half, half, -half + radius);
  shape.lineTo(half, half - radius);
  shape.quadraticCurveTo(half, half, half - radius, half);
  shape.lineTo(-half + radius, half);
  shape.quadraticCurveTo(-half, half, -half, half - radius);
  shape.lineTo(-half, -half + radius);
  shape.quadraticCurveTo(-half, -half, -half + radius, -half);
  const geometry = new THREE.ShapeGeometry(shape, 10);
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
}: {
  artwork: string;
  interactionKey: string;
  unitIndex: number;
  body: ReturnType<typeof projectIconBody>;
}) {
  const iconSize = body.size;
  const ICON_DEPTH = body.depth;
  const faceSize = iconSize - body.faceInset * 2;
  const artworkTexture = useLoader(THREE.TextureLoader, artwork);
  artworkTexture.colorSpace = THREE.SRGBColorSpace;
  const face = useMemo(
    () => roundedFaceGeometry(faceSize, iconSize * 0.18),
    [faceSize, iconSize],
  );
  const shimmer = useMemo(() => {
    const geometry = face.clone();
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      uv.setXY(index, position.getX(index), position.getY(index));
    }
    uv.needsUpdate = true;
    return geometry;
  }, [face]);
  useEffect(
    () => () => {
      face.dispose();
      shimmer.dispose();
    },
    [face, shimmer],
  );
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
  return (
    <>
      <mesh
        geometry={face}
        dispose={null}
        position={[0, iconSize / 2, ICON_DEPTH / 2 + 0.001]}
      >
        <meshPhysicalMaterial
          ref={mark}
          map={artworkTexture}
          metalness={0.14}
          roughness={0.28}
          envMapIntensity={2.9}
          clearcoat={0.82}
          clearcoatRoughness={0.1}
          reflectivity={1}
        />
      </mesh>
      <mesh
        geometry={shimmer}
        dispose={null}
        position={[0, iconSize / 2, ICON_DEPTH / 2 + 0.0015]}
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

function StaticProjectIconArtwork({
  artwork,
  body,
  onReady,
}: {
  artwork: string;
  body: ReturnType<typeof projectIconBody>;
  onReady?: () => void;
}) {
  const iconSize = body.size;
  const faceSize = iconSize - body.faceInset * 2;
  const artworkTexture = useLoader(THREE.TextureLoader, artwork);
  artworkTexture.colorSpace = THREE.SRGBColorSpace;
  const face = useMemo(
    () => roundedFaceGeometry(faceSize, iconSize * 0.18),
    [faceSize, iconSize],
  );
  useEffect(() => () => face.dispose(), [face]);
  useEffect(() => onReady?.(), [onReady]);
  return (
    <mesh
      geometry={face}
      dispose={null}
      position={[0, iconSize / 2, body.depth / 2 + 0.001]}
    >
      <meshPhysicalMaterial
        map={artworkTexture}
        metalness={0.14}
        roughness={0.28}
        envMapIntensity={2.9}
        clearcoat={0.82}
        clearcoatRoughness={0.1}
        reflectivity={1}
      />
    </mesh>
  );
}

export function ProjectIconVisual({
  unitIndex,
  dark,
  hoverKey,
  artwork,
  fallbackColor,
  textured,
  yaw,
  interactive = true,
  onReady,
  size = PROJECT_ARTIFACT_DIMENSIONS.icon,
}: {
  unitIndex: number;
  dark: boolean;
  hoverKey: string;
  artwork: string;
  fallbackColor: string;
  textured: boolean;
  yaw: number;
  interactive?: boolean;
  onReady?: () => void;
  size?: number;
}) {
  const body = projectIconBody(size);
  const iconSize = body.size;
  return (
    <group rotation={[0, yaw, 0]}>
      <RoundedBox
        castShadow
        args={[iconSize, iconSize, body.depth]}
        radius={body.radius}
        smoothness={6}
        position={[0, iconSize / 2, 0]}
      >
        <meshPhysicalMaterial
          color={dark ? "#858b92" : "#d5d9de"}
          metalness={0.88}
          roughness={0.2}
          envMapIntensity={3.1}
          clearcoat={0.55}
          clearcoatRoughness={0.14}
          reflectivity={1}
        />
      </RoundedBox>
      {textured ? (
        <React.Suspense fallback={null}>
          {interactive ? (
            <ProjectIconArtwork
              artwork={artwork}
              interactionKey={hoverKey}
              unitIndex={unitIndex}
              body={body}
            />
          ) : (
            <StaticProjectIconArtwork
              artwork={artwork}
              body={body}
              onReady={onReady}
            />
          )}
        </React.Suspense>
      ) : (
        <RoundedBox
          args={[
            iconSize - body.faceInset * 2,
            iconSize - body.faceInset * 2,
            body.fallbackFaceDepth,
          ]}
          radius={body.fallbackFaceRadius}
          smoothness={5}
          position={[
            0,
            iconSize / 2,
            body.depth / 2 + body.fallbackFaceDepth / 2,
          ]}
        >
          <meshPhysicalMaterial
            color={fallbackColor}
            metalness={0.28}
            roughness={0.32}
            clearcoat={0.48}
          />
        </RoundedBox>
      )}
    </group>
  );
}

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
}) {
  const body = projectIconBody(size);
  const iconSize = body.size;
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
      external
      artifact={artifact}
    >
      <ProjectIconVisual
        unitIndex={unitIndex}
        dark={dark}
        hoverKey={hoverKey}
        artwork={artwork}
        fallbackColor={fallbackColor}
        textured={textured}
        yaw={yaw}
        size={size}
      />
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

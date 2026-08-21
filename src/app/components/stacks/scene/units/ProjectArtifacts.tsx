"use client";

import { type Palette } from "../../theme";
import Grabbable from "../Grabbable";
import { RoundedBox } from "../RoundedBox";
import { useMetalShimmer } from "../objects";
import { useLoader } from "@react-three/fiber";
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";

import {
  PROJECT_ARTIFACT_DIMENSIONS,
  PROJECT_DICE_LAYOUT,
  REVIEWED_SHELF_LAYOUT,
} from "./unitShelfLayout";

export const PROJECT_ICON_BODY = {
  // RoundedBox uses one radius for the 2D corner and front/back bevel. The
  // billet must therefore be thicker than twice that radius or its extrusion
  // depth becomes negative.
  depth: 0.12,
  radius: PROJECT_ARTIFACT_DIMENSIONS.icon * 0.16,
  fallbackFaceDepth: 0.012,
  fallbackFaceRadius: 0.005,
} as const;
const ICON_DEPTH = PROJECT_ICON_BODY.depth;
const ICON_FACE_INSET = 0.014;
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
  hoverKey,
  unitIndex,
}: {
  artwork: string;
  hoverKey: string;
  unitIndex: number;
}) {
  const iconSize = PROJECT_ARTIFACT_DIMENSIONS.icon;
  const faceSize = iconSize - ICON_FACE_INSET * 2;
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
    hoverKey,
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
  doorLabel,
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
  doorLabel?: string;
}) {
  const iconSize = PROJECT_ARTIFACT_DIMENSIONS.icon;
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={iconSize * 1.08}
      shape="box"
      massKg={0.62}
      metal
      href={href}
      doorLabel={doorLabel}
      external
    >
      <group rotation={[0, yaw, 0]}>
        <RoundedBox
          castShadow
          args={[iconSize, iconSize, ICON_DEPTH]}
          radius={PROJECT_ICON_BODY.radius}
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
            <ProjectIconArtwork
              artwork={artwork}
              hoverKey={hoverKey}
              unitIndex={unitIndex}
            />
          </React.Suspense>
        ) : (
          <RoundedBox
            args={[
              iconSize - ICON_FACE_INSET * 2,
              iconSize - ICON_FACE_INSET * 2,
              PROJECT_ICON_BODY.fallbackFaceDepth,
            ]}
            radius={PROJECT_ICON_BODY.fallbackFaceRadius}
            smoothness={5}
            position={[
              0,
              iconSize / 2,
              ICON_DEPTH / 2 + PROJECT_ICON_BODY.fallbackFaceDepth / 2,
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

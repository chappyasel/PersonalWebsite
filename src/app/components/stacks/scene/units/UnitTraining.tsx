"use client";

import { ShakerProp } from "../AuthoredProps";
import Grabbable from "../Grabbable";
import { FootPool } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import WavingGolfFlag from "../WavingGolfFlag";
import GolfExperience from "../golf/GolfExperience";
import { GOLF_FLAG_LOCAL } from "../golf/golfCourse";
import {
  GOLF_CLUB_REST_BASE,
  GOLF_TEE_ROTATIONS,
  GOLF_TEE_STARTS,
} from "../golf/golfLayout";
import { meadowHeight } from "../meadowField";
import { SodaCan } from "../objects";
import {
  DeskFrame,
  PHOTO_LINKS,
  deskFrameHeight,
  photoDoorLabel,
} from "../photos";
import { ShelfUnit } from "../primitives";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import { useUnitLod } from "../useUnitLod";
import { unitPose } from "../worldLayout";
import { RoundedBox } from "@react-three/drei";
import React from "react";
import * as THREE from "three";

import type { UnitProps } from "./types";
import { REVIEWED_SHELF_LAYOUT } from "./unitShelfLayout";

export const TRAINING_BARBELL_POSE: {
  base: [number, number, number];
  rotation: [number, number, number];
  scale: number;
} = {
  base: [1.92, SHELF_GEOMETRY.groundY, -1.04],
  rotation: [0, -Math.PI / 4, 0],
  scale: 0.77,
};

function golfFlagPosition(unitIndex: number): [number, number, number] {
  const pose = unitPose(unitIndex);
  const yaw = pose.rotation[1];
  const [x, z] = GOLF_FLAG_LOCAL;
  const worldX = pose.position[0] + x * Math.cos(yaw) + z * Math.sin(yaw);
  const worldZ = pose.position[2] - x * Math.sin(yaw) + z * Math.cos(yaw);
  return [x, meadowHeight(worldX, worldZ), z];
}

function TrainingPhoto({
  unitIndex,
  palette,
  id,
  base,
  seat,
  rotation,
  width,
  children,
}: {
  unitIndex: number;
  palette: UnitProps["palette"];
  id: string;
  base: [number, number, number];
  seat: number;
  rotation: [number, number, number];
  width: number;
  children: React.ReactNode;
}) {
  const hoverKey = `grab:photo:${id}`;
  const href = PHOTO_LINKS[id] ?? null;
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={Math.max(0.3, width * 1.18)}
      shape="box"
      massKg={0.45}
      href={href ?? undefined}
      doorLabel={href ? photoDoorLabel(href) : undefined}
    >
      <HeldFacing hoverKey={hoverKey} position={[0, seat, 0]} rest={rotation}>
        {children}
      </HeldFacing>
    </Grabbable>
  );
}

let proteinLabelCache: THREE.CanvasTexture | null = null;
function proteinLabelTexture(): THREE.CanvasTexture {
  if (proteinLabelCache) return proteinLabelCache;
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f7f3e9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1262b6";
  ctx.fillRect(0, 0, canvas.width, 72);
  ctx.font = "700 43px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("nutricost", canvas.width / 2, 50);
  ctx.fillStyle = "#17191d";
  ctx.font = "800 56px Arial, sans-serif";
  ctx.fillText("WHEY PROTEIN", canvas.width / 2, 170);
  ctx.font = "800 66px Arial, sans-serif";
  ctx.fillText("ISOLATE", canvas.width / 2, 235);
  ctx.fillStyle = "#1262b6";
  ctx.beginPath();
  ctx.moveTo(0, 320);
  ctx.quadraticCurveTo(360, 250, 768, 345);
  ctx.lineTo(768, 430);
  ctx.quadraticCurveTo(360, 330, 0, 420);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ef7f24";
  ctx.beginPath();
  ctx.moveTo(0, 405);
  ctx.quadraticCurveTo(380, 330, 768, 440);
  ctx.lineTo(768, 512);
  ctx.lineTo(0, 512);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 38px Arial, sans-serif";
  ctx.fillText("CHOCOLATE PB", canvas.width / 2, 470);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  proteinLabelCache = texture;
  return texture;
}

type Pin = {
  id: string;
  src: string;
  aspect: number;
  x: number;
  y: number;
  width: number;
  roll: number;
};

const TRAINING_PINS: Pin[] = [
  {
    id: "training-trophy-side-v8",
    src: "/images/stacks/v8/training-trophy-side.webp",
    aspect: 820 / 1024,
    x: -0.408,
    y: 0.588,
    width: 0.228,
    roll: -0.045,
  },
  {
    id: "training-stage-kneeling-v8",
    src: "/images/stacks/v8/training-stage-kneeling.webp",
    aspect: 819 / 1024,
    x: -0.12,
    y: 0.6,
    width: 0.192,
    roll: 0.035,
  },
  {
    id: "training-stage-side-v8",
    src: "/images/stacks/v8/training-stage-side.webp",
    aspect: 819 / 1024,
    x: 0.132,
    y: 0.588,
    width: 0.192,
    roll: -0.03,
  },
  {
    id: "training-trophy-front-v8",
    src: "/images/stacks/v8/training-trophy-front.webp",
    aspect: 819 / 1024,
    x: 0.384,
    y: 0.576,
    width: 0.204,
    roll: 0.045,
  },
  {
    id: "training-gym-pose-v8",
    src: "/images/stacks/v8/training-gym-pose.webp",
    aspect: 768 / 1024,
    x: -0.324,
    y: 0.288,
    width: 0.192,
    roll: 0.035,
  },
  {
    id: "training-deadlift-v8",
    src: "/images/stacks/v8/training-deadlift.webp",
    aspect: 1024 / 969,
    x: 0.012,
    y: 0.288,
    width: 0.24,
    roll: -0.035,
  },
  {
    id: "training-bench-v8",
    src: "/images/stacks/v8/training-bench.webp",
    aspect: 1024 / 996,
    x: 0.348,
    y: 0.288,
    width: 0.228,
    roll: 0.025,
  },
];

function TrainingBoard({
  palette,
  textured,
  unitIndex,
}: Pick<UnitProps, "palette"> & { textured: boolean; unitIndex: number }) {
  return (
    <group position={[0, 0.396, 0]}>
      <RoundedBox
        castShadow
        args={[1.128, 0.792, 0.035]}
        radius={0.018}
        smoothness={4}
      >
        <meshStandardMaterial color={palette.woodDark} roughness={0.92} />
      </RoundedBox>
      {TRAINING_PINS.map((pin) => {
        const height = pin.width / pin.aspect;
        const hoverKey = `grab:photo:${pin.id}`;
        const href = PHOTO_LINKS[pin.id] ?? undefined;
        const tackOffsetY = height / 2 - 0.012;
        return (
          <React.Fragment key={pin.id}>
            <Grabbable
              unitIndex={unitIndex}
              hoverKey={hoverKey}
              base={[pin.x, pin.y - 0.396, 0.026]}
              physicsDetachOffset={[0, 0, 0.08]}
              shadeColor={palette.shadow}
              shadeWidth={pin.width}
              shape="box"
              massKg={0.025}
              href={href}
              doorLabel={href ? photoDoorLabel(href) : undefined}
            >
              <group rotation={[0, 0, pin.roll]}>
                <RoundedBox
                  castShadow
                  args={[pin.width + 0.018, height + 0.018, 0.008]}
                  radius={0.003}
                  smoothness={2}
                >
                  <meshStandardMaterial color={palette.paper} roughness={0.9} />
                </RoundedBox>
                {textured && (
                  <React.Suspense fallback={null}>
                    <LitImage
                      url={pin.src}
                      role="support"
                      width={pin.width}
                      height={height}
                      roughness={0.6}
                      position={[0, 0, 0.006]}
                    />
                  </React.Suspense>
                )}
                {/* This plane sits in front of the print and owns its whole
                    pointer area. It renders nothing, but unlike the tiny tack
                    it travels with the photo and always reaches Grabbable. */}
                <mesh name={`grab-surface:${pin.id}`} position={[0, 0, 0.024]}>
                  <planeGeometry args={[pin.width + 0.018, height + 0.018]} />
                  <meshBasicMaterial
                    transparent
                    opacity={0}
                    depthWrite={false}
                    colorWrite={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </group>
            </Grabbable>
            {/* Pull the print out from under its tack. The tack belongs to the
                board and opts out of raycasting so it cannot steal the hit. */}
            <mesh
              position={[
                pin.x - Math.sin(pin.roll) * tackOffsetY,
                pin.y - 0.396 + Math.cos(pin.roll) * tackOffsetY,
                0.04,
              ]}
              raycast={() => null}
              userData={{ physicsIgnore: true }}
            >
              <sphereGeometry args={[0.009, 10, 10]} />
              <meshStandardMaterial
                color={palette.hub}
                metalness={0.45}
                roughness={0.4}
              />
            </mesh>
          </React.Fragment>
        );
      })}
    </group>
  );
}

export default function UnitTraining({ palette, dark, index }: UnitProps) {
  const textured = useUnitLod(index);
  const targetPosition = React.useMemo(() => golfFlagPosition(index), [index]);
  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            <TrainingPhoto
              unitIndex={index}
              palette={palette}
              id="training-golf-group-v8"
              base={[-1.08, 0, 0.1]}
              seat={deskFrameHeight(0.204) / 2}
              rotation={[-0.09, -0.17, 0.02]}
              width={0.272}
            >
              <DeskFrame
                src="/images/stacks/v8/training-golf-group.webp"
                palette={palette}
                textured={textured}
                width={0.272}
                height={0.204}
              />
            </TrainingPhoto>
            <TrainingPhoto
              unitIndex={index}
              palette={palette}
              id="training-golf-flag-v8"
              base={[-0.74, 0, 0.13]}
              seat={deskFrameHeight(0.24) / 2}
              rotation={[-0.1, 0.14, -0.02]}
              width={0.18}
            >
              <DeskFrame
                src="/images/stacks/v8/training-golf-flag.webp"
                palette={palette}
                textured={textured}
                width={0.18}
                height={0.24}
              />
            </TrainingPhoto>
            {(
              [
                { id: "diet-dr-pepper", x: -0.39 },
                { id: "sunkist-zero", x: -0.18 },
                { id: "mtn-dew-zero", x: 0.03 },
              ] as const
            ).map((can, i) => (
              <Grabbable
                key={can.id}
                unitIndex={index}
                hoverKey={`grab:can:${can.id}`}
                base={[can.x, 0, 0.1]}
                shadeColor={palette.shadow}
                shadeWidth={0.18}
                shape="box"
                massKg={0.36}
              >
                <SodaCan
                  dark={dark}
                  brand={can.id}
                  rotation={[0, [0.18, -0.2, 0.38][i] ?? 0, 0]}
                />
              </Grabbable>
            ))}
            <Grabbable
              unitIndex={index}
              hoverKey="grab:protein"
              base={[0.38, 0, 0.04]}
              shadeColor={palette.shadow}
              shadeWidth={0.4}
              shape="box"
              massKg={0.9}
            >
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/protein-powder.glb"
                  dark={dark}
                  variant="tinted"
                  tints={{
                    Plastic1Protein1: "#f5f0e6",
                    Lid1Protein1: "#1262b6",
                  }}
                  rotation={[0, 0.3, 0]}
                  scale={2.082}
                />
              </React.Suspense>
              <mesh position={[0, 0.26, 0]} rotation={[0, 0.3, 0]}>
                <cylinderGeometry args={[0.159, 0.159, 0.32, 40, 1, true]} />
                <meshStandardMaterial
                  map={proteinLabelTexture()}
                  roughness={0.58}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </Grabbable>
            <Grabbable
              unitIndex={index}
              hoverKey="grab:basketball"
              base={[0.88, 0, -0.035]}
              shadeColor={palette.shadow}
              shadeWidth={0.45}
              shape="sphere"
              massKg={0.62}
              restitution={0.62}
              maxThrowSpeed={8}
            >
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/basketball.glb"
                  dark={dark}
                  variant="tinted"
                  tintAll="#b77a4f"
                  roughness={0.78}
                  smoothNormals
                  rotation={[0, 1.2, 0]}
                  position={[0, -0.016, 0]}
                  scale={0.435}
                />
              </React.Suspense>
            </Grabbable>
          </group>
        }
      >
        <group position={[-0.44, 0.009, -0.17]} rotation={[-0.1, 0.08, 0.015]}>
          <TrainingBoard
            palette={palette}
            textured={textured}
            unitIndex={index}
          />
        </group>
        <Grabbable
          unitIndex={index}
          hoverKey="grab:dumbbell:training:left"
          base={[-1.02, 0, 0.15]}
          shadeColor={palette.shadow}
          shadeWidth={0.52}
          shape="box"
          massKg={12}
          to="weightlifting"
        >
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/dumbbell.glb"
              dark={dark}
              atlasOverride={{ tint: "#76716d", roughness: 0.55 }}
              rotation={[0, 1.18, 0]}
              scale={1.55}
            />
          </React.Suspense>
        </Grabbable>
        <Grabbable
          unitIndex={index}
          hoverKey="grab:kettlebell"
          base={[0.48, 0, 0.05]}
          shadeColor={palette.shadow}
          shadeWidth={0.32}
          shape="box"
          massKg={16}
          to="weightlifting"
        >
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/kettlebell.glb"
              dark={dark}
              variant="tinted"
              tints={{ phong1SG: palette.hub }}
              roughness={0.5}
              rotation={[0, -0.4, 0]}
              scale={1.85}
            />
          </React.Suspense>
        </Grabbable>
        <ShakerProp
          unitIndex={index}
          palette={palette}
          dark={dark}
          base={[REVIEWED_SHELF_LAYOUT.training.shakerX[0], 0, 0.045]}
        />
        <ShakerProp
          unitIndex={index}
          palette={palette}
          dark={dark}
          id="training-navy"
          cupColor={dark ? "#46647a" : "#7596aa"}
          lidColor="#263a52"
          base={[REVIEWED_SHELF_LAYOUT.training.shakerX[1], 0, 0]}
        />
        <ShakerProp
          unitIndex={index}
          palette={palette}
          dark={dark}
          id="training-amber"
          cupColor={dark ? "#8b6044" : "#c78e65"}
          lidColor="#633a2b"
          base={[REVIEWED_SHELF_LAYOUT.training.shakerX[2], 0, 0.025]}
        />
      </ShelfUnit>

      {/* The single loaded bar owns the rear exercise bay. The two loose
          bumper stacks that used to sit behind the unit repeated its plates
          and read as unrelated weights, so they are intentionally absent. */}
      <Grabbable
        unitIndex={index}
        to="weightlifting"
        hoverKey="grab:barbell"
        base={TRAINING_BARBELL_POSE.base}
        shadeColor={palette.shadow}
        shadeWidth={1.35}
        shape="box"
        massKg={60}
        standsOn="floor"
        spin={0.16}
      >
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/barbell.glb"
            dark={dark}
            variant="tinted"
            tints={{ Iron1Barbell1: palette.hub, Steel1Barbell1: "#8a8f94" }}
            roughness={0.45}
            rotation={TRAINING_BARBELL_POSE.rotation}
            scale={TRAINING_BARBELL_POSE.scale}
          />
        </React.Suspense>
      </Grabbable>

      {/* A second compact dumbbell belongs to the floor exercise bay. Keeping
          it on a different plane prevents two handles and four heads from
          collapsing into a fake loaded bar across the top shelf. */}
      <Grabbable
        unitIndex={index}
        hoverKey="grab:dumbbell:training:right"
        base={[-0.98, SHELF_GEOMETRY.groundY, 0.72]}
        shadeColor={palette.shadow}
        shadeWidth={0.64}
        shape="box"
        massKg={10}
        standsOn="floor"
        to="weightlifting"
      >
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/dumbbell.glb"
            dark={dark}
            atlasOverride={{ tint: "#8c8781", roughness: 0.58 }}
            rotation={[0, -0.54, 0]}
            scale={1.42}
          />
        </React.Suspense>
      </Grabbable>

      <GolfExperience palette={palette} dark={dark} index={index} />
      {GOLF_TEE_STARTS.map(([x, z], tee) => (
        <group
          key={`golf-tee:${tee}`}
          position={[x, SHELF_GEOMETRY.groundY + 0.012, z]}
          rotation={GOLF_TEE_ROTATIONS[tee]}
        >
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/golf-tee.glb"
              dark={dark}
              variant="tinted"
              tintAll={tee === 1 ? "#2d6da3" : "#f2ede2"}
              scale={0.00036}
            />
          </React.Suspense>
        </group>
      ))}
      <React.Suspense fallback={null}>
        <WavingGolfFlag dark={dark} position={targetPosition} />
      </React.Suspense>
      <FootPool
        color={palette.shadow}
        size={[0.58, 0.42]}
        position={[
          GOLF_CLUB_REST_BASE.x,
          GOLF_CLUB_REST_BASE.y,
          GOLF_CLUB_REST_BASE.z,
        ]}
      />
    </group>
  );
}

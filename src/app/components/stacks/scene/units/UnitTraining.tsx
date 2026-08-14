"use client";

import Grabbable, { type GrabbableCommand } from "../Grabbable";
import { FootPool } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { Sway } from "../eggs";
import { SodaCan } from "../objects";
import { DeskFrame, PHOTO_LINKS, PhotoMount, deskFrameHeight } from "../photos";
import { BookPile, ShelfUnit } from "../primitives";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import { useUnitLod } from "../useUnitLod";
import { RoundedBox } from "@react-three/drei";
import React from "react";
import * as THREE from "three";

import {
  GOLF_BALL_RADIUS,
  GOLF_SHOT_RETURN_MS,
  GOLF_SHOT_VELOCITIES,
  createDimpledGolfBallGeometry,
  createGolfBallBumpTexture,
} from "./trainingGolfBall";
import type { UnitProps } from "./types";

const CLUB_SCALE = 2.35;
const GOLF_BALL_GEOMETRY = createDimpledGolfBallGeometry();
const GOLF_BALL_BUMP = createGolfBallBumpTexture();

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
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={Math.max(0.3, width * 1.18)}
      shape="box"
      massKg={0.45}
      href={PHOTO_LINKS[id] ?? undefined}
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
        return (
          <PhotoMount
            key={pin.id}
            unitIndex={unitIndex}
            id={pin.id}
            position={[pin.x, pin.y - 0.396, 0.026]}
            rotation={[0, 0, pin.roll]}
            lift={[0, 0, 0.012]}
          >
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
            <mesh position={[0, height / 2 - 0.012, 0.014]}>
              <sphereGeometry args={[0.009, 10, 10]} />
              <meshStandardMaterial
                color={palette.hub}
                metalness={0.45}
                roughness={0.4}
              />
            </mesh>
          </PhotoMount>
        );
      })}
    </group>
  );
}

function GolfBall({
  unitIndex,
  palette,
  position,
  id,
}: {
  unitIndex: number;
  palette: UnitProps["palette"];
  position: [number, number, number];
  id: keyof typeof GOLF_SHOT_VELOCITIES;
}) {
  const commandRef = React.useRef<GrabbableCommand | null>(null);
  const shot = GOLF_SHOT_VELOCITIES[id];
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={`grab:golf-ball:${id}`}
      base={position}
      shadeColor={palette.shadow}
      shadeWidth={0.14}
      shape="sphere"
      massKg={0.046}
      standsOn="floor"
      commandRef={commandRef}
      onTap={() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
          return;
        commandRef.current?.launch([shot[0], shot[1], shot[2]], {
          returnAfterMs: GOLF_SHOT_RETURN_MS,
          terrain: "meadow",
        });
      }}
    >
      <mesh
        castShadow
        dispose={null}
        geometry={GOLF_BALL_GEOMETRY}
        position={[0, GOLF_BALL_RADIUS, 0]}
      >
        <meshStandardMaterial
          bumpMap={GOLF_BALL_BUMP}
          bumpScale={0.01}
          color={palette.pages}
          roughness={0.56}
        />
      </mesh>
      <mesh position={[0, 0.065, 0]} userData={{ physicsIgnore: true }}>
        <sphereGeometry args={[0.105, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </Grabbable>
  );
}

export default function UnitTraining({ palette, dark, index }: UnitProps) {
  const textured = useUnitLod(index);
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
              to="weightlifting"
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
              to="weightlifting"
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
        <BookPile
          palette={palette}
          x={0.78}
          salt={31}
          linkUnit={index}
          grabbable
        />
        <Grabbable
          unitIndex={index}
          hoverKey="grab:plant:training"
          base={[1.18, 0, -0.2]}
          shadeColor={palette.shadow}
          shadeWidth={0.3}
          shape="box"
          massKg={2.2}
        >
          <Sway unitIndex={index} amount={0.014} rate={0.32} phase={2.1}>
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/potted-plant.glb"
                dark={dark}
                rotation={[0, -0.6, 0]}
                scale={0.82}
              />
            </React.Suspense>
          </Sway>
        </Grabbable>
      </ShelfUnit>

      {/* The single loaded bar owns the rear exercise bay. The two loose
          bumper stacks that used to sit behind the unit repeated its plates
          and read as unrelated weights, so they are intentionally absent. */}
      <Grabbable
        unitIndex={index}
        to="weightlifting"
        hoverKey="grab:barbell"
        base={[1.92, SHELF_GEOMETRY.groundY, -1.04]}
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
            rotation={[0, -Math.PI / 4, 0]}
            scale={0.77}
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

      <Grabbable
        unitIndex={index}
        hoverKey="grab:golf-club"
        base={[-2.05, SHELF_GEOMETRY.groundY, 0.32]}
        shadeColor={palette.shadow}
        shadeWidth={0.46}
        shape="box"
        massKg={0.42}
        standsOn="floor"
      >
        {/* The previous tap animation swung a 1.8-unit radius through 2.18
            radians around the grip, necessarily throwing the head into the
            sky. The authored swing is disabled until it can be rebuilt from
            a physically constrained local rig; the club remains draggable. */}
        <group position={[0, -0.005, 0]} rotation={[0, 0, -0.18]}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/golf-club.glb"
              dark={dark}
              variant="tinted"
              tints={{
                M_PCL_Flat_Black: palette.hub,
                M_PCL_Flat_Grey_Light: palette.metal,
                M_PCL_Flat_White_Darker: "#9aa0a4",
              }}
              rotation={[0, -1, 0]}
              scale={CLUB_SCALE}
            />
          </React.Suspense>
        </group>
      </Grabbable>
      <GolfBall
        unitIndex={index}
        palette={palette}
        id="one"
        position={[-1.7, SHELF_GEOMETRY.groundY, 0.4]}
      />
      <GolfBall
        unitIndex={index}
        palette={palette}
        id="two"
        position={[-1.52, SHELF_GEOMETRY.groundY, 0.29]}
      />
      <GolfBall
        unitIndex={index}
        palette={palette}
        id="three"
        position={[-1.9, SHELF_GEOMETRY.groundY, 0.34]}
      />
      <GolfBall
        unitIndex={index}
        palette={palette}
        id="four"
        position={[-1.62, SHELF_GEOMETRY.groundY, 0.16]}
      />
      <FootPool
        color={palette.shadow}
        size={[0.58, 0.42]}
        position={[-2.05, SHELF_GEOMETRY.groundY, 0.32]}
      />
    </group>
  );
}

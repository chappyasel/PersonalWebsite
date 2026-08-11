"use client";

import Grabbable, { type GrabbableCommand } from "../Grabbable";
import { ContactShade, FootPool } from "../GroundPool";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { Sway } from "../eggs";
import PropLink from "../links";
import { SodaCan, reducedMotion } from "../objects";
import { DeskFrame, PHOTO_LINKS, PhotoMount, deskFrameHeight } from "../photos";
import { BookPile, BumperPlates, ShelfUnit } from "../primitives";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import { useUnitLod } from "../useUnitLod";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useRef } from "react";
import * as THREE from "three";

import type { UnitProps } from "./types";

const CLUB_SCALE = 2.35;
const CLUB_GRIP: [number, number, number] = [0.104, 1.806, 0];
const CLUB_NODE = "stacks-golf-swing";

function ClubSwing({
  triggerRef,
  onImpact,
  children,
}: {
  triggerRef?: React.MutableRefObject<(() => void) | null>;
  onImpact: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(-1);
  const hit = useRef(false);
  const still = React.useMemo(() => reducedMotion(), []);
  const start = React.useCallback(() => {
    if (still) {
      onImpact();
      return;
    }
    t.current = 0;
    hit.current = false;
  }, [onImpact, still]);
  React.useEffect(() => {
    if (!triggerRef) return;
    triggerRef.current = start;
    return () => {
      triggerRef.current = null;
    };
  }, [start, triggerRef]);
  useFrame((_, delta) => {
    const group = ref.current;
    if (!group || t.current < 0) return;
    t.current += Math.min(delta, 1 / 30);
    const time = t.current;
    if (time < 0.38) {
      // Deliberate backswing: the head rises before accelerating through the
      // ball, which reads as a golf stroke rather than another shelf wobble.
      const p = THREE.MathUtils.smoothstep(time, 0, 0.38);
      group.rotation.z = THREE.MathUtils.lerp(0, 0.72, p);
      return;
    }
    if (time < 0.68) {
      const p = THREE.MathUtils.smoothstep(time, 0.38, 0.68);
      group.rotation.z = THREE.MathUtils.lerp(0.72, -2.18, p);
      if (!hit.current && p > 0.64) {
        hit.current = true;
        onImpact();
      }
      return;
    }
    if (time > 1.55) {
      group.rotation.z = 0;
      t.current = -1;
      return;
    }
    const p = THREE.MathUtils.smoothstep(time, 0.68, 1.55);
    group.rotation.z = THREE.MathUtils.lerp(-2.18, 0, p);
  });
  return (
    <group ref={ref} name={CLUB_NODE} position={CLUB_GRIP}>
      <group position={[-CLUB_GRIP[0], -CLUB_GRIP[1], 0]}>
        {children}
        <mesh position={[0.05, 0.92, -0.03]}>
          <boxGeometry args={[0.15, 1.88, 0.14]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
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
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={`grab:photo:${id}`}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={Math.max(0.3, width * 1.18)}
      shape="box"
      massKg={0.45}
      href={PHOTO_LINKS[id] ?? undefined}
    >
      <group position={[0, seat, 0]} rotation={rotation}>
        {children}
      </group>
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
  commandRef,
}: {
  unitIndex: number;
  palette: UnitProps["palette"];
  position: [number, number, number];
  id: string;
  commandRef?: React.MutableRefObject<GrabbableCommand | null>;
}) {
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
      to="weightlifting"
      commandRef={commandRef}
    >
      <mesh castShadow position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.05, 20, 20]} />
        <meshStandardMaterial color={palette.pages} roughness={0.62} />
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
  const clubTrigger = useRef<(() => void) | null>(null);
  const strikeBall = useRef<GrabbableCommand | null>(null);
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
                {
                  id: "diet-dr-pepper",
                  x: -0.39,
                  href: "https://www.target.com/p/-/A-12965383",
                },
                {
                  id: "sunkist-zero",
                  x: -0.18,
                  href: "https://www.sunkistsoda.com/",
                },
                {
                  id: "mtn-dew-zero",
                  x: 0.03,
                  href: "https://www.pepsicopartners.com/pepsico/en/USD/BEVERAGES/Soft-Drinks/Mountain-Dew-Zero-Sugar/p/1-SN109-1",
                },
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
                href={can.href}
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

      {/* The loaded bar and spare bumpers belong in the rear floor bay, not
          on a display plank. Keeping both behind the shelf legs preserves the
          seven-photo board and prevents the plate silhouettes from reading as
          an overhanging shelf prop. */}
      <group position={[-0.68, SHELF_GEOMETRY.groundY, -1.22]} scale={1.05}>
        <BumperPlates linkUnit={index} />
        <ContactShade
          color={palette.shadow}
          width={0.72}
          position={[0.12, 0.03, 0.08]}
        />
      </group>
      <PropLink unitIndex={index} to="weightlifting" hoverKey="link:barbell">
        <group position={[2.12, SHELF_GEOMETRY.groundY, -0.72]}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/barbell.glb"
              dark={dark}
              variant="tinted"
              tints={{ Iron1Barbell1: palette.hub, Steel1Barbell1: "#8a8f94" }}
              roughness={0.45}
              rotation={[0, 0.02, 0]}
              scale={0.77}
            />
          </React.Suspense>
        </group>
      </PropLink>

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
        onTap={() => clubTrigger.current?.()}
      >
        <group position={[0, -0.005, 0]} rotation={[0, 0, -0.18]}>
          <ClubSwing
            triggerRef={clubTrigger}
            onImpact={() => strikeBall.current?.launch([4.8, 1.15, -0.2])}
          >
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
          </ClubSwing>
        </group>
      </Grabbable>
      <GolfBall
        unitIndex={index}
        palette={palette}
        id="one"
        position={[-1.7, SHELF_GEOMETRY.groundY, 0.4]}
        commandRef={strikeBall}
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

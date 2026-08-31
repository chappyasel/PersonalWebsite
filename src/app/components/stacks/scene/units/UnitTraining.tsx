"use client";

import type { ArtifactPreviewFrameLayer } from "../../modal/artifactPreviewFrame";
import type { PhotoArtifactId } from "../../sceneArtifacts";
import { rand } from "../../theme";
import { ShakerProp } from "../AuthoredProps";
import Grabbable from "../Grabbable";
import { FootPool } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { RoundedBox } from "../RoundedBox";
import WavingGolfFlag from "../WavingGolfFlag";
import { useRegisterArtifactPreviewFrame } from "../artifactPreviewFrames";
import { RollProp } from "../eggs";
import { GolfBallProp } from "../golf/GolfBallProp";
import GolfExperience from "../golf/GolfExperience";
import { GOLF_FLAG_LOCAL } from "../golf/golfCourse";
import {
  GOLF_CLUB_REST_BASE,
  GOLF_TEE_LAYOUT,
  GOLF_TEE_MODEL_HEIGHT,
  GOLF_TEE_SCALE,
} from "../golf/golfLayout";
import { meadowHeight } from "../meadowField";
import { scenePhotoUrl } from "../photoTextures";
import { DeskFrame, FlatPrint, deskFrameHeight } from "../photos";
import { ShelfUnit, WoodMaterial } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { unitPose } from "../worldLayout";
import React from "react";
import * as THREE from "three";

import { TrainingFigureCards } from "./TrainingFigureCards";
import {
  TRAINING_BOARD_SIZE,
  TRAINING_PINS,
  type TrainingBoardPin,
} from "./trainingBoardLayout";
import { GorillaModeTub, PreXTub, ProteinTub } from "./trainingTubs";
import type { UnitProps } from "./types";
import {
  REVIEWED_SHELF_LAYOUT,
  TRAINING_BARBELL_POSE,
} from "./unitShelfLayout";

export { TRAINING_BARBELL_POSE } from "./unitShelfLayout";

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
  facingRotation,
  hingeOnHover = false,
  width,
  children,
}: {
  unitIndex: number;
  palette: UnitProps["palette"];
  id: PhotoArtifactId;
  base: [number, number, number];
  seat: number;
  rotation: [number, number, number];
  facingRotation?: [number, number, number];
  hingeOnHover?: boolean;
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
      hoverTiltAngle={hingeOnHover ? Math.PI / 3 : undefined}
      artifact={id}
    >
      <HeldFacing
        hoverKey={hoverKey}
        position={[0, seat, 0]}
        rest={rotation}
        facingRotation={facingRotation}
      >
        {children}
      </HeldFacing>
    </Grabbable>
  );
}

/** The three prints on the lower shelf. Sized with the other shelves' desk
 * frames in mind (Talks runs 0.53 to 0.72 wide, About's portraits are 0.18 to
 * 0.2 by 0.24 to 0.26): a third bigger than the v8 placement, so they read as
 * photographs rather than thumbnails.
 *
 * The pickleball group joined them on 2026-08-29, in the slot the soda-can
 * pyramid left when it went over to Systems. It takes the golf group's
 * treatment verbatim — same 4:3 source, same 0.36 width, same seat and lean —
 * because a second court-sport group shot beside the first should read as one
 * pair of photographs, not as two different framing decisions. Its yaw turns
 * the other way, which is the only thing that keeps them from being a
 * repeated element: the row now fans out from the middle of the plank. */
const TRAINING_GOLF_PRINTS = {
  group: { base: [-1.1, 0, 0.1], width: 0.36, height: 0.27 },
  flag: { base: [-0.69, 0, 0.13], width: 0.24, height: 0.32 },
  pickleball: { base: [-0.12, 0, 0.06], width: 0.36, height: 0.27 },
} as const;

/** Three tees lying loose at the foot of the golf prints, as if tipped out
 * of a pocket: three yaws, not a row. Each lies centred on its base, tip
 * touching the wood, cup end lifted by its own radius. */
const TRAINING_SHELF_TEES = [
  { id: "shelf-left", x: -1.14, z: 0.185, yaw: 0.28, tint: "#f2ede2" },
  { id: "shelf-middle", x: -0.93, z: 0.18, yaw: 0.5, tint: "#e8d7a8" },
  { id: "shelf-right", x: -0.66, z: 0.18, yaw: -0.16, tint: "#f2ede2" },
] as const;

/** Real sizes at the shelves' 2.00 world units per metre: a 24 cm
 * basketball, a 7.4 cm baseball, 6.7 cm tennis balls. Every GLB stands
 * bottom-at-origin with the diameter stacks-render measured (0.8785 for the
 * baseball, 0.1172 for the tennis ball), so scale is the wanted diameter
 * over the measured one. */
export const TRAINING_BALLS = {
  basketball: { radius: 0.24, scale: 0.435, massKg: 0.62 },
  baseball: { radius: 0.074, scale: 0.148 / 0.8785, massKg: 0.145 },
  tennis: { radius: 0.067, scale: 0.134 / 0.1172, massKg: 0.058 },
} as const;

/** Loose balls on the lower shelf: a tennis ball behind the golf prints,
 * the baseball in front of the basketball. Every ball on the shelf, these,
 * the basketball and the two golf balls, can be carried into the golf bay
 * and struck. */
const TRAINING_LOOSE_BALLS = [
  // In front of the flag print's corner, not behind it: at z -0.1 the print
  // hid all but its crown from the camera.
  { id: "tennis", kind: "tennis", x: -0.49, z: 0.12, yaw: 0.4 },
  { id: "baseball", kind: "baseball", x: 0.88, z: 0.14, yaw: 1.3 },
] as const;

/** Two golf balls at the foot of the golf prints. The same GolfBallProp as
 * the four in the bay: carry one over and the club will play it. */
const TRAINING_SHELF_GOLF_BALLS = [
  { id: "shelf-a", x: -0.42, z: 0.0, yaw: 0.7 },
  { id: "shelf-b", x: -0.34, z: -0.12, yaw: 2.4 },
] as const;

function LooseBall({
  unitIndex,
  palette,
  dark,
  id,
  kind,
  x,
  z,
  yaw,
}: Pick<UnitProps, "palette" | "dark"> & {
  unitIndex: number;
  id: string;
  kind: "tennis" | "baseball";
  x: number;
  z: number;
  yaw: number;
}) {
  const spec = TRAINING_BALLS[kind];
  const hoverKey = `grab:ball:${id}`;
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={[x, 0, z]}
      shadeColor={palette.shadow}
      shadeWidth={spec.radius * 1.9}
      shape="sphere"
      massKg={spec.massKg}
      restitution={kind === "tennis" ? 0.72 : 0.45}
      maxThrowSpeed={9}
      signature="roll"
      hittable={{ radius: spec.radius }}
    >
      <RollProp hoverKey={hoverKey}>
        <React.Suspense fallback={null}>
          <ModelProp
            url={
              kind === "tennis"
                ? "/models/tennis-ball.glb"
                : "/models/baseball.glb"
            }
            dark={dark}
            variant="tinted"
            // Both ship their own base colour texture (felt, leather and
            // stitching); the tint only takes the edge off pure white.
            tintAll={kind === "tennis" ? "#eef0d8" : "#f3efe6"}
            roughness={kind === "tennis" ? 0.96 : 0.62}
            smoothNormals={kind === "baseball"}
            rotation={[0, yaw, 0]}
            scale={spec.scale}
          />
        </React.Suspense>
      </RollProp>
    </Grabbable>
  );
}

/** The white mount under each pinned print, 9 mm a side. The preview redraws
 * the same mount around the enlarged photo. */
const PIN_MOUNT_BORDER = 0.009;
const PIN_MOUNT_RADIUS = 0.003;
const PIN_PREVIEW_LAYERS: readonly ArtifactPreviewFrameLayer[] = [
  { inset: PIN_MOUNT_BORDER, tone: "paper", radius: PIN_MOUNT_RADIUS },
];

/** One print on its mount. A component rather than inline JSX so it can
 * register its edges for the preview from under the pin's Grabbable. */
function PinnedPrint({
  pin,
  palette,
  textured,
}: {
  pin: TrainingBoardPin;
  palette: UnitProps["palette"];
  textured: boolean;
}) {
  const height = pin.height;
  useRegisterArtifactPreviewFrame(
    pin.width,
    height,
    PIN_PREVIEW_LAYERS,
    undefined,
    scenePhotoUrl(pin.src, "support"),
  );
  return (
    <group rotation={[0, 0, pin.roll]}>
      <RoundedBox
        castShadow
        args={[
          pin.width + PIN_MOUNT_BORDER * 2,
          height + PIN_MOUNT_BORDER * 2,
          0.008,
        ]}
        radius={PIN_MOUNT_RADIUS}
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
            // Ungraded, like every preview-openable photo (see photos.tsx).
            grade={0}
            position={[0, 0, 0.006]}
          />
        </React.Suspense>
      )}
      {/* This plane sits in front of the print and owns its whole
          pointer area. It renders nothing, but unlike the tiny tack
          it travels with the photo and always reaches Grabbable. */}
      <mesh name={`grab-surface:${pin.id}`} position={[0, 0, 0.024]}>
        <planeGeometry
          args={[
            pin.width + PIN_MOUNT_BORDER * 2,
            height + PIN_MOUNT_BORDER * 2,
          ]}
        />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

let corkTextureCache: THREE.DataTexture | null = null;

/**
 * A small shared cork grain. The board needs a material cue at shelf scale,
 * but loose fleck geometry would spend dozens of draw calls on marks that are
 * only a pixel or two wide. This one texture supplies the colour breakup,
 * roughness, and shallow pits instead.
 */
function corkGrainTexture(): THREE.DataTexture {
  if (corkTextureCache) return corkTextureCache;

  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const patch = rand(Math.floor(x / 5) + Math.floor(y / 5) * 26, 721);
      const grain = rand(index, 722);
      const pore = rand(index, 723);
      const value = Math.round(
        pore > 0.982 ? 142 + grain * 28 : 218 + patch * 20 + grain * 15,
      );
      const offset = index * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2.2);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  corkTextureCache = texture;
  return texture;
}

function CorkBoardBody({
  palette,
  dark,
  textured,
}: Pick<UnitProps, "palette" | "dark"> & { textured: boolean }) {
  const { width, height, frameInset } = TRAINING_BOARD_SIZE;
  const innerWidth = width - frameInset * 2;
  const innerHeight = height - frameInset * 2;
  const cork = textured ? corkGrainTexture() : null;

  return (
    <group>
      {/* The dark backing remains visible in the narrow seams between cork
          and frame, giving the inset a real edge instead of a painted line. */}
      <RoundedBox
        castShadow
        args={[width, height, 0.035]}
        radius={0.018}
        smoothness={4}
      >
        <meshStandardMaterial color={palette.woodDark} roughness={0.88} />
      </RoundedBox>
      <RoundedBox
        receiveShadow
        args={[innerWidth, innerHeight, 0.01]}
        position={[0, 0, 0.015]}
        radius={0.008}
        smoothness={3}
      >
        <meshStandardMaterial
          color={dark ? "#8f6040" : "#c18a5e"}
          map={cork ?? undefined}
          bumpMap={cork ?? undefined}
          bumpScale={0.0035}
          roughnessMap={cork ?? undefined}
          roughness={0.96}
        />
      </RoundedBox>

      {/* Four slim rails are enough to read as a framed pinboard. Keeping the
          vertical rails between the horizontal ones avoids chunky corners. */}
      {([-1, 1] as const).map((side) => (
        <RoundedBox
          key={`board-frame-horizontal:${side}`}
          castShadow
          args={[width, frameInset, 0.021]}
          position={[0, side * (height / 2 - frameInset / 2), 0.015]}
          radius={0.009}
          smoothness={3}
        >
          {textured ? (
            <WoodMaterial
              hex={palette.wood}
              repeat={[2.4, 1]}
              roughness={0.74}
            />
          ) : (
            <meshStandardMaterial color={palette.wood} roughness={0.74} />
          )}
        </RoundedBox>
      ))}
      {([-1, 1] as const).map((side) => (
        <RoundedBox
          key={`board-frame-vertical:${side}`}
          castShadow
          args={[frameInset, innerHeight, 0.021]}
          position={[side * (width / 2 - frameInset / 2), 0, 0.015]}
          radius={0.009}
          smoothness={3}
        >
          {textured ? (
            <WoodMaterial
              hex={palette.wood}
              vertical
              repeat={[1.7, 1]}
              roughness={0.74}
            />
          ) : (
            <meshStandardMaterial color={palette.wood} roughness={0.74} />
          )}
        </RoundedBox>
      ))}
    </group>
  );
}

function TrainingBoard({
  palette,
  dark,
  textured,
  unitIndex,
}: Pick<UnitProps, "palette" | "dark"> & {
  textured: boolean;
  unitIndex: number;
}) {
  return (
    <group position={[0, 0.396, 0]}>
      <CorkBoardBody palette={palette} dark={dark} textured={textured} />
      {TRAINING_PINS.map((pin) => {
        const height = pin.height;
        const hoverKey = `grab:photo:${pin.id}`;
        const tackOffsetY = height / 2 - 0.012;
        return (
          <React.Fragment key={pin.id}>
            <Grabbable
              unitIndex={unitIndex}
              hoverKey={hoverKey}
              base={[pin.x, pin.y, 0.026]}
              physicsDetachOffset={[0, 0, 0.08]}
              shadeColor={palette.shadow}
              shadeWidth={pin.width}
              shape="box"
              massKg={0.025}
              artifact={pin.id}
            >
              <PinnedPrint pin={pin} palette={palette} textured={textured} />
            </Grabbable>
            {/* Pull the print out from under its tack. The tack belongs to the
                board and opts out of raycasting so it cannot steal the hit. */}
            <mesh
              position={[
                pin.x - Math.sin(pin.roll) * tackOffsetY,
                pin.y + Math.cos(pin.roll) * tackOffsetY,
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
      <TrainingFigureCards unitIndex={unitIndex} />
    </group>
  );
}

export default function UnitTraining({ palette, dark, index }: UnitProps) {
  const textured = useUnitLod(index);
  const [plantedTeeRemoved, setPlantedTeeRemoved] = React.useState(false);
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
              base={[...TRAINING_GOLF_PRINTS.group.base]}
              seat={deskFrameHeight(TRAINING_GOLF_PRINTS.group.height) / 2}
              rotation={[-0.09, -0.17, 0.02]}
              width={TRAINING_GOLF_PRINTS.group.width}
            >
              <DeskFrame
                src="/images/stacks/v8/training-golf-group.webp"
                palette={palette}
                textured={textured}
                width={TRAINING_GOLF_PRINTS.group.width}
                height={TRAINING_GOLF_PRINTS.group.height}
              />
            </TrainingPhoto>
            <TrainingPhoto
              unitIndex={index}
              palette={palette}
              id="training-golf-flag-v8"
              base={[...TRAINING_GOLF_PRINTS.flag.base]}
              seat={deskFrameHeight(TRAINING_GOLF_PRINTS.flag.height) / 2}
              rotation={[-0.1, 0.14, -0.02]}
              width={TRAINING_GOLF_PRINTS.flag.width}
            >
              <DeskFrame
                src="/images/stacks/v8/training-golf-flag.webp"
                palette={palette}
                textured={textured}
                width={TRAINING_GOLF_PRINTS.flag.width}
                height={TRAINING_GOLF_PRINTS.flag.height}
              />
            </TrainingPhoto>
            <TrainingPhoto
              unitIndex={index}
              palette={palette}
              id="training-pickleball-group-v8"
              base={[...TRAINING_GOLF_PRINTS.pickleball.base]}
              seat={deskFrameHeight(TRAINING_GOLF_PRINTS.pickleball.height) / 2}
              rotation={[-0.09, 0.19, -0.02]}
              width={TRAINING_GOLF_PRINTS.pickleball.width}
            >
              <DeskFrame
                src="/images/stacks/v8/training-pickleball-group.webp"
                palette={palette}
                textured={textured}
                width={TRAINING_GOLF_PRINTS.pickleball.width}
                height={TRAINING_GOLF_PRINTS.pickleball.height}
              />
            </TrainingPhoto>
            {TRAINING_SHELF_TEES.map((tee) => (
              <Grabbable
                key={`golf-tee:${tee.id}`}
                unitIndex={index}
                hoverKey={`grab:golf-tee:${tee.id}`}
                base={[tee.x, 0.002, tee.z]}
                shadeColor={palette.shadow}
                shadeWidth={0.16}
                shape="box"
                massKg={0.002}
                spin={1.4}
              >
                <group rotation={[0, tee.yaw, 0]}>
                  <React.Suspense fallback={null}>
                    {/* The model stands tip-down at its origin. Rolled onto
                        its side along local x (tip at +x, cup at -x), the cup
                        end lifted by its own radius so the tip meets the
                        wood; the outer group then turns each tee. */}
                    <ModelProp
                      url="/models/golf-tee.glb"
                      dark={dark}
                      variant="tinted"
                      tintAll={tee.tint}
                      position={[GOLF_TEE_MODEL_HEIGHT / 2, 0, 0]}
                      rotation={[0, 0, Math.PI / 2 - 0.1]}
                      scale={GOLF_TEE_SCALE}
                    />
                  </React.Suspense>
                </group>
              </Grabbable>
            ))}
            {TRAINING_LOOSE_BALLS.map((ball) => (
              <LooseBall
                key={ball.id}
                unitIndex={index}
                palette={palette}
                dark={dark}
                {...ball}
              />
            ))}
            {TRAINING_SHELF_GOLF_BALLS.map((ball) => (
              <GolfBallProp
                key={ball.id}
                unitIndex={index}
                palette={palette}
                dark={dark}
                id={ball.id}
                base={[ball.x, 0, ball.z]}
                yaw={ball.yaw}
              />
            ))}
            {/* The heavier dumbbell lies across the back of the lower shelf
                at an angle, one plate toward the cans and the other toward
                the front; its lighter partner stands front-to-back at the
                top-left. Set down, not squared up. */}
            <Grabbable
              unitIndex={index}
              hoverKey="grab:dumbbell:training:left"
              base={[0.4, 0, -0.09]}
              shadeColor={palette.shadow}
              shadeWidth={0.74}
              shape="box"
              massKg={12}
              to="weightlifting"
            >
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/dumbbell.glb"
                  dark={dark}
                  atlasOverride={{ tint: "#76716d", roughness: 0.55 }}
                  rotation={[0, -0.45, 0]}
                  scale={1.55}
                />
              </React.Suspense>
            </Grabbable>
            <Grabbable
              unitIndex={index}
              hoverKey="grab:basketball"
              base={[1.06, 0, -0.08]}
              shadeColor={palette.shadow}
              shadeWidth={0.45}
              shape="sphere"
              massKg={TRAINING_BALLS.basketball.massKg}
              restitution={0.62}
              maxThrowSpeed={8}
              // A sphere, and the shared nod was tilting it about a support
              // edge it does not have. A ball rolls.
              signature="roll"
              hittable={{ radius: TRAINING_BALLS.basketball.radius }}
            >
              <RollProp hoverKey="grab:basketball">
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
              </RollProp>
            </Grabbable>
          </group>
        }
      >
        {/* The board sits 14 cm right of where it used to: the dumbbell's
            back plate at the left end was passing through its lower-left
            corner. */}
        <group position={[-0.3, 0.009, -0.17]} rotation={[-0.1, 0.08, 0.015]}>
          <TrainingBoard
            palette={palette}
            dark={dark}
            textured={textured}
            unitIndex={index}
          />
        </group>
        <TrainingPhoto
          unitIndex={index}
          palette={palette}
          id="training-gym-pose-v8"
          base={[-0.79, 0.006, 0.2]}
          seat={0}
          rotation={[0, -0.05, 0]}
          facingRotation={[Math.PI / 2, 0, 0]}
          hingeOnHover
          width={0.24}
        >
          <FlatPrint
            src="/images/stacks/v8/training-gym-pose.webp"
            palette={palette}
            textured={textured}
            width={0.24}
            height={0.32}
          />
        </TrainingPhoto>
        <TrainingPhoto
          unitIndex={index}
          palette={palette}
          id="training-deadlift-v8"
          base={[-0.43, 0.006, 0.2]}
          seat={0}
          rotation={[0, 0.04, 0]}
          facingRotation={[Math.PI / 2, 0, 0]}
          hingeOnHover
          width={0.285}
        >
          <FlatPrint
            src="/images/stacks/v8/training-deadlift.webp"
            palette={palette}
            textured={textured}
            width={0.285}
            height={0.27}
          />
        </TrainingPhoto>
        <TrainingPhoto
          unitIndex={index}
          palette={palette}
          id="training-bench-v8"
          base={[-0.05, 0.006, 0.19]}
          seat={0}
          rotation={[0, -0.03, 0]}
          facingRotation={[Math.PI / 2, 0, 0]}
          hingeOnHover
          width={0.275}
        >
          <FlatPrint
            src="/images/stacks/v8/training-bench.webp"
            palette={palette}
            textured={textured}
            width={0.275}
            height={0.267}
          />
        </TrainingPhoto>
        <Grabbable
          unitIndex={index}
          hoverKey="artifact:lift-table"
          artifact="lift-table"
          base={[0.29, 0.006, 0.17]}
          shadeColor={palette.shadow}
          shadeWidth={0.28}
          shape="box"
          massKg={0.08}
          physics={false}
          draggable={false}
          hoverTiltAngle={Math.PI / 3}
        >
          <HeldFacing
            hoverKey="artifact:lift-table"
            rest={[0, 0.05, 0]}
            facingRotation={[Math.PI / 2, 0, 0]}
          >
            {/* A letter page, the same paper as the three prints beside it
                and a touch larger than the photos: the four lie in one row,
                flat, 5 to 7 cm apart with their 14 mm borders counted. */}
            <FlatPrint
              src="/images/stacks/artifacts/lift-table.png"
              palette={palette}
              textured={textured}
              width={0.245}
              height={0.317}
            />
          </HeldFacing>
        </Grabbable>
        {/* The lighter dumbbell runs front-to-back at the left end of the
            top shelf, beside the board; the heavier one lies along the lower
            shelf. Two dumbbells set down at different moments, not a pair on
            display. */}
        <Grabbable
          unitIndex={index}
          hoverKey="grab:dumbbell:training:right"
          base={[-1.1, 0, 0.18]}
          shadeColor={palette.shadow}
          shadeWidth={0.52}
          shape="box"
          massKg={10}
          to="weightlifting"
        >
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/dumbbell.glb"
              dark={dark}
              atlasOverride={{ tint: "#8c8781", roughness: 0.58 }}
              rotation={[0, 1.3, 0]}
              scale={1.42}
            />
          </React.Suspense>
        </Grabbable>
        {/* Protein and PRE-X stand in a back row; Gorilla Mode, the one
            taken first, stands in front of them with the shakers. */}
        <ProteinTub
          unitIndex={index}
          palette={palette}
          dark={dark}
          base={[0.47, 0, -0.2]}
        />
        <GorillaModeTub
          unitIndex={index}
          palette={palette}
          dark={dark}
          base={[0.62, 0, 0.2]}
        />
        <PreXTub
          unitIndex={index}
          palette={palette}
          dark={dark}
          base={[0.8, 0, -0.2]}
        />
        {/* The shakers fan in depth rather than standing in a rank, and the
            front one tucks in ahead of the PRE-X tub. */}
        <ShakerProp
          unitIndex={index}
          palette={palette}
          dark={dark}
          base={[REVIEWED_SHELF_LAYOUT.training.shakerX[0], 0, 0.22]}
        />
        <ShakerProp
          unitIndex={index}
          palette={palette}
          dark={dark}
          id="training-navy"
          cupColor={dark ? "#46647a" : "#7596aa"}
          lidColor="#263a52"
          base={[REVIEWED_SHELF_LAYOUT.training.shakerX[1], 0, -0.02]}
        />
        <ShakerProp
          unitIndex={index}
          palette={palette}
          dark={dark}
          id="training-amber"
          cupColor={dark ? "#8b6044" : "#c78e65"}
          lidColor="#633a2b"
          base={[REVIEWED_SHELF_LAYOUT.training.shakerX[2], 0, 0.12]}
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

      <GolfExperience
        palette={palette}
        dark={dark}
        index={index}
        plantedTeeRemoved={plantedTeeRemoved}
      />
      {GOLF_TEE_LAYOUT.map((tee) => {
        const model = (
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/golf-tee.glb"
              dark={dark}
              variant="tinted"
              tintAll={tee.tint}
              position={[...tee.modelPosition]}
              rotation={[...tee.rotation]}
              scale={GOLF_TEE_SCALE}
            />
          </React.Suspense>
        );
        return (
          <Grabbable
            key={`golf-tee:${tee.id}`}
            unitIndex={index}
            hoverKey={`grab:golf-tee:${tee.id}`}
            base={[...tee.position]}
            shadeColor={palette.shadow}
            shadeWidth={0.16}
            shape="box"
            massKg={0.002}
            standsOn="floor"
            spin={1.4}
            onDragIntent={
              tee.id === "stand" ? () => setPlantedTeeRemoved(true) : undefined
            }
          >
            {model}
          </Grabbable>
        );
      })}
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

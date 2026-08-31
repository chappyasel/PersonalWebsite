"use client";

// Physical forms for the five featured-talk photographs — see
// talkGalleryLayout.ts for what each one is and why. Shared rules:
//
// - Geometry and the fullscreen preview both derive from the SAME layer
//   stack (setup.layers), registered through useRegisterArtifactPreviewFrame,
//   so the enlargement always carries exactly the edges the shelf shows.
// - Ornament that belongs to the carried object (the gilt corner rosettes,
//   the hanging board's eyelets) is marked `physicsIgnore`: the preview
//   measures the framed print's face from the subtree, and unmarked ornament
//   would grow the morph target past the frame itself.
// - Hardware that STAYS when the photo is lifted — the easel, the arm, the
//   wires, the plinth — is a sibling, mounted by the unit file. That is both
//   the room's convention and what a real shelf does.
// - Like every preview-openable photo, the prints render ungraded (grade 0):
//   the preview shows the raw file and the crossfade must not shift colour.
import { type Palette } from "../../theme";
import LitImage from "../LitImage";
import { RoundedBox } from "../RoundedBox";
import { useRegisterArtifactPreviewFrame } from "../artifactPreviewFrames";
import { scenePhotoUrl } from "../photoTextures";
import { WoodMaterial } from "../primitives";
import React from "react";

import {
  TALK_ARM,
  TALK_BEZEL,
  TALK_BRASS,
  TALK_EASEL,
  TALK_GILT,
  TALK_GILT_DEEP,
  TALK_GILT_METALNESS,
  TALK_GILT_ROUGHNESS,
  TALK_HANG,
  TALK_PLINTH,
  TALK_PLINTH_SLOT_Z,
  TALK_SETUPS,
  TALK_STONE,
  type TalkSetup,
  talkArmMount,
  talkBoxCenterLocalZ,
  talkEaselLipCenterLocalZ,
  talkEaselPlaneZ,
  talkFramedSize,
  talkHangWires,
  talkPlinthHeight,
  talkSeat,
} from "./talkGalleryLayout";

function useTalkPreviewFrame(setup: TalkSetup, src: string) {
  useRegisterArtifactPreviewFrame(
    setup.image.width,
    setup.image.height,
    setup.layers,
    setup.previewAccents,
    scenePhotoUrl(src, "feature"),
  );
}

function TalkImage({
  src,
  setup,
  textured,
}: {
  src: string;
  setup: TalkSetup;
  textured: boolean;
}) {
  if (!textured) return null;
  return (
    <React.Suspense fallback={null}>
      <LitImage
        url={src}
        role="feature"
        width={setup.image.width}
        height={setup.image.height}
        roughness={0.55}
        grade={0}
      />
    </React.Suspense>
  );
}

/** One course of molding, built as four mitred rails rather than a solid
 * box. This is not decoration for its own sake: concentric SOLID boxes share
 * a front face and z-fight, and the larger one hides the smaller, so a
 * stepped profile can only be built as rings. Rails also mean the molding
 * can stand PROUD of the photo the way real molding does. */
function TalkMoldingCourse({
  outerWidth,
  outerHeight,
  railWidth,
  depth,
  /** How far this course's BACK face sinks behind the image plane. Courses
   * must sink by DIFFERENT amounts: a back face flush with the backing
   * panel's front face — or with another course's — is coplanar, and
   * coplanar faces z-fight. Sunk inside the panel they are simply hidden. */
  sink,
  tone,
  metalness = TALK_GILT_METALNESS,
  roughness = TALK_GILT_ROUGHNESS,
}: {
  outerWidth: number;
  outerHeight: number;
  railWidth: number;
  depth: number;
  sink: number;
  tone: string;
  metalness?: number;
  roughness?: number;
}) {
  const material = (
    <meshStandardMaterial
      color={tone}
      roughness={roughness}
      metalness={metalness}
    />
  );
  return (
    <group position={[0, 0, depth / 2 - sink]}>
      {/* Top and bottom rails run the full width; the side rails OVERLAP into
          them rather than abutting exactly — two rails meeting face to face
          on one plane is the same z-fight in miniature. */}
      {[-1, 1].map((side) => (
        <RoundedBox
          key={`h${side}`}
          castShadow
          args={[outerWidth, railWidth, depth]}
          radius={0.003}
          smoothness={2}
          position={[0, (side * (outerHeight - railWidth)) / 2, 0]}
        >
          {material}
        </RoundedBox>
      ))}
      {[-1, 1].map((side) => (
        <RoundedBox
          key={`v${side}`}
          castShadow
          args={[railWidth, outerHeight - railWidth, depth]}
          radius={0.003}
          smoothness={2}
          position={[(side * (outerWidth - railWidth)) / 2, 0, 0]}
        >
          {material}
        </RoundedBox>
      ))}
    </group>
  );
}

/** Demo night — a deep carved gilt gallery frame: a backing panel, two
 * courses of molding rising outward, and a rosette at each corner. Far too
 * heavy for a stand, which is exactly why it leans on the bookcase post. */
export function TalkGiltFrame({
  src,
  palette,
  textured,
}: {
  src: string;
  palette: Palette;
  textured: boolean;
}) {
  const setup = TALK_SETUPS["talk-demo-night-v8"];
  const framed = talkFramedSize(setup);
  const molding = setup.layers[1]!.inset;
  const liner = setup.layers[0]!.inset;
  useTalkPreviewFrame(setup, src);
  return (
    <group>
      {/* Backing panel: the flat the photo and its liner are mounted on. */}
      <RoundedBox
        castShadow
        args={[framed.width, framed.height, setup.thickness]}
        radius={0.005}
        smoothness={3}
        position={[0, 0, talkBoxCenterLocalZ(setup)]}
      >
        <meshStandardMaterial
          color={TALK_GILT_DEEP}
          roughness={TALK_GILT_ROUGHNESS}
          metalness={TALK_GILT_METALNESS}
        />
      </RoundedBox>
      {/* Pale liner between photo and molding. */}
      <mesh position={[0, 0, -0.0008]}>
        <planeGeometry
          args={[setup.image.width + liner * 2, setup.image.height + liner * 2]}
        />
        <meshStandardMaterial color={palette.pages} roughness={0.88} />
      </mesh>
      <TalkImage src={src} setup={setup} textured={textured} />
      {/* Cove: the wide inner course, standing a little proud. */}
      <TalkMoldingCourse
        outerWidth={framed.width - 0.018}
        outerHeight={framed.height - 0.018}
        railWidth={molding - liner - 0.002}
        depth={0.016}
        sink={0.006}
        tone={TALK_GILT}
        metalness={TALK_GILT_METALNESS}
        roughness={TALK_GILT_ROUGHNESS}
      />
      {/* Outer rail: narrower, standing proudest of all. */}
      <TalkMoldingCourse
        outerWidth={framed.width}
        outerHeight={framed.height}
        railWidth={0.02}
        depth={0.024}
        sink={0.004}
        tone={TALK_GILT_DEEP}
        metalness={TALK_GILT_METALNESS + 0.06}
        roughness={TALK_GILT_ROUGHNESS - 0.04}
      />
      {/* Corner blocks — the joinery detail an ornate frame actually carries,
          square to the rails and flush with the outer edge. Turned 45° they
          poked past the silhouette as little arrowheads. Ornament, so
          `physicsIgnore` keeps them out of the preview's measurement of the
          framed face. */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sy) => (
          <RoundedBox
            key={`${sx}:${sy}`}
            userData={{ physicsIgnore: true }}
            args={[0.034, 0.034, 0.03]}
            radius={0.004}
            smoothness={2}
            position={[
              sx * (framed.width / 2 - 0.017),
              sy * (framed.height / 2 - 0.017),
              0.03 / 2 - 0.007,
            ]}
          >
            <meshStandardMaterial
              color={TALK_GILT}
              roughness={TALK_GILT_ROUGHNESS - 0.08}
              metalness={TALK_GILT_METALNESS + 0.1}
            />
          </RoundedBox>
        )),
      )}
    </group>
  );
}

/** DC policy — the formal presentation: gold fillet, wide warm mat, wood
 * frame. Stands on the ornate easel (a sibling; see TalkTableEasel). */
export function TalkEaselFrame({
  src,
  palette,
  textured,
}: {
  src: string;
  palette: Palette;
  textured: boolean;
}) {
  const setup = TALK_SETUPS["talk-dc-policy-v8"];
  const framed = talkFramedSize(setup);
  const fillet = setup.layers[0]!.inset;
  const mat = setup.layers[1]!.inset;
  useTalkPreviewFrame(setup, src);
  return (
    <group>
      <RoundedBox
        castShadow
        args={[framed.width, framed.height, setup.thickness]}
        radius={0.005}
        smoothness={3}
        position={[0, 0, talkBoxCenterLocalZ(setup)]}
      >
        <meshStandardMaterial color={palette.frame} roughness={0.55} />
      </RoundedBox>
      {/* Mat, then the gold fillet line just inside it. */}
      <mesh position={[0, 0, -0.0008]}>
        <planeGeometry
          args={[setup.image.width + mat * 2, setup.image.height + mat * 2]}
        />
        <meshStandardMaterial color={palette.pages} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, -0.0004]}>
        <planeGeometry
          args={[
            setup.image.width + fillet * 2,
            setup.image.height + fillet * 2,
          ]}
        />
        <meshStandardMaterial
          color={TALK_GILT}
          roughness={TALK_GILT_ROUGHNESS}
          metalness={TALK_GILT_METALNESS}
        />
      </mesh>
      <TalkImage src={src} setup={setup} textured={textured} />
      {/* A narrow raised lip at the frame's outer edge, so the wood reads as
          a moulded frame rather than a flat board. */}
      <TalkMoldingCourse
        outerWidth={framed.width}
        outerHeight={framed.height}
        railWidth={0.016}
        depth={0.012}
        sink={0.005}
        tone={palette.frame}
        metalness={0}
        roughness={0.62}
      />
    </group>
  );
}

/** Interview with Ann — a thin anodised bezel, the way a studio reference
 * monitor is framed. Carried from behind by the arm; nothing under it. */
export function TalkBezelPanel({
  src,
  textured,
}: {
  src: string;
  textured: boolean;
}) {
  const setup = TALK_SETUPS["talk-ann-interview-v8"];
  const framed = talkFramedSize(setup);
  useTalkPreviewFrame(setup, src);
  return (
    <group>
      <RoundedBox
        castShadow
        args={[framed.width, framed.height, setup.thickness]}
        radius={0.004}
        smoothness={3}
        position={[0, 0, talkBoxCenterLocalZ(setup)]}
      >
        <meshStandardMaterial
          color={TALK_BEZEL}
          roughness={0.38}
          metalness={0.65}
        />
      </RoundedBox>
      <TalkImage src={src} setup={setup} textured={textured} />
    </group>
  );
}

/** Consensus — a bare board, printed to the edge. It hangs on two wires, so
 * it carries its own eyelets and nothing else. */
export function TalkHungBoard({
  src,
  palette,
  textured,
}: {
  src: string;
  palette: Palette;
  textured: boolean;
}) {
  const setup = TALK_SETUPS["talk-consensus-phone-v8"];
  const framed = talkFramedSize(setup);
  useTalkPreviewFrame(setup, src);
  return (
    <group>
      <RoundedBox
        castShadow
        args={[framed.width, framed.height, setup.thickness]}
        radius={0.002}
        smoothness={2}
        position={[0, 0, talkBoxCenterLocalZ(setup)]}
      >
        <meshStandardMaterial color={palette.paper} roughness={0.82} />
      </RoundedBox>
      <TalkImage src={src} setup={setup} textured={textured} />
      {/* Brass eyelets, set so each ring's crown meets the board's top edge —
          which is where talkHangWires starts the wire. */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          userData={{ physicsIgnore: true }}
          position={[
            (side * framed.width * TALK_HANG.spread) / 2,
            framed.height / 2 - TALK_HANG.eyeletRadius,
            0.004,
          ]}
        >
          <torusGeometry args={[TALK_HANG.eyeletRadius, 0.003, 6, 16]} />
          <meshStandardMaterial
            color={TALK_BRASS}
            roughness={0.32}
            metalness={0.82}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Panel discussion — a deckled paper margin, reclining in the plinth's slot
 * (a sibling; see TalkStonePlinth). */
export function TalkDeckledPrint({
  src,
  palette,
  textured,
}: {
  src: string;
  palette: Palette;
  textured: boolean;
}) {
  const setup = TALK_SETUPS["talk-panel-v8"];
  const framed = talkFramedSize(setup);
  useTalkPreviewFrame(setup, src);
  return (
    <group>
      <RoundedBox
        castShadow
        args={[framed.width, framed.height, setup.thickness]}
        radius={0.002}
        smoothness={2}
        position={[0, 0, talkBoxCenterLocalZ(setup)]}
      >
        <meshStandardMaterial color={palette.paper} roughness={0.9} />
      </RoundedBox>
      <TalkImage src={src} setup={setup} textured={textured} />
    </group>
  );
}

// --- the hardware that stays behind -----------------------------------------

/** One lathe-turned easel leg: a square post with three turned bulges and a
 * brass finial, built from the layout's own numbers. */
function TalkEaselLeg({ palette }: { palette: Palette }) {
  return (
    <group>
      <mesh castShadow position={[0, TALK_EASEL.legLength / 2, 0]}>
        <boxGeometry
          args={[TALK_EASEL.legSize, TALK_EASEL.legLength, TALK_EASEL.legSize]}
        />
        <WoodMaterial
          hex={palette.strap}
          vertical
          repeat={[0.3, 2]}
          roughness={0.6}
        />
      </mesh>
      {TALK_EASEL.turnings.map((at) => (
        <mesh key={at} castShadow position={[0, TALK_EASEL.legLength * at, 0]}>
          <cylinderGeometry
            args={[
              TALK_EASEL.turningRadius,
              TALK_EASEL.turningRadius,
              TALK_EASEL.turningHeight,
              12,
            ]}
          />
          <WoodMaterial
            hex={palette.strap}
            repeat={[0.6, 0.2]}
            roughness={0.52}
          />
        </mesh>
      ))}
      <mesh castShadow position={[0, TALK_EASEL.legLength, 0]}>
        <sphereGeometry args={[TALK_EASEL.finialRadius, 12, 10]} />
        <meshStandardMaterial
          color={TALK_BRASS}
          roughness={0.32}
          metalness={0.78}
        />
      </mesh>
    </group>
  );
}

/** The ornate tabletop easel the DC frame stands on. Static scenery: grab
 * the photo and the easel stays, which is also what a real shelf does. Rake,
 * plane and tray heights come from the layout so the photo's back face rests
 * along the legs. */
export function TalkTableEasel({ palette }: { palette: Palette }) {
  const rake = TALK_EASEL.rake;
  const mastY = TALK_EASEL.legLength * Math.cos(rake);
  return (
    <group position={[TALK_EASEL.x, 0, 0]} rotation={[0, TALK_EASEL.yaw, 0]}>
      {/* Two front legs, raked back with the working plane and splayed so the
          feet stand wider than the crown. Their centrelines sit half a leg
          behind the plane: the plane is the legs' FRONT face, the one the
          photo's back actually rests on — a leg centred ON the plane pokes
          through the photo. */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[
            side * TALK_EASEL.legHalfSpan,
            0,
            talkEaselPlaneZ(0) - TALK_EASEL.legSize / 2 - 0.002,
          ]}
          rotation={[-rake, 0, side * TALK_EASEL.legSplay]}
        >
          <TalkEaselLeg palette={palette} />
        </group>
      ))}
      {/* Rear leg, hinged at the crown and planted behind. */}
      <group
        position={[0, mastY, talkEaselPlaneZ(mastY) - 0.03]}
        rotation={[TALK_EASEL.rearLegPitch, 0, 0]}
      >
        <mesh castShadow position={[0, -TALK_EASEL.rearLegLength / 2, 0]}>
          <boxGeometry
            args={[
              TALK_EASEL.legSize,
              TALK_EASEL.rearLegLength,
              TALK_EASEL.legSize,
            ]}
          />
          <WoodMaterial
            hex={palette.strap}
            vertical
            repeat={[0.3, 2]}
            roughness={0.6}
          />
        </mesh>
      </group>
      {/* Crossbar tying the front legs, with brass collars at each end. */}
      <group
        position={[
          0,
          TALK_EASEL.crossbarY,
          talkEaselPlaneZ(TALK_EASEL.crossbarY) - 0.018,
        ]}
        rotation={[-rake, 0, 0]}
      >
        <mesh castShadow>
          <boxGeometry
            args={[TALK_EASEL.legHalfSpan * 2 - 0.05, 0.032, 0.018]}
          />
          <WoodMaterial
            hex={palette.strap}
            repeat={[1.4, 0.2]}
            roughness={0.6}
          />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * (TALK_EASEL.legHalfSpan - 0.03), 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.024, 0.024, 0.016, 12]} />
            <meshStandardMaterial
              color={TALK_BRASS}
              roughness={0.35}
              metalness={0.75}
            />
          </mesh>
        ))}
      </group>
      {/* Brass-faced tray the frame stands on, with a front lip. */}
      <group
        position={[
          0,
          TALK_EASEL.trayY - TALK_EASEL.trayThickness / 2,
          talkEaselPlaneZ(TALK_EASEL.trayY) + TALK_EASEL.trayDepth / 2,
        ]}
        rotation={[-rake, 0, 0]}
      >
        <mesh castShadow>
          <boxGeometry
            args={[
              TALK_EASEL.trayWidth,
              TALK_EASEL.trayThickness,
              TALK_EASEL.trayDepth,
            ]}
          />
          <WoodMaterial
            hex={palette.strap}
            repeat={[1.4, 0.2]}
            roughness={0.6}
          />
        </mesh>
        <mesh
          castShadow
          position={[
            0,
            TALK_EASEL.lipHeight / 2 - TALK_EASEL.trayThickness / 2,
            talkEaselLipCenterLocalZ(),
          ]}
        >
          <boxGeometry
            args={[
              TALK_EASEL.trayWidth,
              TALK_EASEL.lipHeight,
              TALK_EASEL.lipThickness,
            ]}
          />
          <meshStandardMaterial
            color={TALK_BRASS}
            roughness={0.36}
            metalness={0.72}
          />
        </mesh>
      </group>
    </group>
  );
}

function ArmMetal() {
  return (
    <meshStandardMaterial
      color={TALK_BEZEL}
      roughness={0.36}
      metalness={0.72}
    />
  );
}

/** The studio monitor arm. A clamp bites over the plank's back edge, a post
 * rises from it, and a boom reaches forward to the head bolted on the back of
 * the panel — which is why nothing stands under that photograph. The
 * counterweight is not decoration: it is what makes the cantilever honest. */
export function TalkMonitorArm({ palette }: { palette: Palette }) {
  const mount = talkArmMount();
  const boomLength = mount.boomToZ - mount.boomFromZ;
  const dropHeight = Math.abs(TALK_ARM.boomY - mount.head[1]);
  return (
    <group position={[mount.postX, 0, 0]}>
      {/* Clamp body on the plank, with a rubber-faced jaw reaching down
          behind its back edge. */}
      <mesh
        castShadow
        position={[0, TALK_ARM.clampHeight / 2, TALK_ARM.clampZ]}
      >
        <boxGeometry
          args={[
            TALK_ARM.clampWidth,
            TALK_ARM.clampHeight,
            TALK_ARM.clampDepth,
          ]}
        />
        <ArmMetal />
      </mesh>
      <mesh
        position={[
          0,
          -TALK_ARM.jawDrop / 2,
          TALK_ARM.clampZ - TALK_ARM.clampDepth / 2 - 0.008,
        ]}
      >
        <boxGeometry args={[TALK_ARM.clampWidth, TALK_ARM.jawDrop, 0.016]} />
        <meshStandardMaterial
          color={palette.shadow}
          roughness={0.72}
          metalness={0.1}
        />
      </mesh>
      {/* Post. */}
      <mesh castShadow position={[0, TALK_ARM.boomY / 2, TALK_ARM.clampZ]}>
        <cylinderGeometry
          args={[TALK_ARM.postRadius, TALK_ARM.postRadius, TALK_ARM.boomY, 14]}
        />
        <ArmMetal />
      </mesh>
      {/* Counterweight disc, low on the post and behind it. */}
      <mesh
        castShadow
        position={[0, TALK_ARM.weightY, TALK_ARM.clampZ - 0.048]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry
          args={[
            TALK_ARM.weightRadius,
            TALK_ARM.weightRadius,
            TALK_ARM.weightThickness,
            18,
          ]}
        />
        <meshStandardMaterial
          color={palette.shadow}
          roughness={0.52}
          metalness={0.45}
        />
      </mesh>
      {/* Boom, running forward to the elbow above the panel's back. */}
      <mesh
        castShadow
        position={[0, TALK_ARM.boomY, mount.boomFromZ + boomLength / 2]}
      >
        <boxGeometry
          args={[TALK_ARM.boomThickness, TALK_ARM.boomThickness, boomLength]}
        />
        <ArmMetal />
      </mesh>
      <mesh castShadow position={[0, TALK_ARM.boomY, mount.boomToZ]}>
        <sphereGeometry args={[TALK_ARM.boomThickness * 0.72, 12, 10]} />
        <ArmMetal />
      </mesh>
      {/* Drop from the elbow to the head, and the head itself. */}
      <mesh
        castShadow
        position={[
          0,
          (TALK_ARM.boomY + mount.head[1]) / 2,
          (mount.boomToZ + mount.head[2]) / 2,
        ]}
      >
        <boxGeometry args={[TALK_ARM.headWidth * 0.45, dropHeight, 0.016]} />
        <ArmMetal />
      </mesh>
      <mesh castShadow position={[0, mount.head[1], mount.head[2] - 0.014]}>
        <boxGeometry args={[TALK_ARM.headWidth, TALK_ARM.headHeight, 0.026]} />
        <ArmMetal />
      </mesh>
    </group>
  );
}

/** The two wires the Consensus board hangs from, and the plates they run
 * into on the underside of the shelf above. Plumb, because that is the only
 * shape a loaded wire takes. */
export function TalkHangingWires() {
  const wires = talkHangWires();
  return (
    <group>
      {wires.map((wire, index) => (
        <group key={index}>
          <mesh
            position={[
              wire.eyelet[0],
              wire.eyelet[1] + wire.length / 2,
              wire.eyelet[2],
            ]}
          >
            <cylinderGeometry
              args={[
                TALK_HANG.wireRadius,
                TALK_HANG.wireRadius,
                wire.length,
                6,
              ]}
            />
            <meshStandardMaterial
              color={TALK_BRASS}
              roughness={0.3}
              metalness={0.85}
            />
          </mesh>
          <mesh
            position={[
              wire.anchor[0],
              TALK_HANG.anchorY - TALK_HANG.plateThickness / 2,
              wire.anchor[2],
            ]}
          >
            <boxGeometry
              args={[
                TALK_HANG.plateWidth,
                TALK_HANG.plateThickness,
                TALK_HANG.plateDepth,
              ]}
            />
            <meshStandardMaterial
              color={TALK_BRASS}
              roughness={0.36}
              metalness={0.78}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The stone plinth whose brass-lined slot grips the panel print. Static
 * scenery, like the easel and the arm. */
export function TalkStonePlinth() {
  const setup = TALK_SETUPS["talk-panel-v8"];
  const slotGap = setup.thickness + 0.005;
  const height = talkPlinthHeight();
  const bodyY = TALK_PLINTH.baseHeight;
  const capY = bodyY + TALK_PLINTH.bodyHeight;
  // Each course sinks a hair into the one below. Stacked exactly, a course's
  // bottom face and the next one's top face are coplanar over the whole
  // overlap — the same z-fight the frame molding had.
  const bite = 0.0015;
  return (
    <group position={[TALK_PLINTH.x, 0, 0]} rotation={[0, TALK_PLINTH.yaw, 0]}>
      {/* Brass base band. */}
      <RoundedBox
        castShadow
        args={[TALK_PLINTH.width, TALK_PLINTH.baseHeight, TALK_PLINTH.depth]}
        radius={0.003}
        smoothness={2}
        position={[0, TALK_PLINTH.baseHeight / 2, 0]}
      >
        <meshStandardMaterial
          color={TALK_BRASS}
          roughness={0.4}
          metalness={0.72}
        />
      </RoundedBox>
      {/* Stone body, drawn in from both the band and the cap. */}
      <RoundedBox
        castShadow
        args={[
          TALK_PLINTH.width - TALK_PLINTH.bodyInset * 2,
          TALK_PLINTH.bodyHeight + bite,
          TALK_PLINTH.depth - TALK_PLINTH.bodyInset * 2,
        ]}
        radius={0.004}
        smoothness={3}
        position={[0, bodyY + TALK_PLINTH.bodyHeight / 2 - bite / 2, 0]}
      >
        <meshStandardMaterial color={TALK_STONE} roughness={0.8} />
      </RoundedBox>
      {/* Stepped cap the slot is cut into. */}
      <RoundedBox
        castShadow
        args={[
          TALK_PLINTH.width,
          TALK_PLINTH.capHeight - TALK_PLINTH.chamfer + bite,
          TALK_PLINTH.depth,
        ]}
        radius={0.004}
        smoothness={3}
        position={[
          0,
          capY + (TALK_PLINTH.capHeight - TALK_PLINTH.chamfer) / 2 - bite / 2,
          0,
        ]}
      >
        <meshStandardMaterial color={TALK_STONE} roughness={0.74} />
      </RoundedBox>
      <RoundedBox
        castShadow
        args={[
          TALK_PLINTH.width - TALK_PLINTH.chamfer * 2,
          TALK_PLINTH.chamfer + bite,
          TALK_PLINTH.depth - TALK_PLINTH.chamfer * 2,
        ]}
        radius={0.002}
        smoothness={2}
        position={[0, height - TALK_PLINTH.chamfer / 2 - bite / 2, 0]}
      >
        <meshStandardMaterial color={TALK_STONE} roughness={0.7} />
      </RoundedBox>
      {/* Brass liner: two rails either side of the slot, raked with the print
          so the stone grips it along its whole bottom edge. */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          castShadow
          position={[
            0,
            height,
            TALK_PLINTH_SLOT_Z +
              (side * (slotGap + TALK_PLINTH.linerThickness)) / 2,
          ]}
          rotation={[setup.rest[0], 0, 0]}
        >
          <boxGeometry
            args={[
              TALK_PLINTH.slotWidth,
              TALK_PLINTH.chamfer * 2.6,
              TALK_PLINTH.linerThickness,
            ]}
          />
          <meshStandardMaterial
            color={TALK_BRASS}
            roughness={0.34}
            metalness={0.8}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Seat height for a carried print, re-exported so the unit file does not
 * have to reach into the layout module for one number. */
export { talkSeat };

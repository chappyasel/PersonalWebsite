"use client";

// Featured talks — five event photographs, foliage, and a floor lamp. Each
// photograph is displayed on its own support (a post lean, a tabletop easel,
// a kickstand, binder clips, a book-stack lean — see talkGalleryLayout.ts),
// and every still keeps its native aspect ratio instead of being recropped
// into one repeated thumbnail shape.
import type { PhotoArtifactId } from "../../sceneArtifacts";
import { useStacks } from "../../store";
import Grabbable from "../Grabbable";
import { FootPool } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import ModelProp from "../ModelProp";
import { LampSwitch, Sway } from "../eggs";
import {
  MOTH_LIGHT_PROFILES,
  TALKS_FLOOR_SHADE_RADIUS,
  registerMeadowLamp,
} from "../meadowLights";
import { ApertureHalo, GlowSprite, ShelfUnit } from "../primitives";
import { sceneUnitLightUserData } from "../sceneGpuPrewarm";
import { useUnitRealLights } from "../scenePerformance";
import { useUnitLod } from "../useUnitLod";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import StickerCamera, { STICKER_CAMERA } from "./StickerCamera";
import {
  TALK_SETUPS,
  type TalkSetupId,
  talkFramedSize,
  talkSeat,
} from "./talkGalleryLayout";
import {
  TalkBezelPanel,
  TalkDeckledPrint,
  TalkEaselFrame,
  TalkGiltFrame,
  TalkHangingWires,
  TalkHungBoard,
  TalkMonitorArm,
  TalkStonePlinth,
  TalkTableEasel,
} from "./talkPhotoSetups";
import { type UnitProps } from "./types";

/** Floor lamp, measured from lamp-floor.glb by material island rather than
 * eyeballed: the `lamp` shade runs y 0.6815…0.8600 with a 0.0878 mouth at the
 * bottom and a 0.0623 opening at the top; `metal` is the pole and base, y
 * 0…0.7607. Everything the light rig needs is those numbers times the scale,
 * so resizing the lamp cannot tear the rig off the shade — which is exactly
 * the trap the desk lamp is still sitting in, its MOUTH constants being
 * unscaled model space in a sibling of the ModelProp.
 *
 * 1.67 → 3.03 (owner: "the ladder and lamp still look significantly too
 * small"). The note this replaces reasoned inside a FLOOR family drawn at
 * ~0.96 units per metre, and that family was the error: the bookcase's own
 * joinery puts the room at 2.00 u/m — bay pitch 0.7275 (0.36 m), clear
 * headroom 0.8075 (0.40 m), plank depth 0.6 (0.30 m), all three a bookshelf
 * at 2.00 and none of them furniture at 0.96 — so the case is a 1.60 × 0.575 m
 * low unit and everything standing on the floor beside it was half size. At
 * 1.67 this was a 0.72 m lamp.
 *
 * 2.85 stands it 2.451 world = 1.23 m, and it is set by the FRAME rather than
 * by the metre: the top of the window is world y ~1.56 (measured off a
 * rendered frame — the plank at 0.035 lands at py 425 and the floor at py 745,
 * so this camera holds ~278 px per unit), and a real 1.50 m lamp at 3.49 would
 * push the shade — the only part of a lamp worth looking at — clean out of it.
 * 2.85 tops out at 1.336, which keeps sky above the shade at every pointer
 * position.
 *
 * The clock across the room moved in the same pass to the same real height:
 * 1.23 m of lamp beside a 1.23 m clock case. Both are capped by the same
 * window and both are honestly short of the object they depict — see the
 * report.
 *
 * Every world-space number that is NOT a child of the scaled ModelProp has to
 * move with it — light `distance` is a falloff radius in world units and a
 * parent scale does not touch it, and neither the glow sprites nor the ground
 * pools are children either. All of them are × 1.707 (2.85/1.67) below, and
 * the intensities are deliberately NOT: the lamp gets bigger, not brighter,
 * which is the same rule LampGlow's `reach` follows. */
const LAMP_S = 2.85;
const SHADE_BOTTOM_Y = 0.6815 * LAMP_S;
const SHADE_TOP_Y = 0.86 * LAMP_S;
const SHADE_BOTTOM_R = TALKS_FLOOR_SHADE_RADIUS;
const SHADE_TOP_R = 0.0623 * LAMP_S;

/** The vertical ramp painted onto the shade fabric — see ShadeFabric.
 *
 * v=0 is the BOTTOM ring of a cylinder's UV and CanvasTexture flips Y, so the
 * gradient is written from canvas-bottom upward and the stops read
 * bottom-rim → top-rim. Four pixels wide because nothing varies around the
 * circumference; the whole texture is 4 × 128. */
let fabricTextureCache: THREE.CanvasTexture | null = null;
function fabricTexture(): THREE.CanvasTexture {
  if (fabricTextureCache) return fabricTextureCache;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, h, 0, 0);
  // Peak just below mid-height (a floor-lamp bulb sits low in its shade),
  // arriving at BOTH rims with a near-zero derivative — the same reason
  // GlowSprite's halo traces a gaussian. A ramp that stops abruptly at a rim
  // draws a line there, and a line on a lampshade is a seam, not light.
  for (const [stop, a] of [
    [0, 0.05],
    [0.1, 0.28],
    [0.24, 0.68],
    [0.42, 1],
    [0.58, 0.86],
    [0.76, 0.44],
    [0.9, 0.15],
    [1, 0.02],
  ] as const) {
    grad.addColorStop(stop, `rgba(255, 201, 138, ${a})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, h);
  fabricTextureCache = new THREE.CanvasTexture(canvas);
  return fabricTextureCache;
}

/** A lit lampshade is TRANSLUCENT. The GLB's shade is one flat opaque island
 * of `lamp`-material yellow, which is why it read as painted plastic however
 * much glow was piled around it — the owner's "the lighting on this isn't at
 * all right".
 *
 * ModelProp's `tinted` variant only remaps `material.color`, so there is no
 * way to make the GLB's own fabric emit from a call site. This is the call-
 * site answer: a second cone, 3% proud of the measured shade, carrying an
 * additive vertical ramp. Brightest where the bulb is, falling to nothing at
 * both rims, so the fabric glows from within instead of being filled flat.
 *
 * Deliberately toneMapped (i.e. NOT `toneMapped={false}` like the mouth disc):
 * an additive layer this large held above the ACES shoulder is exactly what
 * blows out once the composer mounts and Bloom compounds it. Graded with the
 * room it stays a lit shade in both themes.
 *
 * FrontSide, and the back half is depth-tested away by the opaque GLB shade
 * it wraps — so the silhouette never doubles up.
 *
 * The radius is INSIDE the measured shade (0.975) and the material wins the
 * depth test with a polygon offset instead of by standing proud, which is the
 * one non-obvious thing here. Standing proud was tried first, at 1.03 and then
 * 1.06, and both drew a hard pale outline all the way round the lamp: the
 * band of cone hanging past the GLB's silhouette lands on the SKY, and warm
 * additive over a night sky is grey while over a morning sky it is white. The
 * halo the owner objected to, re-drawn as a rectangle. Sitting inside costs a
 * ~1px unlit rim of real shade at the edge — which is what the edge of fabric
 * looks like anyway — and costs nothing over the sky, which is the point.
 * 0.975 rather than a hair inside because the GLB shade is a coarse polygon:
 * its silhouette pulls in to ~0.98 of the circumscribed radius at each facet
 * midpoint, and a smooth 24-gon at 0.99 would poke back out through those.
 *
 * The composer halving is GlowSprite's, for GlowSprite's reason: additive
 * light compounds in the linear HDR target and Bloom then earns a second pass
 * over it. Milder than the sprite's 0.45 because this layer IS tone-mapped and
 * so arrives at the composer already on the shoulder. */
function ShadeFabric({ dark }: { dark: boolean }) {
  const texture = useMemo(() => fabricTexture(), []);
  const postfx = useStacks((s) => s.postfx);
  return (
    <mesh position={[0, (SHADE_BOTTOM_Y + SHADE_TOP_Y) / 2, 0]}>
      <cylinderGeometry
        args={[
          SHADE_TOP_R * 0.975,
          SHADE_BOTTOM_R * 0.975,
          (SHADE_TOP_Y - SHADE_BOTTOM_Y) * 0.985,
          24,
          1,
          true,
        ]}
      />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={(dark ? 0.44 : 0.64) * (postfx ? 0.65 : 1)}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
    </mesh>
  );
}

/** A SpotLight aims at an Object3D, not along its parent's local -Y axis.
 * Leaving the default target at world origin made the inter-unit lamp sweep
 * backward across the whole traverse after it moved away from x=0. Keep a
 * real target in the same lamp group so the cone remains directly beneath
 * the shade at every world position and yaw. */
function FloorLampSpot({
  dark,
  visible,
  unitIndex,
}: {
  dark: boolean;
  visible: boolean;
  unitIndex: number;
}) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);
  useEffect(() => {
    if (light.current && target.current) light.current.target = target.current;
  }, []);
  return (
    <>
      <object3D ref={target} position={[0, 0.02, 0]} />
      <spotLight
        ref={light}
        visible={visible}
        userData={sceneUnitLightUserData(unitIndex)}
        position={[0, SHADE_BOTTOM_Y - 0.017, 0]}
        color="#ffbe73"
        intensity={dark ? 10 : 5.6}
        angle={0.85}
        penumbra={0.9}
        distance={3.81}
        decay={2}
      />
    </>
  );
}

/** The only floor-lamp subtree subscribed to active-unit changes. Keeping the
 * subscription here prevents a light visibility update from re-rendering the
 * complete Talks unit and rebuilding caller-inline model material options.
 * The spot leaves the lower mouth, the upper point lights the top opening,
 * and the lower point supplies the room spill around the cone. */
function FloorLampRealLights({
  dark,
  unitIndex,
}: {
  dark: boolean;
  unitIndex: number;
}) {
  const visible = useUnitRealLights(unitIndex);
  return (
    <>
      <FloorLampSpot dark={dark} visible={visible} unitIndex={unitIndex} />
      <pointLight
        visible={visible}
        userData={sceneUnitLightUserData(unitIndex)}
        position={[0, SHADE_TOP_Y + 0.073, 0]}
        color="#ffcf96"
        intensity={dark ? 2 : 1}
        distance={1.85}
        decay={2}
      />
      <pointLight
        visible={visible}
        userData={sceneUnitLightUserData(unitIndex)}
        position={[0, SHADE_BOTTOM_Y - 0.154, 0]}
        color="#ffcf96"
        intensity={dark ? 3 : 0.75}
        distance={2.5}
        decay={2}
      />
    </>
  );
}

/** Where the two cameras stand. Both sit in the clear span between the gilt
 * frame's right edge (-0.51) and the microphone (0.43), on the wood beneath
 * the hung board — which floats at y 0.315 and so leaves that shelf free. */
const STICKER_CAMERA_MARKS = [
  { key: "talks-a", x: -0.3, z: 0.06, yaw: 0.42, tone: 1 },
  { key: "talks-b", x: 0.19, z: -0.02, yaw: -0.55, tone: 0.96 },
] as const;

/** The shared carry/preview wiring for one talk photo. Pose, seat, mass and
 * shade width all come off the setup's layout entry, so the Grabbable and
 * the rendered form cannot disagree about where the print rests. */
function TalkPhoto({
  unitIndex,
  palette,
  id,
  children,
}: {
  unitIndex: number;
  palette: UnitProps["palette"];
  id: TalkSetupId & PhotoArtifactId;
  children: React.ReactNode;
}) {
  const setup = TALK_SETUPS[id];
  const hoverKey = `grab:photo:${id}`;
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={[setup.base[0], setup.base[1], setup.base[2]]}
      shadeColor={palette.shadow}
      shadeWidth={Math.max(0.34, talkFramedSize(setup).width * 1.08)}
      shape="box"
      massKg={setup.massKg}
      artifact={id}
    >
      <HeldFacing
        hoverKey={hoverKey}
        position={[0, talkSeat(setup), 0]}
        rest={[setup.rest[0], setup.rest[1], setup.rest[2]]}
      >
        {children}
      </HeldFacing>
    </Grabbable>
  );
}

export default function UnitTalks({ palette, dark, index }: UnitProps) {
  const textured = useUnitLod(index);
  /** Shared 0..1 lit factor for the floor lamp: the switch damps it and the
   * two glow sprites multiply it in themselves. */
  const lit = useRef(1);
  // The one practical standing IN the grass. The meadow's shaders are unlit,
  // so FloorLampSpot's real pool stops at the lawn — register the lamp with
  // the meadow (position measured from the mounted rig, so nesting and unit
  // pose cannot drift it) and the grass paints the matching warm pool,
  // following the click-off egg through the same lit ref. Radius is the
  // spot's ground circle: height above ground × tan(0.85 cone) ≈ 2.2.
  const lampRootRef = useRef<THREE.Group>(null);
  useEffect(() => {
    const root = lampRootRef.current;
    if (!root) return;
    const mouth = new THREE.Vector3();
    root.getWorldPosition(mouth);
    return registerMeadowLamp(`talks-floor-lamp-${index}`, {
      x: mouth.x,
      y: mouth.y + SHADE_BOTTOM_Y - 0.017,
      z: mouth.z,
      radius: 2.2,
      strength: 1,
      litRef: lit,
      sourceX: mouth.x,
      sourceY: mouth.y + SHADE_BOTTOM_Y - 0.017,
      sourceZ: mouth.z,
      coneTargetX: mouth.x,
      coneTargetY: -1.1,
      coneTargetZ: mouth.z,
      // The floor shade is the room's largest practical: five moths occupy a
      // wider, deeper volume below its vertical light cone.
      mothCount: MOTH_LIGHT_PROFILES.floor.count,
      mothNearDistance: MOTH_LIGHT_PROFILES.floor.nearDistance,
      mothFarDistance: MOTH_LIGHT_PROFILES.floor.farDistance,
      mothMaxRadius: MOTH_LIGHT_PROFILES.floor.maxRadius,
    });
  }, [index]);
  return (
    <>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            {/* The lower bay takes the two mounts that need real height: the
                gilt frame tipped back into the bookcase's own left post, and
                the Consensus board hanging on wires from the underside of
                the shelf above — the only photograph in the room that never
                touches anything it stands on. */}
            <TalkPhoto
              unitIndex={index}
              palette={palette}
              id="talk-demo-night-v8"
            >
              <TalkGiltFrame
                src="/images/stacks/v8/talk-demo-night.webp"
                palette={palette}
                textured={textured}
              />
            </TalkPhoto>
            <TalkHangingWires />
            <TalkPhoto
              unitIndex={index}
              palette={palette}
              id="talk-consensus-phone-v8"
            >
              <TalkHungBoard
                src="/images/stacks/v8/talk-consensus-phone.webp"
                palette={palette}
                textured={textured}
              />
            </TalkPhoto>

            {/* Two Sticker Cameras, on the wood under the hung board. The
                one shelf in the room where a camera is not decoration: it is
                what took everything hanging around it. Both stand on their
                own base — a 1.35"-deep body on a 2.90" footprint is stable
                well past these yaws — and they are turned differently so the
                pair does not read as one object copied. */}
            {STICKER_CAMERA_MARKS.map((mark) => (
              <Grabbable
                key={mark.key}
                unitIndex={index}
                hoverKey={`grab:sticker-camera:${mark.key}`}
                base={[mark.x, 0, mark.z]}
                shadeColor={palette.shadow}
                shadeWidth={0.26}
                shape="box"
                massKg={0.26}
              >
                <group
                  position={[0, STICKER_CAMERA.height / 2, 0]}
                  rotation={[0, mark.yaw, 0]}
                >
                  <StickerCamera tone={mark.tone} />
                </group>
              </Grabbable>
            ))}

            <Grabbable
              unitIndex={index}
              hoverKey="grab:microphone"
              base={[0.42, 0, 0.08]}
              shadeColor={palette.shadow}
              shadeWidth={0.5}
              shape="box"
              massKg={0.7}
            >
              <group
                position={[0, 0.03, 0]}
                rotation={[0, -0.22, -Math.PI / 2]}
              >
                <React.Suspense fallback={null}>
                  <ModelProp
                    url="/models/microphone.glb"
                    dark={dark}
                    variant="tinted"
                    tints={{ lambert2SG: palette.metal }}
                    scale={0.041}
                  />
                </React.Suspense>
              </group>
            </Grabbable>

            <Grabbable
              unitIndex={index}
              hoverKey="grab:plant:talks-pothos"
              base={[1.08, 0, 0.12]}
              shadeColor={palette.shadow}
              shadeWidth={0.42}
              shape="box"
              colliderProfile="foliage-base"
              massKg={2.3}
            >
              <Sway unitIndex={index} amount={0.019} rate={0.31} phase={0.7}>
                <React.Suspense fallback={null}>
                  <ModelProp
                    url="/models/pothos.glb"
                    dark={dark}
                    variant="recolor"
                    position={[0, -0.135, 0]}
                    rotation={[0, 2.3, 0]}
                    scale={0.62}
                  />
                </React.Suspense>
              </Sway>
            </Grabbable>
          </group>
        }
      >
        {/* Three top-shelf moments, three more mechanisms: the studio panel
            carried out on a clamped monitor arm, the formal frame standing
            on an ornate easel, and the deckled print gripped in a stone
            plinth. All five photographs retain the raw file's own ratio. */}
        <TalkMonitorArm palette={palette} />
        <TalkPhoto
          unitIndex={index}
          palette={palette}
          id="talk-ann-interview-v8"
        >
          <TalkBezelPanel
            src="/images/stacks/v8/talk-ann-interview.webp"
            textured={textured}
          />
        </TalkPhoto>
        <TalkTableEasel palette={palette} />
        <TalkPhoto unitIndex={index} palette={palette} id="talk-dc-policy-v8">
          <TalkEaselFrame
            src="/images/stacks/v8/talk-dc-policy.webp"
            palette={palette}
            textured={textured}
          />
        </TalkPhoto>
        <TalkStonePlinth />
        <TalkPhoto unitIndex={index} palette={palette} id="talk-panel-v8">
          <TalkDeckledPrint
            src="/images/stacks/v8/talk-panel.webp"
            palette={palette}
            textured={textured}
          />
        </TalkPhoto>

        {/* The requested harmonica takes the microphone's old upper-shelf
            position. Its source is already horizontal and bottom-normalized. */}
        <Grabbable
          unitIndex={index}
          hoverKey="grab:harmonica:talks"
          // 0.82 → 0.97: the plinth moved the panel print's right edge out to
          // 0.794, which left the harmonica's Perch 2.6cm from a static
          // island and permanently `resting-pose-blocked`.
          base={[0.97, 0, 0.08]}
          shadeColor={palette.shadow}
          shadeWidth={0.5}
          shape="box"
          massKg={0.18}
        >
          <group rotation={[0, -0.2, 0]}>
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/harmonica.glb"
                dark={dark}
                variant="tinted"
                scale={0.021}
              />
            </React.Suspense>
          </group>
        </Grabbable>

        <Grabbable
          unitIndex={index}
          hoverKey="grab:plant:talks-top"
          base={[1.3, 0, -0.18]}
          shadeColor={palette.shadow}
          shadeWidth={0.28}
          shape="box"
          colliderProfile="foliage-base"
          massKg={2.1}
        >
          <Sway unitIndex={index} amount={0.018} rate={0.36} phase={1.8}>
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/potted-plant.glb"
                dark={dark}
                rotation={[0, -0.42, 0]}
                scale={0.82}
              />
            </React.Suspense>
          </Sway>
        </Grabbable>
      </ShelfUnit>
      {/* Floor lamp in the breathing room between Musings and Talks. Its
          local x is half the 4.4-unit pitch, so it belongs to neither shelf
          while still warming both. See LAMP_S for why it is 1.67 and not the 1.95 that stood
          it taller than a grandfather clock.
          Egg: it clicks off and back on, like both desk lamps. The room has
          three lamps and until now only two of them answered. The trigger
          wraps the pole and shade ONLY — every emissive disc, glow sprite and
          ground pool is a sibling in the rig, because an additive sprite is a
          metre-wide transparent quad and inside the trigger it becomes an
          invisible hit box over half the unit. */}
      <group
        ref={lampRootRef}
        position={[-2.12, -1.115, 0.06]}
        rotation={[0, 0.45, 0]}
      >
        <LampSwitch
          unitIndex={index}
          activeUnitIndexes={[index - 1, index]}
          hoverKey={`egg:lamp:floor:${index}`}
          litRef={lit}
          rig={
            <>
              {/* Light has to LEAVE a shade, out of both ends, or the lamp is a
            painted cone on a stick. Measured rather than guessed: parsing the
            GLB by material puts the shade's `lamp` island at y 0.6815 to
            0.8600, a truncated cone with a 0.0878 mouth at the bottom and a
            0.0623 opening at the top. Everything below is those two numbers
            times the scale, so the rig cannot drift if the lamp is resized.

            v5.1 — the owner's "the lighting on this isn't at all right".
            Three named faults, three fixes:

            1. TWO detached orange orbs, one in the sky above the shade and one
               on the pole below it. Both were GlowSprites sized to the BAY
               rather than to the shade: 0.53 and 0.34 against a mouth that is
               0.293 across, floated 0.111 and 0.086 clear of the rims. A halo
               wider than the thing making it and standing off it is not light,
               it is a ball. They are now 0.26 and 0.155 — each NARROWER than
               the opening it belongs to — and pulled in to 0.032 and 0.014 of
               the rim, so what you see is spill leaving a mouth.
            2. The shade was a flat, uniformly opaque yellow trapezoid, which is
               the whole "painted plastic" read — see ShadeFabric.
            3. White specks on both rims: these two emissive discs, seen at a
               graze. The camera sits at y 0.25 and the mouth at 0.023, so the
               bottom disc is 6.5° off edge-on; the TOP opening is at 0.321,
               ABOVE the camera, so that disc was 4° off edge-on from
               underneath and could never be anything but three white pixels.
               The top disc is gone. The bottom one stays — it is the only
               thing in the rig that is visibly the SOURCE — but at 1.9/1.0
               rather than 3.2/1.6, which keeps it over Bloom's 0.95 threshold
               (emissive #ffc98a is luminance 0.83, so ×1.9 = 1.6) while
               landing amber instead of clipped white. */}
              <mesh position={[0, SHADE_BOTTOM_Y - 0.009, 0]}>
                {/* A real diffuser has thickness. The old zero-thickness disc
                    projected to a 2px line from this low camera and could not
                    look like the broad hot aperture in the reference. */}
                <cylinderGeometry
                  args={[
                    SHADE_BOTTOM_R * 0.88,
                    SHADE_BOTTOM_R * 0.88,
                    0.018,
                    32,
                  ]}
                />
                <meshStandardMaterial
                  color="#ffe6bd"
                  emissive="#ffc98a"
                  emissiveIntensity={dark ? 4.5 : 2.2}
                  roughness={0.4}
                  side={THREE.DoubleSide}
                  toneMapped={false}
                />
              </mesh>
              {/* The fabric itself, lit from inside. */}
              <ShadeFabric dark={dark} />
              {/* One source-shaped performance halo, attached to the bright
                  lower diffuser. Its plane faces down with the aperture, so
                  the low camera sees a soft band—not a circular billboard. */}
              <group
                position={[0, SHADE_BOTTOM_Y - 0.021, 0]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <ApertureHalo
                  diameter={SHADE_BOTTOM_R * 2 * 1.65}
                  opacity={palette.glowOpacity * (dark ? 0.42 : 0.32)}
                  factorRef={lit}
                />
              </group>
              {/* Reversible legacy comparison. Both current modes hide these
                  camera-facing radial billboards and leave the diffuser,
                  illuminated fabric, real spill, and meadow pool untouched.
                  In legacy mode both sprites read the switch's lit factor
                  themselves because the traverse skips sprites. */}
              <group position={[0, SHADE_BOTTOM_Y - 0.055, 0]}>
                <GlowSprite
                  practical
                  opacity={palette.glowOpacity * 1.36}
                  eased
                  scale={0.444}
                  factorRef={lit}
                />
              </group>
              <group position={[0, SHADE_TOP_Y + 0.024, 0]}>
                <GlowSprite
                  practical
                  opacity={palette.glowOpacity * 0.52}
                  eased
                  scale={0.264}
                  factorRef={lit}
                />
              </group>
              {/* And a real spot down the mouth, so anything that does pass
                  under it is genuinely lit rather than merely near a glow.
                  `distance` is a world-space falloff radius and the parent
                  scale does not touch it, so all three distances came down
                  with the lamp (× 0.856). */}
              <FloorLampRealLights dark={dark} unitIndex={index} />
            </>
          }
        >
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/lamp-floor.glb"
              dark={dark}
              variant="tinted"
              tints={{
                lamp: dark ? "#c48735" : "#d7bb7b",
                metal: palette.metal,
              }}
              scale={LAMP_S}
            />
          </React.Suspense>
        </LampSwitch>
        {/* The lamp's own foot occluding the ground — outside the rig on
            purpose. A switched-off lamp still stands on the floor, so its
            shadow is the one thing here that must not dim. */}
        <FootPool
          color={palette.shadow}
          size={[0.5, 0.36]}
          opacity={0.3}
          position={[0, 0.002, 0]}
        />
      </group>
    </>
  );
}

"use client";

// Projects — framed app screenshots; reference books + the trophy below
// (the homework-app acquisition earns it).
import { useStacks } from "../../store";
import Grabbable from "../Grabbable";
import { ContactShade } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import ModelProp from "../ModelProp";
import { EggLamp, Sway } from "../eggs";
import { reducedMotion } from "../objects";
import {
  DeskFrame,
  PHOTO_LINKS,
  deskFrameHeight,
  photoDoorDetail,
  photoDoorLabel,
} from "../photos";
import { type PixelLook, nextPixelLook } from "../pixelArt";
import { ShelfUnit } from "../primitives";
import { propReactionIsEngaged } from "../reactionEngagement";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import { useUnitFrame } from "../unitActivity";
import { useUnitLod } from "../useUnitLod";
import React, { useMemo, useRef } from "react";
import * as THREE from "three";

import { DicePyramid, ProjectIcon } from "./ProjectArtifacts";
import {
  PROJECTS_LAMP_HEAD_QUATERNION,
  PROJECTS_LAMP_ROOT_SCALE,
  PROJECTS_LAMP_ROOT_YAW,
} from "./projectsShelfLighting";
import { type UnitProps } from "./types";
import {
  PROJECT_APPLE_PHOTO_POSE,
  PROJECT_PHOTO_DIMENSIONS,
  REVIEWED_SHELF_LAYOUT,
} from "./unitShelfLayout";

// tiny-treats' themed atlas deliberately retains one cool blue foliage role.
// The Yucca uses that role on half of its leaf clusters, where it reads as a
// second species rather than lighting variation. Keep this correction private
// to the Yucca instance: ModelProp clones the texture and material for the
// override, so the shared atlas and every other plant remain immutable.
const YUCCA_ATLAS_LIGHT = {
  colorSwaps: [{ from: "#4c6d90", to: "#648b4c", tolerance: 6 }] as const,
} as const;
const YUCCA_ATLAS_DARK = {
  colorSwaps: [{ from: "#334d68", to: "#4e713d", tolerance: 6 }] as const,
} as const;

/** Light travelling across polished brass, and nothing else.
 *
 * The trophy is the one prop in the world carrying a metal exception
 * (atlasOverride metalness 0.35 clones it its own material, so writing to
 * that material touches nothing else — every other atlas prop shares one).
 * So its answer to the pointer is the one a cup can give with dignity: the
 * reflection brightens and tightens for a beat and eases back. A trophy
 * that bounced or spun would be a toy.
 *
 * The materials are re-read on every animating frame rather than cached:
 * ModelProp rebuilds its clone on a theme flip (and on any re-render, since
 * `atlasOverride` is an inline object in the memo's deps), which would leave
 * a cached list pointing at freed materials. The traverse costs nothing —
 * it runs only while the damp is in flight, over a prop of two meshes. */
function Glint({
  hoverKey,
  children,
}: {
  hoverKey: string;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const level = useRef(0);
  useUnitFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const target = propReactionIsEngaged(useStacks.getState(), hoverKey)
      ? 1
      : 0;
    if (Math.abs(level.current - target) < 1e-3) {
      if (level.current === target) return; // settled
      level.current = target;
    } else {
      level.current = THREE.MathUtils.damp(level.current, target, 5, delta);
    }
    const v = level.current;
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mat = (o as THREE.Mesh<THREE.BufferGeometry, THREE.Material>)
        .material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      // Never write to the atlas material every other prop is sharing —
      // atlasOverride clones it for this prop, and only that clone is ours.
      if (mat.userData.shared === true) return;
      // 1 → 3.6 and 0.35 → 0.13. These are the owner-approved numbers and
      // this is the SECOND time the file has arrived back at them.
      //
      // NO EMISSIVE, and the reason is worth keeping. A round of "i can't
      // really tell there's glint" was answered here by adding emissive at
      // 0.55/0.44/0.20 — light the prop makes itself, which owes nothing to
      // what the environment probe happens to put behind it. It rendered the
      // trophy as a flat cream cut-out ("wtf is this lmao", with a
      // screenshot). Two separate mistakes, both of them predictable:
      //
      //  1. AMOUNT. Additive light COMPOUNDS in this scene's linear HDR
      //     pipeline — the v4 bloom work landed on ×0.45 where ×1.3 had been
      //     assumed — so 0.55 of added radiance is not a highlight, it is a
      //     white clip after ACES.
      //  2. CHANNEL. Emissive is added per-fragment regardless of the normal,
      //     so it does not brighten a form, it ERASES one. Every bit of
      //     shading that made the cup read as a solid went with it. Whatever
      //     a glint is, it is not uniform.
      //
      // The legibility this was reaching for now comes from the nod instead:
      // `signature="glint"` is classified as a SURFACE reaction, so the prop
      // keeps its band and moves. That is the honest fix — the complaint was
      // that the trophy did nothing, and reflectance was never the channel
      // that was going to say otherwise against a green meadow.
      mat.envMapIntensity = 1 + 2.6 * v;
      mat.roughness = 0.35 - 0.22 * v;
    });
  });
  return <group ref={group}>{children}</group>;
}

/** Pixel Happy Mac boot mark. The GLB's tiny face geometry is hidden by the
 * blue screen tint below; this nearest-filtered texture replaces it with a
 * legible 64px glyph and reads as a live phosphor display rather than paint. */
function drawHappyMac(
  ctx: CanvasRenderingContext2D,
  gazeX: number,
  gazeY: number,
  blink: boolean,
) {
  const S = ctx.canvas.width;
  ctx.imageSmoothingEnabled = false;

  const SCREEN = "#79a6e8";
  const LIGHT = "#e8f0e3";
  const DARK = "#14213a";
  ctx.fillStyle = SCREEN;
  ctx.fillRect(0, 0, S, S);

  // A tiny classic Macintosh silhouette, drawn in whole pixels.
  ctx.fillStyle = DARK;
  ctx.fillRect(14, 7, 36, 45);
  ctx.fillRect(11, 50, 42, 5);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(18, 11, 28, 35);
  ctx.fillRect(18, 46, 24, 4);

  // Recessed screen and the smiling boot face.
  ctx.fillStyle = DARK;
  ctx.fillRect(20, 14, 24, 22);
  ctx.fillStyle = SCREEN;
  ctx.fillRect(23, 17, 18, 16);
  ctx.fillStyle = DARK;
  if (blink) {
    ctx.fillRect(26, 23, 3, 1);
    ctx.fillRect(36, 23, 3, 1);
  } else {
    ctx.fillRect(26 + gazeX, 21 + gazeY, 3, 3);
    ctx.fillRect(36 + gazeX, 21 + gazeY, 3, 3);
  }
  ctx.fillRect(32, 23, 3, 5);
  ctx.fillRect(27, 28, 3, 3);
  ctx.fillRect(30, 30, 9, 3);
  ctx.fillRect(39, 27, 3, 3);

  // Floppy slot and power light complete the silhouette at scene scale.
  ctx.fillRect(31, 41, 12, 3);
  ctx.fillRect(42, 46, 3, 2);

  // Faint scan lines sell glass without softening the pixel art.
  ctx.fillStyle = "rgba(16, 30, 54, 0.08)";
  for (let y = 1; y < S; y += 4) ctx.fillRect(0, y, S, 1);
}

/** The screen's own measurements, off the GLB by material island:
 * `M_screen_blue` spans x −0.0156…0.0156, y 0.0338…0.0609, front face
 * z 0.0226, and the face islands it has to cover reach z 0.0241. */
function FinderMark({ unitIndex }: { unitIndex: number }) {
  const screen = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    drawHappyMac(ctx, 0, 0, false);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return { ctx, texture };
  }, []);
  const still = useMemo(() => reducedMotion(), []);
  const nextBlink = useRef(4.7);
  const blinkUntil = useRef(-1);
  const last = useRef({ x: 0, y: 0, blink: false });
  useUnitFrame((state) => {
    if (still || useStacks.getState().activeUnit !== unitIndex) return;
    const now = state.clock.elapsedTime;
    if (now >= nextBlink.current) {
      blinkUntil.current = now + 0.13;
      // Deterministic but not metronomic: 4.7s, 6.1s, 5.4s...
      nextBlink.current = now + 4.7 + ((Math.floor(now) * 17) % 15) / 10;
    }
    const blink = now < blinkUntil.current;
    const x = Math.round(THREE.MathUtils.clamp(state.pointer.x * 2, -1, 1));
    const y = Math.round(THREE.MathUtils.clamp(-state.pointer.y * 2, -1, 1));
    if (
      last.current.x === x &&
      last.current.y === y &&
      last.current.blink === blink
    )
      return;
    last.current = { x, y, blink };
    drawHappyMac(screen.ctx, x, y, blink);
    screen.texture.needsUpdate = true;
  });
  React.useEffect(() => () => screen.texture.dispose(), [screen]);
  return (
    <mesh position={[0, 0.0474, 0.0245]}>
      <planeGeometry args={[0.021, 0.024]} />
      <meshStandardMaterial
        map={screen.texture}
        roughness={0.42}
        emissive="#719ce0"
        emissiveIntensity={0.58}
        emissiveMap={screen.texture}
      />
    </mesh>
  );
}

const PROJECT_COUCH_W = 0.372;
const PROJECT_COUCH_H = PROJECT_COUCH_W * (819 / 1024);
const PROJECT_WWDC_H = PROJECT_PHOTO_DIMENSIONS.apple.height;
const PROJECT_WWDC_W = PROJECT_PHOTO_DIMENSIONS.apple.width;
const PROJECT_FACEBOOK_W = PROJECT_PHOTO_DIMENSIONS.facebook.width;
const PROJECT_FACEBOOK_H = PROJECT_PHOTO_DIMENSIONS.facebook.height;

function ProjectPhoto({
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
      shadeWidth={Math.max(0.3, width * 1.16)}
      shape="box"
      massKg={0.48}
      href={href ?? undefined}
      doorLabel={href ? photoDoorLabel(href) : undefined}
      doorDetail={href ? photoDoorDetail(href) : undefined}
    >
      <HeldFacing hoverKey={hoverKey} position={[0, seat, 0]} rest={rotation}>
        {children}
      </HeldFacing>
    </Grabbable>
  );
}

/**
 * One circuit board, one pixel-art look. A tap toggles the store's look and
 * records the board's world position so the Effect can wipe outward from it.
 * The Door Label names the mode in both states ("8-bit mode" / "Photo mode"),
 * because the two boards look like clutter until the label says otherwise.
 */
function PixelBoard({
  unitIndex,
  palette,
  look,
  hoverKey,
  title,
  base,
  shadeWidth,
  massKg,
  children,
}: {
  unitIndex: number;
  palette: UnitProps["palette"];
  look: Exclude<PixelLook, "off">;
  hoverKey: string;
  title: string;
  base: [number, number, number];
  shadeWidth: number;
  massKg: number;
  children: React.ReactNode;
}) {
  const active = useStacks((state) => state.pixelLook === look);
  const anchor = useRef<THREE.Group>(null);
  const onTap = () => {
    const state = useStacks.getState();
    const origin = new THREE.Vector3();
    anchor.current?.getWorldPosition(origin);
    state.setPixelLook(nextPixelLook(state.pixelLook, look), [
      origin.x,
      origin.y,
      origin.z,
    ]);
  };
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={shadeWidth}
      shape="box"
      massKg={massKg}
      doorLabel={title}
      actionLabel={active ? "Photo mode" : PIXEL_LOOK_ACTION_LABELS[look]}
      onTap={onTap}
    >
      <group ref={anchor}>
        <React.Suspense fallback={null}>{children}</React.Suspense>
      </group>
    </Grabbable>
  );
}

/** The Arduino's ATmega is an 8-bit part, so its look is "8-bit"; the
 * expansion card takes the next step up. Neither is a claim about colour
 * depth, they are the names the two looks go by. */
const PIXEL_LOOK_ACTION_LABELS: Record<Exclude<PixelLook, "off">, string> = {
  levels: "8-bit mode",
  palette: "16-bit mode",
};

export default function UnitProjects({ palette, dark, index }: UnitProps) {
  const textured = useUnitLod(index);
  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            {/* The generic book pile that once crowded the Mac is gone. The
                remaining personal photographs, trophy and Mac keep their
                measured separation and leave an intentional patch of wood. */}
            {/* Metal exception: the shared atlas material is metalness 0, so
              the trophy read as terracotta (audit §3-Projects). */}
            {/* A hollow metal trophy is a natural handheld object, not shelf
              furniture. It has no navigation destination: a drag picks it up
              and its restrained hover glint carries the visual interest. */}
            <Grabbable
              unitIndex={index}
              hoverKey="grab:trophy"
              base={[REVIEWED_SHELF_LAYOUT.projects.trophyX, 0, -0.02]}
              shadeColor={palette.shadow}
              shadeWidth={0.28}
              shape="box"
              massKg={1.8}
              // A SURFACE signature: the glint is character on top of the
              // band, not instead of it. Standing the nod down here was tried
              // and rejected on 2026-08-20 — "i can't really tell there's
              // glint. I also want the nod" — because a prop whose whole
              // reaction is reflectance has nothing to say in silhouette.
              signature="glint"
            >
              <Glint hoverKey="grab:trophy">
                <React.Suspense fallback={null}>
                  <ModelProp
                    url="/models/trophy.glb"
                    dark={dark}
                    atlasOverride={{ metalness: 0.35, roughness: 0.35 }}
                    rotation={[0, 0.3, 0]}
                    scale={1.55}
                  />
                </React.Suspense>
              </Glint>
            </Grabbable>
            {/* Two personal project moments replace the three legacy prints.
              Each frame aperture is derived from the raw v8 image ratio, so
              neither photograph is cropped into the old generic landscape or
              square treatment. */}
            <ProjectPhoto
              unitIndex={index}
              palette={palette}
              id="projects-coding-couch-v8"
              base={[-1.08, 0, 0.06]}
              seat={deskFrameHeight(PROJECT_COUCH_H) / 2}
              rotation={[-0.08, 0.2, 0]}
              width={PROJECT_COUCH_W}
            >
              <DeskFrame
                src="/images/stacks/v8/projects-coding-couch.webp"
                palette={palette}
                textured={textured}
                width={PROJECT_COUCH_W}
                height={PROJECT_COUCH_H}
              />
            </ProjectPhoto>
            <Grabbable
              unitIndex={index}
              hoverKey="grab:phone:projects"
              base={[REVIEWED_SHELF_LAYOUT.projects.phoneX, 0, 0.13]}
              shadeColor={palette.shadow}
              shadeWidth={0.28}
              shape="box"
              massKg={0.19}
            >
              <group
                position={[0, REVIEWED_SHELF_LAYOUT.projects.phoneSeat, 0]}
                rotation={[-Math.PI / 2, 0, 0.28]}
              >
                <React.Suspense fallback={null}>
                  <ModelProp
                    url="/models/phone.glb"
                    dark={dark}
                    variant="tinted"
                    scale={0.28}
                  />
                </React.Suspense>
              </group>
            </Grabbable>
            {/* The pixel-art switches (scene/pixelArt.ts): two circuit
                boards between the phone and the Mac. The Arduino lies flat at
                the lip and redraws the room in eight levels a channel; the
                green card stands behind it, nearer the Mac, and redraws it in
                the 32-colour palette. Tapping the lit board turns the finish
                off again. Both are ordinary movable props otherwise. */}
            <PixelBoard
              unitIndex={index}
              palette={palette}
              look="levels"
              hoverKey="egg:pixel:arduino"
              title="Arduino Uno"
              base={[
                REVIEWED_SHELF_LAYOUT.projects.arduinoX,
                0,
                REVIEWED_SHELF_LAYOUT.projects.arduinoZ,
              ]}
              shadeWidth={0.26}
              massKg={0.03}
            >
              <ModelProp
                url="/models/arduino.glb"
                dark={dark}
                variant="tinted"
                rotation={[0, 0.3, 0]}
                scale={0.19}
              />
            </PixelBoard>
            <PixelBoard
              unitIndex={index}
              palette={palette}
              look="palette"
              hoverKey="egg:pixel:card"
              title="Circuit board"
              base={[
                REVIEWED_SHELF_LAYOUT.projects.cardX,
                0,
                REVIEWED_SHELF_LAYOUT.projects.cardZ,
              ]}
              shadeWidth={0.3}
              massKg={0.05}
            >
              {/* Upright in its own frame, gold fingers down. A hair of
                  backward lean so the face catches the lamp. */}
              <ModelProp
                url="/models/circuit-board.glb"
                dark={dark}
                variant="tinted"
                rotation={[-0.12, -0.22, 0]}
                scale={0.065}
              />
            </PixelBoard>
            <ProjectPhoto
              unitIndex={index}
              palette={palette}
              id="projects-facebook-v8"
              base={[REVIEWED_SHELF_LAYOUT.projects.facebookPhotoX, 0, 0.11]}
              seat={deskFrameHeight(PROJECT_FACEBOOK_H) / 2}
              rotation={[-0.06, -0.13, 0]}
              width={PROJECT_FACEBOOK_W}
            >
              <DeskFrame
                src="/images/stacks/v8/projects-facebook.webp"
                palette={palette}
                textured={textured}
                width={PROJECT_FACEBOOK_W}
                height={PROJECT_FACEBOOK_H}
              />
            </ProjectPhoto>
            {/* The Mac, and the door to his GitHub.
              It is a compact Macintosh rather than a modern laptop, and that
              is the whole reason it works: at the ~25px this subtends on
              screen a MacBook is a grey wedge, while the beige box with the
              recessed screen, the floppy slot and the chin is unmistakable
              from across the room. The Happy Mac face reads as switched on.
              Two things it needs. The face must point at the camera, and the
              screen materials must stay OUT of the tint or it goes dark.
              On the yaw: the model audit reported "front faces −Z, needs
              rotation-y = π", which shipped an anonymous beige box. The
              audit's rasterizer keeps the SMALLER depth (`d < zbuf[i]`) with
              d = z at yaw 0, so its camera sits at −Z looking toward +Z —
              the opposite side from this scene's camera. Every yaw it
              reports is therefore π out. The front already faces the viewer
              at 0; the 0.34 only turns it off-square.
              Scale 7.0, not the 5.0 the model report suggested. That number
              came off a shelf conversion averaged over props that are
              THEMSELVES undersized (globe, desk lamp, sansevieria). The books
              settle it, on eight axes across three primitives: packRow's
              spines are w 0.055…0.13, h 0.4…0.6, depth 0.3; a BookPile book
              is 0.46 × 0.06 × 0.32; a BookRowMesh cover is 0.36 × 0.52 ×
              0.048. Against a real hardcover every one of those clusters at
              ~2.0 units/metre, and that is the shelf scale. (The BOOKCASE is
              a separate matter — ground to top plank is 1.115 units, about
              0.96 u/m, so the furniture is at roughly half the scale of the
              things standing on it. Two scales for two different things.) At
              5.0 a compact Macintosh stood 0.6× the width of the hardcovers
              beside it when the real machine is 1.5× wider than one. The
              neighboring clutter moved away to open the window.
              7.0 → 9.2. 7.0 put the machine 0.196 × 0.245 × 0.192 m against a
              Macintosh 128K's real 0.246 × 0.345 × 0.277, i.e. 1.4 units per
              metre on a shelf whose books are at 2.0 — it was in the
              everything-else-slightly-small family, not the book family.
              At 9.2 it stands 0.644 tall inside the expanded 0.8075 headroom.
              It also, counter-intuitively, gains
              screen: the placard eats world x past +0.427 on a 1280 window,
              and growing about a fixed centre moves the machine's LEFT edge
              from 0.391 to 0.313, so three times as much of it arrives.
              z stays at −0.14. The yawed depth is 0.648 against a 0.6-deep
              plank, so it cannot be centred: −0.14 puts the front face at
              0.184, inside the front lip, and lets the back hang past the
              rear edge where a camera in front of the shelf cannot see it. */}
            <Grabbable
              unitIndex={index}
              hoverKey="link:projects:mac"
              base={[REVIEWED_SHELF_LAYOUT.projects.macX, 0, -0.14]}
              shadeColor={palette.shadow}
              shadeWidth={0.55}
              shape="box"
              massKg={7.5}
              tiltWhileHeld={false}
              href="https://github.com/chappyasel"
              doorLabel="GitHub"
              doorDetail={["chappyasel"]}
            >
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/mac.glb"
                  dark={dark}
                  variant="tinted"
                  tints={{
                    M_plastic_bone: palette.paper,
                    M_plastic_bone_shad: palette.metal,
                    // The GLB's own face, erased — see FinderMark. Both islands
                    // go to the screen's own blue, which is what they are
                    // standing half a millimetre in front of.
                    M_screen_whitetext: "#1a5be7",
                    M_lam_black: "#1a5be7",
                  }}
                  rotation={[0, -0.34, 0]}
                  scale={9.2}
                />
              </React.Suspense>
              {/* The redrawn mark, in the model's own frame: same yaw and same
                scale as the ModelProp beside it, so the quad sits on the
                screen at every size the machine is ever drawn at. Inside the
                carrier, so it moves with the Mac under the pointer. */}
              <group rotation={[0, -0.34, 0]} scale={9.2}>
                <FinderMark unitIndex={index} />
              </group>
            </Grabbable>
          </group>
        }
      >
        {/* The upper shelf is a row of project objects rather than framed UI.
          The visible practical on the left supplies the warm reflection that
          moves across the two polished icon faces. */}
        <group position={[REVIEWED_SHELF_LAYOUT.projects.topLampX, 0, -0.08]}>
          <EggLamp
            unitIndex={index}
            palette={palette}
            dark={dark}
            yaw={PROJECTS_LAMP_ROOT_YAW}
            scale={PROJECTS_LAMP_ROOT_SCALE}
            spillScale={0.58}
            headQuaternion={PROJECTS_LAMP_HEAD_QUATERNION}
          />
          <ContactShade
            color={palette.shadow}
            width={0.32}
            position={[0, 0.018, 0.02]}
          />
        </group>
        <ProjectIcon
          unitIndex={index}
          palette={palette}
          dark={dark}
          hoverKey="link:projects:weightlifting-icon"
          base={[REVIEWED_SHELF_LAYOUT.projects.topWeightliftingIconX, 0, 0.02]}
          artwork="/images/stacks/v8/512/projects-weightlifting-icon.webp"
          fallbackColor="#6961d8"
          textured={textured}
          yaw={0.07}
          href="https://apps.apple.com/us/app/id1266077653"
          doorLabel="Weightlifting App"
          doorDetail={["App Store"]}
        />
        <DicePyramid unitIndex={index} palette={palette} dark={dark} />
        <ProjectIcon
          unitIndex={index}
          palette={palette}
          dark={dark}
          hoverKey="grab:projects:homework-icon"
          base={[REVIEWED_SHELF_LAYOUT.projects.topHomeworkIconX, 0, 0.02]}
          artwork="/images/stacks/v8/512/projects-homework-icon.webp"
          fallbackColor="#12ace8"
          textured={textured}
          yaw={-0.07}
        />
        <ProjectPhoto
          unitIndex={index}
          palette={palette}
          id="projects-wwdc-v8"
          base={[
            REVIEWED_SHELF_LAYOUT.projects.topApplePhotoX,
            0,
            PROJECT_APPLE_PHOTO_POSE.baseZ,
          ]}
          seat={deskFrameHeight(PROJECT_WWDC_H) / 2}
          rotation={[...PROJECT_APPLE_PHOTO_POSE.rotation]}
          width={PROJECT_WWDC_W}
        >
          <DeskFrame
            src="/images/stacks/v8/projects-wwdc.webp"
            palette={palette}
            textured={textured}
            width={PROJECT_WWDC_W}
            height={PROJECT_WWDC_H}
          />
        </ProjectPhoto>
        <Grabbable
          unitIndex={index}
          hoverKey="grab:plant:projects-small"
          base={[REVIEWED_SHELF_LAYOUT.projects.topPlantX, 0, -0.02]}
          shadeColor={palette.shadow}
          shadeWidth={0.42}
          shape="box"
          colliderProfile="foliage-base"
          massKg={1.4}
        >
          <Sway unitIndex={index} amount={0.022} rate={0.34} phase={1.8}>
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/potted-plant.glb"
                dark={dark}
                rotation={[0, 0.45, 0]}
                scale={0.78}
              />
            </React.Suspense>
          </Sway>
        </Grabbable>
      </ShelfUnit>
      {/* Owner-picked Yucca Plant (Isa Lousberg, CC0), grounded exactly at
          the halfway seam after Projects. It fills the otherwise empty floor
          transition without stealing shelf space from the Mac/gallery. */}
      <Grabbable
        unitIndex={index}
        hoverKey="grab:plant:projects-yucca"
        base={[2.12, SHELF_GEOMETRY.groundY, -0.12]}
        shadeColor={palette.shadow}
        shadeWidth={0.72}
        shape="box"
        colliderProfile="foliage-base"
        massKg={5.6}
        standsOn="floor"
      >
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/yucca-plant.glb"
            dark={dark}
            variant="recolor"
            atlasOverride={dark ? YUCCA_ATLAS_DARK : YUCCA_ATLAS_LIGHT}
            rotation={[0, -0.32, 0]}
            scale={0.76}
          />
        </React.Suspense>
      </Grabbable>
    </group>
  );
}

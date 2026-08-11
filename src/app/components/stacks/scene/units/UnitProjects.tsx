"use client";

// Projects — framed app screenshots; reference books + the trophy below
// (the homework-app acquisition earns it).
import React, { useMemo, useRef } from "react";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useStacks } from "../../store";
import { proxied } from "../../theme";
import { Sway } from "../eggs";
import { ContactShade } from "../GroundPool";
import ModelProp from "../ModelProp";
import {
  Polaroid,
  polaroidSeat,
  reducedMotion,
  SodaCan,
  usePropClick,
} from "../objects";
import PropLink, { HoverProp } from "../links";
import { DeskFrame, deskFrameHeight, FlatPrint, PhotoMount } from "../photos";
import { BookPile, FrameRow, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

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
  unitIndex,
  hoverKey,
  children,
}: {
  unitIndex: number;
  hoverKey: string;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const level = useRef(0);
  /** Where the turn is heading, in radians. A click adds 2π; the damp below
   * chases it, so a second click mid-turn adds to it instead of restarting. */
  const turnTo = useRef(0);
  usePropClick(unitIndex, hoverKey, () => {
    if (reducedMotion()) return;
    turnTo.current += Math.PI * 2;
  });
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const target = useStacks.getState().hovered === hoverKey ? 1 : 0;
    const t = spin.current;
    if (t && t.rotation.y !== turnTo.current) {
      // 1.6, not the 3.4 the badge flip uses: a cup turning on its plinth
      // should take about two seconds, which is how long it takes to read the
      // plate. Snap on arrival so the idle frames cost nothing.
      const next = THREE.MathUtils.damp(t.rotation.y, turnTo.current, 1.6, delta);
      t.rotation.y =
        Math.abs(next - turnTo.current) < 1e-3 ? turnTo.current : next;
      if (t.rotation.y === turnTo.current) {
        // Keep the angle bounded, or a long session accumulates float error
        // into a visible wobble.
        const wrapped = t.rotation.y % (Math.PI * 2);
        t.rotation.y = wrapped;
        turnTo.current = wrapped;
      }
    }
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
      // 1 → 3.6 and 0.35 → 0.13, up from 1 → 2.5 / 0.35 → 0.19. The owner's
      // "hovering + clicking the trophy doesn't seem to do anything" was half
      // a real absence (there was no click at all) and half an amplitude
      // problem: the prop is 0.45 units of dark brass against a bright sky,
      // and a 1.5× swing in envMapIntensity on a surface that reflects a
      // three-lightformer probe is a few levels of grey nobody sees. This is
      // as far as it goes before the cup reads as chrome.
      mat.envMapIntensity = 1 + 2.6 * v;
      mat.roughness = 0.35 - 0.22 * v;
    });
  });
  return (
    <group ref={group}>
      {/* Named so the harness can read the turn off the scene graph rather
          than off pixels — see the note on CLUB_NODE in UnitTraining. */}
      <group ref={spin} name={TROPHY_NODE}>
        {children}
      </group>
    </group>
  );
}

/** @see Glint */
export const TROPHY_NODE = "stacks-trophy-turn";

/** Declared once because it is used twice — as the mount's rotation and as
 * the input to polaroidSeat. A lean typed into one and not the other is the
 * exact bug this scene has regrown four times. */
const WHITEBOARD_LEAN: [number, number, number] = [-0.15, -0.12, 0.04];

/**
 * The classic Finder mark, drawn properly (owner: "I also think you can
 * improve the finder logo").
 *
 * The face on the Mac's screen is not a texture, it is GEOMETRY inside
 * mac.glb: 28 triangles of `M_screen_whitetext` and 28 of `M_lam_black`, both
 * standing proud of the `M_screen_blue` panel between y 0.0348 and 0.0601.
 * At 188 triangles for the whole machine that budget cannot draw a face, and
 * what it produced was a broken dashed line for the mouth and a split that
 * lands nowhere in particular. Editing the GLB is the model pipeline's job and
 * not this file's; what a call site CAN do is remap materials by name, so both
 * face islands are tinted to the screen's own blue — which erases them, since
 * they are 0.5 mm of blue on blue — and the mark is redrawn as a canvas on a
 * quad 2 mm in front.
 *
 * What it draws is the Finder icon and not the Happy Mac: a rounded square
 * split by a slanted line, one half light with a dark profile facing right,
 * the other dark with a light profile facing left. Two half-faces looking past
 * each other. It was designed to work at 32 × 32 pixels, which is roughly what
 * it gets here — the quad is 0.193 × 0.221 world units, about 50 px at this
 * camera — so it is the rare mark that does not need simplifying for the size.
 *
 * Cached per theme-independent: the icon is the Mac's own colours, not the
 * room's, for the same reason the screen stays out of the tint list — a beige
 * box with a warm-grey screen reads as switched off.
 */
let finderTextureCache: THREE.CanvasTexture | null = null;
function finderTexture(): THREE.CanvasTexture {
  if (finderTextureCache) return finderTextureCache;
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  const LIGHT = "#f2efe4";
  const DARK = "#12233d";
  ctx.clearRect(0, 0, S, S);

  // The plate: a rounded square, inset so the blue screen frames it.
  const m = 10;
  const r = 14;
  const plate = new Path2D();
  plate.moveTo(m + r, m);
  plate.arcTo(S - m, m, S - m, S - m, r);
  plate.arcTo(S - m, S - m, m, S - m, r);
  plate.arcTo(m, S - m, m, m, r);
  plate.arcTo(m, m, S - m, m, r);
  plate.closePath();

  /** A head in profile facing +x, in a 0..1 box: crown, forehead, brow, nose,
   * lips, chin, jaw, neck, then back down the skull. One filled silhouette
   * rather than features drawn on an oval, because at 50 px an outline with
   * features inside it is a smudge and a silhouette is still a silhouette.
   * The nose reaches u 0.78, and both faces are placed so that lands just
   * PAST the split — each is clipped to its own half, so the two profiles
   * tile the icon and meet exactly on the line. */
  const PROFILE: number[][] = [
    [0.30, 0.03], [0.52, 0.08], [0.62, 0.25], // crown → forehead
    [0.60, 0.35], [0.62, 0.39],               // brow
    [0.78, 0.50], [0.61, 0.545],              // nose
    [0.68, 0.60], [0.60, 0.66],               // lips
    [0.68, 0.76], [0.50, 0.86],               // chin → jaw
    [0.44, 0.91], [0.44, 1.02],               // neck
    [0.02, 1.02], [0.02, 0.60],               // shoulder → back
    [0.06, 0.22], [0.30, 0.03],               // back of the head
  ];
  const profile = (flip: boolean, ox: number, w: number) => {
    const p = new Path2D();
    const at = (u: number) => (flip ? ox + (1 - u) * w : ox + u * w);
    p.moveTo(at(PROFILE[0]![0]!) * S, PROFILE[0]![1]! * S);
    for (const [u, v] of PROFILE.slice(1)) p.lineTo(at(u!) * S, v! * S);
    p.closePath();
    return p;
  };

  // The split leans — a vertical one reads as a seam between two icons rather
  // than as one mark. Written as two closed polygons rather than as one line
  // plus an even-odd rule, so each half can be used as a clip directly.
  const half = (right: boolean) => {
    const p = new Path2D();
    const top = S * 0.58;
    const bot = S * 0.42;
    if (right) {
      p.moveTo(top, 0);
      p.lineTo(S, 0);
      p.lineTo(S, S);
      p.lineTo(bot, S);
    } else {
      p.moveTo(top, 0);
      p.lineTo(0, 0);
      p.lineTo(0, S);
      p.lineTo(bot, S);
    }
    p.closePath();
    return p;
  };

  ctx.save();
  ctx.clip(plate);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = DARK;
  ctx.fill(half(true));
  // Left half: a dark face on light, looking right at the split. The two
  // placements are solved rather than eyeballed — the profile's nose is at
  // u 0.78, so ox 0.06 with w 0.60 lands it at 0.528 and its mirror at 0.472,
  // a hair either side of the split's 0.50 at mid height, which is what makes
  // the two silhouettes meet on the line instead of leaving a crack down it.
  // The backs of the heads land at 0.072 and 0.928, so each face keeps a
  // sliver of its own ground behind it rather than filling its half solid.
  ctx.save();
  ctx.clip(half(false));
  ctx.fillStyle = DARK;
  ctx.fill(profile(false, 0.06, 0.6));
  ctx.restore();
  // Right half: its mirror, light on dark, looking left at the same line.
  ctx.save();
  ctx.clip(half(true));
  ctx.fillStyle = LIGHT;
  ctx.fill(profile(true, 0.34, 0.6));
  ctx.restore();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  finderTextureCache = texture;
  return texture;
}

/** The screen's own measurements, off the GLB by material island:
 * `M_screen_blue` spans x −0.0156…0.0156, y 0.0338…0.0609, front face
 * z 0.0226, and the face islands it has to cover reach z 0.0241. */
function FinderMark() {
  const texture = useMemo(() => finderTexture(), []);
  return (
    <mesh position={[0, 0.0474, 0.0245]}>
      <planeGeometry args={[0.021, 0.024]} />
      <meshStandardMaterial
        map={texture}
        transparent
        roughness={0.55}
        // The screen is a lit phosphor, not paint: without a little emissive
        // it goes to the same value as the beige box around it the moment the
        // sky behind the unit is bright, and a dark screen reads as a machine
        // that is off — which is the one thing this prop must never say.
        emissive="#7f95c4"
        emissiveIntensity={0.45}
        emissiveMap={texture}
      />
    </mesh>
  );
}

export default function UnitProjects({
  data,
  palette,
  dark,
  index,
  coverWidth,
  onOpenUrl,
}: UnitProps) {
  const textured = useUnitLod(index);
  const frames = useMemo(
    () =>
      data.projects.map((project) => ({
        src: proxied(project.image, coverWidth),
        key: project.link,
      })),
    [data.projects, coverWidth],
  );
  return (
    <ShelfUnit
      palette={palette}
      toneSeed={index}
      lower={
        <group>
          {/* SPACING + SEPARATION (H2, H6). The Mac is 0.598 wide once its −0.34
              yaw is folded in and its left edge lands at x 0.328; the pile's
              top book reached 0.463, so 24 of the Mac's vertices were inside
              it — 1.37 cm deep, measured against the book's own oriented box
              rather than an axis-aligned one. The pile is what moves: pushing
              the Mac right instead would post it behind the desktop placard,
              whose left edge is +0.427 on a 1280 window.
              0.18 → 0.02 clears the Mac by 2.9 cm, and the rest of the run
              steps left with it so the shelf reads as filled rather than as
              a cluster on the right: pothos −1.43, frame −1.05, trophy −0.70,
              print −0.36, pile +0.02, Mac +0.64. */}
          <BookPile palette={palette} x={0.02} salt={47} linkUnit={index} />
          {/* Pothos out at the plank end, where its vines can hang past the
              edge instead of lying on the wood — that overhang is the whole
              reason to own one. Everything else on this shelf is flat and
              rectangular, so the trailing silhouette does real work.
              The pot used to hover with daylight under it. Cause: the model
              pipeline normalises every prop to bottom-at-origin, and this
              prop's lowest vertex is a trailing VINE TIP, not the pot. Split
              into connected islands the GLB reads pot = y 0.2182..0.6182 and
              vine = y 0.0000..0.6874, so y=0 seated the vine on the wood and
              carried the pot 0.2182 (×0.5 = 0.109) into the air. The scale
              was never wrong — the contact plane was.
              So: offset the MODEL down by that measured 0.109 to stand the
              pot on the wood, and pose the plant so every vertex that now
              falls below the shelf line does so in free air rather than
              through the plank. yaw 0.279 with the pot axis at (−1.459,
              0.079) is a solved placement, not a guess — it puts all 116
              sub-surface vertices past the plank's end and front lip while
              keeping the pot's whole footprint on the wood. The offset lives
              on the ModelProp, not the group, so the contact shade stays
              planted at the wood (the BookPile rule).
              Scale 0.5 → 0.66 (a 0.17 m pot rather than 0.13 m, which is the
              6-inch pot a pothos this size is sold in). Three numbers move
              together and none of them is optional:
              - the model's y offset IS the measured pot base, −0.2182 ×
                scale, so it becomes −0.1440. Leave it at −0.1091 and the pot
                floats again, which is the exact bug this comment documents.
              - the contact shade sits at the pot AXIS, local (0.041, −0.061)
                at scale 0.5. That offset is model-space too, so it scales to
                (0.0541, −0.0805), and the disc widens with the pot.
              - the group moves from (−1.5, 0.14) to (−1.43, 0.12). At 0.66
                the pot is 0.34 across; left where it was, its rim hung past
                the plank end (−1.6) and past the front lip (z 0.22), which
                a screenshot showed immediately: the pot read as standing on
                thin air with the shelf ending under its middle. It now
                clears the end by 0.055 and the lip by 0.011.
              The metric answer was 0.7 and it does not fit: 0.7 puts the rim
              0.02 past the plank end, and the vines that are SUPPOSED to
              hang in free air start passing through the wood if you slide it
              inboard far enough to fix that. 0.66 is where those two meet.
              Height check: 0.665 tall less the 0.144 sink = 0.521 above the
              wood, against 0.6575 of headroom under the top plank.
              Sway, finally: it was the only plant in the world standing
              perfectly still while About's and Musings' breathed. Slower and
              shallower than the leafy pair — it hangs rather than stands, so
              it trails rather than nods. It wraps the model alone so the
              pivot is the pot on the wood and the shade stays planted. */}
          <group position={[-1.43, 0, 0.12]}>
            <Sway unitIndex={index} amount={0.019} rate={0.31} phase={0.7}>
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/pothos.glb"
                  dark={dark}
                  variant="recolor"
                  position={[0, -0.144, 0]}
                  rotation={[0, 0.279, 0]}
                  scale={0.66}
                />
              </React.Suspense>
            </Sway>
            <ContactShade
              color={palette.shadow}
              width={0.4}
              position={[0.0541, 0.02, -0.0805]}
            />
          </group>
          {/* Metal exception: the shared atlas material is metalness 0, so
              the trophy read as terracotta (audit §3-Projects). */}
          {/* 1.55 → 0.227 m tall. At 1.2 it stood 0.175 m, which is a
              desk ornament rather than the cup an acquisition earns. Size is
              correct against the books and does not move in this pass.
              What it did not have was an answer to the pointer beyond the
              universal floor lift, so it got the one a cup can give without
              losing its dignity: see Glint. lift is zeroed on purpose — the
              trophy must not move at all. */}
          <HoverProp
            unitIndex={index}
            hoverKey="glint:trophy"
            base={[-0.7, 0, 0]}
            lift={[0, 0, 0]}
            grow={1.05}
          >
            <Glint unitIndex={index} hoverKey="glint:trophy">
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
          </HoverProp>
          {/* Projects had no photograph of a person anywhere — only app
              screenshots, which made the unit read as a portfolio grid
              rather than as work he did with people. The builder cabin
              anchors it; the whiteboard and couch frames sit either side of
              the trophy, and one lies flat so the row isn't a picket fence. */}
          <PhotoMount
            unitIndex={index}
            id="projects-cabin"
            position={[-1.05, deskFrameHeight(0.22) / 2, 0.06]}
            rotation={[-0.1, 0.24, 0.02]}
          >
            <DeskFrame
              src="/images/stacks/projects-cabin.jpg"
              palette={palette}
              textured={textured}
              width={0.31}
              height={0.22}
            />
          </PhotoMount>
          {/* Links out: the whiteboard shot came off a tweet, and the id
              survived verbatim in the archived filename.
              Anchored at the contact edge and seated by polaroidSeat rather
              than the old literal 0.1425, which was `oldHeight/2 · cos(lean)`
              for a size this print stopped being — it stood 1.59 cm off the
              wood. The lean is declared once and fed to both the mount and
              the seat, so the two cannot drift apart. */}
          <PhotoMount
            unitIndex={index}
            id="projects-whiteboard"
            position={[-0.36, polaroidSeat(WHITEBOARD_LEAN), 0.12]}
            rotation={WHITEBOARD_LEAN}
            href="https://x.com/i/status/1778892048747417620"
          >
            <Polaroid
              src="/images/stacks/projects-whiteboard.jpg"
              palette={palette}
              textured={textured}
              anchor="contact"
            />
          </PhotoMount>
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
              pile moved to 0.18 to open the window.
              7.0 → 9.2. 7.0 put the machine 0.196 × 0.245 × 0.192 m against a
              Macintosh 128K's real 0.246 × 0.345 × 0.277, i.e. 1.4 units per
              metre on a shelf whose books are at 2.0 — it was in the
              everything-else-slightly-small family, not the book family.
              9.2 is the ceiling, not the metric answer: it stands 0.644 tall
              under 0.6575 of headroom. It also, counter-intuitively, gains
              screen: the placard eats world x past +0.427 on a 1280 window,
              and growing about a fixed centre moves the machine's LEFT edge
              from 0.391 to 0.313, so three times as much of it arrives.
              z stays at −0.14. The yawed depth is 0.648 against a 0.6-deep
              plank, so it cannot be centred: −0.14 puts the front face at
              0.184, inside the front lip, and lets the back hang past the
              rear edge where a camera in front of the shelf cannot see it. */}
          <PropLink
            unitIndex={index}
            hoverKey="link:projects:mac"
            base={[0.64, 0, -0.14]}
            href="https://github.com/chappyasel"
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
                PropLink, so it rises with the Mac under the pointer. */}
            <group rotation={[0, -0.34, 0]} scale={9.2}>
              <FinderMark />
            </group>
          </PropLink>
          <ContactShade
            color={palette.shadow}
            width={0.4}
            position={[0.64, 0.02, -0.11]}
          />
          {/* Lying flat, so it rises off the wood rather than toward the
              viewer — the standing lift would slide it across the shelf. */}
          <PhotoMount
            unitIndex={index}
            id="projects-couch"
            position={[0.6, 0.003, 0.2]}
            rotation={[0, -0.42, 0]}
            lift={[0, 0.014, 0]}
          >
            <FlatPrint
              src="/images/stacks/projects-couch.jpg"
              palette={palette}
              textured={textured}
            />
          </PhotoMount>
        </group>
      }
    >
      {/* Same hidden-third-frame bug Talks had: a 2.6-wide row centred at
          local x 0 puts frame 3 at 0.49…1.25, and the desktop placard starts
          somewhere between +0.28 and +1.51 depending on the window, moving
          ±0.49 more as the camera pans with the pointer. UnitBooks fixed this
          by hand in v4; Projects and Talks never got the same treatment. */}
      {/* The second of the room's three cans. The top shelf of this unit is a
          row of framed screenshots and nothing else — its whole front ledge is
          bare — so one small object standing in front of the row is the
          cheapest thing that stops it reading as thumbnails pasted on wood,
          the same job the tent card does on Talks. Cool blue here against the
          rust on Training and the olive on Musings. */}
      <group position={[-1.36, 0, 0.26]}>
        <SodaCan
          dark={dark}
          body={dark ? palette.spines[7] : palette.spines[8]}
          rotation={[0, -0.4, 0]}
        />
        <ContactShade
          color={palette.shadow}
          width={0.2}
          position={[0, 0.02, 0.02]}
        />
      </group>
      <group position={[-0.25, 0, 0]}>
        <FrameRow
          frames={frames}
          width={2.6}
          palette={palette}
          textured={textured}
          unitIndex={index}
          onFrameClick={onOpenUrl}
        />
      </group>
    </ShelfUnit>
  );
}

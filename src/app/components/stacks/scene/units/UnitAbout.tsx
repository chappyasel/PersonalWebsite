"use client";

import type { PhotoArtifactId } from "../../sceneArtifacts";
import { useStacks } from "../../store";
import { proxied } from "../../theme";
import { TJMedallionProp } from "../AuthoredProps";
import { CoordinationGlobe } from "../CoordinationGlobe";
import Grabbable from "../Grabbable";
import { ContactShade, FootPool } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { RoundedBox } from "../RoundedBox";
import SitChair from "../SitChair";
import {
  ABOUT_AIC_BASE_DEPTH,
  ABOUT_AIC_BASE_WIDTH,
  ABOUT_AIC_MARK_HEIGHT,
  ABOUT_AIC_MARK_SOURCE_DEPTH,
} from "../aboutAwardGeometry";
import {
  ABOUT_BOOT_LANDMARKS,
  aboutLandmarkNodeName,
} from "../aboutBootComposition";
import {
  ABOUT_AIC_SCALE,
  ABOUT_APPLE_LIGHT_YAW,
  ABOUT_COORDINATION_GLOBE_SCALE,
  ABOUT_LAMP_ROOT_YAW,
  ABOUT_LOWER_AWARD_SCALE,
  ABOUT_TJ_LIGHT_YAW,
  aboutLampHeadQuaternion,
} from "../aboutCoordinationLayout";
import {
  ABOUT_ROLES,
  ABOUT_ROLE_ICON_SIZE,
  aboutRoleIconOffset,
} from "../aboutRoleIcons";
import {
  ABOUT_AIC_MARK_YAW,
  ABOUT_AIC_ROOT_YAW,
  ABOUT_MODEL_POSES,
  ABOUT_PHOTO_POSES,
  ABOUT_TOP_LANDMARK_Z,
} from "../aboutScenePose";
import { proxiedBookCover } from "../bookCoverTexture";
import { EggLamp, SpinProp, Sway } from "../eggs";
import { getSceneInteraction } from "../interactionRegistry";
import { DeskApple, PortraitFrame, useMetalShimmer } from "../objects";
import { DeskFrame, FlatPrint, deskFrameHeight } from "../photos";
import { ShelfUnit } from "../primitives";
import { propReactionIsEngaged } from "../reactionEngagement";
import { ABOUT_COUCH } from "../seated";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import { useUnitFrame } from "../unitActivity";
import { useUnitLod } from "../useUnitLod";
import { useLoader } from "@react-three/fiber";
import React from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

import {
  fallbackCoverEdgeColor,
  readingBookMaterialColors,
} from "~/lib/books/coverEdgeColor";

import { ProjectIcon } from "./ProjectArtifacts";
import { ShelfSucculent } from "./ShelfSucculent";
import {
  ABOUT_READING_BOOK,
  ABOUT_READING_COVER_IMAGE,
  type ReadingBookPose,
  readingBookAtAuthoredPose,
  readingStackPoses,
  recordAboutReadingMaterials,
} from "./aboutReadingStack";
import { featuredBookThickness } from "./featuredBookGeometry";
import { type UnitProps } from "./types";
import { REVIEWED_SHELF_LAYOUT } from "./unitShelfLayout";

export const PORTRAIT_SRC = "/images/about/profile.jpg";
const ABOUT_TOP_PHOTO_HOVER_ANGLE = Math.PI / 3;
const ABOUT_TOP_PHOTO_HOVER_LIFT = 0.025;

function CollectiveLogo({
  palette,
  unitIndex,
}: Pick<UnitProps, "palette"> & { unitIndex: number }) {
  const svg = useLoader(SVGLoader, "/images/stacks/v8/ai-collective-mark.svg");
  const mark = React.useMemo(() => {
    const shapes = svg.paths.flatMap((path) => SVGLoader.createShapes(path));
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: ABOUT_AIC_MARK_SOURCE_DEPTH,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 9,
      bevelThickness: 9,
      curveSegments: 4,
    });
    // SVG coordinates are y-down. Normalize the original 844.38-high mark to
    // an 18 cm desk object and centre it without approximating its silhouette.
    // A negative Y scale used to do the SVG flip, but that reverses triangle
    // winding and leaves the extruded front face lit like a flat backface.
    // A proper 180-degree rotation has a positive determinant, so the front,
    // bevel and side normals all survive the conversion.
    const scale = ABOUT_AIC_MARK_HEIGHT / 844.38;
    geometry.scale(scale, scale, scale);
    geometry.rotateX(Math.PI);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    geometry.translate(
      -(box.min.x + box.max.x) / 2,
      -(box.min.y + box.max.y) / 2,
      -(box.min.z + box.max.z) / 2,
    );
    geometry.computeVertexNormals();
    return geometry;
  }, [svg]);
  React.useEffect(() => () => mark.dispose(), [mark]);
  const shimmerMark = React.useMemo(() => {
    const geometry = mark.clone();
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      // ExtrudeGeometry generated these UVs before the 844px SVG was scaled
      // into scene units, so the shared 0.34-unit shimmer period repeated
      // thousands of times and averaged into an invisible wash. DeskApple's
      // caps use local x/y scene units; remap this private overlay geometry to
      // that same contract so one broad band traverses the open C.
      uv[i * 2] = position.getX(i);
      uv[i * 2 + 1] = position.getY(i);
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geometry;
  }, [mark]);
  React.useEffect(() => () => shimmerMark.dispose(), [shimmerMark]);
  const {
    band,
    mark: front,
    texture,
  } = useMetalShimmer({
    unitIndex,
    hoverKey: "grab:ai-collective-mark",
    idleRoughness: 0.2,
    idleEnv: 3.7,
  });
  return (
    <group>
      {/* Bead-blasted billet, matching DeskApple's material hierarchy. */}
      <RoundedBox
        castShadow
        args={[ABOUT_AIC_BASE_WIDTH, 0.024, ABOUT_AIC_BASE_DEPTH]}
        radius={0.005}
        smoothness={3}
        position={[0, 0.012, 0]}
      >
        <meshStandardMaterial
          color={palette.hub}
          metalness={0.76}
          roughness={0.54}
          envMapIntensity={1.3}
        />
      </RoundedBox>
      {/* The source SVG is extruded directly: the open C, both squared arrow
          tips and the inner negative space remain the brand's actual paths. */}
      <mesh
        castShadow
        geometry={mark}
        position={[0, 0.118, 0.004]}
        // Keep the face nearly square to the environment probe (like the
        // DeskApple) so the anodized front catches the broad light form,
        // while a small yaw still reveals the extruded copper-orange edge.
        rotation={[0, ABOUT_AIC_MARK_YAW, 0]}
      >
        <meshPhysicalMaterial
          ref={front}
          attach="material-0"
          color="#ff9b50"
          emissive="#4a1504"
          emissiveIntensity={0.16}
          metalness={0.82}
          roughness={0.18}
          envMapIntensity={3.7}
          clearcoat={0.62}
          clearcoatRoughness={0.12}
          reflectivity={1}
        />
        <meshPhysicalMaterial
          attach="material-1"
          color="#c85b1c"
          emissive="#351004"
          emissiveIntensity={0.1}
          metalness={0.78}
          roughness={0.28}
          envMapIntensity={3}
          clearcoat={0.35}
          clearcoatRoughness={0.18}
          reflectivity={1}
        />
      </mesh>
      {/* The exact same masked shimmer texture and motion curve as DeskApple,
          on the logo's own extruded geometry so its negative spaces stay
          transparent and no rectangular highlight leaks over the sky. */}
      <mesh
        geometry={shimmerMark}
        position={[0, 0.118, 0.005]}
        rotation={[0, ABOUT_AIC_MARK_YAW, 0]}
        scale={1.003}
      >
        <meshBasicMaterial
          ref={band}
          map={texture}
          color="#fff4e8"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function LoosePhoto({
  unitIndex,
  palette,
  id,
  layoutLabel,
  base,
  seat = 0,
  rotation = [0, 0, 0],
  facingRotation = [0, 0, 0],
  hingeOnHover = false,
  width,
  children,
}: {
  unitIndex: number;
  palette: UnitProps["palette"];
  layoutLabel: string;
  id: PhotoArtifactId;
  base: [number, number, number];
  seat?: number;
  rotation?: [number, number, number];
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
      layoutLabel={layoutLabel}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={Math.max(0.28, width * 1.18)}
      hoverTiltAngle={hingeOnHover ? ABOUT_TOP_PHOTO_HOVER_ANGLE : undefined}
      hoverLift={hingeOnHover ? ABOUT_TOP_PHOTO_HOVER_LIFT : undefined}
      shape="box"
      massKg={0.48}
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

function ReadingStack({
  books,
  bookColors,
  palette,
  dark,
  coverWidth,
  unitIndex,
  onOpenBook,
}: {
  books: UnitProps["data"]["readingBooks"];
  bookColors: UnitProps["data"]["readingBookColors"];
  palette: UnitProps["palette"];
  dark: boolean;
  coverWidth: UnitProps["coverWidth"];
  unitIndex: number;
  onOpenBook?: (id: string) => void;
}) {
  const poses = React.useMemo(() => readingStackPoses(), []);
  const materials = React.useMemo(
    () =>
      books.slice(0, 3).map((book) => {
        const sampled = bookColors[book.id] ?? {
          edge: fallbackCoverEdgeColor(book.id),
          source: "fallback" as const,
        };
        return {
          id: book.id,
          edge: sampled.edge,
          source: sampled.source,
          ...readingBookMaterialColors(sampled.edge, palette.pages, dark),
        };
      }),
    [bookColors, books, dark, palette.pages],
  );
  React.useEffect(() => recordAboutReadingMaterials(materials), [materials]);
  return (
    <group>
      {books.slice(0, 3).map((book, i) => {
        const pose = poses[i]!;
        const material = materials[i]!;
        const thickness =
          1.1 * featuredBookThickness(book.pageCount, book.audioLengthMin);
        return (
          <Grabbable
            key={book.id}
            unitIndex={unitIndex}
            hoverKey={`grab:reading:${book.id}`}
            base={[...pose.base]}
            shadeColor={palette.shadow}
            shadeWidth={0.36}
            shape="box"
            massKg={0.62}
            tiltOnHover={false}
            onTap={() => onOpenBook?.(book.id)}
            // Title, author, then the verb: the label describes the book
            // before it says what a tap does. "Preview", because the tap
            // opens the in-room book modal, not the full notes page.
            doorLabel={book.title}
            doorDetail={book.author ? [book.author] : undefined}
            actionLabel="Preview book notes"
          >
            <ReadingBookHover
              hoverKey={`grab:reading:${book.id}`}
              index={i}
              authoredBase={pose.base}
              rest={pose.rotation}
              thickness={thickness}
            >
              <HeldReadingCover
                hoverKey={`grab:reading:${book.id}`}
                pose={pose}
                name={`stacks-reading-cover:${book.id}`}
              >
                <ReadingBookShell
                  cover={material.cover}
                  pages={material.pages}
                  thickness={thickness}
                />
                {book.coverUrl && (
                  <React.Suspense fallback={null}>
                    <group
                      position={[
                        0,
                        thickness / 2 + ABOUT_READING_COVER_IMAGE.lift,
                        0,
                      ]}
                      rotation={[-Math.PI / 2, 0, 0]}
                    >
                      <LitImage
                        url={proxiedBookCover(book.coverUrl, coverWidth)}
                        width={ABOUT_READING_COVER_IMAGE.width}
                        height={ABOUT_READING_COVER_IMAGE.height}
                        roughness={0.64}
                      />
                    </group>
                  </React.Suspense>
                )}
              </HeldReadingCover>
            </ReadingBookHover>
          </Grabbable>
        );
      })}
    </group>
  );
}

const READING_HOVER_OFFSETS = [
  [-0.085, 0.032, 0.07],
  [0.12, 0.055, 0.14],
  [0.085, 0.032, 0.07],
] as const;

/** The shared hinged nod makes this tightly fanned trio swing through its
 * neighbors. Instead, each jacket eases into its own clear lane: the outer
 * books peel away from the stack and the middle book comes straight forward. */
function ReadingBookHover({
  hoverKey,
  index,
  authoredBase,
  rest,
  thickness,
  children,
}: {
  hoverKey: string;
  index: number;
  authoredBase: readonly [number, number, number];
  rest: readonly [number, number, number];
  thickness: number;
  children: React.ReactNode;
}) {
  const group = React.useRef<THREE.Group>(null);
  const still = React.useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const offset = READING_HOVER_OFFSETS[index] ?? READING_HOVER_OFFSETS[1];

  useUnitFrame((_, rawDelta) => {
    const node = group.current;
    if (!node) return;
    const state = useStacks.getState();
    const carrier = getSceneInteraction(hoverKey)?.root;
    const active =
      propReactionIsEngaged(state, hoverKey) &&
      carrier !== undefined &&
      readingBookAtAuthoredPose(
        carrier.position,
        carrier.quaternion,
        authoredBase,
      );
    const amount = active && !still ? 1 : 0;
    const delta = Math.min(rawDelta, 1 / 30);
    node.position.x = THREE.MathUtils.damp(
      node.position.x,
      offset[0] * amount,
      12,
      delta,
    );
    node.position.y = THREE.MathUtils.damp(
      node.position.y,
      offset[1] * amount,
      12,
      delta,
    );
    node.position.z = THREE.MathUtils.damp(
      node.position.z,
      offset[2] * amount,
      12,
      delta,
    );
  });

  return (
    <>
      {/* Hover motion must not move the surface that owns hover. Otherwise a
          stationary cursor loses the translated jacket, sends it home, then
          catches it again in a loop. This invisible authored-pose volume stays
          put while the visible book moves and is excluded from physics. */}
      <mesh
        name="interaction-hit:reading-book"
        rotation={[rest[0], rest[1], rest[2]]}
        userData={{ physicsIgnore: true }}
      >
        <boxGeometry
          args={[
            ABOUT_READING_BOOK.width + 0.025,
            thickness + 0.025,
            ABOUT_READING_BOOK.depth + 0.025,
          ]}
        />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </mesh>
      <group ref={group}>{children}</group>
    </>
  );
}

const READING_BOARD_THICKNESS = 0.007;

/** A book rather than a colored brick: cream page block, two jacket-matched
 * cloth boards, and a wrapped spine. The slight board overhang is what makes
 * the two horizontal books read as overlapping volumes in the reference. */
function ReadingBookShell({
  cover,
  pages,
  thickness,
}: {
  cover: string;
  pages: string;
  thickness: number;
}) {
  const pageThickness = thickness - READING_BOARD_THICKNESS * 2;
  const boardY = thickness / 2 - READING_BOARD_THICKNESS / 2;
  return (
    <group>
      <RoundedBox
        castShadow
        args={[
          ABOUT_READING_BOOK.width - 0.016,
          pageThickness,
          ABOUT_READING_BOOK.depth - 0.022,
        ]}
        radius={0.006}
        smoothness={3}
      >
        <meshStandardMaterial color={pages} roughness={0.9} />
      </RoundedBox>
      {[-boardY, boardY].map((y) => (
        <RoundedBox
          key={y}
          castShadow
          position={[0, y, 0]}
          args={[
            ABOUT_READING_BOOK.width,
            READING_BOARD_THICKNESS,
            ABOUT_READING_BOOK.depth,
          ]}
          radius={0.002}
          smoothness={2}
        >
          <meshStandardMaterial color={cover} roughness={0.72} />
        </RoundedBox>
      ))}
      <RoundedBox
        castShadow
        position={[-ABOUT_READING_BOOK.width / 2 + 0.006, 0, 0]}
        args={[0.012, thickness - 0.004, ABOUT_READING_BOOK.depth]}
        radius={0.003}
        smoothness={2}
      >
        <meshStandardMaterial color={cover} roughness={0.76} />
      </RoundedBox>
    </group>
  );
}

/** The stack's support angle is authored in its local geometry, while
 * Grabbable owns translation/physics. During a real carry this inner pose
 * presents the jacket toward +Z (the viewer), then eases exactly back to the
 * contact-derived rest rotation when released. */
function HeldReadingCover({
  hoverKey,
  pose,
  name,
  children,
}: {
  hoverKey: string;
  pose: ReadingBookPose;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <HeldFacing
      hoverKey={hoverKey}
      name={name}
      rest={pose.rotation}
      facingRotation={[Math.PI / 2, 0, 0]}
    >
      {children}
    </HeldFacing>
  );
}

export default function UnitAbout({
  palette,
  dark,
  index,
  headOnCapture,
  coverWidth,
  data,
  onOpenBook,
}: UnitProps) {
  const textured = useUnitLod(index);
  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            <Grabbable
              unitIndex={index}
              hoverKey="shimmer:apple"
              metal
              base={[
                ABOUT_BOOT_LANDMARKS.apple.x,
                0,
                SHELF_GEOMETRY.lower.centerZ,
              ]}
              shadeColor={palette.shadow}
              shadeWidth={0.26}
              shape="box"
              massKg={0.35}
              // A Door like the TJ medallion and the AIC mark beside it, so
              // the label can say what the object stands for (owner: make the
              // tooltips describe). The click still fires the mark's sweep.
              href="https://www.apple.com/"
              doorLabel="Apple"
              doorDetail={["Former AR/VR Software Engineer"]}
            >
              <group
                name={aboutLandmarkNodeName("apple")}
                rotation={[0, ABOUT_APPLE_LIGHT_YAW, 0]}
                scale={ABOUT_LOWER_AWARD_SCALE}
              >
                <DeskApple palette={palette} unitIndex={index} />
              </group>
            </Grabbable>
            {/* The Role Icons: where he works now, beside the mark of where
                he worked. Four Project Icon billets at half the Projects
                edge, stacked two by two like the dice; each is a Door to its
                organization and every tile is its own Movable Prop. */}
            <group name={aboutLandmarkNodeName("role-icons")}>
              {ABOUT_ROLES.map((role) => {
                const [dx, dy] = aboutRoleIconOffset(role);
                return (
                  <ProjectIcon
                    key={role.id}
                    unitIndex={index}
                    palette={palette}
                    dark={dark}
                    hoverKey={`link:about:role:${role.id}`}
                    base={[
                      ABOUT_BOOT_LANDMARKS["role-icons"].x + dx,
                      dy,
                      SHELF_GEOMETRY.lower.centerZ,
                    ]}
                    artwork={role.artwork}
                    fallbackColor={role.fallbackColor}
                    textured={textured}
                    yaw={role.yaw}
                    href={role.href}
                    doorLabel={role.doorLabel}
                    doorDetail={role.doorDetail}
                    size={ABOUT_ROLE_ICON_SIZE}
                    massKg={0.08}
                  />
                );
              })}
            </group>
            <Grabbable
              unitIndex={index}
              hoverKey="grab:ai-collective-mark"
              metal
              base={[
                ABOUT_BOOT_LANDMARKS["ai-collective"].x,
                0,
                SHELF_GEOMETRY.lower.centerZ,
              ]}
              shadeColor={palette.shadow}
              shadeWidth={0.26}
              shape="box"
              massKg={0.42}
              sceneImpulseReaction="knockdown"
              href="https://aicollective.com/"
              doorLabel="The AI Collective"
              doorDetail={["Co-founder"]}
            >
              <React.Suspense fallback={null}>
                <group
                  name={aboutLandmarkNodeName("ai-collective")}
                  rotation={[0, ABOUT_AIC_ROOT_YAW, 0]}
                  scale={ABOUT_AIC_SCALE}
                >
                  {/* The open C and its thin billet are visually honest but
                      leave very few raycast pixels at this oblique shelf
                      angle. This padded target belongs only to pointer
                      acquisition; physics continues to measure the visible
                      metal geometry. */}
                  <mesh
                    name="interaction-hit:ai-collective"
                    position={[0, 0.115, 0]}
                    userData={{ physicsIgnore: true }}
                  >
                    <boxGeometry args={[0.29, 0.26, 0.1]} />
                    <meshBasicMaterial
                      transparent
                      opacity={0}
                      depthWrite={false}
                      colorWrite={false}
                    />
                  </mesh>
                  <CollectiveLogo palette={palette} unitIndex={index} />
                </group>
              </React.Suspense>
            </Grabbable>
            <CoordinationGlobe
              unitIndex={index}
              palette={palette}
              dark={dark}
              base={[
                ABOUT_BOOT_LANDMARKS["coordination-globe"].x,
                0,
                SHELF_GEOMETRY.lower.centerZ,
              ]}
              scale={ABOUT_COORDINATION_GLOBE_SCALE}
            />
            <group name={aboutLandmarkNodeName("reading-stack")}>
              <ReadingStack
                books={data.readingBooks}
                bookColors={data.readingBookColors}
                palette={palette}
                dark={dark}
                coverWidth={coverWidth}
                unitIndex={index}
                onOpenBook={onOpenBook}
              />
            </group>
            <React.Suspense fallback={null}>
              <TJMedallionProp
                unitIndex={index}
                palette={palette}
                dark={dark}
                base={[
                  ABOUT_BOOT_LANDMARKS["tj-medallion"].x,
                  0,
                  SHELF_GEOMETRY.lower.centerZ,
                ]}
                href="https://tjhsst.fcps.edu/"
                doorLabel="TJHSST"
                doorDetail={[
                  "Class of 2017",
                  "Alumni Director, TJ Partnership Fund board",
                ]}
                name={aboutLandmarkNodeName("tj-medallion")}
                scale={ABOUT_BOOT_LANDMARKS["tj-medallion"].sceneScale}
                yaw={ABOUT_TJ_LIGHT_YAW}
              />
            </React.Suspense>
            {/* The warm practical from the original desk composition. The
                model and its measured light rig share this one transform;
                fixed task lighting is architecture, not a throwable prop. */}
            <group position={[ABOUT_BOOT_LANDMARKS["desk-lamp"].x, 0, -0.06]}>
              <group name={aboutLandmarkNodeName("desk-lamp")}>
                <EggLamp
                  unitIndex={index}
                  palette={palette}
                  dark={dark}
                  yaw={ABOUT_LAMP_ROOT_YAW}
                  scale={ABOUT_BOOT_LANDMARKS["desk-lamp"].sceneScale}
                  spillScale={0.3}
                  headQuaternion={aboutLampHeadQuaternion(headOnCapture)}
                  captureLightEmphasis={headOnCapture}
                />
              </group>
              <ContactShade
                color={palette.shadow}
                width={0.32}
                position={[0, 0.018, 0.02]}
              />
            </group>
          </group>
        }
      >
        <Grabbable
          unitIndex={index}
          hoverKey="egg:globe"
          base={[ABOUT_BOOT_LANDMARKS.globe.x, 0, ABOUT_TOP_LANDMARK_Z.globe]}
          shadeColor={palette.shadow}
          shadeWidth={0.4}
          shape="box"
          massKg={1.4}
          // The carrier and the SpinProp share this key, so the globe was
          // being handed the shared nod as well. A globe turns.
          signature="spin"
        >
          <group name={aboutLandmarkNodeName("globe")}>
            <SpinProp unitIndex={index} hoverKey="egg:globe" idleRate={0.11}>
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/globe.glb"
                  dark={dark}
                  rotation={[...ABOUT_MODEL_POSES.globe.rotation]}
                  scale={ABOUT_BOOT_LANDMARKS.globe.sceneScale}
                  spinPart="sphere"
                />
              </React.Suspense>
            </SpinProp>
          </group>
        </Grabbable>

        {/* Set Dressing, opposite the succulent after the top plants swapped
            places. */}
        <Grabbable
          unitIndex={index}
          hoverKey="grab:plant:about-cactus"
          layoutLabel="About · Cactus"
          base={[ABOUT_BOOT_LANDMARKS.cactus.x, 0, ABOUT_TOP_LANDMARK_Z.cactus]}
          shadeColor={palette.shadow}
          shadeWidth={0.28}
          shape="box"
          colliderProfile="foliage-base"
          massKg={1.6}
        >
          <group name={aboutLandmarkNodeName("cactus")}>
            <Sway unitIndex={index} amount={0.014} rate={0.34}>
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/cactus.glb"
                  dark={dark}
                  variant="recolor"
                  rotation={[...ABOUT_MODEL_POSES.cactus.rotation]}
                  scale={ABOUT_BOOT_LANDMARKS.cactus.sceneScale}
                />
              </React.Suspense>
            </Sway>
          </group>
        </Grabbable>

        <LoosePhoto
          unitIndex={index}
          palette={palette}
          id="about-collective-group-v8"
          layoutLabel="About · Collective print"
          base={[
            ABOUT_BOOT_LANDMARKS["collective-frame"].x,
            0,
            ABOUT_TOP_LANDMARK_Z["collective-frame"],
          ]}
          rotation={[0, 0, 0]}
          facingRotation={[Math.PI / 2, 0, 0]}
          hingeOnHover
          width={0.3072}
        >
          <group name={aboutLandmarkNodeName("collective-frame")}>
            <FlatPrint
              src="/images/stacks/v8/about-collective-group.webp"
              palette={palette}
              textured={textured}
              width={0.3072}
              height={0.3072 * (640 / 1024)}
            />
          </group>
        </LoosePhoto>

        <LoosePhoto
          unitIndex={index}
          palette={palette}
          id="portrait"
          layoutLabel="About · Large portrait"
          base={[
            ABOUT_BOOT_LANDMARKS.portrait.x,
            0,
            ABOUT_PHOTO_POSES.portrait.baseZ,
          ]}
          // Owner placement via the scene layout editor, 2026-08-22: a
          // slight turn toward the lamp side.
          rotation={[...ABOUT_PHOTO_POSES.portrait.rotation]}
          width={ABOUT_BOOT_LANDMARKS.portrait.profile.width}
        >
          <group
            name={aboutLandmarkNodeName("portrait")}
            scale={ABOUT_BOOT_LANDMARKS.portrait.sceneScale}
          >
            <PortraitFrame
              src={proxied(PORTRAIT_SRC, coverWidth)}
              detailSrc={proxied(PORTRAIT_SRC, 1080)}
              palette={palette}
              textured={textured}
            />
          </group>
        </LoosePhoto>

        <LoosePhoto
          unitIndex={index}
          palette={palette}
          id="about-family-v8"
          layoutLabel="About · Family frame"
          base={[
            ABOUT_BOOT_LANDMARKS["family-frame"].x,
            0,
            ABOUT_PHOTO_POSES.family.baseZ,
          ]}
          seat={deskFrameHeight(0.264) / 2}
          // Owner placement via the scene layout editor, 2026-08-22: the
          // editor's carrier rotation composed onto the old authored tilt.
          rotation={[...ABOUT_PHOTO_POSES.family.rotation]}
          width={0.264 * (769 / 1024)}
        >
          <group name={aboutLandmarkNodeName("family-frame")}>
            <DeskFrame
              src="/images/stacks/v8/about-family.webp"
              palette={palette}
              textured={textured}
              width={0.264 * (769 / 1024)}
              height={0.264}
            />
          </group>
        </LoosePhoto>

        <LoosePhoto
          unitIndex={index}
          palette={palette}
          id="about-speaking-candid-v8"
          layoutLabel="About · Speaking print"
          base={[REVIEWED_SHELF_LAYOUT.about.speakingPrintX, 0, 0.239]}
          rotation={[0, 0, 0]}
          facingRotation={[Math.PI / 2, 0, 0]}
          hingeOnHover
          width={0.306}
        >
          <FlatPrint
            src="/images/stacks/v8/about-speaking-candid.webp"
            palette={palette}
            textured={textured}
            width={0.306}
            height={0.306 * (683 / 1024)}
          />
        </LoosePhoto>

        <Grabbable
          unitIndex={index}
          hoverKey="grab:plant:about-succulent"
          layoutLabel="About · Succulent"
          base={[
            ABOUT_BOOT_LANDMARKS.succulent.x,
            0,
            ABOUT_TOP_LANDMARK_Z.succulent,
          ]}
          shadeColor={palette.shadow}
          shadeWidth={0.28}
          shape="box"
          colliderProfile="foliage-base"
          massKg={1.2}
        >
          <group name={aboutLandmarkNodeName("succulent")}>
            <ShelfSucculent unitIndex={index} dark={dark} />
          </group>
        </Grabbable>

        <LoosePhoto
          unitIndex={index}
          palette={palette}
          id="about-delicate-arch-v8"
          layoutLabel="About · Arch print"
          base={[REVIEWED_SHELF_LAYOUT.about.archPrintX, 0, 0.231]}
          rotation={[0, 0, 0]}
          facingRotation={[Math.PI / 2, 0, 0]}
          hingeOnHover
          width={0.24}
        >
          <FlatPrint
            src="/images/stacks/v8/about-delicate-arch.webp"
            palette={palette}
            textured={textured}
            width={0.24}
            height={0.24}
          />
        </LoosePhoto>

        {/* A frame can lean backward into a plant; it cannot balance on one
            lower corner sideways. The exact 30° x-tilt moves its top toward
            the rear of the shelf while the contact-derived seat keeps its
            complete bottom edge on the plank. */}
        <LoosePhoto
          unitIndex={index}
          palette={palette}
          id="about-profile-full-v8"
          layoutLabel="About · Profile frame"
          base={[
            ABOUT_BOOT_LANDMARKS["profile-frame"].x,
            0,
            ABOUT_PHOTO_POSES.profile.baseZ,
          ]}
          seat={REVIEWED_SHELF_LAYOUT.about.profileSeat}
          rotation={[...ABOUT_PHOTO_POSES.profile.rotation]}
          width={0.18}
        >
          <group name={aboutLandmarkNodeName("profile-frame")}>
            <DeskFrame
              src="/images/stacks/v8/about-profile-full.webp"
              palette={palette}
              textured={textured}
              width={0.18}
              height={0.24}
            />
          </group>
        </LoosePhoto>

        <Grabbable
          unitIndex={index}
          hoverKey="grab:plant:about-large"
          base={[
            ABOUT_BOOT_LANDMARKS["large-plant"].x,
            0,
            ABOUT_TOP_LANDMARK_Z["large-plant"],
          ]}
          shadeColor={palette.shadow}
          shadeWidth={0.34}
          shape="box"
          colliderProfile="foliage-base"
          massKg={3.1}
        >
          <group name={aboutLandmarkNodeName("large-plant")}>
            <Sway unitIndex={index} amount={0.02} rate={0.42} phase={1.3}>
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/potted-plant.glb"
                  dark={dark}
                  rotation={[...ABOUT_MODEL_POSES["large-plant"].rotation]}
                  scale={ABOUT_BOOT_LANDMARKS["large-plant"].sceneScale}
                />
              </React.Suspense>
            </Sway>
          </group>
        </Grabbable>
      </ShelfUnit>

      <Grabbable
        unitIndex={index}
        hoverKey="grab:dumbbell:about"
        base={[...ABOUT_MODEL_POSES.dumbbell.base]}
        shadeColor={palette.shadow}
        shadeWidth={0.58}
        shape="box"
        massKg={10}
        standsOn="floor"
        to="weightlifting"
      >
        <React.Suspense fallback={null}>
          <ModelProp
            url={ABOUT_MODEL_POSES.dumbbell.source}
            dark={dark}
            atlasOverride={{ tint: "#76716d", roughness: 0.55 }}
            rotation={[...ABOUT_MODEL_POSES.dumbbell.rotation]}
            scale={ABOUT_MODEL_POSES.dumbbell.scale}
          />
        </React.Suspense>
      </Grabbable>

      <group
        position={[ABOUT_COUCH.x, SHELF_GEOMETRY.groundY, ABOUT_COUCH.z]}
        rotation={[0, ABOUT_COUCH.yaw, 0]}
      >
        <SitChair unitIndex={index}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/couch.glb"
              dark={dark}
              variant="tinted"
              tints={{
                Couch_Blue: dark ? "#394b61" : "#667d96",
                Black: dark ? "#253447" : "#344a61",
              }}
              roughness={0.84}
              scale={ABOUT_COUCH.scale}
            />
          </React.Suspense>
        </SitChair>
      </group>
      <FootPool
        color={palette.shadow}
        size={[2.1, 1.6]}
        position={[ABOUT_COUCH.x, SHELF_GEOMETRY.groundY, ABOUT_COUCH.z]}
      />
    </group>
  );
}

"use client";

import {
  type ReadingBookEdgeColor,
  fallbackCoverEdgeColor,
  readingBookMaterialColors,
} from "../../../../lib/books/coverEdgeColor";
import {
  markBootBookFaceSettled,
  markBootSequenceReady,
  resetBootSequenceReady,
} from "../loading";
import {
  ABOUT_BOOT_COMPOSITION,
  type AboutBootLandmark,
  type AboutLandmarkGlyph,
  type AboutLandmarkId,
} from "../scene/aboutBootComposition";
import { ABOUT_BOOT_MODEL_SILHOUETTES } from "../scene/aboutBootSilhouettes";
import { APPLE_OUTLINE } from "../scene/appleOutline";
import {
  SHELF_GEOMETRY,
  SHELF_PLANKS,
  SHELF_SURFACE,
} from "../scene/shelfGeometry";
import {
  ABOUT_READING_BOOK,
  readingBookPerspectiveElevation,
  readingStackPoses,
} from "../scene/units/aboutReadingStack";
import { CAMERA } from "../scene/worldLayout";
import { PALETTES, proxied } from "../theme";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  type BootReadingBook,
  bootReadingBookFaceKey,
  getBootReadingBooks,
  getServerBootReadingBooks,
  publishBootReadingBooks,
  subscribeBootReadingBooks,
} from "./bootReadingBooks";

export const SCENE_TO_BOOT_SVG = 100;
export const BOOT_CADENCE_STEP_SECONDS = 0.12;
export const BOOT_CADENCE_SETTLE_SECONDS = 0.32;
export const BOOT_WAVE_INTRO_SECONDS = 0.36;
export const BOOT_WAVE_DURATION_SECONDS = 3.6;
const BOOT_WAVE_MIN_OPACITY = 0.18;

export function projectSceneY(sceneY: number) {
  return -sceneY * SCENE_TO_BOOT_SVG;
}

export function bootCadence(itemCount: number) {
  const lastSlot = Math.max(0, itemCount - 1);
  const revealDuration =
    lastSlot * BOOT_CADENCE_STEP_SECONDS + BOOT_CADENCE_SETTLE_SECONDS;
  return {
    delays: Array.from(
      { length: itemCount },
      (_, index) => index * BOOT_CADENCE_STEP_SECONDS,
    ),
    revealDuration,
    waveDuration: BOOT_WAVE_DURATION_SECONDS,
  };
}

const DEFAULT_BOOT_READING_BOOKS: BootReadingBook[] = [
  { id: "boot-reading-one" },
  { id: "boot-reading-two" },
  { id: "boot-reading-three" },
];

type BootScreenProps = {
  readingBooks?: BootReadingBook[];
  readingBookColors?: Record<string, ReadingBookEdgeColor>;
};

export function BootReadingBooksBridge({
  readingBooks,
  readingBookColors,
}: {
  readingBooks: BootReadingBook[];
  readingBookColors: Record<string, ReadingBookEdgeColor>;
}) {
  useEffect(
    () =>
      publishBootReadingBooks({
        books: readingBooks,
        colors: readingBookColors,
      }),
    [readingBookColors, readingBooks],
  );
  return null;
}

type BootStyle = CSSProperties & Record<`--stacks-boot-${string}`, string>;

export function bootItemPose(
  progress: number,
  index: number,
  cadence: ReturnType<typeof bootCadence>,
) {
  const start = cadence.delays[index]! / cadence.revealDuration;
  const linear = Math.min(
    1,
    Math.max(
      0,
      (progress - start) *
        (cadence.revealDuration / BOOT_CADENCE_SETTLE_SECONDS),
    ),
  );
  const visible = linear * linear * (3 - 2 * linear);
  return { opacity: visible, offsetY: (1 - visible) * 7 };
}

export function bootItemKeyframes(
  index: number,
  cadence: ReturnType<typeof bootCadence>,
): Keyframe[] {
  const hidden = {
    opacity: 0,
    transform: "translate3d(0, 7px, 0)",
  };
  const visible = {
    opacity: 1,
    transform: "translate3d(0, 0, 0)",
  };
  const revealStart = cadence.delays[index]! / cadence.revealDuration;
  const revealEnd =
    (cadence.delays[index]! + BOOT_CADENCE_SETTLE_SECONDS) /
    cadence.revealDuration;

  return [
    { ...hidden, offset: 0 },
    {
      ...hidden,
      offset: revealStart,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    },
    { ...visible, offset: revealEnd },
    { ...visible, offset: 1 },
  ];
}

/** The exact contiguous window at a wave step. ABOUT_BOOT_COMPOSITION is
 * authored top-shelf left→right, then lower-shelf left→right, so incrementing
 * the step produces that same visible route. */
export function bootWaveWindow(step: number, itemCount: number): number[] {
  if (itemCount <= 0) return [];
  const width = Math.max(1, Math.round(itemCount / 4));
  const start = ((step % itemCount) + itemCount) % itemCount;
  return Array.from(
    { length: width },
    (_, offset) => (start + offset) % itemCount,
  );
}

/** Smoothly establishes the first window after every object has appeared. */
export function bootWaveIntroKeyframes(
  index: number,
  itemCount: number,
): Keyframe[] {
  const dimmed = bootWaveWindow(0, itemCount).includes(index);
  return [
    { opacity: 1, offset: 0 },
    { opacity: dimmed ? BOOT_WAVE_MIN_OPACITY : 1, offset: 1 },
  ];
}

/** After the one-shot reveal and intro, a fixed-width window advances one
 * landmark per step. CSS interpolates between steps, fading the outgoing
 * landmark in while the next one fades out. */
export function bootWaveKeyframes(
  index: number,
  itemCount: number,
): Keyframe[] {
  if (itemCount <= 0) return [];
  return Array.from({ length: itemCount + 1 }, (_, step) => ({
    opacity: bootWaveWindow(step, itemCount).includes(index)
      ? BOOT_WAVE_MIN_OPACITY
      : 1,
    offset: step / itemCount,
  }));
}

function cssKeyframes(name: string, frames: Keyframe[]) {
  const body = frames
    .map(({ offset, opacity, transform, easing }) => {
      const percentage = Number((Number(offset) * 100).toFixed(5));
      const alpha = opacity === undefined ? "" : `opacity:${String(opacity)};`;
      const translation =
        transform === undefined ? "" : `transform:${String(transform)};`;
      const timing = easing
        ? `animation-timing-function:${String(easing)};`
        : "";
      return `${percentage}%{${alpha}${translation}${timing}}`;
    })
    .join("");
  return `@keyframes ${name}{${body}}`;
}

export function bootCssKeyframes(
  itemCount: number,
  cadence: ReturnType<typeof bootCadence>,
) {
  return Array.from({ length: itemCount }, (_, index) => {
    return [
      cssKeyframes(
        `stacks-boot-reveal-${index}`,
        bootItemKeyframes(index, cadence),
      ),
      cssKeyframes(
        `stacks-boot-wave-intro-${index}`,
        bootWaveIntroKeyframes(index, itemCount),
      ),
      cssKeyframes(
        `stacks-boot-wave-${index}`,
        bootWaveKeyframes(index, itemCount),
      ),
    ].join("");
  }).join("");
}

function useBootMotion(
  sceneRef: RefObject<SVGSVGElement | null>,
  cadence: ReturnType<typeof bootCadence>,
) {
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    resetBootSequenceReady();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scene.dataset.bootMotion = "reduced";
      markBootSequenceReady();
      return;
    }
    let animations: Animation[] = [];
    let readinessFrame = 0;
    let retireTimer = 0;

    const start = () => {
      if (animations.length) return;
      const phase = document.documentElement.dataset.world;
      if (phase !== "pending" && phase !== "warm") return;

      const motions = Array.from(
        scene.querySelectorAll<SVGGElement>(".stacks-boot-item-motion"),
      );
      const timelineTime = Number(document.timeline.currentTime ?? 0);
      // The server-rendered CSS animation has already been running since the
      // first paint. Adopt those exact compositor timelines instead of
      // replacing them during hydration, which used to jump to an arbitrary
      // page-relative point in a freshly-created loop.
      animations = motions.flatMap((motion) => motion.getAnimations());
      scene.dataset.bootMotion = "compositor";

      const observeFirstPass = () => {
        const animationTime = Number(animations[0]?.currentTime ?? 0);
        if (
          timelineTime >= cadence.revealDuration * 1000 ||
          animationTime >= cadence.revealDuration * 1000
        ) {
          markBootSequenceReady();
          return;
        }
        readinessFrame = requestAnimationFrame(observeFirstPass);
      };
      observeFirstPass();
    };

    start();
    const observer = new MutationObserver(() => {
      const phase = document.documentElement.dataset.world;
      if (phase === "pending" || phase === "warm") {
        start();
        return;
      }
      cancelAnimationFrame(readinessFrame);
      // Let the boot wrapper finish its 360ms opacity transition before
      // retiring the compositor timelines. Cancelling immediately snaps every
      // landmark back to its hidden base style during the handoff.
      retireTimer = window.setTimeout(() => {
        for (const animation of animations) animation.cancel();
        animations = [];
      }, 420);
      observer.disconnect();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-world"],
    });

    return () => {
      observer.disconnect();
      cancelAnimationFrame(readinessFrame);
      window.clearTimeout(retireTimer);
      for (const animation of animations) animation.cancel();
    };
  }, [cadence, sceneRef]);
}

const ABOUT_BOOT_CADENCE = bootCadence(ABOUT_BOOT_COMPOSITION.length);

function paletteVariables(): BootStyle {
  const variables: Record<string, string> = {};
  for (const theme of ["light", "dark"] as const) {
    const palette = PALETTES[theme];
    const suffix = `-${theme}`;
    variables[`--stacks-boot-wood${suffix}`] = palette.wood;
    variables[`--stacks-boot-wood-edge${suffix}`] = palette.woodDark;
    variables[`--stacks-boot-sky${suffix}`] = palette.skyHorizon;
    variables[`--stacks-boot-haze${suffix}`] = palette.skyShadow;
    variables[`--stacks-boot-meadow${suffix}`] = palette.meadowTipA;
    variables[`--stacks-boot-glow${suffix}`] = palette.skyEmber;
    variables[`--stacks-boot-strap${suffix}`] = palette.strap;
    variables[`--stacks-boot-frame${suffix}`] = palette.frame;
    variables[`--stacks-boot-page${suffix}`] = palette.pages;
    variables[`--stacks-boot-metal${suffix}`] = palette.metal;
    variables[`--stacks-boot-ink${suffix}`] = palette.ink;
    variables[`--stacks-boot-leaf${suffix}`] = palette.spines[7];
    variables[`--stacks-boot-pot${suffix}`] = palette.plate;
  }
  return variables as BootStyle;
}

function assertNever(_glyph: never): never {
  throw new Error("Unhandled About boot glyph");
}

type BootFramePhoto = {
  src: string;
  preserveAspectRatio: "xMidYMid slice" | "xMidYMin slice";
};

/** These use the same right-sized sources as the first live unit. Browser
 * image requests do not block HTML paint, so the vector frame appears first
 * and the photo fills it when its scene asset decodes. */
export const BOOT_FRAME_PHOTOS = {
  portrait: {
    src: proxied("/images/about/profile.jpg", 384),
    preserveAspectRatio: "xMidYMin slice",
  },
  "family-frame": {
    src: "/images/stacks/v8/512/about-family.webp",
    preserveAspectRatio: "xMidYMid slice",
  },
  "profile-frame": {
    src: "/images/stacks/v8/512/about-profile-full.webp",
    preserveAspectRatio: "xMidYMid slice",
  },
  "collective-frame": {
    src: "/images/stacks/v8/512/about-collective-group.webp",
    preserveAspectRatio: "xMidYMid slice",
  },
} as const satisfies Partial<Record<AboutLandmarkId, BootFramePhoto>>;

function FrameGlyph({
  landmark,
  width,
  height,
}: {
  landmark: AboutBootLandmark;
  width: number;
  height: number;
}) {
  const landmarkId = landmark.id;
  const photo = (BOOT_FRAME_PHOTOS as Partial<Record<string, BootFramePhoto>>)[
    landmarkId
  ];
  const imageWidth = (landmark.imageProfile?.width ?? 0) * SCENE_TO_BOOT_SVG;
  const imageHeight = (landmark.imageProfile?.height ?? 0) * SCENE_TO_BOOT_SVG;
  const imageX = -imageWidth / 2;
  const imageY = -height + (height - imageHeight) / 2;
  return (
    <>
      <rect
        className="stacks-boot-frame"
        x={-width / 2}
        y={-height}
        width={width}
        height={height}
        rx="2"
      />
      <rect
        className="stacks-boot-frame-empty"
        x={imageX}
        y={imageY}
        width={imageWidth}
        height={imageHeight}
        rx="1"
      />
      {photo && (
        <image
          className="stacks-boot-frame-photo"
          data-boot-photo={landmarkId}
          href={photo.src}
          x={imageX}
          y={imageY}
          width={imageWidth}
          height={imageHeight}
          preserveAspectRatio={photo.preserveAspectRatio}
        />
      )}
    </>
  );
}

function ReadingStackGlyph({
  books,
  colors,
  landmarkX,
}: {
  books: BootReadingBook[];
  colors: Record<string, ReadingBookEdgeColor>;
  landmarkX: number;
}) {
  const visible = books.slice(0, 3);
  const poses = readingStackPoses();
  const [firstPose] = poses;
  const [, , fanAngle] = firstPose.rotation;
  const edgeWidth =
    Math.sin(fanAngle) * ABOUT_READING_BOOK.thickness * SCENE_TO_BOOT_SVG;
  return (
    <g>
      {visible.map((book, index) => {
        const sampled = colors[book.id] ?? {
          edge: fallbackCoverEdgeColor(book.id),
          source: "fallback" as const,
        };
        const light = readingBookMaterialColors(
          sampled.edge,
          PALETTES.light.pages,
          false,
        );
        const dark = readingBookMaterialColors(
          sampled.edge,
          PALETTES.dark.pages,
          true,
        );
        const coverPoints = readingBookPerspectiveElevation(
          poses[index]!,
          CAMERA.z,
        ).map(([x, y]): [number, number] => [
          (x - landmarkX) * SCENE_TO_BOOT_SVG,
          -y * SCENE_TO_BOOT_SVG,
        ]) as [
          [number, number],
          [number, number],
          [number, number],
          [number, number],
        ];
        const cover = coverPoints.map((point) => point.join(",")).join(" ");
        const [bottomLeft, bottomRight, topRight, topLeft] = coverPoints;
        const coverImageTransform = [
          topRight[0] - topLeft[0],
          topRight[1] - topLeft[1],
          bottomLeft[0] - topLeft[0],
          bottomLeft[1] - topLeft[1],
          topLeft[0],
          topLeft[1],
        ].join(" ");
        const clipId = `stacks-boot-reading-cover-${index}`;
        const faceKey = bootReadingBookFaceKey(book);
        const foreEdge = [
          bottomRight,
          [bottomRight[0] + edgeWidth, bottomRight[1]],
          [topRight[0] + edgeWidth, topRight[1]],
          topRight,
        ]
          .map((point) => point.join(","))
          .join(" ");
        return (
          <g
            className="stacks-boot-reading-book"
            data-reading-book={book.id}
            data-edge-color={sampled.edge}
            data-book-color-light={light.cover}
            data-book-color-dark={dark.cover}
            key={book.id}
            style={
              {
                "--stacks-boot-book": `var(--stacks-boot-book-light)`,
                "--stacks-boot-book-light": light.cover,
                "--stacks-boot-book-dark": dark.cover,
                "--stacks-boot-book-page-light": light.pages,
                "--stacks-boot-book-page-dark": dark.pages,
              } as BootStyle
            }
          >
            <defs>
              <clipPath id={clipId}>
                <polygon points={cover} />
              </clipPath>
            </defs>
            <polygon
              className="stacks-boot-book-cover"
              data-boot-reading-cover={index}
              points={cover}
            />
            {book.coverSrc && (
              <image
                className="stacks-boot-book-cover-photo"
                clipPath={`url(#${clipId})`}
                data-boot-book-face={book.id}
                href={book.coverSrc}
                height="1"
                onError={() => {
                  if (faceKey) markBootBookFaceSettled(faceKey);
                }}
                onLoad={() => {
                  if (faceKey) markBootBookFaceSettled(faceKey);
                }}
                preserveAspectRatio="none"
                transform={`matrix(${coverImageTransform})`}
                width="1"
                x="0"
                y="0"
              />
            )}
            <polygon className="stacks-boot-book-edge" points={foreEdge} />
            <line
              className="stacks-boot-book-page-line"
              x1={topLeft[0] + 2}
              x2={topRight[0] - 1}
              y1={topLeft[1] + 2.4}
              y2={topRight[1] + 2.4}
            />
          </g>
        );
      })}
    </g>
  );
}

function ModelSilhouetteGlyph({
  id,
  width,
  height,
}: {
  id: keyof typeof ABOUT_BOOT_MODEL_SILHOUETTES;
  width: number;
  height: number;
}) {
  const silhouette = ABOUT_BOOT_MODEL_SILHOUETTES[id];
  const [, , sourceWidth, sourceHeight] = silhouette.viewBox;
  return (
    <path
      className="stacks-boot-model-silhouette"
      data-model-silhouette={id}
      d={silhouette.path}
      fillRule="evenodd"
      transform={`translate(${-width / 2} ${-height}) scale(${width / sourceWidth} ${height / sourceHeight})`}
    />
  );
}

function CollectiveMarkGlyph({ width }: { width: number }) {
  const baseHeight = 0.024 * SCENE_TO_BOOT_SVG;
  const gap = 0.004 * SCENE_TO_BOOT_SVG;
  const markHeight = 0.18 * SCENE_TO_BOOT_SVG;
  const markWidth = markHeight * (700 / 844.38);
  return (
    <>
      <rect
        className="stacks-boot-mark-base"
        x={-width / 2}
        y={-baseHeight}
        width={width}
        height={baseHeight}
        rx="1"
      />
      <g transform={`translate(0 ${-(baseHeight + gap)})`}>
        <ModelSilhouetteGlyph
          id="ai-collective"
          width={markWidth}
          height={markHeight}
        />
      </g>
    </>
  );
}

function TJMedallionGlyph({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const radius = width / 2;
  const centerY = -height + radius;
  return (
    <>
      <ModelSilhouetteGlyph id="tj-medallion" width={width} height={height} />
      <circle
        className="stacks-boot-tj-ring"
        cx="0"
        cy={centerY}
        r={radius * 0.94}
      />
      <circle
        className="stacks-boot-tj-face"
        cx="0"
        cy={centerY}
        r={radius * 0.7}
      />
      <circle
        className="stacks-boot-tj-detail"
        cx="0"
        cy={centerY + radius * 0.08}
        r={radius * 0.37}
      />
      <path
        className="stacks-boot-tj-detail"
        d={`M ${-radius * 0.46} ${centerY - radius * 0.34} L 0 ${centerY + radius * 0.52} L ${radius * 0.46} ${centerY - radius * 0.34} M ${-radius * 0.32} ${centerY - radius * 0.46} L ${radius * 0.38} ${centerY - radius * 0.32} L 0 ${centerY + radius * 0.52}`}
      />
    </>
  );
}

function appleGlyphPath(height: number, bottom: number): string {
  const point = (x: number, y: number) =>
    `${x * height} ${-(bottom + y * height)}`;
  return APPLE_OUTLINE.map(({ start, curves }) => {
    const segments = curves
      .map(
        ([x1, y1, x2, y2, x, y]) =>
          `C ${point(x1, y1)} ${point(x2, y2)} ${point(x, y)}`,
      )
      .join(" ");
    return `M ${point(start[0], start[1])} ${segments} Z`;
  }).join(" ");
}

function LandmarkGlyph({
  landmark,
  readingBooks,
  readingBookColors,
}: {
  landmark: AboutBootLandmark;
  readingBooks: BootReadingBook[];
  readingBookColors: Record<string, ReadingBookEdgeColor>;
}): ReactNode {
  const width = landmark.profile.width * SCENE_TO_BOOT_SVG;
  const height = landmark.profile.height * SCENE_TO_BOOT_SVG;
  const glyph: AboutLandmarkGlyph = landmark.glyph;
  switch (glyph) {
    case "portrait-frame":
    case "landscape-frame":
      return <FrameGlyph landmark={landmark} width={width} height={height} />;
    case "globe":
      return <ModelSilhouetteGlyph id="globe" width={width} height={height} />;
    case "succulent":
      return (
        <ModelSilhouetteGlyph id="succulent" width={width} height={height} />
      );
    case "plant":
      return (
        <ModelSilhouetteGlyph id="large-plant" width={width} height={height} />
      );
    case "cactus":
      return <ModelSilhouetteGlyph id="cactus" width={width} height={height} />;
    case "desk-lamp":
      return (
        <ModelSilhouetteGlyph id="desk-lamp" width={width} height={height} />
      );
    case "collective-mark": {
      return <CollectiveMarkGlyph width={width} />;
    }
    case "medallion": {
      return <TJMedallionGlyph width={width} height={height} />;
    }
    case "apple": {
      const baseHeight = 0.021 * SCENE_TO_BOOT_SVG;
      const markHeight = 0.15 * SCENE_TO_BOOT_SVG;
      const markBottom = 0.017 * SCENE_TO_BOOT_SVG;
      return (
        <>
          <rect
            className="stacks-boot-metal-fill"
            x={-width / 2}
            y={-baseHeight}
            width={width}
            height={baseHeight}
            rx="1"
          />
          <path
            className="stacks-boot-apple"
            data-boot-apple=""
            d={appleGlyphPath(markHeight, markBottom)}
          />
        </>
      );
    }
    case "reading-stack":
      return (
        <ReadingStackGlyph
          books={readingBooks}
          colors={readingBookColors}
          landmarkX={landmark.x}
        />
      );
    default:
      return assertNever(glyph);
  }
}

export default function BootScreen({
  readingBooks,
  readingBookColors,
}: BootScreenProps) {
  const streamedReadingBooks = useSyncExternalStore(
    subscribeBootReadingBooks,
    getBootReadingBooks,
    getServerBootReadingBooks,
  );
  const resolvedReadingBooks =
    readingBooks ?? streamedReadingBooks?.books ?? DEFAULT_BOOT_READING_BOOKS;
  const resolvedReadingBookColors =
    readingBookColors ?? streamedReadingBooks?.colors ?? {};
  const cadence = ABOUT_BOOT_CADENCE;
  const keyframes = bootCssKeyframes(ABOUT_BOOT_COMPOSITION.length, cadence);
  const sceneRef = useRef<SVGSVGElement>(null);
  useBootMotion(sceneRef, cadence);
  const support = SHELF_GEOMETRY.support;
  const groundY = projectSceneY(SHELF_GEOMETRY.groundY);
  const strapTopY = projectSceneY(
    SHELF_GEOMETRY.top.centerY - SHELF_GEOMETRY.top.thickness / 2,
  );
  const strapHeight = groundY - strapTopY;
  const supportX =
    (SHELF_GEOMETRY.width / 2 - SHELF_GEOMETRY.strapInsetX) * SCENE_TO_BOOT_SVG;
  return (
    <div className="stacks-boot" aria-hidden style={paletteVariables()}>
      <style>{keyframes}</style>
      <div className="stacks-boot-threshold">
        <div className="stacks-boot-entry">
          <p className="stacks-boot-wordmark">Chappy Asel</p>
          <svg
            ref={sceneRef}
            className="stacks-boot-scene"
            data-boot-item-count={ABOUT_BOOT_COMPOSITION.length}
            style={
              {
                "--stacks-boot-reveal-duration": `${cadence.revealDuration.toFixed(2)}s`,
                "--stacks-boot-wave-intro-duration": `${BOOT_WAVE_INTRO_SECONDS.toFixed(2)}s`,
                "--stacks-boot-wave-duration": `${cadence.waveDuration.toFixed(2)}s`,
              } as BootStyle
            }
            viewBox="-150 -108 300 230"
            role="presentation"
          >
            <g className="stacks-boot-supports">
              {[-1, 1].map((side) => (
                <g data-boot-support={side} key={side}>
                  <rect
                    x={
                      side * supportX - (support.width * SCENE_TO_BOOT_SVG) / 2
                    }
                    y={strapTopY}
                    width={support.width * SCENE_TO_BOOT_SVG}
                    height={strapHeight}
                    rx="2"
                  />
                  <rect
                    x={
                      side * supportX -
                      (support.footWidth * SCENE_TO_BOOT_SVG) / 2
                    }
                    y={groundY - support.footHeight * SCENE_TO_BOOT_SVG}
                    width={support.footWidth * SCENE_TO_BOOT_SVG}
                    height={support.footHeight * SCENE_TO_BOOT_SVG}
                    rx="1.5"
                  />
                  <rect
                    x={
                      side * supportX -
                      (support.cleatWidth * SCENE_TO_BOOT_SVG) / 2
                    }
                    y={projectSceneY(
                      SHELF_GEOMETRY.lower.centerY - support.cleatHeight / 2,
                    )}
                    width={support.cleatWidth * SCENE_TO_BOOT_SVG}
                    height={support.cleatHeight * SCENE_TO_BOOT_SVG}
                    rx="1.5"
                  />
                </g>
              ))}
            </g>
            <g className="stacks-boot-landmarks">
              {ABOUT_BOOT_COMPOSITION.map((landmark, index) => (
                <g
                  className="stacks-boot-item"
                  data-landmark-id={landmark.id}
                  data-shelf-id={landmark.shelf}
                  data-cadence-slot={index}
                  key={landmark.id}
                  style={
                    "colorProfile" in landmark
                      ? ({
                          "--stacks-boot-object-light":
                            landmark.colorProfile.light,
                          "--stacks-boot-object-dark":
                            landmark.colorProfile.dark,
                        } as BootStyle)
                      : undefined
                  }
                  transform={`translate(${landmark.x * SCENE_TO_BOOT_SVG} ${projectSceneY(SHELF_SURFACE[landmark.shelf])})`}
                >
                  <g
                    className="stacks-boot-item-motion"
                    style={{
                      animationName: `stacks-boot-reveal-${index}, stacks-boot-wave-intro-${index}, stacks-boot-wave-${index}`,
                    }}
                  >
                    <LandmarkGlyph
                      landmark={landmark}
                      readingBooks={resolvedReadingBooks}
                      readingBookColors={resolvedReadingBookColors}
                    />
                  </g>
                </g>
              ))}
            </g>
            <g className="stacks-boot-planks">
              {SHELF_PLANKS.map((plank) => (
                <rect
                  data-boot-plank=""
                  data-shelf-id={plank.id}
                  data-depth={plank.depth}
                  key={plank.id}
                  x={(-plank.width / 2) * SCENE_TO_BOOT_SVG}
                  y={projectSceneY(plank.centerY + plank.thickness / 2)}
                  width={plank.width * SCENE_TO_BOOT_SVG}
                  height={plank.thickness * SCENE_TO_BOOT_SVG}
                  rx="2"
                />
              ))}
            </g>
            <line
              className="stacks-boot-ground"
              x1={-SHELF_GEOMETRY.width * 55}
              x2={SHELF_GEOMETRY.width * 55}
              y1={groundY}
              y2={groundY}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

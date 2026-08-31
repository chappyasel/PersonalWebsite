"use client";

import {
  type ReadingBookEdgeColor,
  fallbackCoverEdgeColor,
  readingBookMaterialColors,
} from "../../../../lib/books/coverEdgeColor";
import {
  ABOUT_BOOT_STAGE_GLIDE,
  aboutBootStageScript,
  publishAboutBootStage,
  setAboutBootStagePhase,
} from "../boot/aboutBootStage";
import { isBootingPhase } from "../boot/worldBootMachine";
import {
  SERVER_WORLD_BOOT_VIEW,
  documentWorldPhase,
  worldBoot,
} from "../boot/worldBootSession";
import {
  ABOUT_AIC_BASE_DEPTH,
  ABOUT_AIC_BASE_WIDTH,
  ABOUT_AIC_MARK_DEPTH,
  ABOUT_AIC_MARK_HEIGHT,
  ABOUT_AIC_MARK_WIDTH,
  ABOUT_APPLE_BASE_DEPTH,
  ABOUT_APPLE_BASE_WIDTH,
  ABOUT_APPLE_MARK_DEPTH,
  ABOUT_APPLE_MARK_HEIGHT,
} from "../scene/aboutAwardGeometry";
import {
  ABOUT_BOOT_PAINT_COMPOSITION,
  ABOUT_BOOT_VISIBLE_COMPOSITION,
  type AboutBootLandmark,
  type AboutLandmarkGlyph,
} from "../scene/aboutBootComposition";
import {
  type AboutBootFrameId,
  type AboutBootQuad,
  aboutBootFrameProjection,
} from "../scene/aboutBootFrameProjection";
import { ABOUT_BOOT_MODEL_SILHOUETTES } from "../scene/aboutBootSilhouettes";
import { aboutBootShelfSupportProjection } from "../scene/aboutBootSupportProjection";
import {
  ABOUT_ROLES,
  ABOUT_ROLE_ICON_SIZE,
  aboutRoleIconOffset,
} from "../scene/aboutRoleIcons";
import {
  ABOUT_AIC_MARK_YAW,
  ABOUT_AIC_ROOT_YAW,
  ABOUT_APPLE_MARK_YAW,
  ABOUT_APPLE_ROOT_YAW,
  ABOUT_MODEL_POSES,
} from "../scene/aboutScenePose";
import { APPLE_OUTLINE } from "../scene/appleOutline";
import {
  COORDINATION_BASE_BOTTOM_RADIUS,
  COORDINATION_BASE_HEIGHT,
  COORDINATION_BASE_TOP_RADIUS,
  COORDINATION_CORE_CENTER_Y,
  COORDINATION_GLOBE_PROFILE_HEIGHT,
  COORDINATION_HORIZON_SCALE,
  COORDINATION_NECK_SCALE,
  COORDINATION_NETWORK_SCALE,
  COORDINATION_PLINTH_SCALE,
  COORDINATION_STEM_BOTTOM_RADIUS,
  COORDINATION_STEM_CENTER_Y,
  COORDINATION_STEM_HEIGHT,
  COORDINATION_STEM_TOP_RADIUS,
} from "../scene/coordinationGlobeGeometry";
import {
  COORDINATION_CORE_RADIUS,
  coordinationNodePosition,
  createCoordinationNetwork,
} from "../scene/coordinationNetwork";
import { projectIconBody } from "../scene/projectIconGeometry";
import {
  SHELF_GEOMETRY,
  SHELF_PLANKS,
  SHELF_SURFACE,
} from "../scene/shelfGeometry";
import {
  TJ_MEDALLION_FACES,
  TJ_MEDALLION_POSE,
} from "../scene/tjMedallionGeometry";
import {
  ABOUT_READING_BOOK,
  ABOUT_READING_COVER_IMAGE,
  readingBookCoverPerspectiveElevation,
  readingBookForeEdgePerspectiveElevation,
  readingBookImagePerspectiveElevation,
  readingBookPageCorePerspectiveElevation,
  readingStackPoses,
} from "../scene/units/aboutReadingStack";
import { CAMERA } from "../scene/worldLayout";
import { PALETTES } from "../theme";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  type BootReadingBook,
  getBootReadingBooks,
  getServerBootReadingBooks,
  preloadBootReadingBookCovers,
  publishBootReadingBooks,
  subscribeBootReadingBooks,
  waitForBootReadingBooks,
} from "./bootReadingBooks";
import {
  BOOT_DUST_COUNTS,
  BOOT_DUST_SPAWN_DELAY_MS,
  BOOT_DUST_SPAWN_WINDOW_MS,
  BOOT_FRAME_PHOTOS,
  BOOT_WAIT_NOTES,
  BOOT_WAIT_NOTE_INTERVAL_MS,
  BOOT_WAIT_NOTE_LINES,
  type BootFramePhoto,
  SCENE_TO_BOOT_SVG,
  bootCadence,
  bootCssKeyframes,
  bootRevealComplete,
  createBootDustDrift,
  projectSceneY,
} from "./bootVignette";

const BOOT_AIC_SEAT_PX = 0.8;
const BOOT_COORDINATION_NETWORK = createCoordinationNetwork();
const BOOT_COORDINATION_POINTS = BOOT_COORDINATION_NETWORK.nodes.map((node) =>
  coordinationNodePosition(node, 0, 0),
);
const BOOT_COORDINATION_DITHER_4X4 = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
] as const;

/** Transcendental math can differ in its last bits across JS engines. React
 * hydration needs the server and client SVG attribute strings to match. */
function bootSvgNumber(value: number): string {
  const rounded = value.toFixed(6);
  if (rounded === "-0.000000") return "0";
  return rounded.replace(/\.?0+$/, "");
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
  // React hoists preload links into the document head as soon as this streamed
  // subtree arrives. The request therefore starts before hydration publishes
  // the same URLs into the already-mounted boot SVG.
  return readingBooks.map((book) =>
    book.coverSrc ? (
      <link
        as="image"
        data-boot-reading-cover-preload={book.id}
        href={book.coverSrc}
        key={book.id}
        rel="preload"
      />
    ) : null,
  );
}

type BootStyle = CSSProperties & Record<`--stacks-boot-${string}`, string>;

const subscribeWorldBoot = (listener: () => void) =>
  worldBoot.subscribe(listener);
const getWaitStage = () => worldBoot.getView().waitStage;
const getServerWaitStage = () => SERVER_WORLD_BOOT_VIEW.waitStage;
const getBootRevealed = () => worldBoot.getView().revealed;
const getServerBootRevealed = () => SERVER_WORLD_BOOT_VIEW.revealed;

/** The wait strip's supporting line. Its own component so that a stage
 * change re-renders one span and not the whole vignette: the reveal animations
 * are adopted compositor timelines held by ref, and there is no reason to walk
 * two thousand nodes of SVG to swap five words.
 *
 * The supporting notes stay outside the live region. They rotate often enough
 * to reassure a sighted visitor, but announcing each turn would become noise. */
function BootWaitNotes() {
  const stage = useSyncExternalStore(
    subscribeWorldBoot,
    getWaitStage,
    getServerWaitStage,
  );
  const revealed = useSyncExternalStore(
    subscribeWorldBoot,
    getBootRevealed,
    getServerBootRevealed,
  );
  const [turn, setTurn] = useState(0);

  // The turn resets with the gate, so every stage opens on its first line
  // rather than wherever the previous stage's rotation happened to leave off.
  // A gate holding one line needs no timer at all, and neither does a boot
  // screen the world has already replaced: the strip is only hidden by CSS, so
  // without the reveal check this would re-render it every 2.4s for the life of
  // the page, behind a running 3D scene.
  useEffect(() => {
    setTurn(0);
    if (revealed || BOOT_WAIT_NOTES[stage].length < 2) return;
    const timer = window.setInterval(
      () => setTurn((previous) => previous + 1),
      BOOT_WAIT_NOTE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [revealed, stage]);

  const active = turn % BOOT_WAIT_NOTES[stage].length;
  return (
    <div className="stacks-boot-wait-notes">
      {BOOT_WAIT_NOTE_LINES.map((line) => (
        <span
          className="stacks-boot-wait-note"
          data-boot-note={
            line.stage === stage && line.index === active ? "active" : "waiting"
          }
          key={line.text}
        >
          {line.text}
        </span>
      ))}
    </div>
  );
}

function useBootMotion(
  sceneRef: RefObject<SVGSVGElement | null>,
  cadence: ReturnType<typeof bootCadence>,
  firstPaintBooks?: readonly BootReadingBook[],
) {
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    worldBoot.send({ type: "bootVignetteStarted" });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scene.dataset.bootMotion = "reduced";
      setAboutBootStagePhase("placed");
      worldBoot.send({ type: "bootVignetteCompleted" });
      return;
    }
    let animations: Animation[] = [];
    let readinessFrame = 0;
    let retireTimer = 0;
    let glideToken = 0;
    const readingAbort = new AbortController();
    const readingCoversReady = (
      firstPaintBooks
        ? preloadBootReadingBookCovers(firstPaintBooks)
        : waitForBootReadingBooks(readingAbort.signal).then(({ books }) =>
            preloadBootReadingBookCovers(books),
          )
    ).catch(() => undefined);
    const threshold = scene.closest<HTMLElement>(".stacks-boot-threshold");
    const gliders = threshold
      ? Array.from(
          threshold.querySelectorAll<HTMLElement>(
            ".stacks-boot-entry, .stacks-boot-wordmark",
          ),
        )
      : [];

    // The pass ends when the bookcase has settled on the live shelf, not when
    // the last landmark has appeared: the reveal gate must never hand off to
    // the world with the stage still in flight. The glide is a CSS transition,
    // so its own timeline is awaited; when nothing moves (no transition ran,
    // or the start and placed boxes coincide) the pass completes at once.
    const glide = () => {
      const token = ++glideToken;
      const complete = () => {
        void readingCoversReady.then(() => {
          if (token !== glideToken) return;
          worldBoot.send({ type: "bootVignetteCompleted" });
        });
      };
      if (!setAboutBootStagePhase("placed")) {
        complete();
        return;
      }
      const transitions = gliders.flatMap((glider) => {
        // Reading a computed style flushes the attribute change into real
        // transitions before they are listed.
        void getComputedStyle(glider).transform;
        return glider
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition);
      });
      if (transitions.length === 0) {
        complete();
        return;
      }
      void Promise.allSettled(
        transitions.map((transition) => transition.finished),
      ).then(complete);
    };

    const start = () => {
      if (animations.length) return;
      if (!isBootingPhase(documentWorldPhase())) return;

      // Every pass opens on the centred bookcase. Re-entry reuses the
      // document element, and the last pass left it placed.
      setAboutBootStagePhase("start");
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

      // The glide begins at whichever comes first: the last landmark settling,
      // or the room reporting that the vignette is the only thing it is still
      // waiting on. On a fast boot, then, a few landmarks are still fading in
      // while the bookcase travels — by the owner's call, the room as soon as
      // it is ready beats one complete read of the shelf.
      const observeFirstPass = () => {
        const animationTime = Number(animations[0]?.currentTime ?? 0);
        if (
          worldBoot.getView().awaitingVignette ||
          bootRevealComplete(
            timelineTime,
            animationTime,
            cadence.revealDuration,
          )
        ) {
          glide();
          return;
        }
        readinessFrame = requestAnimationFrame(observeFirstPass);
      };
      observeFirstPass();
    };

    start();
    const observer = new MutationObserver(() => {
      if (isBootingPhase(documentWorldPhase())) {
        start();
        return;
      }
      cancelAnimationFrame(readinessFrame);
      glideToken += 1;
      // Let the boot wrapper finish its 360ms opacity transition before
      // retiring the compositor timelines. Cancelling immediately snaps every
      // landmark back to its hidden base style during the handoff. The stage
      // returns to its opening box here too, while nothing can see it, so the
      // next pass never flashes a placed bookcase before its reveal.
      retireTimer = window.setTimeout(() => {
        for (const animation of animations) animation.cancel();
        animations = [];
        setAboutBootStagePhase("start");
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
      glideToken += 1;
      readingAbort.abort();
      window.clearTimeout(retireTimer);
      for (const animation of animations) animation.cancel();
    };
  }, [cadence, firstPaintBooks, sceneRef]);
}

function useBootMotes(motesRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const motes = motesRef.current;
    if (
      !motes ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let stopped = false;
    const animations = new Set<Animation>();
    const timers = new Set<number>();
    const moteSlots = Array.from(
      motes.querySelectorAll<HTMLSpanElement>("[data-boot-mote]"),
    );
    const stage = motes.parentElement?.getBoundingClientRect();
    const stageWidth = stage?.width ?? 560;
    const stageHeight = stage?.height ?? 430;
    const origins = [
      [-0.36, -0.14],
      [0.03, 0.18],
      [0.34, -0.04],
      [-0.2, 0.08],
      [0.4, 0.16],
      [-0.08, -0.23],
      [0.19, -0.19],
      [-0.32, 0.22],
      [0.27, 0.25],
      [-0.43, -0.02],
      [0.11, -0.04],
      [-0.16, 0.27],
    ] as const;
    const theme = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    const counts = BOOT_DUST_COUNTS[theme];
    const spawnDeadline = performance.now() + BOOT_DUST_SPAWN_WINDOW_MS;
    let visibleCount = counts.initial;
    let replacementIndex = 0;

    const stop = () => {
      stopped = true;
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      for (const animation of animations) animation.cancel();
      animations.clear();
    };

    moteSlots.forEach((slot, index) => {
      const mote = slot.querySelector<HTMLSpanElement>(".stacks-boot-mote");
      if (!mote) return;
      const seed = origins[index % origins.length]!;
      const drift = createBootDustDrift(
        { x: seed[0] * stageWidth, y: seed[1] * stageHeight },
        0.73 + index * 1.91,
        0.78 + (index % 4) * 0.11,
        index === 2 || index === 6,
      );
      const animation = mote.animate(drift.keyframes, {
        duration: drift.durationMs,
        iterations: Number.POSITIVE_INFINITY,
        easing: "linear",
      });
      animation.currentTime = (index * 2_713) % drift.durationMs;
      animations.add(animation);
    });

    const activate = (index: number) => {
      moteSlots[index]?.setAttribute("data-boot-active", "");
    };
    for (let index = 0; index < visibleCount; index += 1) activate(index);

    const replace = (index: number) => {
      const slot = moteSlots[index];
      const drift = slot?.querySelector<HTMLSpanElement>(".stacks-boot-mote");
      if (!slot || !drift) return;
      const fade = slot.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 900,
        easing: "ease-in",
        fill: "forwards",
      });
      animations.add(fade);
      fade.onfinish = () => {
        animations.delete(fade);
        fade.cancel();
        if (stopped) return;
        slot.removeAttribute("data-boot-active");
        drift.getAnimations().forEach((animation) => {
          const duration = Number(animation.effect?.getTiming().duration ?? 0);
          if (duration > 0) animation.currentTime = Math.random() * duration;
        });
        requestAnimationFrame(() => {
          if (!stopped) activate(index);
        });
      };
    };

    const scheduleArrival = () => {
      const delay =
        BOOT_DUST_SPAWN_DELAY_MS.minimum +
        Math.random() *
          (BOOT_DUST_SPAWN_DELAY_MS.maximum - BOOT_DUST_SPAWN_DELAY_MS.minimum);
      if (performance.now() + delay > spawnDeadline) return;
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (stopped) return;
        if (visibleCount < counts.maximum) {
          activate(visibleCount);
          visibleCount += 1;
        } else {
          replace(replacementIndex);
          replacementIndex = (replacementIndex + 1) % counts.maximum;
        }
        scheduleArrival();
      }, delay);
      timers.add(timer);
    };
    scheduleArrival();

    const observer = new MutationObserver(() => {
      const phase = documentWorldPhase();
      if (phase === "ready" || phase === null) stop();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-world"],
    });

    return () => {
      observer.disconnect();
      stop();
    };
  }, [motesRef]);
}

/** When the document opens on About, keep the boot stage under the live shelf
 * through viewport and history changes. Other destinations clear the stage. */
function useBootStage() {
  useEffect(() => {
    const republish = () => publishAboutBootStage();
    republish();
    window.addEventListener("resize", republish);
    window.addEventListener("orientationchange", republish);
    window.addEventListener("hashchange", republish);
    window.addEventListener("popstate", republish);
    return () => {
      window.removeEventListener("resize", republish);
      window.removeEventListener("orientationchange", republish);
      window.removeEventListener("hashchange", republish);
      window.removeEventListener("popstate", republish);
    };
  }, []);
}

const ABOUT_BOOT_CADENCE = bootCadence(ABOUT_BOOT_VISIBLE_COMPOSITION.length);
const ABOUT_BOOT_STAGE_SCRIPT = aboutBootStageScript();

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
    variables[`--stacks-boot-dust${suffix}`] = palette.dust;
    variables[`--stacks-boot-dust-halo${suffix}`] =
      theme === "light" ? "#f2b63f" : "#ffe2bd";
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

function FrameGlyph({ landmark }: { landmark: AboutBootLandmark }) {
  const landmarkId = landmark.id;
  const imageProfile = landmark.imageProfile;
  if (!imageProfile) {
    throw new Error(`Boot frame ${landmarkId} has no image profile`);
  }
  const projection = aboutBootFrameProjection(landmarkId as AboutBootFrameId);
  const photo = (BOOT_FRAME_PHOTOS as Partial<Record<string, BootFramePhoto>>)[
    landmarkId
  ];
  const points = (quad: typeof projection.outer) =>
    quad
      .map(([x, y]) => `${x * SCENE_TO_BOOT_SVG},${y * SCENE_TO_BOOT_SVG}`)
      .join(" ");
  const imagePoints = projection.image.map(
    ([x, y]) => [x * SCENE_TO_BOOT_SVG, y * SCENE_TO_BOOT_SVG] as const,
  ) as unknown as AboutBootQuad;
  const [bottomLeft, , topRight, topLeft] = imagePoints;
  const imageTransform = [
    (topRight[0] - topLeft[0]) / imageProfile.width,
    (topRight[1] - topLeft[1]) / imageProfile.width,
    (bottomLeft[0] - topLeft[0]) / imageProfile.height,
    (bottomLeft[1] - topLeft[1]) / imageProfile.height,
    topLeft[0],
    topLeft[1],
  ].join(" ");
  return (
    <>
      <polygon
        className="stacks-boot-frame"
        data-boot-frame-outline={landmarkId}
        points={points(projection.outer)}
      />
      <polygon
        className="stacks-boot-frame-inner"
        data-boot-frame-inner={landmarkId}
        points={points(projection.mat)}
      />
      <polygon
        className="stacks-boot-frame-empty"
        data-boot-frame-image={landmarkId}
        points={points(projection.image)}
      />
      {photo && (
        <image
          className="stacks-boot-frame-photo"
          data-boot-photo={landmarkId}
          href={photo.src}
          x="0"
          y="0"
          width={imageProfile.width}
          height={imageProfile.height}
          transform={`matrix(${imageTransform})`}
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
  const thicknesses = visible.map(
    (book) => book.thickness ?? ABOUT_READING_BOOK.thickness,
  );
  const poses = readingStackPoses(thicknesses);
  return (
    <g>
      {visible
        .map((book, index) => ({ book, index }))
        .reverse()
        .map(({ book, index }) => {
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
          const thickness = book.thickness ?? ABOUT_READING_BOOK.thickness;
          const toBootPoints = (
            points: ReturnType<typeof readingBookCoverPerspectiveElevation>,
          ) =>
            points.map(([x, y]): [number, number] => [
              (x - landmarkX) * SCENE_TO_BOOT_SVG,
              -y * SCENE_TO_BOOT_SVG,
            ]) as [
              [number, number],
              [number, number],
              [number, number],
              [number, number],
            ];
          const coverPoints = toBootPoints(
            readingBookCoverPerspectiveElevation(
              poses[index]!,
              CAMERA.z,
              thickness,
            ),
          );
          const edgePoints = toBootPoints(
            readingBookForeEdgePerspectiveElevation(
              poses[index]!,
              CAMERA.z,
              thickness,
            ),
          );
          const pageCorePoints = toBootPoints(
            readingBookPageCorePerspectiveElevation(
              poses[index]!,
              CAMERA.z,
              thickness,
            ),
          );
          const imagePoints = toBootPoints(
            readingBookImagePerspectiveElevation(
              poses[index]!,
              CAMERA.z,
              thickness,
            ),
          );
          const cover = coverPoints.map((point) => point.join(",")).join(" ");
          const edge = edgePoints.map((point) => point.join(",")).join(" ");
          const pageCore = pageCorePoints
            .map((point) => point.join(","))
            .join(" ");
          const imagePolygon = imagePoints
            .map((point) => point.join(","))
            .join(" ");
          const [imageBottomLeft, , imageTopRight, imageTopLeft] = imagePoints;
          const coverImageTransform = [
            (imageTopRight[0] - imageTopLeft[0]) /
              ABOUT_READING_COVER_IMAGE.width,
            (imageTopRight[1] - imageTopLeft[1]) /
              ABOUT_READING_COVER_IMAGE.width,
            (imageBottomLeft[0] - imageTopLeft[0]) /
              ABOUT_READING_COVER_IMAGE.height,
            (imageBottomLeft[1] - imageTopLeft[1]) /
              ABOUT_READING_COVER_IMAGE.height,
            imageTopLeft[0],
            imageTopLeft[1],
          ].join(" ");
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
              <polygon
                data-boot-reading-image={index}
                fill="none"
                points={imagePolygon}
                stroke="none"
              />
              <polygon
                className="stacks-boot-book-cover"
                data-boot-reading-cover={index}
                points={cover}
              />
              {book.coverSrc && (
                <image
                  className="stacks-boot-book-cover-photo"
                  data-boot-book-face={book.id}
                  href={book.coverSrc}
                  height={ABOUT_READING_COVER_IMAGE.height}
                  preserveAspectRatio="xMidYMid slice"
                  transform={`matrix(${coverImageTransform})`}
                  width={ABOUT_READING_COVER_IMAGE.width}
                  x="0"
                  y="0"
                />
              )}
              <polygon className="stacks-boot-book-edge" points={edge} />
              <polygon
                className="stacks-boot-book-page-core"
                data-boot-reading-page-core={index}
                points={pageCore}
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
  const transform =
    "projection" in silhouette
      ? `matrix(${silhouette.projection.map((value) => value * SCENE_TO_BOOT_SVG).join(" ")})`
      : `translate(${-width / 2} ${-height}) scale(${width / sourceWidth} ${height / sourceHeight})`;
  return (
    <path
      className="stacks-boot-model-silhouette"
      data-model-silhouette={id}
      d={silhouette.path}
      fillRule="evenodd"
      transform={transform}
    />
  );
}

function DirectionalShineGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
      <stop className="stacks-boot-shine-shadow" offset="0" />
      <stop className="stacks-boot-shine-base" offset="0.34" />
      <stop className="stacks-boot-shine-highlight" offset="0.5" />
      <stop className="stacks-boot-shine-base" offset="0.64" />
      <stop className="stacks-boot-shine-shadow" offset="1" />
    </linearGradient>
  );
}

function CollectiveMarkGlyph({ scale }: { scale: number }) {
  const baseWidth =
    (Math.abs(Math.cos(ABOUT_AIC_ROOT_YAW)) * ABOUT_AIC_BASE_WIDTH +
      Math.abs(Math.sin(ABOUT_AIC_ROOT_YAW)) * ABOUT_AIC_BASE_DEPTH) *
    SCENE_TO_BOOT_SVG;
  const baseHeight = 0.024 * SCENE_TO_BOOT_SVG;
  const gap = 0.004 * SCENE_TO_BOOT_SVG;
  const markHeight = ABOUT_AIC_MARK_HEIGHT * SCENE_TO_BOOT_SVG;
  const markYaw = ABOUT_AIC_ROOT_YAW + ABOUT_AIC_MARK_YAW;
  const markWidth =
    (Math.abs(Math.cos(markYaw)) * ABOUT_AIC_MARK_WIDTH +
      Math.abs(Math.sin(markYaw)) * ABOUT_AIC_MARK_DEPTH) *
    SCENE_TO_BOOT_SVG;
  const markShiftX = Math.sin(ABOUT_AIC_ROOT_YAW) * 0.004 * SCENE_TO_BOOT_SVG;
  return (
    <g
      data-boot-aic-seat={BOOT_AIC_SEAT_PX}
      transform={`translate(0 ${BOOT_AIC_SEAT_PX})`}
    >
      <g
        data-boot-aic-root-yaw={ABOUT_AIC_ROOT_YAW}
        data-boot-aic-mark-yaw={ABOUT_AIC_MARK_YAW}
        data-boot-aic-scale={scale}
        transform={`scale(${scale})`}
      >
        <defs>
          <DirectionalShineGradient id="stacks-boot-aic-shine" />
        </defs>
        <rect
          className="stacks-boot-mark-base"
          x={-baseWidth / 2}
          y={-baseHeight}
          width={baseWidth}
          height={baseHeight}
          rx="1"
        />
        <g transform={`translate(${markShiftX} ${-(baseHeight + gap)})`}>
          <ModelSilhouetteGlyph
            id="ai-collective"
            width={markWidth}
            height={markHeight}
          />
        </g>
      </g>
    </g>
  );
}

function TJMedallionGlyph({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const artwork = TJ_MEDALLION_FACES.find(
    (face) => face.id === "artwork-face",
  )!;
  const yaw = TJ_MEDALLION_POSE.yaw;
  const scale = TJ_MEDALLION_POSE.scale * SCENE_TO_BOOT_SVG;
  const centerY = -artwork.position[1] * scale;
  const faceRadius = artwork.radius * scale;
  const faceCenterX = Math.sin(yaw) * artwork.position[2] * scale;
  const xScale = Math.abs(Math.cos(yaw));
  const artworkX = faceCenterX - faceRadius * xScale;
  const artworkY = centerY - faceRadius;
  const artworkWidth = faceRadius * xScale * 2;
  const artworkHeight = faceRadius * 2;
  return (
    <>
      <ModelSilhouetteGlyph id="tj-medallion" width={width} height={height} />
      <image
        data-boot-tj-artwork=""
        href="/images/stacks/tj-medallion.jpg"
        x={artworkX}
        y={artworkY}
        width={artworkWidth}
        height={artworkHeight}
        preserveAspectRatio="none"
        style={{ clipPath: "ellipse(50% 50% at center) fill-box" }}
      />
    </>
  );
}

function CoordinationGlobeGlyph({ height }: { height: number }) {
  const sceneScale =
    height / (COORDINATION_GLOBE_PROFILE_HEIGHT * SCENE_TO_BOOT_SVG);
  const pixels = SCENE_TO_BOOT_SVG * sceneScale;
  const plinthPixels = pixels * COORDINATION_PLINTH_SCALE;
  const neckPixels = pixels * COORDINATION_NECK_SCALE;
  const baseBottomRadius = COORDINATION_BASE_BOTTOM_RADIUS * plinthPixels;
  const baseTopRadius = COORDINATION_BASE_TOP_RADIUS * plinthPixels;
  const baseHeight = COORDINATION_BASE_HEIGHT * plinthPixels;
  const stemBottomRadius = COORDINATION_STEM_BOTTOM_RADIUS * neckPixels;
  const stemTopRadius = COORDINATION_STEM_TOP_RADIUS * neckPixels;
  const stemBottom =
    -(COORDINATION_STEM_CENTER_Y - COORDINATION_STEM_HEIGHT / 2) * neckPixels;
  const stemTop =
    -(COORDINATION_STEM_CENTER_Y + COORDINATION_STEM_HEIGHT / 2) * neckPixels;
  const globeRadius =
    COORDINATION_CORE_RADIUS * COORDINATION_HORIZON_SCALE * pixels;
  const centerY = -COORDINATION_CORE_CENTER_Y * pixels;
  const point = ([x, y]: readonly [number, number, number]) =>
    [
      x * pixels * COORDINATION_NETWORK_SCALE,
      centerY - y * pixels * COORDINATION_NETWORK_SCALE,
    ] as const;
  const edgePath = BOOT_COORDINATION_NETWORK.edges
    .map(([from, to]) => {
      const start = point(BOOT_COORDINATION_POINTS[from]!);
      const end = point(BOOT_COORDINATION_POINTS[to]!);
      return `M ${bootSvgNumber(start[0])} ${bootSvgNumber(start[1])} L ${bootSvgNumber(end[0])} ${bootSvgNumber(end[1])}`;
    })
    .join(" ");
  const ditherCell = pixels * 0.0064;
  const ditherExtent = Math.ceil((globeRadius * 1.06) / ditherCell);
  const ditherPixels: Array<{ x: number; y: number }> = [];
  for (let gridY = -ditherExtent; gridY <= ditherExtent; gridY += 1) {
    for (let gridX = -ditherExtent; gridX <= ditherExtent; gridX += 1) {
      const x = gridX * ditherCell;
      const y = gridY * ditherCell;
      const radius = Math.hypot(x, y) / globeRadius;
      if (radius < 0.82 || radius > 1.06) continue;
      const coverage = (1.06 - radius) / 0.24;
      const bayerX = ((gridX % 4) + 4) % 4;
      const bayerY = ((gridY % 4) + 4) % 4;
      const threshold =
        (BOOT_COORDINATION_DITHER_4X4[bayerY * 4 + bayerX]! + 0.5) / 16;
      if (coverage < threshold) continue;
      ditherPixels.push({
        x: x - ditherCell / 2,
        y: centerY + y - ditherCell / 2,
      });
    }
  }
  return (
    <>
      <polygon
        className="stacks-boot-coordination-base"
        points={`${-baseBottomRadius},0 ${baseBottomRadius},0 ${baseTopRadius},${-baseHeight} ${-baseTopRadius},${-baseHeight}`}
      />
      <polygon
        className="stacks-boot-coordination-stem"
        points={`${-stemBottomRadius},${stemBottom} ${stemBottomRadius},${stemBottom} ${stemTopRadius},${stemTop} ${-stemTopRadius},${stemTop}`}
      />
      <circle
        className="stacks-boot-coordination-core"
        cx="0"
        cy={centerY}
        r={globeRadius * 0.82}
      />
      <g data-dither-grid="ordered-4x4">
        {ditherPixels.map((pixel, index) => (
          <rect
            className="stacks-boot-coordination-dither"
            key={index}
            x={pixel.x}
            y={pixel.y}
            width={ditherCell}
            height={ditherCell}
          />
        ))}
      </g>
      <g className="stacks-boot-coordination-network">
        <path
          className="stacks-boot-coordination-link"
          data-boot-coordination-edges={BOOT_COORDINATION_NETWORK.edges.length}
          d={edgePath}
        />
        <g
          data-boot-coordination-reveals={
            BOOT_COORDINATION_NETWORK.longConnections.length
          }
        >
          {BOOT_COORDINATION_NETWORK.longConnections.map(
            ([from, to], index) => {
              const start = point(BOOT_COORDINATION_POINTS[from]!);
              const end = point(BOOT_COORDINATION_POINTS[to]!);
              return (
                <line
                  className="stacks-boot-coordination-reveal"
                  data-theme={BOOT_COORDINATION_NETWORK.nodes[from]!.theme}
                  key={`${from}-${to}`}
                  pathLength="1"
                  style={
                    {
                      "--stacks-boot-coordination-reveal-delay": `${index * -0.6}s`,
                    } as BootStyle
                  }
                  x1={bootSvgNumber(start[0])}
                  y1={bootSvgNumber(start[1])}
                  x2={bootSvgNumber(end[0])}
                  y2={bootSvgNumber(end[1])}
                />
              );
            },
          )}
        </g>
        {BOOT_COORDINATION_NETWORK.nodes.map((node, index) => {
          const position = BOOT_COORDINATION_POINTS[index]!;
          const [cx, cy] = point(position);
          const depth = Math.max(
            0,
            Math.min(1, 0.5 + position[2] / (COORDINATION_CORE_RADIUS * 2)),
          );
          const radius =
            (0.00235 + (index % 4) * 0.00016) *
            (0.84 + depth * 0.28) *
            pixels *
            COORDINATION_NETWORK_SCALE;
          return (
            <circle
              className="stacks-boot-coordination-node"
              data-theme={node.theme}
              key={index}
              cx={bootSvgNumber(cx)}
              cy={bootSvgNumber(cy)}
              r={bootSvgNumber(radius)}
            />
          );
        })}
      </g>
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

/** Four flat tiles in their own brand colors, at the exact offsets the live
 * Role Icons stand at, so the silhouette hands off to the billets in place.
 * Each rect carries its own light/dark pair: the item-level object color
 * cannot express four different tiles. */
function RoleIconStackGlyph() {
  const size = ABOUT_ROLE_ICON_SIZE * SCENE_TO_BOOT_SVG;
  const body = projectIconBody(ABOUT_ROLE_ICON_SIZE);
  return ABOUT_ROLES.map((role) => {
    const [dx, dy] = aboutRoleIconOffset(role);
    const projectedBodyWidth =
      (Math.abs(Math.cos(role.yaw)) * body.size +
        Math.abs(Math.sin(role.yaw)) * body.depth) *
      SCENE_TO_BOOT_SVG;
    const faceSize = body.size - body.faceInset * 2;
    const projectedFaceWidth =
      Math.abs(Math.cos(role.yaw)) * faceSize * SCENE_TO_BOOT_SVG;
    const faceShiftX =
      Math.sin(role.yaw) * (body.depth / 2) * SCENE_TO_BOOT_SVG;
    const centerX = dx * SCENE_TO_BOOT_SVG;
    const topY = -(dy * SCENE_TO_BOOT_SVG + size);
    const faceTop = topY + body.faceInset * SCENE_TO_BOOT_SVG;
    const faceHeight = faceSize * SCENE_TO_BOOT_SVG;
    return (
      <g key={role.id} data-boot-role={role.id} data-boot-role-yaw={role.yaw}>
        <rect
          className="stacks-boot-role-icon-body"
          x={centerX - projectedBodyWidth / 2}
          y={topY}
          width={projectedBodyWidth}
          height={size}
          rx={size * 0.16}
        />
        <rect
          className="stacks-boot-role-icon"
          x={centerX + faceShiftX - projectedFaceWidth / 2}
          y={faceTop}
          width={projectedFaceWidth}
          height={faceHeight}
          rx={body.fallbackFaceRadius * SCENE_TO_BOOT_SVG}
          style={
            {
              "--stacks-boot-role-light": role.bootColor.light,
              "--stacks-boot-role-dark": role.bootColor.dark,
            } as BootStyle
          }
        />
        <image
          className="stacks-boot-role-artwork"
          data-boot-role-artwork={role.id}
          href={role.artwork}
          x={centerX + faceShiftX - projectedFaceWidth / 2}
          y={faceTop}
          width={projectedFaceWidth}
          height={faceHeight}
          preserveAspectRatio="xMidYMid slice"
        />
      </g>
    );
  });
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
      return <FrameGlyph landmark={landmark} />;
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
      return <CollectiveMarkGlyph scale={landmark.profile.height / 0.208} />;
    }
    case "coordination-globe": {
      return <CoordinationGlobeGlyph height={height} />;
    }
    case "medallion": {
      return <TJMedallionGlyph width={width} height={height} />;
    }
    case "apple": {
      const scale = landmark.profile.height / 0.176;
      const baseHeight = 0.021 * SCENE_TO_BOOT_SVG;
      const appleYaw = ABOUT_APPLE_ROOT_YAW + ABOUT_APPLE_MARK_YAW;
      const baseWidth =
        (Math.abs(Math.cos(appleYaw)) * ABOUT_APPLE_BASE_WIDTH +
          Math.abs(Math.sin(appleYaw)) * ABOUT_APPLE_BASE_DEPTH) *
        SCENE_TO_BOOT_SVG;
      const markHeight = ABOUT_APPLE_MARK_HEIGHT * SCENE_TO_BOOT_SVG;
      const markBottom = 0.017 * SCENE_TO_BOOT_SVG;
      const markShiftX =
        Math.sin(appleYaw) * (ABOUT_APPLE_MARK_DEPTH / 2) * SCENE_TO_BOOT_SVG;
      return (
        <g
          data-boot-apple-root-yaw={ABOUT_APPLE_ROOT_YAW}
          data-boot-apple-mark-yaw={ABOUT_APPLE_MARK_YAW}
          data-boot-apple-scale={scale}
          transform={`scale(${scale})`}
        >
          <defs>
            <DirectionalShineGradient id="stacks-boot-apple-shine" />
          </defs>
          <path
            className="stacks-boot-apple"
            data-boot-apple=""
            d={appleGlyphPath(markHeight, markBottom)}
            transform={`matrix(${Math.cos(appleYaw)} 0 0 1 ${markShiftX} 0)`}
          />
          <rect
            className="stacks-boot-metal-fill"
            data-boot-apple-base=""
            x={-baseWidth / 2}
            y={-baseHeight}
            width={baseWidth}
            height={baseHeight}
            rx="1"
          />
        </g>
      );
    }
    case "role-icons":
      return <RoleIconStackGlyph />;
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
  const keyframes = bootCssKeyframes(
    ABOUT_BOOT_VISIBLE_COMPOSITION.length,
    cadence,
  );
  const sceneRef = useRef<SVGSVGElement>(null);
  const motesRef = useRef<HTMLDivElement>(null);
  useBootMotion(sceneRef, cadence, readingBooks);
  useBootMotes(motesRef);
  useBootStage();
  const support = SHELF_GEOMETRY.support;
  const groundY = projectSceneY(SHELF_GEOMETRY.groundY);
  const strapTopY = projectSceneY(
    SHELF_GEOMETRY.top.centerY - SHELF_GEOMETRY.top.thickness / 2,
  );
  const strapHeight = groundY - strapTopY;
  return (
    <>
      {/* Lays the bookcase over the spot the camera will put the real shelf,
          from the same rest-pose math, before this markup's first paint. It
          has to be rendered from here: the layout math reaches the unit
          registry, which the server page cannot import. */}
      <script dangerouslySetInnerHTML={{ __html: ABOUT_BOOT_STAGE_SCRIPT }} />
      <div
        className="stacks-boot"
        style={
          {
            ...paletteVariables(),
            "--stacks-boot-glide-duration": `${ABOUT_BOOT_STAGE_GLIDE.durationSeconds.toFixed(2)}s`,
            "--stacks-boot-glide-ease": ABOUT_BOOT_STAGE_GLIDE.easing,
          } as BootStyle
        }
      >
        <style>{keyframes}</style>
        <div className="stacks-boot-threshold">
          <div className="stacks-boot-entry">
            <div className="stacks-boot-scene-stage">
              <svg
                ref={sceneRef}
                className="stacks-boot-scene"
                data-boot-item-count={ABOUT_BOOT_VISIBLE_COMPOSITION.length}
                style={
                  {
                    "--stacks-boot-reveal-duration": `${cadence.revealDuration.toFixed(2)}s`,
                  } as BootStyle
                }
                viewBox="-150 -108 300 230"
                aria-hidden
                role="presentation"
              >
                <g className="stacks-boot-supports">
                  {([-1, 1] as const).map((side) => {
                    const projection = aboutBootShelfSupportProjection(side);
                    return (
                      <g data-boot-support={side} key={side}>
                        <rect
                          data-boot-support-upright={side}
                          x={projection.upright.x * SCENE_TO_BOOT_SVG}
                          y={strapTopY}
                          width={projection.upright.width * SCENE_TO_BOOT_SVG}
                          height={strapHeight}
                          rx="2"
                        />
                        <rect
                          data-boot-support-foot={side}
                          x={projection.foot.x * SCENE_TO_BOOT_SVG}
                          y={groundY - support.footHeight * SCENE_TO_BOOT_SVG}
                          width={projection.foot.width * SCENE_TO_BOOT_SVG}
                          height={support.footHeight * SCENE_TO_BOOT_SVG}
                          rx="1.5"
                        />
                      </g>
                    );
                  })}
                </g>
                <g className="stacks-boot-landmarks">
                  {ABOUT_BOOT_PAINT_COMPOSITION.map(
                    ({ landmark, cadenceSlot }) => (
                      <g
                        className="stacks-boot-item"
                        data-landmark-id={landmark.id}
                        data-shelf-id={landmark.shelf}
                        data-cadence-slot={cadenceSlot}
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
                            animationName: `stacks-boot-reveal-${cadenceSlot}`,
                          }}
                        >
                          <LandmarkGlyph
                            landmark={landmark}
                            readingBooks={resolvedReadingBooks}
                            readingBookColors={resolvedReadingBookColors}
                          />
                        </g>
                      </g>
                    ),
                  )}
                </g>
                <g
                  className="stacks-boot-item stacks-boot-floor-prop"
                  data-boot-ground-prop="dumbbell"
                  style={
                    {
                      "--stacks-boot-object-light": "#76716d",
                      "--stacks-boot-object-dark": "#595653",
                    } as BootStyle
                  }
                  transform={`translate(${ABOUT_MODEL_POSES.dumbbell.base[0] * SCENE_TO_BOOT_SVG} ${projectSceneY(ABOUT_MODEL_POSES.dumbbell.base[1])})`}
                >
                  <ModelSilhouetteGlyph
                    id="dumbbell"
                    width={
                      ABOUT_BOOT_MODEL_SILHOUETTES.dumbbell.profile[0] *
                      SCENE_TO_BOOT_SVG
                    }
                    height={
                      ABOUT_BOOT_MODEL_SILHOUETTES.dumbbell.profile[1] *
                      SCENE_TO_BOOT_SVG
                    }
                  />
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
              </svg>
              <div ref={motesRef} className="stacks-boot-motes" aria-hidden>
                {Array.from(
                  { length: BOOT_DUST_COUNTS.light.maximum },
                  (_, mote) => (
                    <span
                      className="stacks-boot-mote-slot"
                      data-boot-mote="dust"
                      key={`dust-${mote}`}
                    >
                      <span className="stacks-boot-mote" />
                    </span>
                  ),
                )}
              </div>
            </div>
          </div>
          {/* A sibling of the entry, not a child: the entry carries the glide's
              scale and the name must not grow with the bookcase. */}
          <p aria-hidden className="stacks-boot-wordmark">
            Chappy Asel
          </p>
        </div>
        <div className="stacks-boot-wait" data-boot-wait="">
          <p
            className="stacks-boot-wait-label"
            role="status"
            aria-live="polite"
          >
            Loading the 3D room
            <span className="stacks-boot-wait-dots" aria-hidden>
              {[0, 1, 2].map((dot) => (
                <span
                  className="stacks-boot-wait-dot"
                  key={dot}
                  style={
                    {
                      "--stacks-boot-dot-delay": `${dot * 0.18}s`,
                    } as BootStyle
                  }
                >
                  .
                </span>
              ))}
            </span>
          </p>
          <div aria-hidden>
            <BootWaitNotes />
          </div>
        </div>
      </div>
    </>
  );
}

import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { TRAINING_FIGURE_CARD_LAYOUT } from "./scene/units/trainingBoardLayout";
import {
  ANALYZE_DATA_REPOSITORY,
  MODEL_ARTIFACT_PREVIEWS_ENABLED,
  SCENE_ARTIFACTS,
  SCENE_PHOTOS,
  TRAINING_BOARD_PHOTOS,
  TRAINING_FIGURES,
  adjacentSceneArtifact,
  sceneArtifactById,
  sceneArtifactCollection,
  sceneArtifactPreviewEnabled,
} from "./sceneArtifacts";

const inspector = fs.readFileSync(
  new URL("./modal/SceneArtifactInspector.tsx", import.meta.url),
  "utf8",
);
const cards = fs.readFileSync(
  new URL("./scene/units/TrainingFigureCards.tsx", import.meta.url),
  "utf8",
);
const modelStage = fs.readFileSync(
  new URL("./modal/ModelArtifactStage.tsx", import.meta.url),
  "utf8",
);
const stacksCanvas = fs.readFileSync(
  new URL("./StacksCanvas.tsx", import.meta.url),
  "utf8",
);
const photoCarrierSources = [
  "UnitAbout.tsx",
  "UnitProjects.tsx",
  "UnitSystems.tsx",
  "UnitTalks.tsx",
  "UnitTraining.tsx",
].map((name) =>
  fs.readFileSync(new URL(`./scene/units/${name}`, import.meta.url), "utf8"),
);
const grabbable = fs.readFileSync(
  new URL("./scene/Grabbable.tsx", import.meta.url),
  "utf8",
);
const globalStyles = fs.readFileSync(
  new URL("../../../styles/globals.css", import.meta.url),
  "utf8",
);

describe("Scene artifact inspector", () => {
  it("keeps analysis navigation separate from the quiet document", () => {
    expect(TRAINING_FIGURES.map((figure) => figure.id)).toEqual([
      "aggregate-strength",
      "big-three",
      "dexa-history",
    ]);
    expect(adjacentSceneArtifact("aggregate-strength", -1).id).toBe(
      "dexa-history",
    );
    expect(adjacentSceneArtifact("dexa-history", 1).id).toBe(
      "aggregate-strength",
    );
    expect(sceneArtifactCollection("lift-table")).toHaveLength(1);
  });

  it("registers the scene cards through the artifact interface", () => {
    expect(cards).toContain("TRAINING_FIGURES.map");
    expect(cards).toContain("artifact={id}");
    expect(cards).not.toContain("actionLabel=");
  });

  it("renders the source figures proportionally and keeps hover motion", () => {
    expect(cards).toContain("url={figure.image}");
    expect(cards).toContain("const height = width * heightRatio;");
    expect(
      TRAINING_FIGURE_CARD_LAYOUT.map(({ heightRatio }) => heightRatio),
    ).toEqual(TRAINING_FIGURES.map(({ width, height }) => height / width));
    expect(cards).toContain("grade={0}");
    expect(cards).not.toContain("drawFigure(");
    expect(cards).not.toContain("tiltOnHover={false}");
  });

  it("uses the reviewed analysis-repository figures", () => {
    expect(
      TRAINING_FIGURES.map(({ id, image, width, height }) => ({
        id,
        image,
        width,
        height,
      })),
    ).toEqual([
      {
        id: "aggregate-strength",
        image: "/images/stacks/training-figures/aggregate-strength.png",
        width: 972,
        height: 579,
      },
      {
        id: "big-three",
        image: "/images/stacks/training-figures/big-three.png",
        width: 964,
        height: 568,
      },
      {
        id: "dexa-history",
        image:
          "/images/stacks/training-figures/dexa-lean-mass-vs-bodyweight.png",
        width: 2000,
        height: 1600,
      },
    ]);
  });

  it("groups the four pinned board photos into one zoomable collection", () => {
    expect(TRAINING_BOARD_PHOTOS.map((photo) => photo.id)).toEqual([
      "training-trophy-side-v8",
      "training-stage-kneeling-v8",
      "training-stage-side-v8",
      "training-trophy-front-v8",
    ]);
    expect(
      TRAINING_BOARD_PHOTOS.every(
        (photo) =>
          photo.kind === "image" &&
          photo.actions.some(
            (action) =>
              action.kind === "external" &&
              action.href === "https://www.instagram.com/boyswithgains/",
          ),
      ),
    ).toBe(true);
  });

  it("catalogs every presented photograph in a room-local collection", () => {
    expect(SCENE_PHOTOS).toHaveLength(29);
    expect(
      Object.fromEntries(
        [
          "about-photos",
          "training-photos",
          "projects-photos",
          "talks-photos",
          "systems-photos",
        ].map((collection) => [
          collection,
          SCENE_PHOTOS.filter((photo) => photo.collection === collection)
            .length,
        ]),
      ),
    ).toEqual({
      "about-photos": 6,
      "training-photos": 9,
      "projects-photos": 3,
      "talks-photos": 5,
      "systems-photos": 6,
    });
    expect(
      SCENE_PHOTOS.every(
        (photo) => photo.interactionId === `grab:photo:${photo.id}`,
      ),
    ).toBe(true);
  });

  it("routes every room photo carrier through the artifact inspector", () => {
    for (const source of photoCarrierSources) {
      expect(source).toContain("artifact={id}");
    }
  });

  it("uses the existing pinchable photo viewer with a projected scene origin", () => {
    expect(ANALYZE_DATA_REPOSITORY).toBe(
      "https://github.com/WeightliftingApp/WeightliftingApp-AnalyzeData",
    );
    expect(inspector).toContain('from "react-photo-view"');
    expect(inspector).toContain("<PhotoSlider");
    expect(inspector).toContain("originElement ? { originRef: originElement }");
    expect(inspector).toContain("readSceneArtifactPreviewOriginSession");
    expect(inspector).toContain(
      "sceneArtifactPreviewOriginSessionMatchesViewport",
    );
    expect(inspector).not.toContain("const originElement = useRef");
    expect(inspector).toContain("createRef<HTMLImageElement>()");
    expect(inspector).toContain('objectFit: "contain"');
    expect(inspector).toContain('"PhotoView__Photo"');
    expect(inspector).toContain("fitArtifactPreviewToViewport");
    // The enlarged photo is drawn as the print it is on the shelf: the
    // scene-registered edges around the image, sized off the viewer's box.
    expect(inspector).toContain("useArtifactPreviewFrames");
    expect(inspector).toContain("framedArtifactPreviewSize(frame, entry)");
    expect(inspector).toContain("artifactPreviewFrameLayout(frame,");
    expect(inspector).toContain('"stacks-artifact-preview-print"');
    expect(inspector).toContain("data-scene-artifact-preview-edge");
    expect(inspector).toContain("<PreviewFrameAccents");
    expect(inspector).toContain("data-scene-artifact-preview-accent");
    expect(inspector).toContain("data-scene-artifact-preview-well");
    expect(inspector).toContain("opacity: visible ? style.opacity : 0");
    expect(inspector).toContain("render: ({ attrs }) => (");
    expect(inspector).toContain("<PreviewPrint");
    // The open starts from the print's rendered pose (roll, yaw,
    // perspective), eased back to identity on the viewer's own clock.
    expect(inspector).toContain("artifactPreviewPoseTransform(fitted, origin,");
    expect(inspector).toContain("node.style.transform = pose");
    expect(globalStyles).toContain("[data-scene-artifact-preview-edge]");
    expect(globalStyles).toContain(
      '[data-scene-artifact-preview-edge-finish="gilt"]',
    );
    expect(globalStyles).toContain(
      '[data-scene-artifact-preview-accent="eyelet"]',
    );
    expect(globalStyles).toContain("feTurbulence");
    // The room's lighting rides the preview: solid through the swap, then
    // eased off to the true photo. Measured per print — one constant per
    // theme pointed the wrong way for prints the room renders BRIGHTER than
    // their file — so the tint is a multiply layer and the scalar, which can
    // exceed 1, is a filter the CSS custom property carries.
    expect(inspector).toContain("useArtifactShadeSamples");
    expect(inspector).toContain("artifactPreviewShade(shadeSamples.get(");
    expect(inspector).toContain("--stacks-preview-shade-filter");
    expect(inspector).toContain("data-scene-artifact-preview-shade");
    expect(inspector).toContain("data-scene-artifact-preview-photo");
    expect(inspector).toContain('mixBlendMode: "multiply"');
    expect(inspector).toContain('isolation: "isolate"');
    expect(globalStyles).toContain("[data-scene-artifact-preview-shade]");
    expect(inspector).toContain('loading="eager"');
    expect(inspector).toContain('decoding="sync"');
    expect(inspector).toContain("@next/next/no-img-element");
    expect(inspector).toContain("data-scene-artifact-preview-closing");
    expect(inspector).toContain("data-scene-artifact-preview-opening");
    expect(globalStyles).toContain(
      "@keyframes stacks-artifact-preview-fade-in",
    );
    expect(globalStyles).toContain(
      "@keyframes stacks-artifact-preview-fade-out",
    );
    expect(globalStyles).toContain(
      "animation: stacks-artifact-preview-fade-out 360ms linear both",
    );
    expect(globalStyles).toContain(
      "@keyframes stacks-artifact-preview-mask-in",
    );
    expect(globalStyles).toContain(
      "@keyframes stacks-artifact-preview-mask-out",
    );
    expect(globalStyles).toContain(
      ".stacks-artifact-preview-mask.PhotoView-Slider__fadeOut",
    );
    // A plain darkened room, no backdrop blur: the minifier only ever
    // shipped the -webkit- copy, so Chrome never blurred and Safari did.
    // The owner chose the unblurred look for both.
    expect(globalStyles).not.toContain("backdrop-filter: blur(24px)");
    expect(globalStyles).toContain(".stacks-artifact-preview-print {");
    expect(globalStyles).toContain("box-shadow:");
    expect(globalStyles).toContain("30% {");
    expect(globalStyles).toContain("70%,");
    expect(globalStyles).toContain("[data-scene-artifact-preview-opening]");
    expect(globalStyles).toContain("opacity: 1 !important");
    expect(inspector).toContain("data-scene-artifact-preview-origin");
    expect(inspector).toContain("destinationFor(action.to)");
    expect(inspector).not.toContain('aria-label="Zoom in"');
    expect(inspector).not.toContain('aria-label="Zoom out"');
    expect(inspector).toContain('aria-label="Previous image"');
    expect(inspector).toContain('aria-label="Next image"');
    expect(inspector).toContain("{index + 1} / {total}");
    expect(inspector).toContain("selectSceneArtifact(next.id)");
    expect(inspector).toContain("photoClosable={false}");
    expect(inspector).toContain("maskOpacity={null}");
    expect(inspector).toContain('maskClassName="stacks-artifact-preview-mask"');
    expect(inspector).toContain("backdrop-blur-xl");
    expect(inspector).not.toContain("bg-black/50");
    expect(inspector.match(/sm:size-10/g)).toHaveLength(3);
    expect(inspector).toContain("min-h-11");
    expect(inspector).toContain("sm:min-h-10");
    expect(inspector).toContain("data-preview-chrome-visible");
    expect(inspector).toContain('data-artifact-preview-control="close"');
    expect(inspector).toContain('data-artifact-preview-control="navigation"');
    expect(inspector).toContain('data-artifact-preview-control="actions"');
    expect(inspector).toContain("data-artifact-preview-scrim");
    expect(inspector).toContain("data-artifact-preview-caption");
    expect(inspector).toContain("ArrowUpRightIcon");
    expect(inspector).not.toContain("ArrowSquareOutIcon");
    expect(inspector).toContain(
      'className="pointer-events-auto flex w-fit max-w-full',
    );
    expect(inspector).not.toContain("min-h-11 flex-1 items-center");
  });

  it("defines Lift Table as a directly inspectable singleton image", () => {
    expect(SCENE_ARTIFACTS).toHaveLength(34);
    expect(sceneArtifactById("lift-table")).toMatchObject({
      kind: "image",
      title: "Lift Table",
      caption: "The first lifting chart I put together.",
      interactionId: "artifact:lift-table",
      image: "/images/stacks/artifacts/lift-table.png",
      actions: [{ label: "Open PDF", href: "/documents/lift-table.pdf" }],
    });
  });

  it("defines Homework as a captioned, link-free model artifact", () => {
    expect(sceneArtifactCollection("homework-app")).toHaveLength(1);
    expect(sceneArtifactById("homework-app")).toMatchObject({
      kind: "model",
      title: "Homework App",
      model: "homework-icon",
      interactionId: "grab:projects:homework-icon",
      fallbackImage: "/images/stacks/v8/projects-homework-icon.webp",
      actions: [],
      description: [
        expect.stringContaining("organizing, tracking, and reminding"),
        expect.stringContaining("Haystack AI in 2019"),
        expect.stringContaining("338k installs, 63k MAU"),
      ],
    });
    expect(inspector).toContain("useModelArtifactRendererEnabled");
    expect(inspector).toContain("data-model-artifact-fallback");
    expect(inspector).toContain("modelArtifactPreviewVisible");
    expect(inspector).toContain("data-model-artifact-phase");
    expect(inspector).toContain("!renderModel && (");
    expect(inspector).toContain("artifact.actions.length > 0");
    expect(modelStage).toContain('frameloop="demand"');
    expect(modelStage).toContain("<OrbitControls");
    expect(modelStage).toContain("enablePan={false}");
    expect(modelStage).toContain("interactive={false}");
    expect(modelStage).toContain("onPointerMissed");
    expect(modelStage).toContain("onBackgroundClick()");
    expect(modelStage).toContain("projectArtifactInspectionLighting");
    expect(modelStage).not.toContain('color={dark ? "#c6d3ef"');
    expect(inspector).toContain(
      'interactive={handoff?.phase === "inspecting"}',
    );
    expect(inspector).toContain("onClick={closeSceneArtifact}");
    expect(inspector).toContain(
      "onClick={renderModel ? undefined : closeSceneArtifact}",
    );
    expect(inspector).toContain("onBackgroundClick={closeSceneArtifact}");
    expect(inspector).toContain(
      'className="mx-auto w-full max-w-[720px] self-center text-left"',
    );
    expect(modelStage).toContain("enabled={interactive}");
    expect(stacksCanvas).toContain("modelArtifactRoomShouldFreeze");
    expect(stacksCanvas).toContain(
      'frameloop={freezeRoom ? "never" : "always"}',
    );
  });

  it("switches the whole model preview path behind one flag", () => {
    // Off since 2026-08-23 (the lift-and-orbit preview was regressing); the
    // viewer and handoff stay in place so re-enabling is flipping this back.
    expect(MODEL_ARTIFACT_PREVIEWS_ENABLED).toBe(false);
    expect(
      sceneArtifactPreviewEnabled(sceneArtifactById("homework-app")!),
    ).toBe(MODEL_ARTIFACT_PREVIEWS_ENABLED);
    expect(sceneArtifactPreviewEnabled(sceneArtifactById("portrait")!)).toBe(
      true,
    );
  });

  it("moves the physical source relative to the live camera before crossfading", () => {
    expect(grabbable).toContain("artifactTargetNdc");
    expect(grabbable).toContain("camera.getWorldQuaternion");
    expect(grabbable).toContain("artifactTargetWorldPosition");
    expect(grabbable).toContain("artifactHandoffStartScale");
    expect(grabbable).toContain("artifactTargetLocalScale");
    expect(grabbable).toContain("g.scale.lerpVectors");
    expect(grabbable).toContain("setArtifactOpacity");
    expect(grabbable).toContain('type: "source-at-target"');
    expect(inspector).toContain(
      "modelArtifactPreviewVisible(artifactHandoffPhase)",
    );
    expect(inspector).toContain("stacks-artifact-preview--handoff-visible");
    expect(inspector).toContain('"stacks-artifact-preview",');
    expect(globalStyles).not.toContain("animation: none !important");
    expect(grabbable).toContain("target.sourceBounds ? 0");
    // The image handoff is a stagger, not a crossfade: the physical print
    // leaves only through its own late window, under an already-solid DOM.
    expect(grabbable).toContain("artifactPreviewRamp");
    expect(grabbable).toContain("ARTIFACT_PREVIEW_SOURCE_OUT_START");
    expect(grabbable).toContain("ARTIFACT_PREVIEW_CROSSFADE_START");
    expect(grabbable).toContain("artifactHandoffTravelElapsed.current /");
    expect(grabbable).not.toContain(
      'const modelHandoff =\n      artifactEntry?.kind === "model"',
    );
    expect(inspector).not.toContain("--model-handoff-x");
  });
});

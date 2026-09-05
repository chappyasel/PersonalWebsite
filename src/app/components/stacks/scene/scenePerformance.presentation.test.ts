import fs from "node:fs";
import { describe, expect, it } from "vitest";

const primitives = fs.readFileSync(
  new URL("./primitives.tsx", import.meta.url),
  "utf8",
);
const eggs = fs.readFileSync(new URL("./eggs.tsx", import.meta.url), "utf8");
const talks = fs.readFileSync(
  new URL("./units/UnitTalks.tsx", import.meta.url),
  "utf8",
);
const meadow = fs.readFileSync(
  new URL("./Meadow.tsx", import.meta.url),
  "utf8",
);
const grabbable = fs.readFileSync(
  new URL("./Grabbable.tsx", import.meta.url),
  "utf8",
);
const scene = fs.readFileSync(new URL("./Scene.tsx", import.meta.url), "utf8");
const litImage = fs.readFileSync(
  new URL("./LitImage.tsx", import.meta.url),
  "utf8",
);
const photoDetails = fs.readFileSync(
  new URL("./scenePhotoDetails.ts", import.meta.url),
  "utf8",
);
const environment = fs.readFileSync(
  new URL("./SceneEnvironment.tsx", import.meta.url),
  "utf8",
);
const wavingGolfFlag = fs.readFileSync(
  new URL("./WavingGolfFlag.tsx", import.meta.url),
  "utf8",
);
const golfExperience = fs.readFileSync(
  new URL("./golf/GolfExperience.tsx", import.meta.url),
  "utf8",
);
const canvas = fs.readFileSync(
  new URL("../StacksCanvas.tsx", import.meta.url),
  "utf8",
);
const qualitySampler = fs.readFileSync(
  new URL("./qualitySampler.ts", import.meta.url),
  "utf8",
);
const lift = fs.readFileSync(new URL("./Lift.tsx", import.meta.url), "utf8");
const placards = fs.readFileSync(
  new URL("../dom/PlacardLayer.tsx", import.meta.url),
  "utf8",
);
const store = fs.readFileSync(new URL("../store.ts", import.meta.url), "utf8");
const diagnosticsRegistry = fs.readFileSync(
  new URL("./sceneDiagnosticsRegistry.ts", import.meta.url),
  "utf8",
);
const butterflies = fs.readFileSync(
  new URL("./Butterflies.tsx", import.meta.url),
  "utf8",
);
const wildlife = fs.readFileSync(
  new URL("./Wildlife.tsx", import.meta.url),
  "utf8",
);
const home = fs.readFileSync(
  new URL("../StacksHome.tsx", import.meta.url),
  "utf8",
);
const staticWorld = fs.readFileSync(
  new URL("./staticWorld.tsx", import.meta.url),
  "utf8",
);
const modelProp = fs.readFileSync(
  new URL("./ModelProp.tsx", import.meta.url),
  "utf8",
);
const unitLod = fs.readFileSync(
  new URL("./useUnitLod.ts", import.meta.url),
  "utf8",
);

describe("scene performance integration", () => {
  it("hides only real lights while retaining every practical-light rig", () => {
    expect(primitives).toContain("visible={realLightVisible}");
    expect(primitives).toContain("visible={realLights}");
    expect(eggs).toContain("realLights={realLights}");
    expect(talks).toContain("<FloorLampRealLights");
    expect(talks).toContain("visible={visible}");
    expect(modelProp).toContain("DESK_LAMP_SHADE_GLOW_NODE");
    expect(primitives).toContain("registerMeadowLamp");
  });

  it("gates only practical-lamp billboard glows behind the reversible comparison mode", () => {
    expect(primitives).toContain("practicalGlowSpriteEnabled");
    expect(primitives.match(/<GlowSprite/g)).toHaveLength(2);
    expect(talks.match(/<GlowSprite/g)).toHaveLength(2);
    expect(primitives.match(/\n\s+practical\n/g)).toHaveLength(1);
    expect(talks.match(/\n\s+practical\n/g)).toHaveLength(2);
  });

  it("derives the cheap halo from the aperture plane instead of the camera", () => {
    const haloStart = primitives.indexOf("export function ApertureHalo");
    const haloEnd = primitives.indexOf("export function GlowSprite", haloStart);
    const apertureHalo = primitives.slice(haloStart, haloEnd);

    expect(haloStart).toBeGreaterThanOrEqual(0);
    expect(apertureHalo).toContain("practicalGlowHaloEnabled");
    expect(apertureHalo).toContain("<mesh");
    expect(apertureHalo).toContain("<planeGeometry");
    expect(apertureHalo).toContain("depthTest");
    expect(apertureHalo).toContain("depthWrite={false}");
    expect(apertureHalo).not.toContain("<sprite");
    expect(primitives.match(/<ApertureHalo/g)).toHaveLength(1);
    expect(talks.match(/<ApertureHalo/g)).toHaveLength(1);
    expect(eggs).toContain("stacksSelfDimmed");
  });

  it("hands the analytic fallback off to the actually mounted bloom pass", () => {
    expect(store).toContain("bloomActive: boolean");
    expect(store).toContain("setBloomActive");
    expect(canvas).toContain("const bloomActive = plan.effects.bloom");
    expect(primitives).toContain("state.bloomActive");
    expect(primitives).not.toContain("settings.skipBloom ? 1 : 0.38");
  });

  it("keeps the desk-shade glow behind opaque scene depth", () => {
    expect(primitives).not.toContain("function ShadeGlow");
    expect(modelProp).toContain("DESK_LAMP_SHADE_GLOW_NODE");
    expect(modelProp).toContain("depthTest: true");
    expect(modelProp).toContain("depthFunc: THREE.EqualDepth");
    expect(modelProp).toContain("depthWrite: false");
  });

  it("uses a compile-time far shader without rebuilding the instanced mesh", () => {
    expect(meadow).toContain("#ifdef FAR_SIMPLE");
    expect(meadow).toContain("defines: { FAR_SIMPLE: 1 }");
    expect(meadow).toContain("farWindAt");
    expect(meadow).toContain("material={");
    expect(meadow).toContain(
      "args={[undefined, undefined, tile.indices.length]}",
    );
  });

  it("freezes only explicit static roots and manually updates the moving sky", () => {
    expect(primitives).toContain(
      '<StaticWorldRoot id={`shelf-structure:${toneSeed ?? "shared"}`}>',
    );
    expect(meadow).toContain('<StaticWorldRoot id="meadow-geometry">');
    expect(grabbable).not.toContain("StaticWorldRoot");
    expect(staticWorld).toContain("object.matrixAutoUpdate = false");
    expect(staticWorld).toContain("object.matrixWorldAutoUpdate = false");
    expect(staticWorld).toContain("findFrozenStaticWorldMutation");
    expect(environment).toContain("updateManualWorldMatrix(domeRef.current)");
    expect(environment).toContain("matrixWorldAutoUpdate={false}");
  });

  // The backdrop's own tones, opacity, and ramp are asserted against the
  // module in canvasCompositing.test.ts. This is the wiring fact that has no
  // in-process interface: that the shell actually paints it.
  it("paints the scene backdrop behind the canvas layer", () => {
    expect(canvas).toMatch(/background: sceneBackdropFor\(dark\)/);
    expect(canvas).toContain("gl={SCENE_CANVAS_CONTEXT}");
  });

  it("keeps the no-meadow comparison visually grounded without restoring terrain work", () => {
    expect(environment).toContain("uniform float uMeadow;");
    expect(environment).toContain(
      "float exposedGround = (1.0 - uMeadow) * uDark;",
    );
    expect(environment).toContain(
      "float ground = mix(meadowGround, noMeadowGround, exposedGround);",
    );
    expect(environment).toContain("u.uMeadow!.value = THREE.MathUtils.damp(");
    expect(wavingGolfFlag).toContain("useResolvedMeadowVisibility");
    expect(wavingGolfFlag).toContain("{meadowVisible ? (");
    expect(golfExperience).toContain("useResolvedMeadowVisibility");
    expect(golfExperience).toContain("golfBallCupOpacity(");
    expect(golfExperience).toContain("meadowVisible,");
  });

  it("mounts diagnostic sweeps only after an explicit request", () => {
    expect(canvas).toContain("{diagnosticsRequested ? (");
    expect(canvas).toContain(
      "<PerformanceProbe instrumentFrames={!supportReportMode} />",
    );
    expect(canvas).toContain("{!supportReportMode ? (");
    expect(canvas).toContain("<StaticWorldInvariantProbe />");
    expect(scene).toContain(
      'process.env.NODE_ENV === "development" && diagnosticsRequested',
    );
  });

  it("restarts automatic diagnostics for a new boot generation", () => {
    expect(home).toContain("state.epoch !== observedEpoch");
    expect(home).toContain("armCheckpoints(state)");
    expect(home).toContain("PERFORMANCE_DIAGNOSTIC_CHECKPOINTS_MS.map");
    expect(canvas).toContain(
      "<AutomaticPerformanceDiagnosticRun key={epoch} />",
    );
  });

  it("shows diagnostic timing without trusting it for automatic quality", () => {
    expect(canvas).toContain("liveMetricsRef.current = metrics");
    expect(canvas).toContain("sample.instrumented");
    expect(qualitySampler).toContain(
      "frames.some((retained) => retained.instrumented)",
    );
    expect(canvas).toContain(
      "visible && focused && !qualityControls.frozen && !instrumented",
    );
  });

  it("keeps the learned renderer bucket fixed after WebGL creation", () => {
    const sampleStart = canvas.indexOf("const onQualitySample = useCallback");
    const sampleEnd = canvas.indexOf(
      "const onComposerError = useCallback",
      sampleStart,
    );
    const sampleCallback = canvas.slice(sampleStart, sampleEnd);

    expect(sampleStart).toBeGreaterThanOrEqual(0);
    expect(sampleCallback).not.toContain("setRendererCapability");
    expect(sampleCallback).not.toContain("observed: metrics");
  });

  it("guards preview warming and the settled-prop fast path", () => {
    expect(scene).toContain("scenePrewarmDeferred()");
    expect(scene).toContain("useTexture.preload(url)");
    expect(scene).not.toContain("mastersByUnit");
    expect(scene).not.toContain('cache: "force-cache"');
    expect(canvas).toContain("setSceneTraveling(true)");
    expect(canvas).toContain("scenePrewarmDeferred()");
    expect(grabbable).toContain("shouldSuspendSettledPropFrame");
  });

  it("warms complete shelf resources before interaction with a live comparison switch", () => {
    expect(unitLod).toContain("prewarmAllUnitVisuals");
    expect(canvas).toContain("prewarmSceneGpuResources");
    expect(canvas).toContain("prewarmSceneGpuPrograms");
    expect(canvas).toContain("shouldWarmSceneGpuResources");
    expect(canvas).toContain("resourceVariant");
    expect(canvas).toContain("warmedResourceVariant");
    expect(canvas).toContain("useProgress.subscribe");
    expect(canvas).toContain("markSceneFrameInstrumented()");
    expect(diagnosticsRegistry).toContain("Preload all shelf visuals");
    expect(diagnosticsRegistry).toContain('key: "prewarmAllUnitVisuals"');
    expect(canvas).toContain("SceneLightShapePadding");
    expect(diagnosticsRegistry).toContain(
      "Stabilize nearby-light shader count",
    );
    expect(diagnosticsRegistry).toContain(
      'key: "stableNeighborhoodLightShape"',
    );
    expect(primitives).toContain("sceneUnitLightUserData(lightUnitIndex)");
    expect(primitives).toContain("sceneUnitLightUserData(unitIndex)");
    expect(eggs).toContain("unitIndex={unitIndex}");
    expect(talks).toContain("sceneUnitLightUserData(unitIndex)");
  });

  it("loads only explicitly authored photo details outside the boot manager", () => {
    expect(photoDetails).toContain("fetch(url, { signal })");
    expect(photoDetails).toContain("resource.dispose()");
    expect(litImage).toContain("!performanceSettings.highResolutionPhotos");
    expect(litImage).toContain("if (!detailUrl || detailsDisabled");
    expect(litImage).toContain("isReleased: () => lease.released");
    expect(litImage).toContain(
      "const detailTexture = liveLitImageDetailResource({",
    );
    expect(litImage).not.toContain("detailUrl ?? url");
    expect(scene).not.toContain("scenePhotoManifestMasterUrl");
    expect(litImage).toContain("previewTexture={previewTexture}");
    expect(litImage).toContain("detailTexture={detailTexture}");
    expect(litImage).not.toContain("<Suspense fallback={preview}>");
    expect(litImage).toContain("lease.release()");
  });

  it("uses one photo mesh and no per-photo frame subscriber", () => {
    expect(litImage).toContain("detailTexture ?? previewTexture");
    expect(litImage).not.toContain("useFrame");
    expect(litImage).not.toMatch(
      /<meshStandardMaterial[\s\S]*?\btransparent\b[\s\S]*?\/>/,
    );
    expect(litImage.match(/<mesh\b/g)).toHaveLength(1);
  });

  // The composer half of this — which passes mount, in what order, and at
  // what values — is asserted against the rendered chain in
  // Effects.contract.test.tsx and shelfDepthOfField.test.ts. What the paper
  // mode declares is asserted in placardSurface.test.ts. This is the wiring
  // fact: the resolved mode reaches the DOM as the attribute those rules and
  // that policy both key on.
  it("publishes the resolved glass mode where its stylesheet can see it", () => {
    expect(placards).toContain("effectivePlacardGlassMode");
    expect(placards).toContain("data-stacks-glass-mode={glassMode}");
    expect(placards).toContain("PLACARD_PAPER_SURFACE_CSS");
  });

  it("runs reversible RCAS only for reduced-DPR composer frames", () => {
    expect(canvas).toContain("adaptiveSharpenAmount(");
    expect(canvas).toContain("sharpenAmount={sharpenAmount}");
    expect(diagnosticsRegistry).toContain('"adaptiveSharpen"');
    expect(diagnosticsRegistry).toContain("Sharpen reduced-DPR output");
  });

  it("ships an opaque paper comparison without a scene-copy pipeline", () => {
    expect(canvas).not.toContain("SceneGlassSampler");
    expect(canvas).not.toContain("sceneGlassLiveController");
    expect(placards).not.toContain("SceneGlassSurface");
  });

  it("keeps resident units behind one camera-driven activity boundary", () => {
    expect(scene).toContain("<SceneUnitActivityDriver />");
    expect(scene).toContain("<UnitActivityProvider index={index}>");
    expect(scene).toContain("useUnitActivityRoot(index, root)");
    expect(diagnosticsRegistry).toContain('"virtualizeUnitWork"');
  });

  it("resolves one axis-driven policy and records travel in its reducer", () => {
    expect(canvas).toContain("resolveSceneQualityPlan({");
    expect(canvas).toContain(
      "narrowViewport: viewport.width < STACKS_DESKTOP_MIN_WIDTH",
    );
    expect(canvas).toContain("reduceSceneQualityAxes");
    expect(canvas).toContain("<AdaptiveQualityProbe");
    expect(canvas).toContain("onSample={onQualitySample}");
    expect(canvas).toContain("onForeground={onQualityForeground}");
    expect(canvas).toContain('type: "travel-start"');
    expect(canvas).not.toContain("allowsDynamicSceneResolution");
    expect(canvas).not.toContain("allowResolutionChange:");
    expect(canvas).toContain("initialAutoResolutionStep");
    expect(canvas).toContain("resolutionStepForScale(starting, ceiling)");
    expect(canvas).toContain("touch: coarseTouch");
    expect(canvas).toContain(
      "qualityControls.depthOfFieldBokehMultiplier ?? undefined",
    );
    expect(canvas).toContain(
      "qualityControls.depthOfFieldResolutionScale ?? undefined",
    );
    expect(canvas).toContain(
      'contentTier: mode === "auto" ? axisState.axes.content : undefined',
    );
    expect(canvas).toContain("plan={plan}");
  });

  it("records attributable performance traces without adding browser automation", () => {
    expect(canvas).toContain("scenePerformanceTrace.frame");
    expect(canvas).toContain('type: moving ? "travel-start" : "travel-end"');
    expect(canvas).toContain('type: "quality-transition"');
    expect(canvas).toContain('type: "performance-settings"');
    expect(canvas).toContain("<PerformanceTraceObservers />");
    expect(canvas).toContain("cameraYawDeg");
    expect(canvas).toContain("cameraLookLagX");
    expect(canvas).toContain("visibleUnits");
    expect(canvas).toContain("metrics: liveMetricsRef.current");
    expect(canvas).toContain("physicalPixels: plan.physicalPixels");
    expect(home).toContain('<Profiler id="canvas-react"');
    expect(home).toContain('<Profiler id="placard"');
    expect(home).toContain("scenePerformanceTrace.reactCommit");
  });

  it("retains bounded quality samples and browser lifecycle evidence", () => {
    expect(canvas).toContain("sceneQualityEvidence.recordSample");
    expect(canvas).toContain("sceneQualityEvidence.recordLifecycle");
    expect(canvas).toContain('window.addEventListener("blur"');
    expect(canvas).toContain('window.addEventListener("focus"');
    expect(canvas).toContain('window.addEventListener("pagehide"');
    expect(canvas).toContain('document.addEventListener("freeze"');
    expect(canvas).toContain("evidence: sceneQualityEvidence.snapshot()");
    expect(canvas).toContain("qualityEvidenceRequested");
    expect(canvas).toContain("recordEvidence={qualityEvidenceRequested}");
  });

  it("keeps sampled telemetry out of React scene state", () => {
    expect(canvas).toContain("const liveMetricsRef = useRef<");
    expect(canvas).toContain("liveMetricsRef.current = metrics");
    expect(canvas).not.toContain("setLiveMetrics(metrics)");
  });

  it("keeps placard travel updates in lightweight desktop and mobile shells", () => {
    const mobilePanelStart = placards.indexOf(
      "const MobileUnitPanel = memo(function MobileUnitPanel",
    );
    const mobilePanelEnd = placards.indexOf(
      "export default function PlacardLayer",
      mobilePanelStart,
    );
    const mobilePanel = placards.slice(mobilePanelStart, mobilePanelEnd);

    expect(placards).toContain(
      "const DesktopUnitPanel = memo(function DesktopUnitPanel",
    );
    expect(placards).toContain("const bodies = useMemo<");
    expect(mobilePanelStart).toBeGreaterThanOrEqual(0);
    expect(mobilePanel).not.toContain(
      "const activeUnit = useStacks((s) => s.activeUnit)",
    );
    expect(mobilePanel).toContain("side:");
    expect(placards).toContain('transitionProperty: "transform, visibility"');
    expect(placards).toContain('visibility: active ? "visible" : "hidden"');
  });

  it("keeps touch on the shared effects chain and contains composer failures", () => {
    expect(canvas).toContain("Touch uses the same effect");
    expect(canvas).toContain("EffectsErrorBoundary");
    expect(canvas).toContain('type: "effects-error"');
  });

  it("reduces wing blur and suspends only provably distant wildlife in Safety", () => {
    expect(butterflies).toContain("wingBlurSamples");
    expect(butterflies).toContain(
      "Math.abs(motion.currentUnit - stacks.activeUnit) > 1",
    );
    expect(wildlife).toContain(
      "Math.abs(lampUnitIndex - stacks.activeUnit) > 1",
    );
  });

  it("balances dense meadow tiles and suspends settled hover frames", () => {
    expect(meadow).toContain("meadowTilePopulationLimit(performanceSettings)");
    expect(meadow).toContain("maxPopulation");
    expect(meadow).toContain('farGrassShader === "simplified"');
    expect(environment).toContain(
      "farGrassShader={quality.environment.farGrassShader}",
    );
    expect(lift).toContain("suspendSettledHoverWork");
    expect(lift).toContain("settled.current");
  });

  it("fades the automatic survival meadow out and its single recovery back in", () => {
    const flowerFragmentStart = meadow.indexOf("const FLOWER_FRAGMENT");
    const flowerFragmentEnd = meadow.indexOf(
      "// ---------------------------------------------------------------------------",
      flowerFragmentStart,
    );
    const flowerFragment = meadow.slice(flowerFragmentStart, flowerFragmentEnd);

    expect(flowerFragmentStart).toBeGreaterThanOrEqual(0);
    expect(flowerFragment).toContain("uniform float uOpacity;");
    expect(scene).toContain("quality.environment.meadow");
    expect(scene).toContain(
      'scenePerformanceController.isOverridden("meadow")',
    );
    expect(environment).toContain("useResolvedMeadowVisibility");
    expect(environment).toContain("meadowRetiring");
    expect(environment).toContain("meadowRecovering");
    expect(environment).toContain("onRetired");
    expect(environment).toContain("onRecovered");
    expect(environment).toContain("THREE.MathUtils.damp(");
    expect(meadow).toContain("MEADOW_RETIRE_SECONDS");
    expect(meadow).toContain("MEADOW_RECOVER_SECONDS");
    expect(meadow).toContain("gl_FragColor = vec4(col, uOpacity)");
    expect(meadow).toContain("onRetiredRef.current?.()");
    expect(meadow).toContain("onRecoveredRef.current?.()");
    expect(canvas).toContain(
      "survival: stored.survival || axesRef.current.survival",
    );
  });

  it("samples and persists quality only while the page is visible and focused", () => {
    expect(canvas).toContain("!document.hidden && document.hasFocus()");
    expect(canvas).toContain("sampler.current?.setForegroundActive");
    expect(canvas).toContain("documentFocused: document.hasFocus()");
    expect(canvas).toContain(
      "visible && focused && !qualityControls.frozen && !instrumented",
    );
    expect(canvas).toContain('recordLifecycle("window-blur", now)');
    expect(canvas).toContain('window.addEventListener("focus", onFocus)');
    expect(canvas).toContain(
      "scenePerformanceTrace.isActive() &&\n      !document.hidden &&\n      document.hasFocus()",
    );
  });
});

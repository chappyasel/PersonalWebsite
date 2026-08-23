import fs from "node:fs";
import { describe, expect, it } from "vitest";

const diagnosticsSource = fs.readFileSync(
  new URL("./SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);
const diagnosticsStyles = fs.readFileSync(
  new URL("./SceneDiagnostics.module.css", import.meta.url),
  "utf8",
);
const chromeSource = fs.readFileSync(
  new URL("./ChromeLayer.tsx", import.meta.url),
  "utf8",
);
const canvasSource = fs.readFileSync(
  new URL("../StacksCanvas.tsx", import.meta.url),
  "utf8",
);
const registrySource = fs.readFileSync(
  new URL("../scene/sceneDiagnosticsRegistry.ts", import.meta.url),
  "utf8",
);
const controlSources = `${diagnosticsSource}\n${registrySource}`;

describe("development diagnostics chrome", () => {
  it("uses one diagnostics drawer instead of separate perch and physics drawers", () => {
    expect(diagnosticsSource).toContain("function SceneDiagnostics");
    expect(diagnosticsSource).not.toContain("function DevPerchHud");
    expect(diagnosticsSource).not.toContain("function DevPhysicsHud");
    expect(diagnosticsSource).toContain("Perches");
    expect(diagnosticsSource).toContain("Physics");
  });

  it("keeps overlay controls inside the Inspect view", () => {
    expect(diagnosticsSource).toContain("Show all overlays");
    expect(diagnosticsSource).toContain("Hide all overlays");
    expect(diagnosticsSource).not.toContain("stacks-debug-quick");
    expect(diagnosticsSource).toContain(
      'sceneDiagnosticsRegistry.setGroup("inspect.overlays", enabled)',
    );
  });

  it("organizes the console by diagnostic intent", () => {
    expect(diagnosticsSource).toContain("type DiagnosticsPanel =");
    expect(diagnosticsSource).toContain('"overview"');
    expect(diagnosticsSource).toContain('"render"');
    expect(diagnosticsSource).toContain('"simulate"');
    expect(diagnosticsSource).toContain('"inspect"');
    expect(diagnosticsSource).toContain("Scene health");
    expect(registrySource).toContain("Scene overlays");
    expect(registrySource).toContain("Authored camera depth");
    expect(registrySource).toContain("Meadow wind");
    expect(registrySource).toContain("Insect behavior");
    expect(registrySource).toContain("Physics runtime");
    expect(diagnosticsSource).toContain("Scene quality");
    expect(diagnosticsSource).toContain("Rendering experiments");
    expect(registrySource).toContain("Lighthouse beacon");
    expect(diagnosticsSource).toContain("Policy internals");
    expect(diagnosticsSource).toContain('role="tabpanel"');
  });

  it("keeps overview navigation contextual", () => {
    expect(diagnosticsSource).toContain(
      "data-empty={notices.length === 0 || undefined}",
    );
    expect(diagnosticsSource).toContain("No active signals");
    expect(diagnosticsSource).not.toContain("Tune rendering");
    expect(diagnosticsSource).not.toContain("Inspect scene");
  });

  it("holds live overview geometry stable while health signals change", () => {
    expect(diagnosticsStyles).toContain("block-size: 52px");
    expect(diagnosticsStyles).toContain("block-size: 96px");
    expect(diagnosticsStyles).toContain("overflow-y: auto");
    expect(diagnosticsStyles).toContain(
      "grid-template-rows: auto auto minmax(0, 1fr)",
    );
    expect(diagnosticsStyles).toContain(
      "block-size: min(720px, calc(100dvh - 24px))",
    );
  });

  it("turns the console into a touch-friendly fixed-height mobile sheet", () => {
    expect(diagnosticsStyles).toContain("@media (width < 640px)");
    expect(diagnosticsStyles).toContain("inset: auto 0 0");
    expect(diagnosticsStyles).toContain("block-size: min(82svh, 720px)");
    expect(diagnosticsStyles).toContain("border-radius: 14px 14px 0 0");
    expect(diagnosticsStyles).toContain("min-block-size: 40px");
    expect(diagnosticsStyles).toContain("grid-template-columns: 1fr");
  });

  it("uses a compact accessible close icon", () => {
    expect(diagnosticsSource).toContain('aria-label="Close scene diagnostics"');
    expect(diagnosticsSource).toContain(
      '<XIcon aria-hidden="true" size={18} weight="bold" />',
    );
    expect(diagnosticsSource).not.toContain("          Close\n");
  });

  it("uses one semantic diagnostics palette", () => {
    expect(diagnosticsStyles).toContain("--diagnostics-accent:");
    expect(diagnosticsStyles).toContain("--diagnostics-success:");
    expect(diagnosticsStyles).toContain("--diagnostics-warning:");
    expect(diagnosticsStyles).toContain("--diagnostics-danger:");
    expect(diagnosticsStyles).toContain(
      'button[aria-pressed="true"] {\n  color: var(--diagnostics-accent);',
    );
  });

  it("uses fixed-width live chrome so changing metrics cannot shift layout", () => {
    expect(diagnosticsStyles).toContain("inline-size: 168px");
    expect(diagnosticsStyles).toContain("min-inline-size: 168px");
    expect(diagnosticsStyles).toContain("max-inline-size: 168px");
    expect(diagnosticsStyles).toContain(
      "grid-template-rows: repeat(4, 1.12em)",
    );
    expect(diagnosticsStyles).toContain("inline-size: 100%");
    expect(diagnosticsStyles).toContain("text-overflow: ellipsis");
    expect(diagnosticsStyles).not.toContain("min-width: max-content");
    expect(diagnosticsStyles).not.toContain('content: "D"');
  });

  it("uses the HUD as the only console trigger with a safe H shortcut", () => {
    expect(diagnosticsSource).toContain("<DevPerformanceHud");
    expect(diagnosticsSource).toContain('aria-keyshortcuts="`"');
    expect(diagnosticsSource).toContain('event.key !== "`"');
    expect(diagnosticsSource).toContain(
      "isEditableShortcutTarget(event.target)",
    );
    expect(diagnosticsSource).not.toContain("stacks-perch-hud");
  });

  it("renders declarative semantic HUD segments", () => {
    expect(diagnosticsSource).toContain("createDevHudRows(snapshot)");
    expect(diagnosticsSource).toContain("data-tone={segment.tone");
    expect(diagnosticsSource).toContain("data-emphasis={segment.emphasis");
    expect(diagnosticsStyles).toContain('[data-tone="positive"]');
    expect(diagnosticsStyles).toContain('[data-tone="warning"]');
    expect(diagnosticsStyles).toContain('[data-tone="danger"]');
  });

  it("exposes adaptive quality controls and the full live policy status", () => {
    expect(registrySource).toContain("Quality mode");
    expect(registrySource).toContain('optionGroup: "Manual only"');
    expect(registrySource).toContain('optionGroup: "Adaptive range"');
    expect(registrySource.indexOf('value: "cinematic+"')).toBeLessThan(
      registrySource.indexOf('value: "cinematic"'),
    );
    expect(registrySource).toContain(
      'value: "cinematic+", label: "Cinematic+"',
    );
    expect(registrySource).toContain('value: "cinematic", label: "Cinematic"');
    expect(registrySource).toContain("Freeze Auto adaptation");
    expect(diagnosticsSource).toContain("Reset learned profile");
    expect(diagnosticsSource).toContain("Effective");
    expect(diagnosticsSource).toContain("cooldownRemainingMs");
    expect(diagnosticsSource).toContain("storageBucket");
    expect(diagnosticsSource).toContain("fallbackStatus");
    expect(diagnosticsSource).toContain("custom overrides");
    // What the Rendering card says — who is driving, the step the frame was
    // rendered at, and whether it is pinned — is asserted against the module
    // that formats it in qualityReadout.test.ts.
    expect(diagnosticsSource).toContain("qualityRenderingReadout");
  });

  it("keeps the compact HUD focused on policy decisions and their visual cost", () => {
    expect(diagnosticsSource).toContain("targetFrameMs");
    expect(diagnosticsSource).toContain("droppedFrameRatio");
    expect(diagnosticsSource).toContain("pixelBudget");
    expect(diagnosticsSource).toContain("bloomLevels");
    expect(diagnosticsSource).toContain("ambientOcclusionHalfRes");
    expect(diagnosticsSource).toContain("depthOfFieldResolutionScale");
    expect(diagnosticsSource).toContain("createDevHudRows(snapshot)");
    expect(diagnosticsSource).not.toContain("ms p50/p95");
    expect(diagnosticsSource).not.toContain("snapshot.framebuffer");
  });

  it("captures an attributable stationary-versus-travel performance trace", () => {
    expect(diagnosticsSource).toContain("function PerformanceTraceControls");
    expect(diagnosticsSource).toContain("Performance trace");
    expect(diagnosticsSource).toContain("Start capture");
    expect(diagnosticsSource).toContain("Download JSON");
    expect(diagnosticsSource).toContain("report.summary.settled.frameMs.p95");
    expect(diagnosticsSource).toContain("report.summary.travel.frameMs.p95");
    expect(diagnosticsSource).toContain(
      "report.summary.travelToSettledP95Ratio",
    );
    expect(diagnosticsSource).toContain("strongestSignals");
  });

  it("downloads the cheap automatic-quality decision log after a device run", () => {
    expect(diagnosticsSource).toContain("Download quality log");
    expect(diagnosticsSource).toContain(
      'window.__stacks?.qualityLog("download")',
    );
  });

  it("edits the live meadow wind strength and animation speed", () => {
    expect(diagnosticsSource).toContain(
      "meadowDiagnosticsController.subscribe",
    );
    expect(registrySource).toContain('inputId: "stacks-wind-strength"');
    expect(registrySource).toContain('inputId: "stacks-wind-live"');
    expect(registrySource).toContain('inputId: "stacks-wind-speed"');
    expect(registrySource).toContain("meadowDiagnosticsController.update");
    expect(diagnosticsSource).toContain("Reset wind");
    expect(registrySource).toContain('inputId: "stacks-grass-deformation"');
    expect(registrySource).toContain("Persistent grass deformation");
    expect(registrySource).toContain("deformationEnabled");
  });

  it("toggles authored camera depth from the Simulate view", () => {
    expect(registrySource).toContain("store: cameraDepthDiagnosticsController");
    expect(registrySource).toContain(
      "cameraDepthDiagnosticsController.setEnabled",
    );
    expect(registrySource).toContain("Authored camera depth");
    expect(diagnosticsSource).toContain("Simulation controls");
  });

  it("offers a reset-on-reload free-roam camera in the Simulate view", () => {
    expect(diagnosticsSource).toContain(
      "freeRoamDiagnosticsController.subscribe",
    );
    expect(registrySource).toContain(
      "freeRoamDiagnosticsController.setEnabled",
    );
    expect(registrySource).toContain("Free-roam camera");
    expect(diagnosticsSource).toContain("WASD");
    expect(registrySource).toContain("Fog in free roam");
    expect(registrySource).toContain('ariaKeyShortcuts: "F Shift+F"');
    expect(diagnosticsSource).toContain("Q/E");
    expect(diagnosticsSource).toContain("Shift for one-third");
    expect(diagnosticsSource).toContain("Shift+F starts from");
    expect(diagnosticsSource).toContain("never captures the mouse");
    expect(diagnosticsSource).toContain("Hold the right button");
    expect(diagnosticsSource).toContain("selects an editable prop");
  });

  it("keeps inspection scope with overlays and telemetry", () => {
    const inspectStart = diagnosticsSource.indexOf(
      'id="stacks-diagnostics-panel-inspect"',
    );
    const inspectSource = diagnosticsSource.slice(inspectStart);

    expect(inspectSource).toContain("<DiagnosticSegmentedControl");
    expect(registrySource).toContain("Active shelf");
    expect(registrySource).toContain("All shelves");
    expect(registrySource).toContain("Scene overlays");
    expect(inspectSource).toContain("Perches ·");
    expect(inspectSource).toContain("Flights ·");
    expect(inspectSource).toContain("<PhysicsDiagnosticsDetails");
  });

  it("exposes every negligible-impact optimization as an independent control", () => {
    expect(controlSources).toContain("Suspend settled distant props");
    expect(controlSources).toContain("Pause prewarming during travel");
    expect(controlSources).toContain("Limit real lights to nearby shelves");
    expect(controlSources).toContain("Simplify far-grass shader");
    expect(controlSources).toContain("Opaque paper");
    expect(controlSources).toContain("Native live blur");
    expect(controlSources).toContain("Aperture only");
    expect(controlSources).toContain("Analytic halo");
    expect(controlSources).toContain("Legacy sprites");
    expect(controlSources).toContain("Use effective DPR rungs");
    expect(controlSources).toContain("Skip ambient occlusion");
    expect(controlSources).toContain("Skip bloom");
    expect(controlSources).toContain("Skip depth of field");
    expect(registrySource).toContain('inputId: "stacks-dof-strength"');
    expect(registrySource).toContain('inputId: "stacks-dof-quality"');
    expect(registrySource).toContain(
      "sceneQualityController.setDepthOfFieldBokehMultiplier",
    );
    expect(registrySource).toContain(
      "sceneQualityController.setDepthOfFieldResolutionScale",
    );
    expect(diagnosticsSource).toContain(
      "sceneQualityController.resetDepthOfField",
    );
    expect(registrySource).toContain("Remember slow travel frames");
    expect(registrySource).toContain("Balance dense meadow tiles");
    expect(registrySource).toContain("Suspend settled hover work");
    expect(diagnosticsSource).toContain("Enable all optimizations");
    expect(diagnosticsSource).toContain("Disable all optimizations");
  });

  it("offers a scene-scoped first-visit reset from Render settings", () => {
    expect(diagnosticsSource).toContain("Reset scene to first visit");
    expect(diagnosticsSource).toContain("clearSceneFirstVisitStorage");
    expect(diagnosticsSource).toContain("sceneFirstVisitUrl");
    expect(diagnosticsSource).toContain("window.location.reload()");
    expect(diagnosticsSource).toContain("window.location.replace(cleanUrl)");
  });

  it("opts the portaled diagnostics drawer out of world-scroll capture", () => {
    const drawerStart = diagnosticsSource.indexOf(
      'id="stacks-scene-diagnostics"',
    );
    const drawerEnd = diagnosticsSource.indexOf(">", drawerStart);
    const drawerOpeningTag = diagnosticsSource.slice(drawerStart, drawerEnd);

    expect(drawerStart).toBeGreaterThanOrEqual(0);
    expect(drawerOpeningTag).toContain("data-stacks-scrollable");
  });
});

describe("production diagnostics activation", () => {
  it("keeps a safe H listener in the always-loaded chrome", () => {
    expect(chromeSource).toContain('import("./SceneDiagnostics")');
    expect(chromeSource).toContain('event.key !== "`"');
    expect(chromeSource).toContain("isEditableShortcutTarget(event.target)");
    expect(chromeSource).toContain(
      "<Diagnostics initiallyOpen={request.initiallyOpen} />",
    );
  });

  it("loads the cheap HUD by default in development without starting instrumentation", () => {
    const requestInitializer = chromeSource.slice(
      chromeSource.indexOf("const [request, setRequest]"),
      chromeSource.indexOf("const [Diagnostics, setDiagnostics]"),
    );

    expect(requestInitializer).toContain(
      'process.env.NODE_ENV === "development"',
    );
    expect(requestInitializer).toContain("initiallyOpen: false");
    expect(requestInitializer).not.toContain("requestDevHooks()");
    expect(chromeSource).toContain("requestSceneHooks()");
    expect(canvasSource).toContain("onSceneHooksRequested(() => {");
    expect(canvasSource).toContain("installDevHooks();");
    expect(diagnosticsSource).toContain("requestDevHooks()");
  });

  it("offers a hidden mobile entry point without rendering a control", () => {
    expect(chromeSource).toContain(
      "sceneDiagnosticsQueryMode(window.location.search)",
    );
    expect(chromeSource).toContain('queryMode === "debug"');
    expect(chromeSource).toContain("setRequest({ initiallyOpen: true })");
  });

  it("loads a production HUD without requesting expensive scene probes", () => {
    const hudBranch = chromeSource.slice(
      chromeSource.indexOf('if (queryMode === "hud" && request === null)'),
      chromeSource.indexOf("if (request) return"),
    );

    expect(hudBranch).toContain("setRequest({ initiallyOpen: false })");
    expect(hudBranch).not.toContain("requestDevHooks()");
  });

  it("does not production-gate the diagnostics loader", () => {
    expect(chromeSource).toContain("<SceneDiagnosticsLoader />");
    expect(chromeSource).not.toContain(
      'process.env.NODE_ENV === "development" ? (\n            <SceneDiagnostics',
    );
  });
});

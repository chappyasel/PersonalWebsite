import fs from "node:fs";
import { describe, expect, it } from "vitest";

const diagnosticsSource = fs.readFileSync(
  new URL("./SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);
const chromeSource = fs.readFileSync(
  new URL("./ChromeLayer.tsx", import.meta.url),
  "utf8",
);

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
    expect(diagnosticsSource).toContain("sceneDebugOverlayPatches");
  });

  it("organizes the console by diagnostic intent", () => {
    expect(diagnosticsSource).toContain("type DiagnosticsPanel =");
    expect(diagnosticsSource).toContain('"overview"');
    expect(diagnosticsSource).toContain('"render"');
    expect(diagnosticsSource).toContain('"simulate"');
    expect(diagnosticsSource).toContain('"inspect"');
    expect(diagnosticsSource).toContain("Scene health");
    expect(diagnosticsSource).toContain("Scene overlays");
    expect(diagnosticsSource).toContain("Authored camera depth");
    expect(diagnosticsSource).toContain("Meadow wind");
    expect(diagnosticsSource).toContain("Insect behavior");
    expect(diagnosticsSource).toContain("Physics runtime");
    expect(diagnosticsSource).toContain("Scene quality");
    expect(diagnosticsSource).toContain("Rendering experiments");
    expect(diagnosticsSource).toContain("Policy internals");
    expect(diagnosticsSource).toContain('role="tabpanel"');
  });

  it("uses fixed-width live chrome so changing metrics cannot shift layout", () => {
    expect(diagnosticsSource).toContain("inline-size: 240px");
    expect(diagnosticsSource).toContain("min-inline-size: 240px");
    expect(diagnosticsSource).toContain("max-inline-size: 240px");
    expect(diagnosticsSource).toContain("text-overflow: ellipsis");
    expect(diagnosticsSource).not.toContain("min-width: max-content");
  });

  it("uses the HUD as the only console trigger with a safe D shortcut", () => {
    expect(diagnosticsSource).toContain("<DevPerformanceHud");
    expect(diagnosticsSource).toContain('aria-keyshortcuts="d"');
    expect(diagnosticsSource).toContain('event.key.toLowerCase() !== "d"');
    expect(diagnosticsSource).toContain(
      "isEditableShortcutTarget(event.target)",
    );
    expect(diagnosticsSource).not.toContain("stacks-perch-hud");
  });

  it("renders declarative semantic HUD segments", () => {
    expect(diagnosticsSource).toContain("createDevHudRows(snapshot)");
    expect(diagnosticsSource).toContain("data-tone={segment.tone");
    expect(diagnosticsSource).toContain("data-emphasis={segment.emphasis");
    expect(diagnosticsSource).toContain('[data-tone="positive"]');
    expect(diagnosticsSource).toContain('[data-tone="warning"]');
    expect(diagnosticsSource).toContain('[data-tone="danger"]');
  });

  it("exposes adaptive quality controls and the full live policy status", () => {
    expect(diagnosticsSource).toContain("Quality policy");
    expect(diagnosticsSource).toContain(
      '<option value="cinematic">Cinematic</option>',
    );
    expect(diagnosticsSource).toContain("Freeze Auto adaptation");
    expect(diagnosticsSource).toContain("Reset learned profile");
    expect(diagnosticsSource).toContain("Effective");
    expect(diagnosticsSource).toContain("cooldownRemainingMs");
    expect(diagnosticsSource).toContain("storageBucket");
    expect(diagnosticsSource).toContain("fallbackStatus");
    expect(diagnosticsSource).toContain("custom overrides");
    expect(diagnosticsSource).toContain(': "Auto"');
    expect(diagnosticsSource).not.toContain(
      "runtime.forcedProfile ?? runtime.plan.profile",
    );
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

  it("edits the live meadow wind strength and animation speed", () => {
    expect(diagnosticsSource).toContain(
      "meadowDiagnosticsController.subscribe",
    );
    expect(diagnosticsSource).toContain('id="stacks-wind-strength"');
    expect(diagnosticsSource).toContain('id="stacks-wind-live"');
    expect(diagnosticsSource).toContain('id="stacks-wind-speed"');
    expect(diagnosticsSource).toContain("meadowDiagnosticsController.update");
    expect(diagnosticsSource).toContain("Reset wind");
  });

  it("toggles authored camera depth from the Simulate view", () => {
    expect(diagnosticsSource).toContain(
      "cameraDepthDiagnosticsController.subscribe",
    );
    expect(diagnosticsSource).toContain(
      "cameraDepthDiagnosticsController.setEnabled",
    );
    expect(diagnosticsSource).toContain("Authored camera depth");
    expect(diagnosticsSource).toContain("Changes apply on the next frame");
  });

  it("exposes every negligible-impact optimization as an independent control", () => {
    expect(diagnosticsSource).toContain("Suspend settled distant props");
    expect(diagnosticsSource).toContain("Pause prewarming during travel");
    expect(diagnosticsSource).toContain("Limit real lights to nearby shelves");
    expect(diagnosticsSource).toContain("Simplify far-grass shader");
    expect(diagnosticsSource).toContain("Opaque paper");
    expect(diagnosticsSource).toContain("Native live blur");
    expect(diagnosticsSource).toContain("Aperture only");
    expect(diagnosticsSource).toContain("Analytic halo");
    expect(diagnosticsSource).toContain("Legacy sprites");
    expect(diagnosticsSource).toContain("Use effective DPR rungs");
    expect(diagnosticsSource).toContain("Skip ambient occlusion");
    expect(diagnosticsSource).toContain("Skip bloom");
    expect(diagnosticsSource).toContain("Skip depth of field");
    expect(diagnosticsSource).toContain("Remember slow travel frames");
    expect(diagnosticsSource).toContain("Balance dense meadow tiles");
    expect(diagnosticsSource).toContain("Suspend settled hover work");
    expect(diagnosticsSource).toContain("Enable all optimizations");
    expect(diagnosticsSource).toContain("Disable all optimizations");
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
  it("keeps a safe D listener in the always-loaded chrome", () => {
    expect(chromeSource).toContain('import("./SceneDiagnostics")');
    expect(chromeSource).toContain('event.key.toLowerCase() !== "d"');
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
    expect(diagnosticsSource).toContain("requestDevHooks()");
  });

  it("offers a hidden mobile entry point without rendering a control", () => {
    expect(chromeSource).toContain(
      'new URLSearchParams(window.location.search).get("debug") === "1"',
    );
    expect(chromeSource).toContain("setRequest({ initiallyOpen: true })");
  });

  it("does not production-gate the diagnostics loader", () => {
    expect(chromeSource).toContain("<SceneDiagnosticsLoader />");
    expect(chromeSource).not.toContain(
      'process.env.NODE_ENV === "development" ? (\n            <SceneDiagnostics',
    );
  });
});

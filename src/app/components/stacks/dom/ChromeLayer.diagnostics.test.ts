import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./ChromeLayer.tsx", import.meta.url),
  "utf8",
);

describe("development diagnostics chrome", () => {
  it("uses one diagnostics drawer instead of separate perch and physics drawers", () => {
    expect(source).toContain("function DevDiagnosticsHud");
    expect(source).not.toContain("function DevPerchHud");
    expect(source).not.toContain("function DevPhysicsHud");
    expect(source).toContain("Perches");
    expect(source).toContain("Physics");
  });

  it("keeps overlay controls inside the Inspect view", () => {
    expect(source).toContain("Show all overlays");
    expect(source).toContain("Hide all overlays");
    expect(source).not.toContain("stacks-debug-quick");
    expect(source).toContain("sceneDebugOverlayPatches");
  });

  it("organizes the console by diagnostic intent", () => {
    expect(source).toContain("type DiagnosticsPanel =");
    expect(source).toContain('"overview"');
    expect(source).toContain('"render"');
    expect(source).toContain('"simulate"');
    expect(source).toContain('"inspect"');
    expect(source).toContain("Scene health");
    expect(source).toContain("Scene overlays");
    expect(source).toContain("Meadow wind");
    expect(source).toContain("Insect behavior");
    expect(source).toContain("Physics runtime");
    expect(source).toContain("Scene quality");
    expect(source).toContain("Rendering experiments");
    expect(source).toContain("Policy internals");
    expect(source).toContain('role="tabpanel"');
  });

  it("uses fixed-width live chrome so changing metrics cannot shift layout", () => {
    expect(source).toContain("inline-size: 240px");
    expect(source).toContain("min-inline-size: 240px");
    expect(source).toContain("max-inline-size: 240px");
    expect(source).toContain("text-overflow: ellipsis");
    expect(source).not.toContain("min-width: max-content");
  });

  it("uses the HUD as the only console trigger with a safe D shortcut", () => {
    expect(source).toContain("<DevPerformanceHud");
    expect(source).toContain('aria-keyshortcuts="d"');
    expect(source).toContain('event.key.toLowerCase() !== "d"');
    expect(source).toContain("isEditableShortcutTarget(event.target)");
    expect(source).not.toContain("stacks-perch-hud");
  });

  it("renders declarative semantic HUD segments", () => {
    expect(source).toContain("createDevHudRows(snapshot)");
    expect(source).toContain("data-tone={segment.tone");
    expect(source).toContain("data-emphasis={segment.emphasis");
    expect(source).toContain('[data-tone="positive"]');
    expect(source).toContain('[data-tone="warning"]');
    expect(source).toContain('[data-tone="danger"]');
  });

  it("exposes adaptive quality controls and the full live policy status", () => {
    expect(source).toContain("Quality policy");
    expect(source).toContain('<option value="cinematic">Cinematic</option>');
    expect(source).toContain("Freeze Auto adaptation");
    expect(source).toContain("Reset learned profile");
    expect(source).toContain("Effective");
    expect(source).toContain("cooldownRemainingMs");
    expect(source).toContain("storageBucket");
    expect(source).toContain("fallbackStatus");
    expect(source).toContain("custom overrides");
  });

  it("keeps the compact HUD focused on policy decisions and their visual cost", () => {
    expect(source).toContain("targetFrameMs");
    expect(source).toContain("droppedFrameRatio");
    expect(source).toContain("pixelBudget");
    expect(source).toContain("bloomLevels");
    expect(source).toContain("ambientOcclusionHalfRes");
    expect(source).toContain("depthOfFieldResolutionScale");
    expect(source).toContain("createDevHudRows(snapshot)");
    expect(source).not.toContain("ms p50/p95");
    expect(source).not.toContain("snapshot.framebuffer");
  });

  it("captures an attributable stationary-versus-travel performance trace", () => {
    expect(source).toContain("function PerformanceTraceControls");
    expect(source).toContain("Performance trace");
    expect(source).toContain("Start capture");
    expect(source).toContain("Download JSON");
    expect(source).toContain("report.summary.settled.frameMs.p95");
    expect(source).toContain("report.summary.travel.frameMs.p95");
    expect(source).toContain("report.summary.travelToSettledP95Ratio");
    expect(source).toContain("strongestSignals");
  });

  it("edits the live meadow wind strength and animation speed", () => {
    expect(source).toContain("meadowDiagnosticsController.subscribe");
    expect(source).toContain('id="stacks-wind-strength"');
    expect(source).toContain('id="stacks-wind-live"');
    expect(source).toContain('id="stacks-wind-speed"');
    expect(source).toContain("meadowDiagnosticsController.update");
    expect(source).toContain("Reset wind");
  });

  it("exposes every negligible-impact optimization as an independent control", () => {
    expect(source).toContain("Suspend settled distant props");
    expect(source).toContain("Pause prewarming during travel");
    expect(source).toContain("Limit real lights to nearby shelves");
    expect(source).toContain("Simplify far-grass shader");
    expect(source).toContain("Sampled scene glass");
    expect(source).toContain("Native live blur");
    expect(source).toContain("Flat tint");
    expect(source).toContain("Aperture only");
    expect(source).toContain("Analytic halo");
    expect(source).toContain("Legacy sprites");
    expect(source).toContain("Use effective DPR rungs");
    expect(source).toContain("Skip ambient occlusion");
    expect(source).toContain("Skip bloom");
    expect(source).toContain("Skip depth of field");
    expect(source).toContain("Remember slow travel frames");
    expect(source).toContain("Balance dense meadow tiles");
    expect(source).toContain("Suspend settled hover work");
    expect(source).toContain("Enable all optimizations");
    expect(source).toContain("Disable all optimizations");
  });

  it("opts the portaled diagnostics drawer out of world-scroll capture", () => {
    const drawerStart = source.indexOf('id="stacks-scene-diagnostics"');
    const drawerEnd = source.indexOf(">", drawerStart);
    const drawerOpeningTag = source.slice(drawerStart, drawerEnd);

    expect(drawerStart).toBeGreaterThanOrEqual(0);
    expect(drawerOpeningTag).toContain("data-stacks-scrollable");
  });
});

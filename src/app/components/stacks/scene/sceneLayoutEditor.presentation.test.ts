import fs from "node:fs";
import { describe, expect, it } from "vitest";

const grabbableSource = fs.readFileSync(
  new URL("./Grabbable.tsx", import.meta.url),
  "utf8",
);
const canvasSource = fs.readFileSync(
  new URL("../StacksCanvas.tsx", import.meta.url),
  "utf8",
);
const diagnosticsSource = fs.readFileSync(
  new URL("../dom/SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);
const gizmoSource = fs.readFileSync(
  new URL("./SceneLayoutEditorGizmo.tsx", import.meta.url),
  "utf8",
);
const aboutSource = fs.readFileSync(
  new URL("./units/UnitAbout.tsx", import.meta.url),
  "utf8",
);
const editorSource = fs.readFileSync(
  new URL("./sceneLayoutEditor.ts", import.meta.url),
  "utf8",
);
const draftRouteSource = fs.readFileSync(
  new URL("../../../api/stacks-layout-draft/route.ts", import.meta.url),
  "utf8",
);

describe("scene layout editor presentation", () => {
  it("gives the editor sole ownership of an edited prop and its shadow", () => {
    expect(grabbableSource).toContain(
      "sceneLayoutEditorController.positionFor(hoverKey)",
    );
    expect(grabbableSource).toContain(
      "sceneLayoutEditorController.rotationFor(hoverKey)",
    );
    expect(grabbableSource).toContain(
      "sceneLayoutEditorController.scaleFor(hoverKey)",
    );
    expect(grabbableSource).toContain("g.position.fromArray(layoutPosition)");
    expect(grabbableSource).toContain(
      "s.position.set(g.position.x, base[1] + 0.02, g.position.z + 0.02)",
    );
    expect(grabbableSource).toContain(
      "if (sceneLayoutEditorController.owns(hoverKey)) return false",
    );
    expect(grabbableSource).toContain(
      "sceneLayoutEditorController.select(hoverKey)",
    );
  });

  it("mounts dev-only controls and exposes a stable snapshot hook", () => {
    expect(canvasSource).toContain("<SceneLayoutEditorGizmo />");
    expect(canvasSource).toContain(
      "window.__stacks.layout = () => sceneLayoutEditorController.export()",
    );
    expect(diagnosticsSource).toContain("Enable layout editing");
    expect(diagnosticsSource).toContain("Copy layout snapshot");
    expect(diagnosticsSource).toContain("Page Up/Down for height");
    expect(diagnosticsSource).toContain("Move, rotate, and scale");
    expect(diagnosticsSource).toContain("Uniform scale");
    expect(diagnosticsSource).toContain("⌘Z undo");
    expect(gizmoSource).toContain("<PivotControls");
    expect(gizmoSource.match(/<PivotControls/g)).toHaveLength(2);
    expect(gizmoSource).toContain("const GIZMO_SIZE = 108");
    expect(gizmoSource).not.toContain("scale={0.72}");
    expect(gizmoSource).toContain("const GIZMO_OPACITY = 0.4");
    expect(gizmoSource.match(/scale=\{GIZMO_SIZE\}/g)).toHaveLength(3);
    expect(gizmoSource.match(/opacity=\{GIZMO_OPACITY\}/g)).toHaveLength(2);
    expect(gizmoSource).toContain("const ALIGNMENT_GUIDE_EXTENT = 10_000");
    expect(gizmoSource).toContain("const ROTATION_GUIDE_RADIUS = 0.65");
    expect(gizmoSource).toContain("const PLANE_GRID_STEP = 0.25");
    expect(gizmoSource).toContain("hoveredControl(directionControls.current)");
    expect(gizmoSource).toContain(
      "points={ALIGNMENT_GUIDE_POINTS[activeHoverGuide.axis]}",
    );
    expect(gizmoSource).toContain(
      "points={ROTATION_GUIDE_POINTS[activeHoverGuide.axis]}",
    );
    expect(gizmoSource).toContain(
      "points={PLANE_GRID_POINTS[activeHoverGuide.axis]}",
    );
    expect(gizmoSource).toContain('<ScreenSizer scale={GIZMO_SIZE}>');
    expect(gizmoSource).toContain("segments");
    expect(gizmoSource).toContain("raycast={() => null}");
    expect(gizmoSource).toContain("disableScaling");
    expect(gizmoSource).toContain("activeAxes={[true, false, false]}");
    expect(gizmoSource).not.toContain("mode={snapshot.mode}");
  });

  it("registers every movable prop and keeps friendly About labels", () => {
    expect(aboutSource.match(/layoutLabel="About ·/g)).toHaveLength(8);
    expect(grabbableSource).toContain(
      "layoutLabel ?? defaultLayoutEditorLabel(hoverKey, unitIndex)",
    );
    expect(grabbableSource).not.toContain(
      'process.env.NODE_ENV !== "development" || !layoutLabel',
    );
  });

  it("autosaves an atomic development handoff without restoring it", () => {
    expect(editorSource).toContain(
      "sceneLayoutEditorController.subscribe(schedule)",
    );
    expect(editorSource).toContain("navigator.sendBeacon(");
    expect(editorSource).toContain(
      "window.__stacksLayoutDraftAutosaveCleanup = () => {\n    flush();",
    );
    expect(editorSource).toContain("if (!draftWriteEligible) return");
    expect(draftRouteSource).toContain(
      'process.env.NODE_ENV !== "development"',
    );
    expect(draftRouteSource).toContain('"stacks-layout-draft.json"');
    expect(draftRouteSource).toContain("await rename(temporary, destination)");
    expect(editorSource).not.toContain("restoreSceneLayoutDraft");
  });
});

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
    expect(diagnosticsSource).toContain('label="Page Up or Page Down"');
    expect(diagnosticsSource).toContain("move Y");
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
    expect(gizmoSource).toContain("<ScreenSizer scale={GIZMO_SIZE}>");
    expect(gizmoSource).toContain("segments");
    expect(gizmoSource).toContain("raycast={() => null}");
    expect(gizmoSource).toContain("disableScaling");
    expect(gizmoSource).toContain("activeAxes={[true, false, false]}");
    expect(gizmoSource).not.toContain("mode={snapshot.mode}");
  });

  it("draws the gizmo in the selected prop's parent space, not the scene's", () => {
    // The gizmo is mounted at the Canvas root while the props it edits hang
    // under their units, and Systems' unit sits at world x 13.2. Handing
    // PivotControls the prop's LOCAL matrix with nothing between it and the
    // scene drew the whole gizmo at that local translation read as a world
    // position — measured once at [-0.855, 0, -0.18] for a prop that was
    // actually at [12.373, -0.843, -0.831]. Selection, nudging and export all
    // kept working, so the only symptom was an affordance that never appeared
    // and a drag that could not be started.
    expect(canvasSource).toContain("<SceneLayoutEditorGizmo />");
    expect(gizmoSource).toContain(
      "<group ref={propParentFrame} matrixAutoUpdate={false}>",
    );
    expect(gizmoSource).toContain("frame.matrix.copy(parent.matrixWorld)");
    // The matrix fed to the controls stays LOCAL on purpose: drei reports drag
    // results relative to its own outer group, so the frame above is what puts
    // both directions in the space `updateTransform` writes back to.
    expect(gizmoSource).toContain("matrix={root.matrix}");
    expect(gizmoSource).not.toContain("matrix={root.matrixWorld}");
  });

  it("marks the selected prop on its shade, in the editor's own branch", () => {
    // WHERE the cue is written is the load-bearing part, and the thing a
    // refactor would break silently.
    //
    // It cannot live in the reaction path. `owns()` is true the moment a prop
    // is selected, so Grabbable's editor branch claims the prop and RETURNS
    // before any reaction code runs — measured on the page, after selecting a
    // prop `propReactionIsEngaged` was never called for it again. Free roam
    // suppressing reactions wholesale (`setPropReactionsSuppressed(true)`,
    // plus `store.setHovered` nulling itself while that holds) is a second
    // wall behind the first, and this placement clears both.
    //
    // And it is the SHADE, not the prop. This tool edits position, rotation
    // and scale; a cue written into any of the three is a value that
    // disagrees with the gizmo and with the exported record. The footprint is
    // the one channel it does not edit.
    const branch = grabbableSource.slice(
      grabbableSource.indexOf("if (layoutPosition) {"),
      grabbableSource.indexOf("const shelf: ScenePhysicsWorld | null"),
    );
    expect(branch).toContain(
      "sceneLayoutEditorController.getSnapshot().selectedId === hoverKey",
    );
    expect(branch).toContain("SELECTED_SHADE_OPACITY");
    expect(branch).toContain("SELECTED_SHADE_WIDTH");
    // The prop's own three channels stay neutral in this branch. An earlier
    // pass put the cue on `n.scale`; that is the residue this guards against.
    expect(branch).toContain("n.position.set(0, 0, 0)");
    expect(branch).toContain("n.rotation.set(0, 0, 0)");
    expect(branch).toContain("n.scale.setScalar(1)");
    expect(grabbableSource).not.toContain("LAYOUT_SELECTED_SCALE");
    // Brightness and size only. The sprite takes `shadeColor` from the unit
    // palette, and a selection that shifted hue would put a colour in the
    // room that the room does not have.
    expect(branch).not.toMatch(/s\.material\.color/);
    // The reaction gate stays untouched by the editor, in both directions.
    expect(editorSource).not.toContain("reactionEngagement");
  });

  it("makes an editor pose the prop's resting pose outside free roam", () => {
    // The whole point of the tool is looking at a new arrangement the way a
    // visitor sees it, so the override has to reach the paths that decide
    // where a prop lives when nothing is touching it: React's own transforms,
    // the physics home, the settle landing, and the homing damp. An earlier
    // version restored the authored numbers on exit, which meant the docked
    // view could never show the layout being evaluated.
    expect(grabbableSource).toContain("base: authoredBase,");
    expect(grabbableSource).toContain(
      "const layoutOverride = useSceneLayoutOverride(hoverKey)",
    );
    expect(grabbableSource).toContain(
      "sceneLayoutEditorController.overrideFor",
    );
    expect(grabbableSource).toContain("scale={restScale}");
    // Registration keeps reporting the AUTHORED numbers, so exported deltas
    // stay measured against the source however many times a prop has moved.
    expect(grabbableSource).toContain("const layoutBaseX = authoredBase[0]");
    expect(grabbableSource).toContain(
      "authored: [layoutBaseX, layoutBaseY, layoutBaseZ]",
    );
    // Rest rotation is no longer assumed to be identity anywhere.
    expect(grabbableSource).not.toContain("g.quaternion.identity()");
    expect(grabbableSource).not.toContain("g.rotation.set(0, 0, 0)");
    expect(
      grabbableSource.match(
        /g\.rotation\.set\(restRotationX, restRotationY, restRotationZ\)/g,
      ),
    ).toHaveLength(3);
    // And leaving the editor stops driving props without moving them.
    expect(editorSource).not.toContain("applyAuthoredRootTransform");
  });

  it("gives the gizmo's handles priority over anything in front of them", () => {
    // r3f walks intersections in distance order and stops at the first
    // handler that calls stopPropagation. Both sides here do, so a prop
    // standing between the camera and an arrow silently ate every press
    // aimed at that arrow: measured on the Systems shelf, a press at
    // 1465,726 selected `pills:organizer:front-lower` while the gizmo for
    // `back-lower` was drawn across that exact pixel.
    expect(gizmoSource).toContain("promoteGizmoIntersections");
    expect(gizmoSource).toContain("setEvents({");
    expect(gizmoSource).toContain("setEvents({ filter: undefined })");
    // Drawing on top is only half of it, and was already true.
    expect(gizmoSource.match(/depthTest=\{false\}/g)?.length).toBeGreaterThan(
      1,
    );
  });

  it("registers every movable prop and keeps friendly About labels", () => {
    // Eight authored props plus screenshot mode's Macintosh, which stands in
    // for the portrait only while that mode is on but is a movable prop then.
    expect(aboutSource.match(/layoutLabel="About ·/g)).toHaveLength(9);
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

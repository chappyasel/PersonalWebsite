import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  fs.readFileSync(new URL(relative, import.meta.url), "utf8");

const bridges = read("./ScrollBridges.tsx");
const touchLayer = read("./TouchInteractionLayer.tsx");
const canvas = read("../StacksCanvas.tsx");
const home = read("../StacksHome.tsx");
const grabbable = read("../scene/Grabbable.tsx");
const links = read("../scene/links.tsx");
const eggs = read("../scene/eggs.tsx");
const environment = read("../scene/SceneEnvironment.tsx");
const scene = read("../scene/Scene.tsx");
const meadow = read("../scene/Meadow.tsx");
const store = read("../store.ts");
const sheet = read("../dom/PlacardLayer.tsx");
const rail = read("../dom/UnitRail.tsx");
const globals = read("../../../../styles/globals.css");
const tapFirstCapability = read("../../../../lib/useTapFirstCapability.ts");
const scenePointerEvents = read("./scenePointerEvents.ts");
const golf = read("../scene/golf/GolfExperience.tsx");
const golfBall = read("../scene/golf/GolfBallProp.tsx");

describe("coarse-pointer ownership", () => {
  it("has no vertical-to-horizontal Touch Events bridge", () => {
    expect(bridges).not.toContain('addEventListener("touchmove"');
    expect(bridges).toContain('touchAction = "pan-x"');
  });

  it("reserves a two-finger carry gesture for prop depth", () => {
    expect(canvas).toContain('touchAction: "pan-x"');
    expect(touchLayer).toContain("startDepthGesture(");
    expect(touchLayer).toContain("moveDepthGesture(");
    expect(touchLayer).toContain("finishDepthGesture();");
    expect(touchLayer).toContain("secondaryPointerId");
    expect(grabbable).toContain("heldDepthFromPinch(");
  });

  it("uses a background pinch for visitor-controlled world zoom", () => {
    expect(touchLayer).toContain("startWorldPinch(");
    expect(touchLayer).toContain("updateWorldPinch();");
    expect(touchLayer).toContain("worldZoomFromPinch(");
  });

  it("separates narrow presentation from pointer behavior and material", () => {
    expect(tapFirstCapability).toContain(
      '"(hover: none) and (pointer: coarse)"',
    );
    expect(tapFirstCapability).not.toContain("width < 1200px");
    expect(bridges).toContain("A wheel or trackpad is fine-pointer intent");
    expect(bridges).not.toContain("window.innerWidth < 1200");
    expect(bridges).not.toContain("touchWorldRef.zoomOffset - wheelDeltaPx");
    expect(sheet).toContain("useTapFirstCapability()");
    expect(sheet).toContain("performanceSettings.placardGlassMode");
    expect(sheet).toContain('className="min-[1200px]:hidden"');
    expect(sheet).toContain("min-[1200px]:block");
    expect(rail).toContain("useTapFirstCapability()");
  });

  it("routes touch through one arbiter instead of legacy activators", () => {
    expect(touchLayer).toContain("reduceTouchGesture");
    expect(touchLayer).toContain("runSceneInteractionActivation");
    expect(touchLayer).toContain(
      'touchWorldRef.interactionPointerType = "touch"',
    );
    expect(touchLayer).toContain(
      'addEventListener("lostpointercapture", onPointerCancel',
    );
    expect(grabbable).toContain('if (event.pointerType === "touch") return;');
    expect(links).toContain('if (e.pointerType === "touch")');
    expect(eggs).toContain('pointerType?: string }).pointerType === "touch"');
    expect(environment).toContain('if (e.pointerType === "touch")');
  });

  it("routes opt-in first-touch actions through the coarse-touch arbiter", () => {
    expect(eggs).toContain("activateOnFirstTouch,");
    expect(touchLayer).toContain(
      "activateOnFirstTouch: Boolean(spec.activateOnFirstTouch)",
    );
  });

  it("stands up from a seated touch before a shelf Halo can claim it", () => {
    expect(touchLayer).toContain(
      'import { isSeated, leaveSeat } from "../scene/seated"',
    );
    expect(touchLayer).toMatch(
      /const onPointerDown = \(event: PointerEvent\)[\s\S]*?if \(isSeated\(\)\) \{[\s\S]*?leaveSeat\(\);[\s\S]*?return;[\s\S]*?const hit = touchHitAt/,
    );
  });

  it("hits Golf balls and the club on the first stationary touch", () => {
    expect(golf).toMatch(
      /id: "golf-club:strike",[\s\S]*?activateOnFirstTouch: true,[\s\S]*?activation:/,
    );
    // The balls are Grabbables now; the prop opts into the first-touch
    // arbiter and the selected bay claims the tap through `hittable`.
    expect(golfBall).toMatch(
      /hoverKey=\{`golf-ball:\$\{id\}`\}[\s\S]*?activateOnFirstTouch[\s\S]*?hittable=\{\{[\s\S]*?radius: GOLF_BALL_RADIUS,[\s\S]*?golf: true,[\s\S]*?bayUnitIndex/,
    );
    // A hittable ball registers no activation, so both halves of the claim
    // are load-bearing: the arbiter must treat it as activatable, and the
    // activate effect must offer the tap to the bay when the registry
    // declines. A declined tap degrades to Touch Focus, not to nothing.
    expect(touchLayer).toContain(
      "activatable: Boolean(spec.activation) || isHittableBall(hit.id)",
    );
    expect(touchLayer).toMatch(
      /!runSceneInteractionActivation\(effect\.interactionId\) &&\s*!tapHittableBall\(effect\.interactionId\)/,
    );
  });

  it("claims a prop touch before the browser can turn its first move into native travel", () => {
    expect(touchLayer).toMatch(
      /const onTouchStart = \(event: TouchEvent\)[\s\S]*?touchHitAt\([\s\S]*?event\.preventDefault\(\)/,
    );
    expect(touchLayer).toContain(
      'addEventListener("touchstart", onTouchStart, {',
    );
    expect(touchLayer).toMatch(
      /addEventListener\("touchstart", onTouchStart, \{[\s\S]*?passive: false/,
    );
  });

  it("keeps the touch arbiter in the lazy canvas bundle", () => {
    expect(home).not.toContain("TouchInteractionLayer");
    expect(canvas).toContain(
      'import TouchInteractionLayer from "./input/TouchInteractionLayer"',
    );
    expect(canvas.match(/<TouchInteractionLayer \/>/g) ?? []).toHaveLength(1);
  });

  it("skips scene-wide hover raycasts for coarse touch moves", () => {
    expect(canvas).toContain("scenePointerMoveWithoutCoarseHover");
    expect(scenePointerEvents).toContain("shouldSkipSceneHoverRaycast");
    expect(scenePointerEvents).toContain(
      'event as PointerEvent).pointerType === "touch"',
    );
    expect(canvas).toContain("events={pointerEvents}");
  });

  it("does not cover the world with discovery-copy pills", () => {
    expect(touchLayer).not.toContain("Swipe sideways to travel");
    expect(touchLayer).not.toContain("Pull the sheet up to read");
    expect(touchLayer).not.toContain("Tap to focus · hold to carry");
  });

  it("does not let Golf near-misses activate an underlying unit plane", () => {
    expect(scene).toContain("if (state.golfFocused) return;");
  });

  it("publishes touch taps and drags through the meadow's desktop motion path", () => {
    expect(touchLayer).toContain("meadowPulseRevision");
    expect(store).toContain("meadowPulseRevision");
    expect(meadow).toContain("handledTouchPulseRevision");
    expect(meadow).toContain("touchWorldRef.wakeStrength");
    expect(meadow).not.toContain("if (!finePointer) return;");
  });

  it("keeps horizontal sheet navigation owned by the sheet", () => {
    expect(sheet).toContain("mobileSheetHorizontalSwipeIntent(");
    expect(sheet).toContain("swipeToAdjacentUnit");
    expect(sheet).toContain("if (direction) swipeToAdjacentUnit(direction)");
  });

  it("keeps WebKit touch callouts and selection off gesture surfaces", () => {
    expect(globals).toMatch(
      /\.stacks-canvas-shell \{[\s\S]*?-webkit-touch-callout: none;[\s\S]*?-webkit-user-select: none;/,
    );
    expect(globals).toMatch(
      /\.stacks-canvas-shell canvas \{[\s\S]*?-webkit-touch-callout: none;[\s\S]*?-webkit-user-select: none;/,
    );
    expect(sheet).toMatch(
      /\[data-stacks-mobile-panel\] \[data-tilt-card-interactive\] \*[\s\S]*?-webkit-touch-callout: none;[\s\S]*?-webkit-user-select: none !important;/,
    );
    expect(canvas).toContain(
      'shell.addEventListener("selectstart", preventNativeSelection)',
    );
    expect(canvas).toContain(
      'shell.addEventListener("contextmenu", preventNativeSelection)',
    );
    expect(sheet).toContain(
      'panel.addEventListener("selectstart", onSelectStart)',
    );
    expect(sheet).toContain(
      'panel.addEventListener("contextmenu", onContextMenu)',
    );
    expect(rail).toMatch(
      /\.stacks-unit-rail-mobile \*[\s\S]*?-webkit-touch-callout: none;[\s\S]*?-webkit-user-select: none;/,
    );
    expect(rail).toContain(
      'rail.addEventListener("selectstart", preventNativeSelection)',
    );
    expect(rail).toContain(
      'rail.addEventListener("dblclick", preventNativeSelection)',
    );
    expect(globals).toMatch(
      /html\[data-world\] \.stacks-world-shell \*[\s\S]*?-webkit-user-select: none !important;/,
    );
    expect(globals).toMatch(
      /html\[data-world\] \.placard-scroll \*[\s\S]*?-webkit-user-select: text !important;/,
    );
    expect(globals).not.toContain("html[data-world] body *");
    expect(home).toContain("selectionAllowedForGesture");
    expect(home).toContain("selectableElementFor(selection.anchorNode)");
    // Chrome hides an input's caret from window.getSelection(), so the node
    // checks alone would let clearSelection collapse a focused text field's
    // caret to 0 between keystrokes — the bug that corrupted Universal
    // Search typing. The clearer must also yield to a focused editable.
    expect(home).toContain("selectableElementFor(document.activeElement)");
    expect(home).toContain("[data-book-modal-shell]");
    // The intercepted-route sheet (routine, manual, an exercise page) mounts
    // over the live world with the same guard active. It is matched by its
    // scroller because expand strips the data-modal-sheet attribute.
    expect(home).toContain("[data-modal-scroller]");
    expect(home).toContain(
      'document.addEventListener("selectionchange", clearSelection)',
    );
    expect(home).toContain(
      'world.addEventListener("touchstart", onTouchStart, { passive: false })',
    );
  });

  it("keeps every mobile Unit directly tappable while retaining row scrubbing", () => {
    expect(rail).toContain("aria-label={railLabel}");
    expect(rail).toContain("go(i);");
    expect(rail).not.toContain("aria-expanded={mapExpanded}");
    expect(rail).toContain('touchAction: "pan-y pinch-zoom"');
    expect(rail).toContain("setUnitMapPreview(preview)");
  });
});

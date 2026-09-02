import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  fs.readFileSync(new URL(relative, import.meta.url), "utf8");

describe("Vision ride integration", () => {
  it("registers a drag-arbitrated scene action with hover-only preload", () => {
    const about = read("../scene/units/UnitAbout.tsx");
    expect(about).toContain('hoverKey="action:about:vision-ride"');
    expect(about).toContain("onTap={() => void activateVisionRide()}");
    expect(about).toContain("onHoverIntent={() => void preloadVisionRide()}");
    expect(about).toContain('actionLabel="Put on Apple Vision Pro"');
    expect(about).toContain("bayUnitIndex: GOLF_UNIT_INDEX");
    expect(about).not.toContain(
      'href="https://www.apple.com/apple-vision-pro/"',
    );
    const entry = read("./visionRideEntry.ts");
    expect(entry).not.toContain("window.open");
    expect(entry).toContain("state.visionRideSessionFailed");
  });

  it("lets the Training golf bay arm the fairway reality only by striking Vision Pro", () => {
    const golf = read("../scene/golf/GolfExperience.tsx");
    expect(golf).toContain(
      'recordFieldNoteEvent({ type: "golf-prop-struck", propId: loose.id })',
    );
    expect(golf).toContain('loose.id === "action:about:vision-ride"');
    expect(golf).toContain('armVisionRideModifier("golf")');
  });

  it("keeps native accessible entry, removal, and Apple source controls", () => {
    const placard = read("../dom/PlacardLayer.tsx");
    const controls = read("../dom/VisionRideControls.tsx");
    expect(placard).toContain("Put on Apple Vision Pro");
    expect(placard).toContain("APPLE_VISION_PRO_URL");
    expect(controls).toContain("Remove Vision Pro");
    expect(controls).toContain(
      'className="pointer-events-auto fixed inset-0 cursor-default bg-transparent outline-none"',
    );
    expect(controls).toContain('style={{ touchAction: "none" }}');
    expect(controls).not.toContain("rounded-full");
    expect(controls).toContain('aria-live="polite"');
    expect(controls).toContain('event.key !== "Escape"');
  });

  it("awards both Vision Pro discoveries only after the ride reaches cruising", () => {
    const controls = read("../dom/VisionRideControls.tsx");
    const entry = read("./visionRideEntry.ts");
    expect(controls).toContain('state.visionRidePhase === "cruising"');
    expect(controls).toContain('type: "vision-ride-entered"');
    expect(controls).toContain("profile: state.visionRideSessionProfile");
    expect(entry).not.toContain("recordFieldNoteEvent");
  });

  it("keeps the reference-defining terrain and CRT presentation authored", () => {
    const world = read("./VisionRideWorld.tsx");
    const terrain = read("./visionRideTerrain.ts");
    const transition = read("./VisionRideTransition.tsx");
    expect(world).toContain("landscapeFragment");
    expect(world).toContain("vViewDepth");
    expect(world).toContain("skyColor(vSkyHeight, uBreath)");
    expect(world).toContain("ditherSky(skyColor(vSkyHeight, uBreath))");
    expect(world).toContain("palette.surfaceFogNear");
    expect(world).toContain("palette.surfaceFogFar");
    expect(world).toContain("palette.surfaceFogMax");
    expect(world).toContain("vFacetUv");
    expect(world).toContain("ScreenDitherOverlay");
    expect(world).toContain("deterministicStarSizes");
    expect(world).toContain("deterministicStarTwinkle");
    expect(world).toContain("palette.skyTop");
    expect(world).toContain("palette.sunTop");
    expect(world).toContain("440.0, hero");
    expect(world).toContain("fwidth(vUv) * ${lineWidthPx.toFixed(2)}");
    expect(world).toContain(
      "float wire = max(line, glow) * ${lineOpacity.toFixed(2)}",
    );
    expect(world).toContain("VISION_RIDE_SUN_DIAMETER_METRES,");
    expect(world).toContain("VISION_RIDE_SUN_DIAMETER_METRES * 1.5");
    expect(world).toContain("-VISION_RIDE_SUN_DEPTH_METRES");
    expect(terrain).toContain("1_700");
    expect(terrain).toContain("surfaceIndices");
    expect(transition).toContain("uApertureW");
    expect(transition).toContain("uApertureH");
    expect(transition).toContain("uBeam");
    expect(transition).toContain("uCenter");
    expect(transition).toContain("step(0.001, uApertureH)");
    expect(transition).toContain("float visionProProfile");
    expect(transition).toContain("float noseRelief");
    expect(transition).toContain("headsetFlightChoreography");
    expect(transition).toContain("getWorldPosition(projectedVisorCenter)");
    expect(transition).toContain("Math.PI");
  });

  it("renders the road and both mountain flanks as one shared landscape mesh", () => {
    const world = read("./VisionRideWorld.tsx");
    const landscape = world.slice(
      world.indexOf("function UnifiedLandscape"),
      world.indexOf("const MILE_MARKER_SEGMENTS"),
    );
    expect(world).toContain("generateUnifiedLandscape");
    expect(landscape).toContain("function UnifiedLandscape");
    expect(landscape).toContain("geometry={geometry}");
    expect(landscape).toContain("material={material}");
    expect(landscape.match(/geometry=\{geometry\}/g)).toHaveLength(3);
    expect(landscape.match(/material=\{material\}/g)).toHaveLength(3);
    expect(world).not.toContain("function MovingGrid");
    expect(world).not.toContain("function WireframeMountains");
    expect(world).not.toContain("MountainChunkMeshes");
    expect(world).not.toContain("MOUNTAIN_FRAGMENT");
  });

  it("draws the sky, stars and sun before the terrain so the sun stays behind every ridge", () => {
    const world = read("./VisionRideWorld.tsx");
    const order = world.slice(
      world.indexOf("const ORDER = {"),
      world.indexOf("} as const;", world.indexOf("const ORDER = {")),
    );
    const value = (key: string) =>
      Number(new RegExp(`${key}: (-?[\\d_]+)`).exec(order)![1]);
    expect(value("sky")).toBeLessThan(value("stars"));
    expect(value("stars")).toBeLessThan(value("sun"));
    expect(value("sun")).toBeLessThanOrEqual(value("mountains"));
    expect(value("mountains")).toBeLessThan(0);
    // None of the three backgrounds write depth; the sun blends explicitly
    // from the opaque queue rather than being sorted behind the terrain.
    expect(world).toContain("blending={THREE.CustomBlending}");
    expect(world).toContain("renderOrder={ORDER.sun}");
    expect(world).toContain("renderOrder={ORDER.mountains}");
  });

  it("drives the whole environment from one breathing cycle", () => {
    const world = read("./VisionRideWorld.tsx");
    // The cycle is evaluated against the orientation's settled chase
    // distance, so the car's growth is the same fraction on every viewport.
    expect(world).toMatch(
      /environmentBreath\(\s*elapsed,\s*reducedMotion,\s*framing\.chaseDistance,\s*profile\.breath,?\s*\)/,
    );
    expect(world).toContain("uniforms.uBreath!.value = cycle.phase");
    expect(world).toContain(
      "sun.current.scale.setScalar(cycle.sunScale * profile.sunBaseScale)",
    );
    expect(world).toContain(
      "(cycle.chaseOffset + parallax.current.z / cycle.carScale) * intro",
    );
    // The aim comes from the live eye so the tilt that keeps the bumper in
    // frame covers the pointer's pull as well as the breath.
    expect(world).toMatch(/chaseAimY\(\s*framing,\s*eyeY,\s*cameraZ,?\s*\)/);
  });

  it("reads the pointer from the window because the exit button covers the canvas", () => {
    const world = read("./VisionRideWorld.tsx");
    const controls = read("../dom/VisionRideControls.tsx");
    expect(controls).toContain("pointer-events-auto fixed inset-0");
    expect(world).toContain('window.addEventListener("pointermove", onMove');
    expect(world).toContain("normalizedPointer(");
    expect(world).toContain('if (event.pointerType === "touch") return;');
    expect(world).toContain("visionRideTouchRuntime.getSnapshot()");
    expect(controls).toContain("visionRideTouchRuntime.begin");
    expect(controls).toContain("visionRideTouchRuntime.move");
    expect(controls).toContain("visionRideTouchRuntime.end");
    expect(controls).toContain("suppressClickUntil");
    expect(controls).toContain(
      'event.pointerType !== "touch" || reducedMotion',
    );
    expect(controls).toContain(
      'useStacks.getState().requestVisionRideExit("button")',
    );
    expect(world).not.toContain("state.pointer.x");
    // WASD and the arrows feed the same shift, by key code, and never steal
    // a keystroke from a text field or a modifier chord.
    expect(world).toContain('window.addEventListener("keydown", onKeyDown)');
    expect(world).toContain('window.addEventListener("keyup", onKeyUp)');
    expect(world).toContain("isVisionRideShiftKey(event.code)");
    expect(world).toContain("isEditableShortcutTarget(event.target)");
    expect(world).toContain("keyAxes(keysPressed.current)");
    // The aim shares the lateral shift: a truck, not an orbit about the car.
    expect(world).toContain("lateralReach(");
    expect(world).toContain(
      "parallax.current.x * intro,\n      -reach,\n      reach,",
    );
    expect(world).toContain("pose.aim[0] + chaseAimX(shiftX)");
    // The wheels are returned by the car memo, not kept in a ref the effect
    // cleanup empties: a profile change ran the old cleanup after the new
    // memo and the wheels stopped turning.
    expect(world).toContain("const { car, wheels } = useMemo(() => {");
    expect(world).toContain("return { car: clone, wheels };");
    expect(world).not.toContain("wheels.current");
    expect(world).toMatch(
      /profile\.speedMetresPerSecond\s*\/\s*VISION_RIDE_CAMERA\.wheelRadiusMetres/,
    );
    expect(world).toContain(
      'useStacks.getState().visionRidePhase !== "cruising"',
    );
    expect(world).toContain(
      'document.addEventListener("visibilitychange", onVisibility)',
    );
    // lookAt pins the car's nominal position on every viewport, and the
    // framing itself comes from the pure, per-orientation module.
    expect(world).toContain("const framing = chaseFraming(portrait);");
    // Road, mountains, horizon and sun-foot colours come from the palette module.
    expect(world).toContain("surfaceGradientGlsl");
    expect(world).toContain("glslVec3(palette.surfaceBottom)");
    expect(world).toContain("glslVec3(palette.surfaceBase)");
    expect(world).toContain("glslVec3(palette.roadLine)");
    expect(world).toContain("glslVec3(palette.skyHorizon)");
    expect(world).toContain("glslVec3(palette.sunFoot)");
    // The single fill derives its gradient from the drawing-buffer coordinate,
    // independent of camera distance and terrain height.
    expect(world).toContain("uniform float uViewportHeight;");
    expect(world).toContain("gl_FragCoord.y / max(uViewportHeight, 1.0)");
    expect(world).not.toContain("eyeDistance");
    expect(world).not.toContain("varying float vHeight;");
    expect(world).toContain(
      "const GRID_CELL_METRES = VISION_RIDE_GRID_CELL_METRES;",
    );
    // Grid coordinates come from the shared mesh and its three recycled
    // instances move together. There is no independent scrolling texture.
    expect(world).toContain("const landscapeVertex = (terrain:");
    expect(world).toContain(
      "position.x / ${(GRID_CELL_METRES * terrain.gridCellXScale)",
    );
    expect(world).toContain(
      "-position.z / ${(GRID_CELL_METRES * terrain.gridCellYScale)",
    );
    expect(world).toContain("mountainWindowOffsets(travel)");
    expect(world).not.toContain("uniform float uTravel");
    expect(world).toContain("profile.terrain.heightScale");
    // lookAt still pins the car's nominal x and z; only the aim height moves,
    // and only to keep the car's rear inside the frame.
    expect(world).toMatch(
      /camera\.lookAt\(\s*pose\.aim\[0\][^;]*chaseAimY\([^)]*\)[^;]*pose\.aim\[2\],?\s*\)/,
    );
  });

  it("uses sparse digital mile markers instead of repeated roadside lights", () => {
    const world = read("./VisionRideWorld.tsx");
    const diagnostics = read("./visionRideDiagnostics.ts");
    const registry = read("../scene/sceneDiagnosticsRegistry.ts");
    expect(world).toContain("function DigitalMileMarker");
    expect(world).toContain("<instancedMesh");
    expect(world).toContain("mileMarkerPresentation(");
    expect(world).toContain("mileMarkersEnabled && !reducedMotion");
    expect(world).not.toContain("RoadsideMarkers");
    expect(diagnostics).toContain("useVisionRideMileMarkersEnabled");
    expect(registry).toContain('id: "render.vision-ride-mile-markers"');
    expect(registry).toContain('label: "Vision Ride mile markers"');
    expect(registry).toContain("setMileMarkersEnabled");
    expect(registry).toContain("renderTargetAllocations: 0");
    expect(registry).toContain("textureSamples: 0");
    expect(registry).toContain("perFrameWork: false");
  });

  it("uses native glowing particles from the real lamps behind a live zero-cost control", () => {
    const world = read("./VisionRideWorld.tsx");
    const diagnostics = read("./visionRideDiagnostics.ts");
    const registry = read("../scene/sceneDiagnosticsRegistry.ts");
    expect(world).toContain("function CarLightTrails");
    expect(world).toContain("<points");
    expect(world).toContain("lightTrailParticleDistance({");
    expect(world).toContain("gl_PointCoord");
    expect(world).toContain("THREE.AdditiveBlending");
    expect(world).not.toContain("LIGHT_TRAIL_FRAGMENT");
    expect(world).not.toContain("tailLights");
    expect(world).toContain("lightTrailsEnabled && !reducedMotion");
    expect(diagnostics).toContain("useVisionRideLightTrailsEnabled");
    expect(registry).toContain('id: "render.vision-ride-light-trails"');
    expect(registry).toContain('label: "Vision Ride light trails"');
    expect(registry).toContain("setLightTrailsEnabled");
  });

  it("paints the curtain from a navy static palette with no green or red lead", () => {
    const transition = read("./VisionRideTransition.tsx");
    const shader = transition.slice(
      transition.indexOf("const CURTAIN_FRAGMENT"),
      transition.indexOf("const startPosition"),
    );
    // The old iris mixed three phase-shifted sines per channel: red, green
    // and blue peaked independently and the frame went olive and brown.
    expect(shader).not.toContain("sin(uTime + p.x");
    expect(shader).not.toContain("iris");
    const colours = Array.from(
      shader.matchAll(/vec3\((\d*\.\d+), (\d*\.\d+), (\d*\.\d+)\)/g),
    ).map(([, r, g, b]) => [Number(r), Number(g), Number(b)] as const);
    expect(colours.length).toBeGreaterThan(4);
    for (const [r, g, b] of colours) {
      expect(b).toBeGreaterThanOrEqual(g);
      expect(b).toBeGreaterThanOrEqual(r);
    }
  });

  it("renders the sun as a yellow-to-pink disc with horizontal cut-outs", () => {
    const world = read("./VisionRideWorld.tsx");
    const shader = world.slice(
      world.indexOf("const sunFragment"),
      world.indexOf("const GRID_CELL_METRES"),
    );
    expect(shader).toContain("palette.sunTop");
    expect(shader).toContain("palette.sunMiddle");
    expect(shader).toContain("palette.sunFoot");
    expect(shader).toContain("float bandPhase = fract");
    expect(shader).toContain("float grooveWidth");
    expect(shader).toContain("float stripeRegion");
    expect(shader).toContain("groove *= stripeRegion");
    expect(shader).toContain("fwidth(vUv.y * ${style.bandCount.toFixed(1)})");
    expect(shader).toContain("float upperBevel");
    expect(shader).toContain("float lowerBevel");
    expect(shader).toContain("uTime * ${style.bandSpeed.toFixed(2)} * uMotion");
    expect(world).toContain("ref={sunMaterial}");
    expect(world).toContain("uMotion: { value: reducedMotion ? 0 : 1 }");
    expect(shader).toContain("vec3 grooveColor");
    expect(shader).toContain("max(disc, rimHalo)");
    expect(world).toContain("const sunGlowFragment");
    expect(world).toContain("THREE.AdditiveBlending");
    expect(world).toContain("VISION_RIDE_SUN_DIAMETER_METRES * 1.5");
    expect(world).toContain("vec3 sunColor");
    expect(world).toContain("only honors the circular alpha");
  });

  it("recompiles every profile-authored sky material when its shader changes", () => {
    const world = read("./VisionRideWorld.tsx");

    expect(world).toContain("key={skyShader}");
    expect(world).toContain("key={starsShader}");
    expect(world).toContain("key={glowShader}");
    expect(world).toContain("key={discShader}");
  });

  it("feeds the HDR sun into stronger ride-specific shared bloom", () => {
    const effects = read("../scene/Effects.tsx");
    expect(effects).toContain(
      "visionRideRetroFxEnabled\n                ? 0.82",
    );
    expect(effects).toContain("Math.max(1.9, plan.bloomIntensity.dark)");
    expect(effects).toContain(
      "visionRideRoomHidden && visionRideRetroFxEnabled",
    );
  });

  it("keys room effects and camera life to the curtain, not the phase", () => {
    const effects = read("../scene/Effects.tsx");
    const rig = read("../scene/CameraRig.tsx");
    const transition = read("./VisionRideTransition.tsx");
    const store = read("../store.ts");
    expect(effects).toContain("state.visionRideRoomHidden");
    expect(effects).not.toContain('state.visionRidePhase !== "idle"');
    expect(rig).toContain(
      "if (useStacks.getState().visionRideRoomHidden) return;",
    );
    expect(rig).not.toContain('visionRidePhase === "donning") return;');
    expect(transition).toContain(
      "roomEffectsActive(phase, elapsed, reducedMotion)",
    );
    expect(transition).toContain("setVisionRideRoomHidden(hidden)");
    // Coverage and opacity reach the shader as separate uniforms.
    expect(transition).toContain("lensCurtain(curtainAmount, reducedMotion)");
    expect(transition).toContain("uniforms.uOpacity!.value = lens.opacity");
    expect(transition).toContain(
      "uniforms.uScale!.value = lens.coverage * LENS_FULL_SCALE",
    );
    expect(store).toContain("visionRideRoomHidden: false");
  });

  it("draws the fullscreen overlays in clip space, immune to camera near", () => {
    // Regression: both overlays used camera-tracked planes at z=-0.09 and
    // z=-0.075, inside Three's default near=0.1 — every frame rendered
    // unmasked. Clip-space quads cannot be near-clipped or lost to ride
    // camera ownership changes.
    const world = read("./VisionRideWorld.tsx");
    const transition = read("./VisionRideTransition.tsx");
    expect(transition).toContain("gl_Position = vec4(position.xy, 0.0, 1.0)");
    expect(world).toContain("gl_Position = vec4(position.xy, 0.0, 1.0)");
    expect(transition).not.toContain("position={[0, 0, -0.09]}");
    expect(world).not.toContain("position={[0, 0, -0.075]}");
    // The curtain stays above the dither overlay.
    expect(transition).toContain("renderOrder={10_000}");
    expect(world).toContain("renderOrder={ORDER.dither}");
    expect(world).toContain("dither: 9_000");
  });

  it("blocks room input and preserves the scroll subtree during the ride", () => {
    const canvas = read("../StacksCanvas.tsx");
    const scroll = read("../input/ScrollBridges.tsx");
    const touch = read("../input/TouchInteractionLayer.tsx");
    expect(canvas).toContain('visionRidePhase === "idle"');
    expect(canvas).toContain(
      "const roomMounted = visionRideRoomMounted(visionRidePhase);",
    );
    expect(canvas).toContain("roomMounted ? (");
    expect(canvas.indexOf("<ScrollControls")).toBeLessThan(
      canvas.indexOf("{roomMounted ? ("),
    );
    expect(scroll).toContain('state.visionRidePhase !== "idle"');
    expect(touch).toContain('store.visionRidePhase !== "idle"');
  });

  it("keeps the car and soundtrack out of initial preloads", () => {
    const canvas = read("../StacksCanvas.tsx");
    const models = read("../scene/ModelProp.tsx");
    const audio = read("../audio/sceneAudio.ts");
    expect(canvas).not.toContain("vision-ride-lamborghini.glb");
    expect(models).not.toContain("vision-ride-lamborghini.glb");
    expect(audio).not.toContain('synthwave-loop.ogg",\n  windA');
    expect(audio).toContain("const CORE_AMBIENCE");
  });

  it("stops entry static with the visual snow and blocks late-unlock replay", () => {
    const experience = read("./VisionRideExperience.tsx");
    const transition = read("./VisionRideTransition.tsx");
    const audio = read("../audio/sceneAudio.ts");
    expect(experience).toContain('phase === "cruising"');
    expect(experience).toContain("sceneAudio.beginVisionRideSwitchOn()");
    expect(transition).not.toContain(
      "elapsed >= VISION_RIDE_TIMELINE.entry.flickerSeconds",
    );
    expect(transition).toContain("beat.complete");
    expect(transition).toContain("sceneAudio.finishVisionRideEntry()");
    expect(audio).not.toContain("rideEntryStopTimer");
    expect(audio).toContain("this.rideEntryEffectsAllowed = false");
    expect(audio).toContain("if (this.rideEntryEffectsAllowed)");
    expect(audio).toContain("this.stopVisionRideStaticSources()");
  });

  it("declares a default-on live diagnostic with a zero-cost off path", () => {
    const registry = read("../scene/sceneDiagnosticsRegistry.ts");
    expect(registry).toContain('id: "render.vision-ride"');
    expect(registry).toContain('label: "Vision Ride"');
    expect(registry).toContain("defaultValue: true");
    expect(registry).toContain('reloadInput: "novisionride"');
    expect(registry).toContain("renderTargetAllocations: 0");
    expect(registry).toContain("textureSamples: 0");
    expect(registry).toContain("perFrameWork: false");
    expect(registry).toContain('id: "render.vision-ride-retro-fx"');
    expect(registry).toContain('label: "Vision Ride retro finish"');
    expect(registry).toContain("setRetroFxEnabled");
  });
  it("keeps three out of the ride modules the homepage loads up front", () => {
    // The placard's entry link, the store and the chrome import these in
    // the initial client graph. A value import of three in any of them
    // ships the 98 KB core with the first route load; the 3D scene loads
    // it lazily. PR #45's production deploy failed the route budget on the
    // runtime's import, so this pins every module on that path.
    for (const relative of [
      "./visionRideEntry.ts",
      "./visionRideLightTrails.ts",
      "./visionRideMileMarker.ts",
      "./visionRideRuntime.ts",
      "./visionRideProfiles.ts",
      "./visionRideState.ts",
      "./visionRideTouch.ts",
      "./visionRideDiagnostics.ts",
      "./visionRideTransitionTimeline.ts",
      "../dom/VisionRideControls.tsx",
      "../scene/visionProDisplayDiagnostics.ts",
      "../scene/visionProGeometry.ts",
    ]) {
      const source = read(relative);
      expect(source, relative).not.toMatch(
        /^import (?!type )[^;]*from "three["/]/m,
      );
      expect(source, relative).not.toMatch(/^import \* as THREE from "three"/m);
    }
  });
});

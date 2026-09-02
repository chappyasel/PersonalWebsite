import fs from "node:fs";
import { describe, expect, it } from "vitest";

const globeSource = fs.readFileSync(
  new URL("./CoordinationGlobe.tsx", import.meta.url),
  "utf8",
);
const networkSource = fs.readFileSync(
  new URL("./coordinationNetwork.ts", import.meta.url),
  "utf8",
);
const legibilitySource = fs.readFileSync(
  new URL("./coordinationGlobeLegibility.ts", import.meta.url),
  "utf8",
);
const diagnosticsSource = fs.readFileSync(
  new URL("../dom/SceneDiagnostics.tsx", import.meta.url),
  "utf8",
);
const diagnosticsRegistrySource = fs.readFileSync(
  new URL("./sceneDiagnosticsRegistry.ts", import.meta.url),
  "utf8",
);
const unitSource = fs.readFileSync(
  new URL("./units/UnitAbout.tsx", import.meta.url),
  "utf8",
);
const eggSource = fs.readFileSync(
  new URL("./eggs.tsx", import.meta.url),
  "utf8",
);
const modelSource = fs.readFileSync(
  new URL("./ModelProp.tsx", import.meta.url),
  "utf8",
);
const primitivesSource = fs.readFileSync(
  new URL("./primitives.tsx", import.meta.url),
  "utf8",
);
const grabbableSource = fs.readFileSync(
  new URL("./Grabbable.tsx", import.meta.url),
  "utf8",
);
const authoredPropsSource = fs.readFileSync(
  new URL("./AuthoredProps.tsx", import.meta.url),
  "utf8",
);
const portalLabelSource = fs.readFileSync(
  new URL("../dom/PortalLabel.tsx", import.meta.url),
  "utf8",
);
const environmentSource = fs.readFileSync(
  new URL("./SceneEnvironment.tsx", import.meta.url),
  "utf8",
);
const butterflySource = fs.readFileSync(
  new URL("./Butterflies.tsx", import.meta.url),
  "utf8",
);
const wildlifeSource = fs.readFileSync(
  new URL("./Wildlife.tsx", import.meta.url),
  "utf8",
);
const meadowSource = fs.readFileSync(
  new URL("./Meadow.tsx", import.meta.url),
  "utf8",
);
const geometrySource = fs.readFileSync(
  new URL("./coordinationGlobeGeometry.ts", import.meta.url),
  "utf8",
);
const awardGeometrySource = fs.readFileSync(
  new URL("./aboutAwardGeometry.ts", import.meta.url),
  "utf8",
);
const objectsSource = fs.readFileSync(
  new URL("./objects.tsx", import.meta.url),
  "utf8",
);
const bootSource = fs.readFileSync(
  new URL("../dom/BootScreen.tsx", import.meta.url),
  "utf8",
);
const effectsSource = fs.readFileSync(
  new URL("./Effects.tsx", import.meta.url),
  "utf8",
);
const eggSourceWithLighting = fs.readFileSync(
  new URL("./eggs.tsx", import.meta.url),
  "utf8",
);

describe("Coordination globe presentation contract", () => {
  it("registers the requested external Portal destination", () => {
    expect(globeSource).toContain('href="https://coordination.sh/"');
    expect(globeSource).toContain('portalLabel="Coordination Research"');
    expect(globeSource).toContain("external");
  });

  it("keeps reduced motion static and unmounts the whole expensive path when off", () => {
    const staticStart = globeSource.indexOf(
      "function StaticCoordinationNetwork",
    );
    const liveStart = globeSource.indexOf("function LiveCoordinationNetwork");
    const policyStart = globeSource.indexOf("function CoordinationNetwork");
    const bodyStart = globeSource.indexOf("function CoordinationGlobeBody");
    const staticBranch = globeSource.slice(staticStart, liveStart);
    const liveBranch = globeSource.slice(liveStart, policyStart);
    const body = globeSource.slice(bodyStart);

    expect(staticBranch).not.toContain("useUnitFrame");
    expect(liveBranch).toContain("useUnitFrame");
    expect(globeSource).toContain("prefers-reduced-motion: reduce");
    expect(body).toMatch(/effectEnabled\s*\?\s*\(\s*<CoordinationSingularity/);
    expect(globeSource).not.toContain("<MeshTransmissionMaterial");
    expect(globeSource).not.toContain('name="coordination-gravity-lens"');
    expect(globeSource).toContain("depthTest={false}");
  });

  it("lets the globe use the standard carry and hover paths", () => {
    const moveStart = grabbableSource.indexOf("const onGrabMove");
    const moveEnd = grabbableSource.indexOf("const onGrabUp", moveStart);
    const move = grabbableSource.slice(moveStart, moveEnd);

    expect(globeSource).not.toContain("draggable={false}");
    expect(globeSource).toContain('shape="box"');
    expect(globeSource).toContain("massKg=");
    expect(globeSource).toContain(
      "onDragIntent={(origin) => emitShockwave(origin, true)}",
    );
    expect(globeSource).toContain("triggerCoordinationBurst(");
    expect(globeSource).toContain("stepCoordinationBurst(");
    expect(move).toContain("onDragIntentRef.current({");
    expect(move.indexOf("onDragIntentRef.current({")).toBeLessThan(
      move.indexOf("beginCarry(event)"),
    );
  });

  it("discovers the shockwave when hover triggers the globe", () => {
    const engagementStart = globeSource.indexOf(
      "const entered = coordinationEngaged",
    );
    const engagementEnd = globeSource.indexOf(
      "}, [coordinationEngaged",
      engagementStart,
    );
    const engagement = globeSource.slice(engagementStart, engagementEnd);

    expect(engagement).toMatch(/emitShockwave\(\s*\{[\s\S]*?\},\s*true,?\s*\)/);
  });

  it("limits the pointer hit to the visible singularity", () => {
    const hitStart = globeSource.indexOf(
      'name="interaction-hit:coordination-globe"',
    );
    const hitEnd = globeSource.indexOf("</mesh>", hitStart);
    const hit = globeSource.slice(hitStart, hitEnd);

    expect(hitStart).toBeGreaterThan(-1);
    expect(hit).toContain(
      "<sphereGeometry args={[COORDINATION_INTERACTION_RADIUS",
    );
    expect(hit).not.toContain("<boxGeometry");
    expect(globeSource).toContain("const NO_RAYCAST = () => null");
    expect(
      globeSource.match(/raycast=\{NO_RAYCAST\}/g)?.length,
    ).toBeGreaterThanOrEqual(7);
  });

  it("drops stale hover ownership when the pointer leaves the scene surface", () => {
    const trackStart = portalLabelSource.indexOf("const track =");
    const trackEnd = portalLabelSource.indexOf(
      'window.addEventListener("pointermove"',
      trackStart,
    );
    const track = portalLabelSource.slice(trackStart, trackEnd);

    expect(trackStart).toBeGreaterThan(-1);
    expect(track).toContain("state.setHovered(null)");
  });

  it("keeps the standard physical hover response on the movable globe", () => {
    const globeStart = globeSource.indexOf("export function CoordinationGlobe");
    const globe = globeSource.slice(globeStart);

    expect(globe).not.toContain("tiltOnHover={false}");
  });

  it("grows an improbable connection when hover begins", () => {
    expect(globeSource).toContain(
      'object.name = "coordination-connection-reveal"',
    );
    expect(globeSource).toContain("triggerNextCoordinationConnection(");
    expect(globeSource).toContain("stepCoordinationConnectionPool(");
  });

  it("keeps both neighborhood and reveal lines sharp in screen space", () => {
    expect(
      globeSource.match(/new LineSegments2/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(globeSource).toContain("new LineMaterial");
    expect(globeSource).toContain("worldUnits: false");
    expect(globeSource).not.toContain("<lineBasicMaterial");
    expect(globeSource).toContain("gl.getPixelRatio()");
    expect(globeSource).toContain("legibility.baseLineWidthPx");
    expect(globeSource).toContain("legibility.revealLineWidthPx");
    expect(legibilitySource).toContain("LOW_RESOLUTION_MEGAPIXELS = 0.4");
  });

  it("writes the amorphous horizon depth before its impossible graph layers", () => {
    const horizonStart = globeSource.indexOf("function AmorphousHorizon");
    const horizonEnd = globeSource.indexOf(
      "/** The approved live path",
      horizonStart,
    );
    const horizon = globeSource.slice(horizonStart, horizonEnd);

    expect(horizon).toContain("depthTest={true}");
    expect(horizon).toContain("depthWrite={true}");
  });

  it("clips impossible graph layers to the externally visible horizon", () => {
    const lineFactory = globeSource.slice(
      globeSource.indexOf("function screenSpaceLineMaterial"),
      globeSource.indexOf("type NetworkScene"),
    );
    const networkScene = globeSource.slice(
      globeSource.indexOf("function useNetworkScene"),
      globeSource.indexOf("function NetworkMeshes"),
    );
    const networkMeshes = globeSource.slice(
      globeSource.indexOf("function NetworkMeshes"),
      globeSource.indexOf("function StaticCoordinationNetwork"),
    );
    const horizon = globeSource.slice(
      globeSource.indexOf("function AmorphousHorizon"),
      globeSource.indexOf("/** The approved live path"),
    );

    expect(effectsSource).toContain("<EffectComposer");
    expect(effectsSource).toContain("stencilBuffer");
    expect(globeSource).toContain("HORIZON_STENCIL_MATERIAL_PROPS");
    expect(globeSource).toContain("NETWORK_STENCIL_MATERIAL_PROPS");
    expect(globeSource).toContain("THREE.ReplaceStencilOp");
    expect(globeSource).toContain("THREE.EqualStencilFunc");
    expect(horizon).toContain("{...HORIZON_STENCIL_MATERIAL_PROPS}");
    expect(lineFactory).toContain(
      "Object.assign(material, NETWORK_STENCIL_MATERIAL_PROPS)",
    );
    expect(networkScene).toContain(
      "Object.assign(tipMaterial, NETWORK_STENCIL_MATERIAL_PROPS)",
    );
    expect(networkMeshes).toContain("{...NETWORK_STENCIL_MATERIAL_PROPS}");
  });

  it("continues firing faster hover connections and quieter idle connections", () => {
    expect(networkSource).toContain("coordinationConnectionInterval");
    expect(networkSource).toContain("coordinationIdleConnectionInterval");
    expect(globeSource).toContain("nextConnectionIn");
    expect(globeSource).toMatch(
      /if \(coordinationEngaged[\s\S]*nextConnectionIn\.current -= Math\.max\(0, delta\)[\s\S]*triggerNextCoordinationConnection/,
    );
    expect(globeSource).toContain("coordinationIdleConnectionInterval(");
    expect(globeSource).toContain(
      "state.focusedInteraction === COORDINATION_GLOBE_INTERACTION_ID",
    );
  });

  it("makes reveal connections unmistakable against the resting web", () => {
    const baseWidth = Number(
      /NETWORK_LINE_WIDTH_PX = ([\d.]+)/.exec(globeSource)?.[1],
    );
    const revealWidth = Number(
      /REVEAL_LINE_WIDTH_PX = ([\d.]+)/.exec(globeSource)?.[1],
    );
    const baseOpacity = Number(
      /opacity: ([\d.]+),\n\s+vertexColors: true/.exec(globeSource)?.[1],
    );

    expect(revealWidth).toBeGreaterThanOrEqual(baseWidth * 3);
    expect(baseOpacity).toBeLessThanOrEqual(0.3);
    expect(globeSource).toContain("REVEAL_COLOR_INTENSITY = 1.6");
    expect(globeSource).toContain("multiplyScalar(REVEAL_COLOR_INTENSITY)");
    expect(globeSource).toContain("0.9 + hoverStrength * 0.1");
  });

  it("renders a pool of simultaneous reveal lines", () => {
    expect(networkSource).toContain("COORDINATION_CONNECTION_CAPACITY");
    expect(globeSource).toContain("createCoordinationConnectionPool");
    expect(globeSource).toContain("stepCoordinationConnectionPool");
    expect(globeSource).toContain("scene.connectionLines.map");
  });

  it("publishes one drag shockwave to props, grass, petals, and dust", () => {
    expect(globeSource).toContain("publishSceneImpulse(");
    expect(globeSource).toContain("publishMeadowPhysicalEvent(");
    expect(grabbableSource).toContain("getSceneImpulse(");
    expect(environmentSource).toContain("uCoordinationEnergy");
    expect(environmentSource).toContain("COORDINATION_HUMAN_COLOR");
    expect(environmentSource).toContain("COORDINATION_AGENT_COLOR");
    expect(globeSource.match(/strength: 2,/g)).toHaveLength(2);
  });

  it("turns hover entry into a physical knockdown and practical-light shock", () => {
    expect(globeSource).toContain("wasShockwaveEngaged");
    expect(globeSource).toContain("emitShockwave(");
    expect(unitSource).toContain('sceneImpulseReaction="knockdown"');
    expect(authoredPropsSource).toContain('sceneImpulseReaction="knockdown"');
    expect(grabbableSource).toContain("prepared.world.knock(");
    expect(eggSourceWithLighting).toContain("sceneImpulseLightScale(");
    expect(eggSourceWithLighting).toContain("sceneImpulseStrengthAt(");
    expect(primitivesSource).toContain("function ShelfLightBank");
    expect(primitivesSource).toContain("sceneImpulseLightScale(");
    const bankStart = primitivesSource.indexOf("function ShelfLightBank");
    const bankEnd = primitivesSource.indexOf(
      "function RegisteredShelfPlank",
      bankStart,
    );
    expect(primitivesSource.slice(bankStart, bankEnd)).toContain('form="back"');
    expect(globeSource).toContain("const coordinationEngaged =");
    expect(globeSource).toContain("focused || hovered");
  });

  it("makes the dust response global, faster, brighter, and saturated", () => {
    expect(environmentSource).toContain("coordinationGlobal");
    expect(environmentSource).toContain("coordinationBrightness");
    expect(environmentSource).toContain("coordinationEngaged");
    expect(environmentSource).toContain(
      "stacks.hovered === COORDINATION_GLOBE_INTERACTION_ID",
    );
    expect(environmentSource).toContain(
      "stacks.dragging === COORDINATION_GLOBE_INTERACTION_ID",
    );
    expect(environmentSource).toContain(
      "stacks.focusedInteraction === COORDINATION_GLOBE_INTERACTION_ID",
    );
    expect(environmentSource).toContain(
      "if (coordinationEngaged) coordinationEnergy.current = 1",
    );
    expect(environmentSource).toContain("if (!coordinationEngaged)");
    expect(environmentSource).toMatch(
      /coordinationTravel\.current \+=\s*boundedDelta \* coordinationEnergy\.current \* (?:1\d|[2-9]\d)/,
    );
    expect(environmentSource).toContain(
      "boundedDelta * (1 + coordinationEnergy.current)",
    );
    expect(environmentSource).toContain(
      "mix(1.0, 2.0, smoothstep(0.0, 0.68, coordinationGlobal))",
    );
  });

  it("turns butterfly and moth wings neon blue and green during the effect", () => {
    expect(butterflySource).toContain("COORDINATION_AGENT_COLOR");
    expect(butterflySource).toContain("COORDINATION_HUMAN_COLOR");
    expect(butterflySource).toContain("COORDINATION_NEON_INTENSITY");
    expect(butterflySource).toContain("coordinationColorMix");
    expect(butterflySource).toContain(
      "coordinationGlobeDiagnosticsController.getSnapshot().effectEnabled",
    );
    expect(wildlifeSource).toContain("COORDINATION_AGENT_COLOR");
    expect(wildlifeSource).toContain("COORDINATION_HUMAN_COLOR");
    expect(wildlifeSource).toContain("coordinationMothColors");
    expect(wildlifeSource).toContain("coordinationColorMix.current");
  });

  it("runs butterflies and moths at twice speed while the globe is engaged", () => {
    expect(networkSource).toContain("COORDINATION_INSECT_TIME_SCALE = 2");
    for (const insectSource of [butterflySource, wildlifeSource]) {
      expect(insectSource).toContain(
        "coordinationEngaged ? COORDINATION_INSECT_TIME_SCALE : 1",
      );
      expect(insectSource).toContain("advanceInsectPilot(pilot, insectDelta");
    }
  });

  it("knocks every held butterfly and moth off its perch on each impulse", () => {
    for (const insectSource of [butterflySource, wildlifeSource]) {
      expect(insectSource).toContain("getSceneImpulse()");
      expect(insectSource).toContain("sceneImpulseInsectDeparture(");
      expect(insectSource).toContain('cause: "impulse"');
    }
  });

  it("keeps brand color in the graph and gives the black horizon an amorphous edge", () => {
    const horizonStart = globeSource.indexOf("const HORIZON_VERTEX");
    const horizonEnd = globeSource.indexOf("type BurstSignal", horizonStart);
    const horizon = globeSource.slice(horizonStart, horizonEnd);

    expect(horizon).not.toMatch(/human|agent|COORDINATION_/i);
    expect(horizon).toContain("noise3");
    expect(horizon).toContain("vec3 displaced");
    expect(horizon).toContain("gl_FragColor = vec4(vec3(edgeLift)");
    expect(globeSource).toContain("function AmorphousHorizon");
    expect(globeSource).not.toContain("function GlassRim");
    expect(globeSource).not.toContain("function PhotonRing");
    expect(globeSource).not.toContain("torusGeometry");
    expect(horizon).toContain("discard");
    expect(globeSource).toContain("horizonMaterial.current?.uniforms.uTime");
    expect(globeSource).toContain(
      "coordinationNodePosition(node, elapsed, burstStrength)",
    );
    expect(horizon).toContain("* (0.0015 + vEdgeNoise * 0.0035)");
    expect(globeSource).not.toContain("nodeHalos");
    expect(globeSource).not.toContain("THREE.AdditiveBlending");
    const horizonMeshStart = globeSource.indexOf("function AmorphousHorizon");
    const horizonMeshEnd = globeSource.indexOf(
      "/** The approved live path",
      horizonMeshStart,
    );
    expect(globeSource.slice(horizonMeshStart, horizonMeshEnd)).not.toContain(
      "transparent",
    );
  });

  it("feathers the horizon with a dynamic organic coverage gradient", () => {
    const vertexStart = globeSource.indexOf("const HORIZON_VERTEX");
    const fragmentStart = globeSource.indexOf("const HORIZON_FRAGMENT");
    const fragmentEnd = globeSource.indexOf("type BurstSignal", fragmentStart);
    const vertex = globeSource.slice(vertexStart, fragmentStart);
    const fragment = globeSource.slice(fragmentStart, fragmentEnd);

    expect(vertex).toContain("vEdgeNoise");
    expect(vertex).toContain("vViewNormal");
    expect(fragment).toContain("organicCoverage");
    expect(fragment).toContain("gl_FragCoord");
    expect(fragment).toContain("discard");
    expect(vertex).toContain("uActivity");
    expect(fragment).toContain("temporalGrain");
    expect(fragment).toContain("ditherCellSize");
    expect(fragment).toContain("uDitherCellSize * 2.0");
    expect(fragment).toContain("uDitherBandCoverage");
    expect(globeSource).toContain("legibility.ditherCellPx");
    expect(globeSource).toContain("legibility.ditherBandCoverage");
  });

  it("flickers the complete sky when the Coordination shockwave fires", () => {
    expect(environmentSource).toContain("uCoordinationFlicker");
    expect(environmentSource).toContain("sceneImpulseSkyScale(");
    expect(environmentSource).toContain("handledSkyImpulse");
  });

  it("drives the sky, image-based environment, and room lights from one fault signal", () => {
    expect(environmentSource).toContain(
      "function CoordinationEnvironmentFault",
    );
    expect(environmentSource).toContain("coordinationFlickerSignal.current");
    expect(environmentSource).toContain(
      "scene.environmentIntensity = baseIntensity * flickerSignal.current",
    );
    expect(environmentSource).toContain("light.intensity *= environmentScale");
    expect(environmentSource).toContain("hemi.intensity *= environmentScale");
    expect(environmentSource).toContain(
      "environmentFlickerSignal={activeCoordinationFlickerSignal}",
    );
    expect(meadowSource).toContain("uEnvironmentFlicker");
    expect(meadowSource).toContain("COORDINATION_ENVIRONMENT_FLICKER");
    expect(meadowSource).toContain("environmentFlickerSignal.current");
    expect(
      meadowSource.match(/col \*= uEnvironmentFlicker/g)?.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("grows the black horizon while independently tightening its contents and stand", () => {
    expect(geometrySource).toContain("COORDINATION_PLINTH_SCALE = 0.84");
    expect(geometrySource).toContain("COORDINATION_NECK_SCALE = 0.7");
    expect(geometrySource).toContain("COORDINATION_HORIZON_SCALE = 1.1");
    expect(geometrySource).toContain("COORDINATION_NETWORK_SCALE = 0.9");
    expect(globeSource).toContain("scale={COORDINATION_PLINTH_SCALE}");
    expect(globeSource).toContain("scale={COORDINATION_NECK_SCALE}");
    expect(globeSource).toContain("scale={COORDINATION_HORIZON_SCALE}");
    expect(globeSource).toContain("scale={COORDINATION_NETWORK_SCALE}");
    expect(bootSource).toContain("COORDINATION_NETWORK_SCALE");
  });

  it("matches the AIC and Apple base widths to their visible marks", () => {
    expect(awardGeometrySource).toContain(
      "ABOUT_AIC_BASE_WIDTH = ABOUT_AIC_MARK_WIDTH",
    );
    expect(awardGeometrySource).toContain(
      "ABOUT_APPLE_BASE_WIDTH = ABOUT_APPLE_MARK_WIDTH",
    );
    expect(unitSource).toContain(
      "args={[ABOUT_AIC_BASE_WIDTH, 0.024, ABOUT_AIC_BASE_DEPTH]}",
    );
    expect(objectsSource).toContain(
      "args={[ABOUT_APPLE_BASE_WIDTH, 0.021, ABOUT_APPLE_BASE_DEPTH]}",
    );
    expect(bootSource).toContain(
      "Math.abs(Math.sin(ABOUT_AIC_ROOT_YAW)) * ABOUT_AIC_BASE_DEPTH",
    );
  });

  it("exposes a live diagnostics switch without touching quality policy", () => {
    expect(diagnosticsRegistrySource).toContain("Coordination singularity");
    expect(diagnosticsRegistrySource).toContain(
      "coordinationGlobeDiagnosticsController.setEffectEnabled",
    );
    expect(diagnosticsSource).not.toContain(
      "setEffectEnabled(sceneQualityController",
    );
  });

  it("moves the shade and complete light rig through one measured hinge", () => {
    const lampStart = eggSource.indexOf("export function EggLamp");
    const lampEnd = eggSource.indexOf("export function SpinProp", lampStart);
    const lamp = eggSource.slice(lampStart, lampEnd);

    expect(unitSource).toContain(
      "headQuaternion={aboutLampHeadQuaternion(headOnCapture)}",
    );
    expect(unitSource).toContain("captureLightEmphasis={headOnCapture}");
    expect(unitSource).not.toContain("aimOffset={[0.35, 0, 0]}");
    expect(lamp).toContain("<group quaternion={headQuaternion}>");
    expect(lamp).toContain("<LampGlow");
    expect(lamp).toContain("deskLampHeadQuaternion={headQuaternion}");
    expect(modelSource).toContain("export function articulateDeskLampHead");
    expect(modelSource).toContain("DESK_LAMP_HEAD_NODE");
    expect(modelSource).toContain(
      "const rootToMesh = meshToRoot.clone().invert()",
    );
  });
});

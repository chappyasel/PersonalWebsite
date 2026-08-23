"use client";

// A lighthouse beam is visible because mist and dust scatter a narrow cone
// of light toward the viewer. Flat glowing rectangles look like rotating
// props, so each direction below uses four crossed sheets with an analytic
// soft cone. The cards share one material and contain no sampled texture.
// A small radial sprite supplies the short flash seen when either beam points
// at the camera.
import { useCoarseTouchCapability } from "../../input/useCoarseTouchCapability";
import { useStacks } from "../../store";
import { lighthouseBeaconDiagnosticsController } from "../lighthouseBeaconDiagnostics";
import { useUnitFrame } from "../unitActivity";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";

export const LIGHTHOUSE_BEACON_PERIOD_SECONDS = 7.5;
const WHITE = "#ffe8b8";
const RED = "#ff6046";
const POV_BLOOM_BOOST = 2;
const BEAM_CARD_ANGLES = [
  0,
  Math.PI / 4,
  Math.PI / 2,
  (Math.PI * 3) / 4,
] as const;

const BEAM_VERTEX = /* glsl */ `
  varying vec2 vBeamUv;

  void main() {
    vBeamUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  varying vec2 vBeamUv;
  uniform vec3 uBeamColor;
  uniform float uBeamOpacity;
  uniform float uEdgeSoftness;
  uniform float uFadeStart;
  uniform float uPower;

  float random(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(random(cell), random(cell + vec2(1.0, 0.0)), local.x),
      mix(
        random(cell + vec2(0.0, 1.0)),
        random(cell + vec2(1.0, 1.0)),
        local.x
      ),
      local.y
    );
  }

  void main() {
    float distanceAlong = vBeamUv.x;
    float distanceFromAxis = abs(vBeamUv.y - 0.5) * 2.0;
    float coneRadius = mix(
      0.14,
      1.0,
      smoothstep(0.0, 0.88, distanceAlong)
    );
    float softEdge = 1.0 - smoothstep(
      coneRadius * (1.0 - uEdgeSoftness),
      coneRadius,
      distanceFromAxis
    );
    float clearLens = smoothstep(0.0, 0.07, distanceAlong);
    float dissolve = 1.0 - smoothstep(uFadeStart, 1.0, distanceAlong);
    float inverseScatter = mix(1.0, 0.24, pow(distanceAlong, 0.72));
    float particulate = mix(
      0.82,
      1.08,
      noise(vec2(distanceAlong * 6.5, vBeamUv.y * 3.0))
    );
    float alpha =
      uBeamOpacity *
      softEdge *
      clearLens *
      dissolve *
      inverseScatter *
      particulate *
      uPower;

    if (alpha < 0.002) discard;
    vec3 colour = uBeamColor * mix(1.3, 0.72, distanceAlong);
    gl_FragColor = vec4(colour, alpha);
  }
`;

const textures: { flash?: THREE.DataTexture } = {};

function flashTexture(): THREE.DataTexture {
  if (textures.flash) return textures.flash;
  const size = 64;
  const centre = (size - 1) / 2;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const radius = Math.min(1, Math.hypot(x - centre, y - centre) / centre);
      const broadGlow = Math.max(0, 1 - radius) ** 2.2;
      const hotCore = Math.exp(-radius * radius * 42) * 0.62;
      const alpha = Math.min(1, broadGlow + hotCore);
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  textures.flash = texture;
  return texture;
}

export function advanceLighthouseBeaconAngle(angle: number, delta: number) {
  const turn =
    (Math.max(0, delta) * Math.PI * 2) / LIGHTHOUSE_BEACON_PERIOD_SECONDS;
  return (angle + turn) % (Math.PI * 2);
}

/** The opposing lamp faces share one optical assembly. The high exponent
 * turns its broad cosine into the quick flash of a collimated lighthouse. */
export function lighthouseFlashWeights(facing: number) {
  const clamped = THREE.MathUtils.clamp(facing, -1, 1);
  return {
    white: Math.max(0, clamped) ** 16,
    red: Math.max(0, -clamped) ** 16,
  } as const;
}

/** Begin dimming beyond 20 degrees and reach black around 39 degrees. The
 * frame loop damps this target so crossing either edge never pops. */
export function lighthouseUprightPower(worldUpY: number) {
  return THREE.MathUtils.smoothstep(worldUpY, 0.78, 0.94);
}

/** Scenery for physics and insect walks, invisible to the pointer. */
const SCENERY = { physicsIgnore: true } as const;
const noRaycast = () => null;

function BeamVolume({
  colour,
  length,
  start,
  width,
  opacity,
  softness,
  fadeStart,
  powerUniform,
}: {
  colour: string;
  length: number;
  start: number;
  width: number;
  opacity: number;
  softness: number;
  fadeStart: number;
  powerUniform: THREE.IUniform<number>;
}) {
  const geometry = useMemo(() => {
    const next = new THREE.PlaneGeometry(length, width, 1, 1);
    next.translate(start + length / 2, 0, 0);
    return next;
  }, [length, start, width]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uBeamColor: { value: new THREE.Color(colour) },
          uBeamOpacity: { value: opacity },
          uEdgeSoftness: { value: softness },
          uFadeStart: { value: fadeStart },
          uPower: powerUniform,
        },
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [colour, fadeStart, opacity, powerUniform, softness],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return BEAM_CARD_ANGLES.map((cardAngle) => (
    <mesh
      key={cardAngle}
      geometry={geometry}
      material={material}
      rotation={[cardAngle, 0, 0]}
      userData={SCENERY}
      raycast={noRaycast}
      renderOrder={3}
    />
  ));
}

function LighthouseBeamEffect({
  dark,
  height,
  radius,
}: {
  dark: boolean;
  height: number;
  radius: number;
}) {
  const lantern = useRef<THREE.Group>(null);
  const visuals = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  const flash = useRef<THREE.SpriteMaterial>(null);
  const povFlash = useRef<THREE.SpriteMaterial>(null);
  const halo = useRef<THREE.SpriteMaterial>(null);
  const source = useRef<THREE.MeshBasicMaterial>(null);
  const angle = useRef(0.32);
  const power = useRef(0);
  const still = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const flashMap = useMemo(() => flashTexture(), []);
  const world = useMemo(() => new THREE.Vector3(), []);
  const toCamera = useMemo(() => new THREE.Vector3(), []);
  const beamDirection = useMemo(() => new THREE.Vector3(), []);
  const worldRotation = useMemo(() => new THREE.Quaternion(), []);
  const lanternRotation = useMemo(() => new THREE.Quaternion(), []);
  const worldUp = useMemo(() => new THREE.Vector3(), []);
  const powerUniform = useMemo<THREE.IUniform<number>>(
    () => ({ value: 0 }),
    [],
  );
  const whiteColour = useMemo(() => new THREE.Color(WHITE), []);
  const redColour = useMemo(() => new THREE.Color(RED), []);
  const bloomActive = useStacks((state) => state.bloomActive);
  const beamStart = radius * 0.76;
  const innerBeamLength = radius * 7.4;
  const innerBeamWidth = radius * 1.85;
  const innerBeamOpacity = dark ? 0.15 : 0.085;
  const outerBeamLength = radius * 9.4;
  const outerBeamWidth = radius * 3.6;
  const outerBeamOpacity = dark ? 0.055 : 0.028;
  const flashPeak = bloomActive ? (dark ? 0.46 : 0.34) : dark ? 0.9 : 0.65;
  const sourceGain = bloomActive ? (dark ? 3.4 : 4.2) : 1.35;
  const flashGain = bloomActive ? (dark ? 2.8 : 3.5) : 1.2;
  const povFlashPeak = bloomActive ? (dark ? 0.12 : 0.09) : dark ? 0.16 : 0.11;
  const povFlashGain = bloomActive ? (dark ? 3.2 : 4) * POV_BLOOM_BOOST : 1.15;
  const haloBase = bloomActive ? (dark ? 0.045 : 0.025) : dark ? 0.14 : 0.08;

  useUnitFrame(({ camera }, delta) => {
    const lanternGroup = lantern.current;
    const visualGroup = visuals.current;
    const group = rotor.current;
    const flashMaterial = flash.current;
    const povFlashMaterial = povFlash.current;
    const haloMaterial = halo.current;
    const sourceMaterial = source.current;
    if (
      !lanternGroup ||
      !visualGroup ||
      !group ||
      !flashMaterial ||
      !povFlashMaterial ||
      !haloMaterial ||
      !sourceMaterial
    )
      return;

    lanternGroup.getWorldQuaternion(lanternRotation);
    worldUp.set(0, 1, 0).applyQuaternion(lanternRotation);
    const powerTarget = lighthouseUprightPower(worldUp.y);
    power.current = THREE.MathUtils.damp(
      power.current,
      powerTarget,
      powerTarget < power.current ? 22 : 14,
      delta,
    );
    powerUniform.value = power.current;
    visualGroup.visible = power.current > 0.002;
    if (!visualGroup.visible) return;

    if (still) {
      flashMaterial.opacity = 0;
      povFlashMaterial.opacity = 0;
      haloMaterial.opacity = haloBase * power.current;
      haloMaterial.color.copy(whiteColour);
      sourceMaterial.color.copy(whiteColour).multiplyScalar(sourceGain);
      sourceMaterial.opacity = (dark ? 0.68 : 0.52) * power.current;
      return;
    }

    angle.current = advanceLighthouseBeaconAngle(angle.current, delta);
    group.rotation.y = angle.current;
    group.getWorldPosition(world);
    camera.getWorldPosition(toCamera).sub(world);
    toCamera.y = 0;
    if (toCamera.lengthSq() === 0) return;
    toCamera.normalize();
    group.getWorldQuaternion(worldRotation);
    beamDirection.set(1, 0, 0).applyQuaternion(worldRotation);
    beamDirection.y = 0;
    beamDirection.normalize();

    const { white, red } = lighthouseFlashWeights(beamDirection.dot(toCamera));
    const level = Math.max(white, red);
    const povLevel = Math.sqrt(level);
    const colour = white >= red ? whiteColour : redColour;
    const target = flashPeak * level;
    flashMaterial.opacity = THREE.MathUtils.damp(
      flashMaterial.opacity,
      target * power.current,
      22,
      delta,
    );
    povFlashMaterial.opacity = THREE.MathUtils.damp(
      povFlashMaterial.opacity,
      povFlashPeak * povLevel * power.current,
      18,
      delta,
    );
    haloMaterial.opacity = THREE.MathUtils.damp(
      haloMaterial.opacity,
      (haloBase + level * (bloomActive ? 0.07 : 0.2)) * power.current,
      10,
      delta,
    );
    flashMaterial.color.copy(colour).multiplyScalar(flashGain);
    povFlashMaterial.color.copy(colour).multiplyScalar(povFlashGain);
    haloMaterial.color.copy(colour);
    sourceMaterial.color.copy(colour).multiplyScalar(sourceGain);
    sourceMaterial.opacity =
      ((dark ? 0.62 : 0.48) + level * (dark ? 0.12 : 0.08)) * power.current;
  });

  return (
    <group ref={lantern} position={[0, height, 0]}>
      <group ref={visuals} visible={false}>
        <mesh userData={SCENERY} raycast={noRaycast} renderOrder={4}>
          <sphereGeometry args={[radius * 0.21, 12, 8]} />
          <meshBasicMaterial
            ref={source}
            color={WHITE}
            transparent
            opacity={dark ? 0.62 : 0.48}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
        <group ref={rotor} rotation={[0, angle.current, 0]}>
          <BeamVolume
            colour={WHITE}
            length={outerBeamLength}
            start={beamStart}
            width={outerBeamWidth}
            opacity={outerBeamOpacity}
            softness={0.92}
            fadeStart={0.42}
            powerUniform={powerUniform}
          />
          <BeamVolume
            colour={WHITE}
            length={innerBeamLength}
            start={beamStart}
            width={innerBeamWidth}
            opacity={innerBeamOpacity}
            softness={0.68}
            fadeStart={0.6}
            powerUniform={powerUniform}
          />
          <group rotation={[0, Math.PI, 0]}>
            <BeamVolume
              colour={RED}
              length={outerBeamLength}
              start={beamStart}
              width={outerBeamWidth}
              opacity={outerBeamOpacity}
              softness={0.92}
              fadeStart={0.42}
              powerUniform={powerUniform}
            />
            <BeamVolume
              colour={RED}
              length={innerBeamLength}
              start={beamStart}
              width={innerBeamWidth}
              opacity={innerBeamOpacity}
              softness={0.68}
              fadeStart={0.6}
              powerUniform={powerUniform}
            />
          </group>
        </group>
        <sprite
          scale={[radius * 8.2, radius * 8.2, 1]}
          userData={SCENERY}
          raycast={noRaycast}
          renderOrder={4}
        >
          <spriteMaterial
            ref={halo}
            map={flashMap}
            color={WHITE}
            transparent
            opacity={haloBase}
            blending={THREE.AdditiveBlending}
            depthTest
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
        <sprite
          scale={[radius * 4.6, radius * 4.6, 1]}
          userData={SCENERY}
          raycast={noRaycast}
          renderOrder={5}
        >
          <spriteMaterial
            ref={flash}
            map={flashMap}
            color={WHITE}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthTest
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
        {/* A broad, low-opacity glare reaches the viewer just before the
            narrow optical core. Its HDR centre enters the real bloom pass;
            depth testing still lets foreground geometry block the flash. */}
        <sprite
          scale={[radius * 12.5, radius * 12.5, 1]}
          userData={SCENERY}
          raycast={noRaycast}
          renderOrder={4}
        >
          <spriteMaterial
            ref={povFlash}
            map={flashMap}
            color={WHITE}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthTest
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
      </group>
    </group>
  );
}

export function LighthouseBeacon({
  dark,
  height,
  radius,
}: {
  dark: boolean;
  /** Prop-local y of the lantern room's centre. */
  height: number;
  /** Inner radius of the lantern glass. */
  radius: number;
}) {
  const diagnostics = useSyncExternalStore(
    lighthouseBeaconDiagnosticsController.subscribe,
    lighthouseBeaconDiagnosticsController.getSnapshot,
    lighthouseBeaconDiagnosticsController.getSnapshot,
  );
  // Phones keep the lit lantern (the Glass material's emissive) and skip the
  // beam: sixteen double-sided additive shader planes and three additive
  // sprites are the same class of transparency work that broke the shaker
  // cups on Safari, and the composer already refuses multisampled targets on
  // touch for the same reason (quality.ts, Effects.tsx).
  const touch = useCoarseTouchCapability();

  return diagnostics.effectEnabled && !touch ? (
    <LighthouseBeamEffect dark={dark} height={height} radius={radius} />
  ) : null;
}

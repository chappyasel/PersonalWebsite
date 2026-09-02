"use client";

import { sceneAudio } from "../audio/sceneAudio";
import { VisionProProp } from "../scene/VisionProProp";
import { useStacks } from "../store";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { visionRideRuntime } from "./visionRideRuntime";
import {
  VISION_RIDE_HEADSET_PITCH,
  cruisingPresentation,
  doffingPresentation,
  donningPresentation,
  headsetFlightChoreography,
  lensCurtain,
  returningPresentation,
  roomEffectsActive,
} from "./visionRideTransitionTimeline";

/** Iris scale at full coverage: the disc's soft rim clears the frame
 * corners (length 1.41 in clip space over the 0.68 inner radius). */
const LENS_FULL_SCALE = 2.28;

// Clip-space fullscreen quad: the mesh bypasses camera matrices entirely,
// so the curtain cannot be lost to the near plane or to ride-camera
// ownership changes. (The previous camera-tracked plane at local z=-0.09
// sat inside Three's default near=0.1 and was clipped away wholesale.)
const CURTAIN_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// One palette for every closed pixel: ink, navy, blue-violet. Red never
// leads and green never exceeds blue, so no frame of the curtain can drift
// olive, brown, or into the RGB split the old sine iris produced.
const CURTAIN_FRAGMENT = `
  varying vec2 vUv;
  uniform float uOpacity;
  uniform float uCrtMode;
  uniform float uApertureW;
  uniform float uApertureH;
  uniform float uBeam;
  uniform float uStatic;
  uniform float uScale;
  uniform float uTime;
  uniform vec2 uCenter;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // Broadcast snow: 2 px cells refreshed at 60 Hz, a scanline every third
  // row, and sparse horizontal tear bands rolling through. uStatic lifts the
  // snow from a faint navy shimmer to legible static.
  vec3 snow(vec2 frag, float amount) {
    vec2 cell = floor(frag / 2.0);
    float tick = floor(uTime * 60.0);
    float grain = hash21(cell + tick * 7.0);
    grain = pow(grain, 2.4 - amount * 1.3);
    float row = floor(frag.y / 2.0);
    float band = hash21(vec2(floor((row + tick * 3.0) / 7.0), tick * 0.25));
    float tear = step(0.94, band);
    vec3 ink = vec3(0.004, 0.004, 0.014);
    vec3 navy = vec3(0.055, 0.072, 0.250);
    vec3 violet = vec3(0.280, 0.180, 0.620);
    vec3 color = mix(ink, navy, grain);
    color = mix(color, violet, grain * grain * (0.45 + 0.55 * amount));
    color += tear * amount * vec3(0.09, 0.11, 0.30);
    float scan = 0.80 + 0.20 * step(0.34, fract(frag.y / 3.0));
    return color * scan;
  }

  void main() {
    vec2 screenPosition = vUv * 2.0 - 1.0;
    vec2 center = uCrtMode < 0.5 ? uCenter : vec2(0.0);
    vec2 p = (screenPosition - center) / max(uScale, 0.001);
    float amount = clamp(uStatic, 0.0, 1.0);
    vec3 grain = snow(gl_FragCoord.xy, amount);
    vec3 ink = vec3(0.003, 0.003, 0.010);

    if (uCrtMode < 0.5) {
      // Lens fill / lift: a centred disc that grows past the frame, dark
      // glass with the snow rising inside it. uScale is coverage, uOpacity
      // is the alpha inside the disc; under normal motion the latter is 1,
      // so the room is covered, never veiled.
      // A wide visor mask follows the projected headset instead of growing
      // as an unrelated circle from the middle of the viewport.
      float edge = smoothstep(1.15, 0.68, length(p * vec2(0.72, 1.0)));
      vec3 color = mix(ink, grain, amount);
      gl_FragColor = vec4(color, uOpacity * edge);
      return;
    }

    float halfHeight = mix(0.004, 1.2, uApertureH);
    float halfWidth = mix(0.035, 1.25, uApertureW);
    float curvedY = abs(p.y) + p.x * p.x * 0.1;
    float visibleY = 1.0 - smoothstep(halfHeight - 0.025, halfHeight + 0.025, curvedY);
    float visibleX = 1.0 - smoothstep(halfWidth - 0.025, halfWidth + 0.025, abs(p.x));
    float visible = visibleX * visibleY;
    float alpha = 1.0 - visible;

    // The bright line rides the aperture edge with a soft halo, and a dot
    // sits at the centre once the width has gone.
    float line = exp(-95.0 * abs(curvedY - halfHeight)) * visibleX;
    float halo = exp(-9.0 * abs(curvedY - halfHeight)) * visibleX * 0.3;
    float spot = exp(-70.0 * length(p * vec2(1.0, 2.6))) * (1.0 - uApertureW);
    float light = (line + halo + spot) * uBeam;

    vec3 closed = mix(ink, grain, amount);
    vec3 color = closed + light * vec3(0.60, 0.72, 1.0);
    // Static reads over the open picture too during the flicker beats.
    float over = hash21(floor(gl_FragCoord.xy / 2.0) + floor(uTime * 60.0) * 7.0);
    // Keep a visible bed of snow during the switch-on/off beats. The old
    // 0..22% overlay disappeared against bright frames and read as a normal
    // dissolve; this 12..54% burst reads unmistakably as television snow.
    float snowAlpha = (0.12 + over * 0.42) * amount;
    alpha = max(alpha, snowAlpha);
    alpha = max(alpha, min(1.0, light));
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

const startPosition = new THREE.Vector3();
const startQuaternion = new THREE.Quaternion();
const startScale = new THREE.Vector3();
const endPosition = new THREE.Vector3();
const endQuaternion = new THREE.Quaternion();
const endScale = new THREE.Vector3();
const wearingMatrix = new THREE.Matrix4();
const wearingOffset = new THREE.Matrix4();
const wearingRotation = new THREE.Matrix4();
const travelRotation = new THREE.Matrix4();
const travelMatrix = new THREE.Matrix4();
const travelQuaternion = new THREE.Quaternion();
// Travel nearly level so the turn reads. The last approach pitches the visor
// down by another 24.6 degrees, lifting the rear strap above the camera before
// the model reaches the wearing anchor.
const travelEuler = new THREE.Euler(
  VISION_RIDE_HEADSET_PITCH.travel,
  Math.PI,
  0.025,
  "YXZ",
);
const wearingEuler = new THREE.Euler(
  VISION_RIDE_HEADSET_PITCH.wearing,
  Math.PI,
  0.025,
  "YXZ",
);
const cameraUp = new THREE.Vector3();
const projectedVisorCenter = new THREE.Vector3();
const FLIGHT_ARC_SCENE_UNITS = 0.18;

export default function VisionRideTransition({ dark }: { dark: boolean }) {
  const phase = useStacks((state) => state.visionRidePhase);
  const ready = useStacks((state) => state.visionRideReady);
  const clone = useRef<THREE.Group>(null);
  const curtainMaterial = useRef<THREE.ShaderMaterial>(null);
  const phaseRef = useRef<typeof phase | null>(null);
  const phaseStartedAt = useRef(0);
  const entryAudioFinished = useRef(false);
  const roomHidden = useRef(false);
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useFrame((state) => {
    if (phaseRef.current !== phase) {
      phaseRef.current = phase;
      phaseStartedAt.current = state.clock.elapsedTime;
      if (phase === "cruising") entryAudioFinished.current = false;
      // Re-measure the shelf anchor the moment the return flight begins so
      // the headset lands where the shelf IS, not where it was at capture.
      // Falls back to the calibrated capture when the source is unmounted.
      if (phase === "returning") visionRideRuntime.updateReturnAnchor();
    }
    const elapsed = state.clock.elapsedTime - phaseStartedAt.current;
    camera.updateWorldMatrix(true, false);
    wearingOffset.makeTranslation(0, -0.02, -0.135);
    wearingRotation.makeRotationFromEuler(wearingEuler);
    travelRotation.makeRotationFromEuler(travelEuler);
    wearingMatrix.multiplyMatrices(camera.matrixWorld, wearingOffset);
    wearingMatrix.multiply(wearingRotation);
    wearingMatrix.decompose(endPosition, endQuaternion, endScale);
    travelMatrix.multiplyMatrices(camera.matrixWorld, wearingOffset);
    travelMatrix.multiply(travelRotation);
    travelQuaternion.setFromRotationMatrix(travelMatrix);

    // Room effects follow the curtain, not the phase. Publishing only on
    // change keeps this a no-op store read on every other frame.
    const hidden = !roomEffectsActive(phase, elapsed, reducedMotion);
    if (hidden !== roomHidden.current) {
      roomHidden.current = hidden;
      useStacks.getState().setVisionRideRoomHidden(hidden);
    }

    let curtainAmount = 0;
    let crtMode = 0;
    let apertureWidth = 0;
    let apertureHeight = 0;
    let beam = 0;
    let staticAmount = 0;
    let trackVisor = false;
    if (phase === "donning") {
      const beat = donningPresentation(elapsed, reducedMotion);
      const flight = headsetFlightChoreography(beat.progress);
      curtainAmount = beat.curtainAmount;
      staticAmount = beat.staticAmount;
      trackVisor = true;
      const source = visionRideRuntime.sourceMatrix();
      if (clone.current && source) {
        source.decompose(startPosition, startQuaternion, startScale);
        clone.current.position.lerpVectors(
          startPosition,
          endPosition,
          flight.travelProgress,
        );
        cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
        clone.current.position.addScaledVector(
          cameraUp,
          flight.arc * FLIGHT_ARC_SCENE_UNITS,
        );
        clone.current.quaternion.slerpQuaternions(
          startQuaternion,
          travelQuaternion,
          flight.turnProgress,
        );
        clone.current.quaternion.slerp(endQuaternion, flight.seatProgress);
        clone.current.scale.lerpVectors(
          startScale,
          endScale,
          flight.travelProgress,
        );
      }
      if (beat.complete && ready) useStacks.getState().startVisionRide();
    } else if (phase === "cruising") {
      curtainAmount = 1;
      crtMode = 1;
      const beat = cruisingPresentation(elapsed, reducedMotion);
      apertureWidth = beat.apertureWidth;
      apertureHeight = beat.apertureHeight;
      beam = beat.beam;
      staticAmount = beat.staticAmount;
      if (
        !entryAudioFinished.current &&
        beat.complete
      ) {
        entryAudioFinished.current = true;
        sceneAudio.finishVisionRideEntry();
      }
    } else if (phase === "doffing") {
      curtainAmount = 1;
      crtMode = 1;
      const beat = doffingPresentation(elapsed, reducedMotion);
      apertureWidth = beat.apertureWidth;
      apertureHeight = beat.apertureHeight;
      beam = beat.beam;
      staticAmount = beat.staticAmount;
      if (beat.complete) useStacks.getState().showVisionRideReturn();
    } else if (phase === "returning") {
      const beat = returningPresentation(elapsed, reducedMotion);
      const flight = headsetFlightChoreography(beat.progress);
      curtainAmount = beat.curtainAmount;
      staticAmount = beat.staticAmount;
      trackVisor = true;
      const destination = visionRideRuntime.returnMatrix();
      if (clone.current && destination) {
        destination.decompose(startPosition, startQuaternion, startScale);
        clone.current.position.lerpVectors(
          endPosition,
          startPosition,
          flight.travelProgress,
        );
        cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
        clone.current.position.addScaledVector(
          cameraUp,
          flight.arc * FLIGHT_ARC_SCENE_UNITS,
        );
        clone.current.quaternion.slerpQuaternions(
          endQuaternion,
          travelQuaternion,
          flight.faceClearanceProgress,
        );
        clone.current.quaternion.slerp(startQuaternion, flight.turnProgress);
        clone.current.scale.lerpVectors(
          endScale,
          startScale,
          flight.travelProgress,
        );
      }
      if (beat.complete && destination) {
        visionRideRuntime.reset();
        useStacks.getState().finishVisionRide();
      }
    }

    const material = curtainMaterial.current;
    if (material) {
      const lens = lensCurtain(curtainAmount, reducedMotion);
      material.uniforms.uOpacity!.value = lens.opacity;
      material.uniforms.uCrtMode!.value = crtMode;
      material.uniforms.uApertureW!.value = apertureWidth;
      material.uniforms.uApertureH!.value = apertureHeight;
      material.uniforms.uBeam!.value = beam;
      material.uniforms.uStatic!.value = staticAmount;
      material.uniforms.uScale!.value = lens.coverage * LENS_FULL_SCALE;
      material.uniforms.uTime!.value = state.clock.elapsedTime;
      const center = material.uniforms.uCenter!.value as THREE.Vector2;
      if (trackVisor && clone.current) {
        clone.current.getWorldPosition(projectedVisorCenter).project(camera);
        center.set(projectedVisorCenter.x, projectedVisorCenter.y);
      } else {
        center.set(0, 0);
      }
    }
  });

  return (
    <>
      <group
        ref={clone}
        visible={
          !reducedMotion && (phase === "donning" || phase === "returning")
        }
        matrixAutoUpdate
      >
        <VisionProProp dark={dark} />
      </group>
      <mesh frustumCulled={false} renderOrder={10_000}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={curtainMaterial}
          transparent
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          uniforms={{
            uOpacity: { value: 0 },
            uCrtMode: { value: 0 },
            uApertureW: { value: 0 },
            uApertureH: { value: 0 },
            uBeam: { value: 0 },
            uStatic: { value: 0 },
            uScale: { value: 0 },
            uTime: { value: 0 },
            uCenter: { value: new THREE.Vector2() },
          }}
          vertexShader={CURTAIN_VERTEX}
          fragmentShader={CURTAIN_FRAGMENT}
        />
      </mesh>
    </>
  );
}

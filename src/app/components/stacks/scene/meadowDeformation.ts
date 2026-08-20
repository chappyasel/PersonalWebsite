import * as THREE from "three";

import type { MeadowPhysicalEvent } from "./meadowDisturbance";

export type MeadowDeformationQuality = "full" | "lean" | "off";

export const MEADOW_DEFORMATION_BOUNDS = Object.freeze({
  minX: -4.2,
  maxX: 29.4,
  minZ: -21,
  maxZ: 4.6,
});

export const MEADOW_DEFORMATION = Object.freeze({
  full: Object.freeze({ size: 512, recoveryHz: 10 }),
  lean: Object.freeze({ size: 256, recoveryHz: 6 }),
  idleClearSeconds: 7,
  holdSeconds: 1,
  softEdgeFraction: 0.25,
  behindRadius: 1.5,
  aheadRadius: 0.3,
  directionSplay: 0.4,
  maxLean: 0.36,
  heightCompression: 0.42,
  motionSuppression: 0.8,
});

export type MeadowDeformationCapsule = Readonly<{
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  directionX: number;
  directionZ: number;
  radius: number;
}>;

export type MeadowDeformationScissor = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type MeadowDeformationDiagnostics = Readonly<{
  textureCount: number;
  acceptedStamps: number;
  droppedStamps: number;
  outOfBoundsStamps: number;
  active: boolean;
  recoveryDraws: number;
  resetRevision: number;
  cpuSubmissionMs: number;
}>;

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const STAMP_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec4 uBounds;
  uniform vec4 uSegment;
  uniform vec2 uDirection;
  uniform float uRadius;
  uniform float uStrength;
  uniform float uFlattening;
  void main() {
    vec2 world = mix(uBounds.xy, uBounds.zw, vUv);
    vec2 a = uSegment.xy;
    vec2 b = uSegment.zw;
    vec2 ab = b - a;
    float ab2 = dot(ab, ab);
    float along = ab2 > 1e-8 ? clamp(dot(world - a, ab) / ab2, 0.0, 1.0) : 0.0;
    float distanceToCapsule = length(world - (a + ab * along));
    float inner = uRadius * ${(1 - MEADOW_DEFORMATION.softEdgeFraction).toFixed(2)};
    float shape = 1.0 - smoothstep(inner, uRadius, distanceToCapsule);
    float magnitude = clamp(shape * uStrength, 0.0, 1.0);
    float flattening = clamp(uFlattening, 0.0, 1.0);
    vec2 encodedDirection = uDirection * 0.5 + 0.5;
    gl_FragColor = vec4(encodedDirection * magnitude, flattening * magnitude, magnitude);
  }
`;

const COPY_VERTEX = FULLSCREEN_VERTEX;
const RECOVERY_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform float uElapsed;
  void main() {
    vec4 source = texture2D(uSource, vUv);
    if (source.a <= 0.001) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float rate = mix(2.2, 0.30, source.a);
    float nextMagnitude = source.a * exp(-uElapsed * rate);
    if (nextMagnitude <= 0.002) {
      gl_FragColor = vec4(0.0);
      return;
    }
    gl_FragColor = vec4(source.rgb / source.a * nextMagnitude, nextMagnitude);
  }
`;

const COPY_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSource;
  void main() {
    gl_FragColor = texture2D(uSource, vUv);
  }
`;

function nowMs() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function meadowDeformationContains(x: number, z: number) {
  return (
    x >= MEADOW_DEFORMATION_BOUNDS.minX &&
    x <= MEADOW_DEFORMATION_BOUNDS.maxX &&
    z >= MEADOW_DEFORMATION_BOUNDS.minZ &&
    z <= MEADOW_DEFORMATION_BOUNDS.maxZ
  );
}

export function meadowDeformationWorldToUv(x: number, z: number) {
  return {
    u:
      (x - MEADOW_DEFORMATION_BOUNDS.minX) /
      (MEADOW_DEFORMATION_BOUNDS.maxX - MEADOW_DEFORMATION_BOUNDS.minX),
    v:
      (z - MEADOW_DEFORMATION_BOUNDS.minZ) /
      (MEADOW_DEFORMATION_BOUNDS.maxZ - MEADOW_DEFORMATION_BOUNDS.minZ),
  };
}

export function meadowDeformationCapsule(
  event: Pick<
    MeadowPhysicalEvent,
    | "startX"
    | "startZ"
    | "endX"
    | "endZ"
    | "directionX"
    | "directionZ"
    | "radius"
  >,
): MeadowDeformationCapsule {
  const segmentX = event.endX - event.startX;
  const segmentZ = event.endZ - event.startZ;
  const suppliedLength = Math.hypot(event.directionX, event.directionZ);
  const segmentLength = Math.hypot(segmentX, segmentZ);
  const directionX =
    suppliedLength > 1e-5
      ? event.directionX / suppliedLength
      : segmentLength > 1e-5
        ? segmentX / segmentLength
        : 0;
  const directionZ =
    suppliedLength > 1e-5
      ? event.directionZ / suppliedLength
      : segmentLength > 1e-5
        ? segmentZ / segmentLength
        : 0;
  const radius = Math.max(0, event.radius);
  return {
    startX:
      event.startX - directionX * radius * MEADOW_DEFORMATION.behindRadius,
    startZ:
      event.startZ - directionZ * radius * MEADOW_DEFORMATION.behindRadius,
    endX: event.endX + directionX * radius * MEADOW_DEFORMATION.aheadRadius,
    endZ: event.endZ + directionZ * radius * MEADOW_DEFORMATION.aheadRadius,
    directionX,
    directionZ,
    radius,
  };
}

export function meadowDeformationScissor(
  capsule: MeadowDeformationCapsule,
  size: number,
): MeadowDeformationScissor | null {
  const minX = Math.max(
    MEADOW_DEFORMATION_BOUNDS.minX,
    Math.min(capsule.startX, capsule.endX) - capsule.radius,
  );
  const maxX = Math.min(
    MEADOW_DEFORMATION_BOUNDS.maxX,
    Math.max(capsule.startX, capsule.endX) + capsule.radius,
  );
  const minZ = Math.max(
    MEADOW_DEFORMATION_BOUNDS.minZ,
    Math.min(capsule.startZ, capsule.endZ) - capsule.radius,
  );
  const maxZ = Math.min(
    MEADOW_DEFORMATION_BOUNDS.maxZ,
    Math.max(capsule.startZ, capsule.endZ) + capsule.radius,
  );
  if (minX >= maxX || minZ >= maxZ || size <= 0) return null;
  const low = meadowDeformationWorldToUv(minX, minZ);
  const high = meadowDeformationWorldToUv(maxX, maxZ);
  const x = Math.max(0, Math.floor(low.u * size));
  const y = Math.max(0, Math.floor(low.v * size));
  const right = Math.min(size, Math.ceil(high.u * size));
  const top = Math.min(size, Math.ceil(high.v * size));
  return { x, y, width: right - x, height: top - y };
}

export function decayMeadowDeformation(magnitude: number, elapsed: number) {
  const clamped = Math.max(0, Math.min(1, magnitude));
  const rate = 2.2 + (0.3 - 2.2) * clamped;
  const next = clamped * Math.exp(-Math.max(0, elapsed) * rate);
  return next <= 0.002 ? 0 : next;
}

export function meadowDeformationStampStrength(
  strength: number,
  reducedMotion: boolean,
) {
  const clamped = Math.max(0, Math.min(1, strength));
  return reducedMotion ? Math.min(0.35, clamped) : clamped;
}

export function meadowDeformationStampFlattening(strength: number) {
  return strength > 0 ? 1 : 0;
}

export function encodeMeadowDeformation(
  directionX: number,
  directionZ: number,
  flattening: number,
  magnitude: number,
): [number, number, number, number] {
  const alpha = Math.max(0, Math.min(1, magnitude));
  return [
    (directionX * 0.5 + 0.5) * alpha,
    (directionZ * 0.5 + 0.5) * alpha,
    Math.max(0, Math.min(1, flattening)) * alpha,
    alpha,
  ];
}

export function blendMeadowDeformation(
  source: readonly [number, number, number, number],
  destination: readonly [number, number, number, number],
): [number, number, number, number] {
  const inverseSourceAlpha = 1 - source[3];
  return [
    source[0] + destination[0] * inverseSourceAlpha,
    source[1] + destination[1] * inverseSourceAlpha,
    source[2] + destination[2] * inverseSourceAlpha,
    source[3] + destination[3] * inverseSourceAlpha,
  ];
}

/** Saves every renderer field touched by an offscreen pass, including on a
 * renderer exception. Exported so the failure path can be tested headlessly. */
export function withMeadowRendererState(
  renderer: THREE.WebGLRenderer,
  pass: () => void,
) {
  const target = renderer.getRenderTarget();
  const targetViewport = target?.viewport.clone() ?? null;
  const targetScissor = target?.scissor.clone() ?? null;
  const targetScissorTest = target?.scissorTest ?? false;
  const viewport = renderer.getViewport(new THREE.Vector4()).clone();
  const scissor = renderer.getScissor(new THREE.Vector4()).clone();
  const scissorTest = renderer.getScissorTest();
  const autoClear = renderer.autoClear;
  const clearColor = renderer.getClearColor(new THREE.Color()).clone();
  const clearAlpha = renderer.getClearAlpha();
  try {
    pass();
  } finally {
    if (target && targetViewport && targetScissor) {
      target.viewport.copy(targetViewport);
      target.scissor.copy(targetScissor);
      target.scissorTest = targetScissorTest;
      renderer.setRenderTarget(target);
    } else {
      renderer.setRenderTarget(null);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
    }
    renderer.autoClear = autoClear;
    renderer.setClearColor(clearColor, clearAlpha);
  }
}

function createTarget(size: number) {
  const target = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  target.texture.generateMipmaps = false;
  return target;
}

const INITIAL_DIAGNOSTICS: MeadowDeformationDiagnostics = Object.freeze({
  textureCount: 0,
  acceptedStamps: 0,
  droppedStamps: 0,
  outOfBoundsStamps: 0,
  active: false,
  recoveryDraws: 0,
  resetRevision: 0,
  cpuSubmissionMs: 0,
});

export class MeadowDeformationController {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly stampMaterial: THREE.ShaderMaterial;
  private readonly recoveryMaterial: THREE.ShaderMaterial;
  private readonly copyMaterial: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null =
    null;
  private current: 0 | 1 = 0;
  private quality: MeadowDeformationQuality = "off";
  private hidden = false;
  private lastRecoveryAt = 0;
  private nextRecoveryAt = 0;
  private lastStampAt = -Infinity;
  private disposed = false;
  private diagnostics: MeadowDeformationDiagnostics = INITIAL_DIAGNOSTICS;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    quality: MeadowDeformationQuality,
    private readonly reducedMotion: boolean,
  ) {
    const bounds = MEADOW_DEFORMATION_BOUNDS;
    this.stampMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uBounds: {
          value: new THREE.Vector4(
            bounds.minX,
            bounds.minZ,
            bounds.maxX,
            bounds.maxZ,
          ),
        },
        uSegment: { value: new THREE.Vector4() },
        uDirection: { value: new THREE.Vector2() },
        uRadius: { value: 0 },
        uStrength: { value: 0 },
        uFlattening: { value: 0 },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: STAMP_FRAGMENT,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.recoveryMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSource: { value: null as THREE.Texture | null },
        uElapsed: { value: 0 },
      },
      vertexShader: COPY_VERTEX,
      fragmentShader: RECOVERY_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { uSource: { value: null as THREE.Texture | null } },
      vertexShader: COPY_VERTEX,
      fragmentShader: COPY_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(this.geometry, this.stampMaterial);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.setQuality(quality);
  }

  get texture() {
    return this.targets?.[this.current].texture ?? null;
  }

  getSnapshot() {
    return this.diagnostics;
  }

  private publish(patch: Partial<MeadowDeformationDiagnostics>) {
    this.diagnostics = Object.freeze({ ...this.diagnostics, ...patch });
  }

  private timedPass(pass: () => void) {
    const started = nowMs();
    try {
      withMeadowRendererState(this.renderer, pass);
    } finally {
      this.publish({
        cpuSubmissionMs: this.diagnostics.cpuSubmissionMs + (nowMs() - started),
      });
    }
  }

  private bindTarget(
    target: THREE.WebGLRenderTarget,
    scissor: MeadowDeformationScissor | null = null,
  ) {
    target.viewport.set(0, 0, target.width, target.height);
    target.scissor.set(
      scissor?.x ?? 0,
      scissor?.y ?? 0,
      scissor?.width ?? target.width,
      scissor?.height ?? target.height,
    );
    target.scissorTest = scissor !== null;
    this.renderer.setRenderTarget(target);
  }

  private clearTarget(target: THREE.WebGLRenderTarget) {
    this.timedPass(() => {
      this.bindTarget(target);
      this.renderer.autoClear = false;
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, false, false);
    });
  }

  private disposeTargets() {
    if (!this.targets) return;
    this.targets[0].dispose();
    this.targets[1].dispose();
    this.targets = null;
    this.current = 0;
    this.publish({ textureCount: 0, active: false });
  }

  setQuality(quality: MeadowDeformationQuality) {
    if (this.disposed || quality === this.quality) return;
    const previousQuality = this.quality;
    this.quality = quality;
    if (quality === "off") {
      this.disposeTargets();
      return;
    }
    const size = MEADOW_DEFORMATION[quality].size;
    if (this.targets?.[0].width === size) return;
    const old = this.targets;
    const oldCurrent = old?.[this.current] ?? null;
    const next: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] = [
      createTarget(size),
      createTarget(size),
    ];
    try {
      this.clearTarget(next[0]);
      this.clearTarget(next[1]);
      if (oldCurrent) {
        this.copyMaterial.uniforms.uSource!.value = oldCurrent.texture;
        this.quad.material = this.copyMaterial;
        this.timedPass(() => {
          this.bindTarget(next[0]);
          this.renderer.autoClear = false;
          this.renderer.render(this.scene, this.camera);
        });
      }
    } catch (error) {
      next[0].dispose();
      next[1].dispose();
      this.quality = previousQuality;
      throw error;
    }
    old?.[0].dispose();
    old?.[1].dispose();
    this.targets = next;
    this.current = 0;
    this.publish({ textureCount: 2 });
  }

  stamp(event: MeadowPhysicalEvent, now: number) {
    if (this.disposed || !this.targets || this.quality === "off") {
      this.publish({ droppedStamps: this.diagnostics.droppedStamps + 1 });
      return false;
    }
    if (this.hidden || event.strength <= 0 || event.radius <= 0) {
      this.publish({ droppedStamps: this.diagnostics.droppedStamps + 1 });
      return false;
    }
    const target = this.targets[this.current];
    const capsule = meadowDeformationCapsule(event);
    const scissor = meadowDeformationScissor(capsule, target.width);
    if (!scissor) {
      this.publish({
        droppedStamps: this.diagnostics.droppedStamps + 1,
        outOfBoundsStamps: this.diagnostics.outOfBoundsStamps + 1,
      });
      return false;
    }
    const uniforms = this.stampMaterial.uniforms;
    const segment = uniforms.uSegment!.value as THREE.Vector4;
    const direction = uniforms.uDirection!.value as THREE.Vector2;
    segment.set(capsule.startX, capsule.startZ, capsule.endX, capsule.endZ);
    direction.set(capsule.directionX, capsule.directionZ);
    uniforms.uRadius!.value = capsule.radius;
    uniforms.uStrength!.value = meadowDeformationStampStrength(
      event.strength,
      this.reducedMotion,
    );
    uniforms.uFlattening!.value = meadowDeformationStampFlattening(
      event.strength,
    );
    this.quad.material = this.stampMaterial;
    this.timedPass(() => {
      this.bindTarget(target, scissor);
      this.renderer.autoClear = false;
      this.renderer.render(this.scene, this.camera);
    });
    this.lastStampAt = now;
    this.lastRecoveryAt = now + MEADOW_DEFORMATION.holdSeconds;
    this.nextRecoveryAt =
      this.lastRecoveryAt +
      1 / MEADOW_DEFORMATION[this.quality].recoveryHz;
    this.publish({
      acceptedStamps: this.diagnostics.acceptedStamps + 1,
      active: true,
    });
    return true;
  }

  private recover(elapsed: number) {
    if (!this.targets || elapsed <= 0) return;
    const source = this.targets[this.current];
    const destination = this.targets[this.current === 0 ? 1 : 0];
    this.recoveryMaterial.uniforms.uSource!.value = source.texture;
    this.recoveryMaterial.uniforms.uElapsed!.value = elapsed;
    this.quad.material = this.recoveryMaterial;
    this.timedPass(() => {
      this.bindTarget(destination);
      this.renderer.autoClear = false;
      this.renderer.render(this.scene, this.camera);
    });
    this.current = this.current === 0 ? 1 : 0;
    this.publish({ recoveryDraws: this.diagnostics.recoveryDraws + 1 });
  }

  tick(now: number, hidden: boolean) {
    if (this.disposed || !this.targets || this.quality === "off") return;
    if (hidden) {
      this.hidden = true;
      return;
    }
    if (this.hidden) {
      this.hidden = false;
      if (!this.reducedMotion && this.diagnostics.active) {
        if (now - this.lastStampAt >= MEADOW_DEFORMATION.idleClearSeconds) {
          this.clear(false);
          return;
        }
        const recoveryStartsAt =
          this.lastStampAt + MEADOW_DEFORMATION.holdSeconds;
        if (now <= recoveryStartsAt) {
          this.lastRecoveryAt = recoveryStartsAt;
          this.nextRecoveryAt =
            recoveryStartsAt +
            1 / MEADOW_DEFORMATION[this.quality].recoveryHz;
          return;
        }
        this.recover(now - Math.max(this.lastRecoveryAt, recoveryStartsAt));
        this.lastRecoveryAt = now;
        this.nextRecoveryAt =
          now + 1 / MEADOW_DEFORMATION[this.quality].recoveryHz;
      }
      return;
    }
    if (!this.diagnostics.active || this.reducedMotion) return;
    if (now - this.lastStampAt >= MEADOW_DEFORMATION.idleClearSeconds) {
      this.clear(false);
      return;
    }
    if (now < this.nextRecoveryAt) return;
    this.recover(now - this.lastRecoveryAt);
    this.lastRecoveryAt = now;
    this.nextRecoveryAt = now + 1 / MEADOW_DEFORMATION[this.quality].recoveryHz;
  }

  clear(reset = true) {
    if (this.targets) {
      this.clearTarget(this.targets[0]);
      this.clearTarget(this.targets[1]);
    }
    this.lastStampAt = -Infinity;
    this.publish({
      active: false,
      resetRevision: reset
        ? this.diagnostics.resetRevision + 1
        : this.diagnostics.resetRevision,
    });
  }

  applyResetRevision(resetRevision: number) {
    if (resetRevision === this.diagnostics.resetRevision) return;
    this.clear(false);
    this.publish({ resetRevision });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeTargets();
    this.scene.remove(this.quad);
    this.geometry.dispose();
    this.stampMaterial.dispose();
    this.recoveryMaterial.dispose();
    this.copyMaterial.dispose();
  }
}

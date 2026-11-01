import { BLINKER_GLSL } from "./coordinationCrossingShader";

export const DUST_VERTEX = /* glsl */ `
  attribute float aKind;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;
  uniform vec3 uColors[3];
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uBoost;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = uColors[int(aKind + 0.5)];
    float twinkle = 0.74 + 0.26 * sin(uTime * 2.6 + aPhase);
    vAlpha = min(1.0, aAlpha * twinkle * uBoost);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * 6.0 * uPixelRatio;
  }
`;

/** The page's dark sprite, stop for stop: a grain burns white at its core. */
export const DUST_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    if (r >= 1.0) discard;
    float a = r < 0.12
      ? 1.0
      : r < 0.4
        ? mix(1.0, 0.3, (r - 0.12) / 0.28)
        : mix(0.3, 0.0, (r - 0.4) / 0.6);
    vec3 color = mix(vColor, vec3(1.0), 1.0 - clamp(r / 0.12, 0.0, 1.0));
    gl_FragColor = vec4(color, a * vAlpha);
    #include <colorspace_fragment>
  }
`;

/** A quad that always faces the camera, so the block and its shadow hold the
 * page's flat shape however the prop is carried. The fragment works in the
 * page's ems, which is the unit the blinker is written in. */
export const BLINKER_VERTEX = /* glsl */ `
  uniform float uLocalPerEm;
  varying vec2 vEm;

  void main() {
    vEm = position.xy / uLocalPerEm;
    vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float scale = length(modelViewMatrix[0].xyz);
    centre.xy += position.xy * scale;
    gl_Position = projectionMatrix * centre;
  }
`;

/** Premultiplied, so one quad holds an opaque block and an additive glow. */
export const BLINKER_FRAGMENT = /* glsl */ `
  uniform vec2 uBlockMin;
  uniform vec2 uBlockMax;
  uniform float uEm;
  uniform vec3 uAccent;
  uniform float uBlock;
  uniform float uBloom;
  uniform float uHeat;
  varying vec2 vEm;
  ${BLINKER_GLSL}

  void main() {
    float inside = blinkerCoverage(vEm, 1.0 / max(fwidth(vEm.x), 0.0001));
    float glow = blinkerGlow(vEm) * uBloom * (1.0 - inside);
    float block = inside * uBlock;
    gl_FragColor = vec4(uAccent * (glow + block * uHeat), block);
    #include <colorspace_fragment>
  }
`;

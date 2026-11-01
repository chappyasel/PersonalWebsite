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

/** The page's sprite, stop for stop. `core` is how white a grain burns at its
 * middle: fully on the dark page, not at all on the light one. */
const grainFragment = (core: string, encode: string) => /* glsl */ `
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
    vec3 color = mix(vColor, vec3(1.0), ${core} * (1.0 - clamp(r / 0.12, 0.0, 1.0)));
    gl_FragColor = vec4(color, a * vAlpha);
    ${encode}
  }
`;

export const DUST_FRAGMENT = grainFragment(
  "1.0",
  "#include <colorspace_fragment>",
);

/** The same grains once they leave the orb: drawn in the page's pixels over the
 * finished frame, where the room's depth of field cannot blur them away. Colors
 * go straight to the display-encoded screen, as in the crossing's composite. */
export const SCATTER_VERTEX = /* glsl */ `
  attribute float aKind;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;
  uniform vec3 uColors[3];
  uniform vec2 uViewport;
  uniform float uDpr;
  uniform float uTime;
  uniform float uGain;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = uColors[int(aKind + 0.5)];
    float twinkle = 0.74 + 0.26 * sin(uTime * 2.6 + aPhase);
    vAlpha = min(1.0, aAlpha * twinkle * uGain);
    gl_Position = vec4(
      position.x / uViewport.x * 2.0 - 1.0,
      1.0 - position.y / uViewport.y * 2.0,
      0.0,
      1.0
    );
    gl_PointSize = aSize * 6.0 * uDpr;
  }
`;

export const SCATTER_FRAGMENT = `uniform float uCore;
${grainFragment("uCore", "")}`;

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

/** Premultiplied, so one quad holds an opaque block and an additive glow.
 *
 * The quad is a camera-facing square about five orbs wide, and on screen that
 * square is exactly the faint warm rectangle that showed around the orb while
 * it charged. Pixels the glow does not reach are discarded, not written as
 * zero, so nothing in the composer (blending, ambient occlusion's transparency
 * targets, a GPU's rounding) can see the square's edge. The cutoff is far
 * below one display step even at the full charge-and-burst lift. */
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
    if (block <= 0.0 && glow < 1.0 / 4096.0) discard;
    gl_FragColor = vec4(uAccent * (glow + block * uHeat), block);
    #include <colorspace_fragment>
  }
`;

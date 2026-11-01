import { CROSSING_TIMELINE as T } from "./coordinationCrossing";

const ms = (value: number) => value.toFixed(1);

/** coordination.sh's .blinker::after, layer for layer: the room's orb and the
 * crossing both draw this one. Needs uBlockMin, uBlockMax, and uEm declared, in
 * any one unit. */
export const BLINKER_GLSL = /* glsl */ `
float erfApprox(float x) {
  float side = x < 0.0 ? -1.0 : 1.0;
  float a = abs(x);
  float d = 1.0 + a * (0.278393 + a * (0.230389 + a * (0.000972 + a * 0.078108)));
  d *= d;
  d *= d;
  return side - side / d;
}

/** A Gaussian blur of the blinker's rectangle, which is what a box-shadow is. */
float blurredBlock(vec2 px, float sigma) {
  float scale = 1.0 / (sigma * 1.41421356);
  vec2 low = (px - uBlockMin) * scale;
  vec2 high = (px - uBlockMax) * scale;
  return 0.25
    * (erfApprox(low.x) - erfApprox(high.x))
    * (erfApprox(low.y) - erfApprox(high.y));
}

float blinkerGlow(vec2 px) {
  return 1.0
    - (1.0 - blurredBlock(px, 0.08 * uEm) * 0.8)
    * (1.0 - blurredBlock(px, 0.28 * uEm) * 0.46)
    * (1.0 - blurredBlock(px, 0.75 * uEm) * 0.22);
}

/** A box-shadow paints only outside its box, so this is where the glow stops. */
float blinkerCoverage(vec2 px, float unitsPerPixel) {
  vec2 inside = clamp(0.5 + min(px - uBlockMin, uBlockMax - px) * unitsPerPixel, 0.0, 1.0);
  return inside.x * inside.y;
}
`;

export const COORDINATION_CROSSING_VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Composites over the room's finished frame. uWire comes from the props alone:
 * red is a wire line and green is any prop pixel, which is what lets grass and
 * city fade while the props turn to wire. Colors arrive display-encoded and
 * leave the same way, so nothing here converts color space. */
export const COORDINATION_CROSSING_FRAGMENT = /* glsl */ `
uniform sampler2D uRoom;
uniform sampler2D uWire;
uniform vec2 uBuffer;
uniform vec2 uOrb;
uniform float uDpr;
uniform float uTime;
uniform float uReach;
uniform float uDark;
uniform vec3 uGround;
uniform vec3 uDot;
uniform vec3 uTone;
uniform vec3 uAccent;
uniform vec2 uBlockMin;
uniform vec2 uBlockMax;
uniform float uEm;
uniform float uBlock;
uniform float uBloom;
uniform float uFlare;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float orange(vec3 c) {
  float high = max(c.r, max(c.g, c.b));
  float low = min(c.r, min(c.g, c.b));
  float saturation = (high - low) / max(high, 0.001);
  float hue = step(c.b, c.g) * step(c.g, c.r)
    * smoothstep(0.25, 0.6, (c.r - c.g) / max(high - low, 0.001));
  return hue * smoothstep(0.5, 0.72, saturation) * smoothstep(0.42, 0.62, high);
}

float shade(vec3 c) {
  float lifted = pow(luma(c), 0.62);
  return uDark > 0.5 ? lifted : 1.0 - lifted;
}

vec2 uvAt(vec2 px) {
  return vec2(px.x * uDpr, uBuffer.y - px.y * uDpr) / uBuffer;
}

float stage(float start, float span, float spread, float front, float jitter) {
  return clamp((uTime - start - front * spread - jitter * ${ms(T.jitter)}) / span, 0.0, 1.0);
}

${BLINKER_GLSL}

/** The flare outside the block, and the block on top. Light stops at the block's
 * edge like the page's shadow, so a blink leaves an empty block in the glow. */
vec3 lightBlinker(vec3 color, vec2 px) {
  if (uBlock <= 0.0 && uBloom <= 0.0) return color;
  float inside = blinkerCoverage(px, uDpr);
  float outside = 1.0 - inside;
  color = mix(color, uAccent, blinkerGlow(px) * uBloom * outside);

  float away = length(max(uBlockMin - px, max(px - uBlockMax, vec2(0.0)))) / uEm;
  float heat = (1.4 * exp(-away * away / 0.5)
    + 0.8 * exp(-away * away / 5.0)
    + 0.5 * exp(-away * away / 40.0)) * uFlare * uBloom * outside;
  vec3 light = mix(uAccent, vec3(1.0, 0.82, 0.66), clamp(heat * 0.5, 0.0, 1.0));
  color = mix(color, light, 1.0 - exp(-heat));

  vec3 core = mix(uAccent, vec3(1.0, 0.9, 0.8), uFlare * 0.75);
  return mix(color, core, inside * uBlock);
}

void sampleCell(vec2 px, inout float tone, inout float hot) {
  vec2 uv = uvAt(px);
  vec3 room = texture2D(uRoom, uv).rgb;
  tone += texture2D(uWire, uv).g * shade(room) * 0.2;
  hot = max(hot, orange(room));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uBuffer;
  vec2 px = vec2(gl_FragCoord.x, uBuffer.y - gl_FragCoord.y) / uDpr;
  vec2 cell = floor(px / 16.0);
  vec2 centre = (cell + 0.5) * 16.0;
  float jitter = hash(cell);
  float front = min(distance(px, uOrb) / uReach, 1.0);

  vec3 room = texture2D(uRoom, uv).rgb;
  vec2 wire = texture2D(uWire, uv).rg;
  vec3 mono = mix(uGround, uTone, shade(room));

  float background = stage(${ms(T.backgroundStart)}, ${ms(T.backgroundSpan)}, ${ms(T.backgroundSpread)}, front, jitter);
  vec3 backdrop = mix(room, mono, smoothstep(0.0, 0.45, background));
  backdrop = mix(backdrop, uGround, smoothstep(0.35, 1.0, background));

  float wiring = stage(${ms(T.wireStart)}, ${ms(T.wireSpan)}, ${ms(T.wireSpread)}, front, jitter);
  vec3 solid = mix(room, mono, smoothstep(0.0, 0.4, wiring));
  solid = mix(solid, uGround, smoothstep(0.3, 0.85, wiring));
  vec3 line = mix(uTone, uAccent, orange(room));
  vec3 prop = mix(solid, line, wire.r * smoothstep(0.05, 0.45, wiring));
  vec3 matrix = mix(backdrop, prop, wire.g);

  float cellFront = min(distance(centre, uOrb) / uReach, 1.0);
  float halftone = smoothstep(
    0.0,
    1.0,
    clamp((uTime - ${ms(T.halftoneStart)} - cellFront * ${ms(T.halftoneSpread)}) / ${ms(T.halftoneSpan)}, 0.0, 1.0)
  );
  if (halftone <= 0.0) {
    gl_FragColor = vec4(lightBlinker(matrix, px), 1.0);
    return;
  }

  float tone = 0.0;
  float hot = 0.0;
  sampleCell(centre, tone, hot);
  sampleCell(centre + vec2(-4.0, -4.0), tone, hot);
  sampleCell(centre + vec2(4.0, -4.0), tone, hot);
  sampleCell(centre + vec2(-4.0, 4.0), tone, hot);
  sampleCell(centre + vec2(4.0, 4.0), tone, hot);

  float shrink = smoothstep(
    ${ms(T.shrinkStart)},
    ${ms(T.shrinkStart + T.shrinkSpan)},
    uTime + (jitter - 0.5) * ${ms(T.shrinkJitter)}
  );
  float presence = smoothstep(0.02, 0.18, tone) * (1.0 - shrink);
  float radius = mix(1.25, 8.8 * sqrt(tone), presence);
  float outAt = ${ms(T.orangeOutStart)} + jitter * ${ms(T.orangeOutSpread)};
  float lit = hot * (1.0 - smoothstep(outAt - 70.0, outAt, uTime));
  radius = mix(radius, 7.4, lit);
  vec3 ink = mix(mix(uDot, uTone, presence), uAccent, lit);

  // Settles on the page's own radial-gradient, 1px solid to 1.5px clear, which
  // ramps linearly. A smoothstep here leaves the last dots visibly different.
  float edge = 0.25 + 0.25 * (1.0 - shrink);
  float covered = 1.0 - clamp((distance(px, centre) - radius + edge) / (2.0 * edge), 0.0, 1.0);
  vec3 dots = mix(uGround, ink, covered);
  gl_FragColor = vec4(lightBlinker(mix(matrix, dots, halftone), px), 1.0);
}
`;

"use client";

// Atmosphere for the homepage 3D scene — gradient sky dome, fog-matched palette,
// hemisphere fill, camera-tracking key light with soft shadows, and dust.
import { markMeadowReady } from "../loading";
import { progressRef, useStacks } from "../store";
import { PALETTES, type Palette, rand } from "../theme";
import { Environment, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  type MutableRefObject,
  type RefObject,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";

import Butterflies from "./Butterflies";
import Meadow from "./Meadow";
import Petals from "./Petals";
import Wildlife from "./Wildlife";
import { registerCinematicSun } from "./cinematicSun";
import { coordinationGlobeDiagnosticsController } from "./coordinationGlobeDiagnostics";
import {
  COORDINATION_AGENT_COLOR,
  COORDINATION_GLOBE_INTERACTION_ID,
  COORDINATION_HUMAN_COLOR,
} from "./coordinationNetwork";
import { DAYLIGHT_RENDERING } from "./daylightRendering";
import {
  freeRoamDiagnosticsController,
  freeRoamFogVisible,
} from "./freeRoamDiagnostics";
import {
  getSceneInteraction,
  registerSceneInteraction,
} from "./interactionRegistry";
import { claimEffectLayer, effectLayerAges } from "./layeredEffects";
import { MEADOW_LAYOUT_REVISION } from "./meadowField";
import { type SceneQualityPlan } from "./quality";
import {
  SCENE_IMPULSE_SKY_DURATION,
  getSceneImpulse,
  sceneImpulseSkyScale,
} from "./sceneImpulse";
import { useScenePerformanceSettings } from "./scenePerformance";
import { useSceneQualityControls } from "./sceneQualityController";
import { getSeatAmount } from "./seated";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import { SKY_LIGHTING } from "./skyLighting";
import { updateManualWorldMatrix } from "./staticWorld";
import { MID_X, STACKS_DESKTOP_MIN_WIDTH, TRAVEL_X } from "./worldLayout";

const FIREWORK_LAYERS = 4;
type CoordinationFlickerSignal = MutableRefObject<number>;

// The meadow ships — statically, since round 2. React.lazy put its JS fetch
// AFTER first mount, where the boot reveal could not see it (the loading
// manager never counts a chunk fetch) and grass popped in after the curtain
// lifted. A static import folds it into the StacksCanvas async chunk, which
// the route budget does not measure (the manifest lists only StacksHome), so
// the homepage entry stays untouched. Flipping this to false still re-parks
// the feature at zero cost. The diagnostics registry also accepts
// `?nomeadow` as a reload-time seed for its live Meadow control.
const MEADOW_ENABLED = true;

// Chappy's morning, painted truthfully. Dark theme is 3:45am San Francisco —
// fully dark, cold indigo, the city mostly asleep; light theme is just after
// first light. One ShaderMaterial for both: `uDark` crossfades the palettes
// (damped, no recompile), `uDawn` advances the morning with the traverse
// (scroll-tied and reversible), and a compass-true analytic skyline sits low
// on the horizon with its own haze term (the dome opts out of scene fog).
//
// Left→right the traverse pans the real east-facing view: Twin Peaks /
// Mt Davidson → Sutro Tower on its hill → Coit on Telegraph Hill →
// Transamerica → the downtown cluster → Salesforce Tower → the ember →
// Bay Bridge with the Bay Lights. Truthful details: the Salesforce crown is
// DARK at 3:45 (Day for Night runs dusk→2am); in light mode its glass follows
// the atmospheric grade until hover/click wakes the installation. The Bay
// Lights run dusk-until-dawn, so they are the one landmark alive all night.
//
// The dome must also run the same tonemapping + colorspace encode as every
// lit material — without those includes the authored hexes never reach the
// screen. IGN dither in output space breaks up gradient banding.
const SKY_VERTEX = `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = `
  // ---- Washington, seen from Columbia Island. -------------------------
  //
  // Sitting down in the About armchair turns the camera around, and what is
  // at your back is where he grew up. The vantage is the Mount Vernon Trail
  // on Columbia Island, at the Navy–Merchant Marine Memorial (38.8762 N,
  // 77.0496 W), eye 2.3 m above the water, looking ENE across the Potomac.
  // Every number below is derived from that one position, so moving it
  // invalidates all of them together.
  //
  // The postcard vantage — the Tidal Basin's own rim — cannot work, and the
  // arithmetic is short enough to write down. The Monument and the Jefferson
  // stand 902 m apart, so seeing them 23° apart puts you 2.2 km back; the
  // basin is 1 km across, and from anywhere on it they are 41° to 112° apart
  // against a seated frame 39° wide. From the Virginia shore they are 22.9°
  // apart, the Capitol comes with them, and the only cost is that the water
  // in front of you is the Potomac rather than the basin itself.
  //
  // Azimuths are stored as offsets FROM THE MONUMENT, positive to screen
  // right. (The seated camera looks +z, so screen-right is world −x and
  // a = atan(dir.z, dir.x) increases rightward — verified against a
  // screenshot, because the wrong sign mirrors the entire city.) The
  // Monument itself is placed at run time by uDcAnchor, because where it can
  // go depends on the viewport: the desktop placard owns 528 px of the right
  // of the frame, and a phone in portrait sees only 19° of sky in total.
  #define DC_OLDPOST  0.0638
  #define DC_NMAAHC   0.0262
  #define DC_WHITTEN  0.1804
  #define DC_CASTLE   0.2659
  #define DC_HIRSH    0.3491
  #define DC_JEFF     0.3994
  #define DC_CAPITOL  0.4676
  #define DC_HUD      0.5230
  // The memory-house is composed independently of the surveyed skyline. At
  // 0.005 it literally straddled the Monument; −0.045 centres the reduced
  // silhouette in the rendered gap between desktop nav and Monument.
  #define DC_HOME    -0.0450
  // The memory-house is 70% of the previous authored size in both axes.
  #define DC_HOME_X_SCALE 2.529
  #define DC_HOME_Y_SCALE 0.553
  //
  // Heights are elevation above the WATERLINE, and the waterline is the true
  // horizon (e = 0) exactly. It is also the mirror plane, and a mirror that
  // does not sit on the horizon is the one error that puts every reflection
  // in the frame at odds with the thing it reflects.
  //
  // The Monument is the unit everything else is quoted in, because it is the
  // number a viewer actually checks: Old Post Office tower 0.41 of it, the
  // Jefferson 0.35, the Capitol 0.32 even with Capitol Hill under it, and
  // the 130 ft federal ceiling 0.23. Nothing in Washington comes within 40%
  // of 555 ft, and a Capitol dome drawn anywhere near the Monument's height
  // makes the whole image wrong.
  #define DC_MON_TOP  0.0913   // 555 ft 5⅛ in at 1 925 m
  #define DC_MON_BASE 0.0036   // it stands on a low knoll
  #define DC_MON_HW   0.004365 // 55 ft 1½ in square base → 10.08 : 1
  #define DC_MON_TPR  0.375    // half-width runs base → 0.625× over the shaft
  #define DC_MON_PYR  0.099    // pyramidion, as a fraction of the height
  // A flat mirror reflects one to one in angle — marginally longer, if
  // anything, never shorter. What compression survives here is ripple slope
  // and near-bank occlusion, not geometry, so it is small.
  #define REFLECT_K 1.06

  // How long Salesforce Tower's crown runs after it is clicked. Mirrored by
  // SF_SHOW_DURATION in the JS below, which stops feeding the clock.
  #define SF_SHOW 9.0

  // ---- The two named towers, in the dome's own angular units. Both are quoted
  // from the real buildings and both are drawn against the same apparent
  // distance the rest of the skyline is (≈3.2 km), so they can be checked
  // against each other rather than eyeballed one at a time.
  //
  // Transamerica Pyramid: 853 ft to the tip of the spire on a 175 ft square
  // base. The WINGS — lifts on the east face, stairwell and smoke tower on the
  // west — break out of the sloping faces at the 29th floor (387 ft, 0.454 of
  // the height) and stop at the top of the 48th (641 ft, 0.752), where the
  // spire takes over.
  #define TR_TOP    0.082
  #define TR_HW     0.0102
  #define TR_WING_B 0.0372
  #define TR_WING_T 0.0617
  // Salesforce Tower: 1,070 ft to the top of the crown, 970 ft to the roof.
  // Its lower shaft stays broad before the upper floors pull inward more
  // decisively; the crown is about 70% of the base width and ends flat.
  #define SF_TOP    0.100
  #define SF_ROOF   0.0907
  #define SF_HW     0.0100
  // 0.70 × 0.80 = 0.56 of the base width at the flat top.
  #define SF_TAPER  0.440

  // Jasper, 45 Lansing: 430 ft / 39 floors. Keep its quiet rectangular mass
  // east of Salesforce and west of the Bay Bridge, in the same atmospheric
  // material as the rest of the skyline. Its identity lives in one window,
  // not a contrasting facade treatment.
  #define JASPER_AZ  -1.190
  #define JASPER_TOP  0.0515
  #define JASPER_HW   0.0068

  // Longest a fireworks launch runs: seven shells, the last let go at 3.10 s,
  // up to 1.08 s of rise and a 3.4 s willow on top. Mirrored by FIRE_DURATION
  // in the JS below, which stops feeding the clock.
  #define FIRE_WINDOW 7.8

  uniform float uDark;     // 0 light theme … 1 dark theme (damped crossfade)
  uniform float uDawn;     // scroll offset 0…1 — the traverse advances the morning
  uniform float uPan;      // azimuth the traverse has swept (see SkyDome)
  uniform float uHover;    // azimuth the pointer is over, or 99 for none
  uniform float uTime;
#ifdef COORDINATION_SKY_FLICKER
  uniform float uCoordinationFlicker;
#endif
  uniform float uSimplify; // degrade rung: 1 = two bands, no city/stars/ember
  uniform float uPost;     // 1 = composer owns the frame
  uniform float uFires[${FIREWORK_LAYERS}]; // launch ages, < 0 idle
  uniform float uFireSeeds[${FIREWORK_LAYERS}]; // each launch deals its own shells
  uniform float uSeat;     // 0 at the shelf … 1 seated (scene/seated.ts)
  uniform float uDcAnchor; // azimuth the Washington Monument is drawn at —
                           // solved per frame from the viewport (see SkyDome)
  uniform float uSfHover;  // 0…1 damped: pointer is on Salesforce's crown
  uniform float uSfShow;   // seconds since the crown was clicked, < 0 idle
  uniform float uSfSeed;   // re-deals the crown's palette on every wake
  uniform float uJasperHover; // 0…1 damped: pointer is on 45 Lansing
  uniform float uJasperShow;  // seconds since Chappy's window was clicked
  uniform vec3 zenithL;  uniform vec3 zenithD;
  uniform vec3 horizonL; uniform vec3 horizonD;
  uniform vec3 shadowL;  uniform vec3 shadowD;
  uniform vec3 emberL;   uniform vec3 emberD;
  uniform vec3 dcZenithL;
  uniform vec3 dcHorizonL;
  uniform vec3 dcShadowL;
  uniform vec3 dcWaterL;
  uniform vec3 cityL;    uniform vec3 cityD;
  uniform vec3 windowL;  uniform vec3 windowD;
  varying vec3 vLocal;

  // Hoskins hash-without-sine — fract(sin(x)*43758) bands or degenerates on
  // some mobile GPU drivers.
  float hash1(float n) {
    n = fract(n * 0.1031);
    n *= n + 33.33;
    n *= n + n;
    return fract(n);
  }
  float hash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  // Smooth dome profile for hills — quartic falloff, zero outside |a-c| > w.
  float hump(float a, float c, float w) {
    float q = (a - c) / w;
    float m = max(1.0 - q * q, 0.0);
    return m * m;
  }
  // A tiny skyline block in angular coordinates. Keeping the authored tower
  // inventory in this one idiom makes every quoted height and bearing legible
  // in the shader instead of hiding the skyline inside a random roof hash.
  float sfBlock(float az, float el, float centre, float halfW, float top) {
    return step(abs(az - centre), halfW) * step(0.001, el) * step(el, top);
  }
  // One rule for every lit window in this city, so the generic carpet and the
  // named towers can never fall out of step. A FIXED per-cell hash crossing a
  // smoothly moving threshold, plus a slow per-window phase that turns a few
  // over on their own clock — never a re-deal. Offsetting the hash by
  // floor(uDawn * 6.0) is what made the whole skyline blink to a new pattern
  // six times per traverse ("the building lights jump on movement").
  float windowLit(vec2 cell, float thr) {
    float h = hash2(cell);
    float slow = 0.006 * sin(uTime * 0.05 + hash2(cell + 3.0) * 6.2832);
    return smoothstep(thr + 0.004, thr - 0.004, h + slow);
  }
  // Distance from a point to a segment, in (azimuth, elevation). The bird is
  // four of these and nothing else.
  float segD(vec2 p, vec2 s0, vec2 s1) {
    vec2 pa = p - s0, ba = s1 - s0;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
    return length(pa - ba * h);
  }
  // Bilinear value noise on the hash — two octaves are enough for the very
  // low-frequency air the bands need.
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a0 = hash2(i);
    float b0 = hash2(i + vec2(1.0, 0.0));
    float c0 = hash2(i + vec2(0.0, 1.0));
    float d0 = hash2(i + vec2(1.0, 1.0));
    return mix(mix(a0, b0, f.x), mix(c0, d0, f.x), f.y);
  }

  // The sky's three-band gradient as a function of elevation, so the basin can
  // ask what the sky looks like at an elevation that is not its own. Water is
  // a mirror; giving it a water hex instead of the sky's own band is what
  // makes CG lakes look like painted floors, and it would also drop the
  // reflection off the dawn ramp and the theme crossfade.
  vec3 skyBand(float el, vec3 sh, vec3 ho, vec3 ze) {
    vec3 c = mix(sh, ho, smoothstep(0.0, 0.16, el));
    return mix(c, ze, smoothstep(0.045, 0.30, el));
  }

  // The anti-twilight arch, applied to a sky that already exists. The
  // vantage faces 040° and the April sun sets at 275°, so the sun is ~120°
  // behind the viewer's left shoulder and there is NO afterglow in front of
  // you at all. Painting one there was why every marble face in the old
  // frame was a pale shape on a brighter sky.
  //
  // What is in front of you instead is the Earth's own shadow: a dark
  // blue-grey band from the horizon to roughly 6° elevation, with the Belt
  // of Venus — a rose band — above it from about 6° to 12°. Dark at the
  // bottom, warm above, cool at the top. Sampled twice, once by the sky and
  // once by the water at the mirrored elevation, so the two cannot disagree.
  // The shadow is a COLOUR, not an exposure: it is the unlit atmosphere, so
  // it is cool and desaturated, and mixing toward it is what finally pulled
  // the light theme off the ACES shoulder. Grading it down by multiplication
  // alone left a bright beige horizon that no marble could out-run, which is
  // exactly the ghost this was supposed to fix.
  vec3 dcSkyGrade(vec3 c, float el, vec3 umbraC, vec3 beltC,
                  float shK, float beltA, float dim) {
    // Evening exposure first: the whole vault comes down a stop, most of it
    // low. This is what the light theme needs and the dark theme does not —
    // the morning palette sits on the ACES shoulder, where nothing drawn in
    // front of it can separate from it, and the old vista was a ghost for
    // exactly that reason.
    c *= mix(dim, 1.0, smoothstep(0.0, 0.34, el));
    c = mix(c, umbraC, shK * smoothstep(0.125, -0.030, el));
    float bq = (el - 0.152) / 0.066;
    return c + beltC * exp(-(bq * bq)) * beltA;
  }

  // One Washington weather field, sampled by both the sky and its mirrored
  // elevation in the Potomac. Broad, vertically compressed noise makes long
  // strands instead of a row of cotton balls. The third channel is a higher,
  // thinner veil, so every cloud is not parked on the same horizontal deck.
  vec3 dcCloudField(float az, float el) {
    vec2 drift = vec2(uTime * 0.0052, -uTime * 0.0007);
    vec2 p = vec2(az * 5.6, el * 22.0) + drift;
    float macro = 0.68 * vnoise(p * vec2(0.84, 1.18))
                + 0.32 * vnoise(vec2(p.x * 1.52 + p.y * 0.42,
                                      p.y * 1.85) + 11.4);
    float billow = 0.58 * vnoise(p * vec2(3.15, 4.60) + 3.7)
                 + 0.42 * vnoise(p * vec2(5.80, 7.40) + 19.2);
    float deck = smoothstep(0.060, 0.095, el)
               * (1.0 - smoothstep(0.175, 0.245, el));
    float mass = smoothstep(0.49, 0.72, macro + 0.11 * billow);
    float eroded = smoothstep(0.42, 0.76, billow);
    float body = mass * mix(0.58, 0.88, eroded) * deck;
    // Break the deck into weather systems at a scale much wider than its
    // scalloped edge; this avoids a wallpaper of equal cotton balls.
    float systems = smoothstep(0.30, 0.69,
      vnoise(vec2(az * 4.4 + uTime * 0.0024, 7.1)));
    body *= systems;

    vec2 wp = vec2(az * 11.5 - uTime * 0.0031,
                   el * 27.0 + uTime * 0.0004);
    float wispNoise = 0.62 * vnoise(wp)
                    + 0.38 * vnoise(wp * vec2(2.7, 1.35) + 23.0);
    float wisps = smoothstep(0.61, 0.79, wispNoise)
                * smoothstep(0.145, 0.205, el)
                * (1.0 - smoothstep(0.255, 0.315, el));
    return vec3(macro + 0.16 * billow, body, wisps);
  }

  // The flock is also a reusable field. Sampling it at mirrored elevation in
  // the water pass gives the birds the same ripple shear as the architecture
  // instead of inventing a disconnected second animation.
  float dcBirdField(float az, float el) {
    if (el < 0.092 || el > 0.168) return 0.0;
    float dcBirdT = mod(uTime, 30.0);
    float flock = 0.0;
    for (int df = 0; df < 2; df++) {
      float ff = float(df);
      float bt = fract(dcBirdT / 30.0 + ff * 0.5);
      float flockId = floor(uTime / 30.0) + ff * 19.0;
      for (int db = 0; db < 3; db++) {
        float bf = float(db);
        vec2 org = vec2(-0.23 + 0.54 * bt + bf * 0.028,
                        0.108 + bf * 0.015 + ff * 0.018
                        + 0.008 * sin(bt * 4.0 + bf * 1.9));
        vec2 q = vec2(az, el) - org;
        if (dot(q, q) > 0.00018) continue;
        float w = 0.0062 + 0.0008 * hash1(flockId + bf * 7.1);
        float beat = sin(uTime * (6.3 + bf * 0.35) + bf * 1.7);
        vec2 elbowL = vec2(-w * 0.52, w * 0.25 * beat);
        vec2 elbowR = vec2( w * 0.52, w * 0.25 * beat);
        vec2 tipL = vec2(-w, w * (0.48 * sin(uTime * 6.3 - 0.8 + bf) - 0.05));
        vec2 tipR = vec2( w, w * (0.48 * sin(uTime * 6.3 - 0.8 + bf) - 0.05));
        float d = min(min(segD(q, vec2(0.0), elbowL), segD(q, elbowL, tipL)),
                      min(segD(q, vec2(0.0), elbowR), segD(q, elbowR, tipR)));
        flock = max(flock, smoothstep(0.00155, 0.00038, d)
                   * smoothstep(0.0, 0.10, bt)
                   * (1.0 - smoothstep(0.88, 1.0, bt)));
      }
    }
    return flock;
  }

  // The city, drawn ONCE as a function of height above the waterline, which
  // is what lets one call serve both the upright image and its reflection.
  // Returns coverage in .x, distance haze in .y and tone in .z (0 = an unlit
  // federal block, 1 = floodlit marble), composited BACK TO FRONT so a
  // nearer building overwrites a farther one and brings its own haze and its
  // own lighting with it. Depth order is write order, and that is the whole
  // reason the Capitol can carry twice the Monument's haze without a second
  // pass. The spread is not decoration: on a clear evening the Jefferson at
  // 1.3 km sits at 0.12 and the Capitol at 3.8 km at 0.32, and one haze
  // constant across the frame throws away the depth the distances give free.
  vec3 dcCity(float x, float h) {
    vec3 r = vec3(0.0);
    if (h < 0.0 || h > DC_MON_TOP + 0.002) return r;

    // Continuous low civic fabric extends well beyond both possible frame
    // edges. It is intentionally subordinate to the named buildings and will
    // be mostly screened by trees, but unlike the previous mask it never
    // dissolves into transparency at an arbitrary composition boundary.
    float datumTop = 0.0052
                   + 0.0020 * step(-0.18, x)
                   + 0.0014 * step(0.56, x)
                   - 0.0010 * step(0.12, x) * step(x, 0.22);
    float civicDatum = step(-0.34, x) * step(x, 0.72)
                     * step(0.0007, h) * step(h, datumTop);
    r = mix(r, vec3(1.0, 0.24, 0.035), civicDatum);

    // US Capitol, 3.8 km out and the haziest thing in frame. Capitol Hill
    // puts its base 27 m above the water, which is most of the reason a
    // 288 ft building reads as tall from here at all. The dome is 96 ft
    // against a 751 ft building — ONE EIGHTH of the width — and a dome
    // spanning a third of the mass is the single most common way to draw
    // this building wrong. Bottom to top: long low block, narrow drum, dome,
    // lantern, and the Statue of Freedom as a pip at 6.8% of the height. The
    // wings' pediments, colonnades and porticoes are cut; only the roofline
    // matters at 77 px wide.
    float cx = x - DC_CAPITOL;
    if (abs(cx) < 0.0315 && h < 0.0302) {
      // Three masses and shallow pediments keep the wings from reading as a
      // single office block. The centre projects toward the viewer and gets
      // the brighter stone tone carried in r.z.
      float wings = step(abs(cx), 0.0307) * step(0.0064, h) * step(h, 0.0138);
      float centre = step(abs(cx), 0.0102) * step(0.0060, h) * step(h, 0.0158);
      float wingCut = step(0.0206, abs(cx)) * step(0.0120, h);
      wings *= 1.0 - wingCut;
      float pedH = 0.0158 - abs(cx) * 0.34;
      float pediment = step(abs(cx), 0.0100) * step(0.0149, h) * step(h, pedH);
      float drum = step(abs(cx), 0.0038) * step(0.0156, h) * step(h, 0.0204);
      float dome = step(length(vec2(cx / 0.00425, (h - 0.0204) / 0.00655)), 1.0)
                 * step(0.0204, h);
      float lant = step(abs(cx), 0.0015) * step(0.0268, h) * step(h, 0.0284);
      float stat = step(abs(cx), 0.0007) * step(0.0284, h) * step(h, 0.0294);
      float m = clamp(wings + centre + pediment + drum + dome + lant + stat, 0.0, 1.0);
      // The dome and the Statue are floodlit and the wings are not, so after
      // dark the whole building resolves to one small bright cap on a dark
      // block — which is all anyone pictures of it anyway.
      float centreStone = step(abs(cx), 0.0103) * step(0.0146, h);
      r = mix(r, vec3(1.0, 0.32, mix(0.10, 0.95, centreStone)), m);
    }

    // Old Post Office clock tower, 315 ft — 0.57 of the Monument, the third
    // tallest structure in Washington and the only thing in it that reads as
    // a tower. Two verticals of very different heights is a better
    // composition than one vertical alone, and there is no other candidate:
    // every memorial on the Mall is under a quarter of the Monument.
    float ox = x - DC_OLDPOST;
    if (abs(ox) < 0.0078 && h < 0.0392) {
      float base = step(abs(ox), 0.0064) * step(0.0015, h) * step(h, 0.0062);
      float shaft = step(abs(ox), 0.00525) * step(0.0062, h) * step(h, 0.0294);
      float clock = step(abs(ox), 0.00635) * step(0.0230, h) * step(h, 0.0306);
      float corn  = step(abs(ox), 0.00725) * step(0.0306, h) * step(h, 0.0327);
      float pk = clamp((h - 0.0327) / 0.0046, 0.0, 1.0);
      float roof = step(abs(ox), 0.0068 * (1.0 - pk * 0.86))
                 * step(0.0327, h) * step(h, 0.0373);
      float mast = step(abs(ox), 0.00055) * step(0.0370, h) * step(h, 0.0390);
      float litClock = step(0.0230, h) * step(h, 0.0294);
      r = mix(r, vec3(1.0, 0.24, mix(0.28, 0.72, litClock)),
              clamp(base + shaft + clock + corn + roof + mast, 0.0, 1.0));
    }

    // The low city is authored as the buildings this sightline actually
    // crosses, not a noise-generated cornice strip. Each mass uses its own
    // setback, roof, material tone, and distance haze. Tree canopy hides the
    // lower storeys in the final composite, as it does in the NPS vista.

    // Federal Triangle and Mall museums behind the Monument: long classical
    // fronts, but separated by real streets and courtyards. These explicit
    // gaps must remain sky/tree gaps—never alpha-fade the district at either
    // end.
    float triangle = 0.0;
    triangle += step(0.034, x) * step(x, 0.071)
              * step(0.0010, h) * step(h, 0.0142);
    triangle += step(0.075, x) * step(x, 0.111)
              * step(0.0010, h) * step(h, 0.0168);
    triangle += step(0.116, x) * step(x, 0.145)
              * step(0.0010, h) * step(h, 0.0135);
    // Shallow porticoes and rooftop pavilions break the three blocks without
    // inventing high-rise roof clutter Washington does not have.
    triangle += step(0.082, x) * step(x, 0.102)
              * step(0.0168, h) * step(h, 0.0190);
    triangle += step(0.122, x) * step(x, 0.138)
              * step(0.0135, h) * step(h, 0.0152);
    r = mix(r, vec3(1.0, 0.25, 0.08), clamp(triangle, 0.0, 1.0));

    // National Museum of African American History and Culture: three bronze
    // corona tiers flare upward just behind/right of the Monument. This dark,
    // compact counterform is visible in the actual Mall sequence and stops
    // the Monument/Old Post pairing from floating over anonymous boxes.
    float nx = x - DC_NMAAHC;
    float n0t = clamp((h - 0.0030) / 0.0040, 0.0, 1.0);
    float n1t = clamp((h - 0.0070) / 0.0040, 0.0, 1.0);
    float n2t = clamp((h - 0.0110) / 0.0040, 0.0, 1.0);
    float n0 = step(abs(nx), mix(0.0043, 0.0072, n0t))
             * step(0.0030, h) * step(h, 0.0070);
    float n1 = step(abs(nx), mix(0.0040, 0.0068, n1t))
             * step(0.0070, h) * step(h, 0.0110);
    float n2 = step(abs(nx), mix(0.0037, 0.0064, n2t))
             * step(0.0110, h) * step(h, 0.0150);
    r = mix(r, vec3(1.0, 0.21, 0.07), clamp(n0 + n1 + n2, 0.0, 1.0));

    // Jamie L. Whitten / USDA: a five-storey projecting centre, lower
    // symmetrical wings, recessed links, end pavilions, and shallow hipped
    // roofs. GSA identifies precisely this three-part composition.
    float wx = x - DC_WHITTEN;
    float whWings = step(abs(wx), 0.0360) * step(0.0010, h) * step(h, 0.0138);
    float whLinks = (step(abs(wx - 0.021), 0.0070)
                   + step(abs(wx + 0.021), 0.0070))
                  * step(0.0010, h) * step(h, 0.0115);
    float whCentre = step(abs(wx), 0.0100) * step(0.0010, h) * step(h, 0.0186);
    float whEnds = (step(abs(wx - 0.031), 0.0050)
                  + step(abs(wx + 0.031), 0.0050))
                 * step(0.0010, h) * step(h, 0.0154);
    float whRoof = step(abs(wx), 0.0090 - 0.18 * max(h - 0.0186, 0.0))
                 * step(0.0186, h) * step(h, 0.0206);
    float whitten = clamp(whWings + whLinks + whCentre + whEnds + whRoof, 0.0, 1.0);
    r = mix(r, vec3(1.0, 0.16, 0.34), whitten);

    // Low Smithsonian museum terraces leave breathing room around the Castle.
    float museums = 0.0;
    museums += step(0.221, x) * step(x, 0.239)
             * step(0.0010, h) * step(h, 0.0118);
    museums += step(0.293, x) * step(x, 0.326)
             * step(0.0010, h) * step(h, 0.0132);
    museums += step(0.331, x) * step(x, 0.354)
             * step(0.0010, h) * step(h, 0.0108);
    r = mix(r, vec3(1.0, 0.20, 0.12), clamp(museums, 0.0, 1.0));

    // Smithsonian Castle: 447-foot red-sandstone body with nine towers. At
    // this distance four roofline cues survive—the 140-foot north tower,
    // central battlements, and two unequal turrets—so those are what we draw.
    float sx = x - DC_CASTLE;
    float castleBody = step(abs(sx), 0.0295) * step(0.0010, h) * step(h, 0.0102);
    float castleKeep = step(abs(sx + 0.004), 0.0085)
                     * step(0.0102, h) * step(h, 0.0148);
    float castleNorth = step(abs(sx + 0.0200), 0.0042)
                      * step(0.0080, h) * step(h, 0.0192);
    float northCapT = clamp((h - 0.0192) / 0.0032, 0.0, 1.0);
    float castleNorthCap = step(abs(sx + 0.0200), 0.0046 * (1.0 - northCapT))
                         * step(0.0192, h) * step(h, 0.0224);
    float castleTurrets = (step(abs(sx - 0.0130), 0.0033)
                         * step(0.0090, h) * step(h, 0.0165))
                        + (step(abs(sx - 0.0240), 0.0025)
                         * step(0.0080, h) * step(h, 0.0142));
    float castle = clamp(castleBody + castleKeep + castleNorth
                       + castleNorthCap + castleTurrets, 0.0, 1.0);
    r = mix(r, vec3(1.0, 0.23, 0.16), castle);

    // Hirshhorn: the low elevated concrete drum is a crucial shape change
    // between the Castle/USDA band and Forrestal's severe horizontal slab.
    float ix = x - DC_HIRSH;
    float hirshBody = step(abs(ix), 0.0135)
                    * step(0.0060, h) * step(h, 0.0130);
    float hirshCrown = step(length(vec2(ix / 0.0135, (h - 0.0130) / 0.0024)), 1.0)
                     * step(0.0130, h);
    float hirshPiers = (step(abs(ix - 0.0060), 0.0018)
                      + step(abs(ix + 0.0060), 0.0018))
                     * step(0.0010, h) * step(h, 0.0060);
    r = mix(r, vec3(1.0, 0.18, 0.055),
            clamp(hirshBody + hirshCrown + hirshPiers, 0.0, 1.0));

    // Forrestal / L'Enfant: broad modern slabs and a recessed bridge rather
    // than another classical box. The height stays low; their identity is
    // horizontal proportion and stepped roof plant.
    float modern = 0.0;
    modern += step(0.358, x) * step(x, 0.382)
            * step(0.0010, h) * step(h, 0.0158);
    modern += step(0.362, x) * step(x, 0.376)
            * step(0.0158, h) * step(h, 0.0180);
    modern += step(0.418, x) * step(x, 0.442)
            * step(0.0010, h) * step(h, 0.0144);
    r = mix(r, vec3(1.0, 0.17, 0.04), clamp(modern, 0.0, 1.0));

    // Robert C. Weaver HUD building: Marcel Breuer's ten-storey curvilinear
    // X is the one unmistakably modern roofline east of this composition.
    // A shallow concave top and paired end shoulders carry that identity at
    // skyline scale; a rectangular tower would be factually wrong.
    float hx = x - DC_HUD;
    float hudTop = 0.0162 + 0.0030 * smoothstep(0.006, 0.029, abs(hx));
    float hud = step(abs(hx), 0.0300) * step(0.0010, h) * step(h, hudTop);
    float hudEnds = (step(abs(hx - 0.027), 0.0050)
                   + step(abs(hx + 0.027), 0.0050))
                  * step(0.0010, h) * step(h, 0.0204);
    r = mix(r, vec3(1.0, 0.15, 0.03), clamp(hud + hudEnds, 0.0, 1.0));

    // Washington Monument — the hero, and the composition. Aspect is drawn,
    // not eyeballed: 10.08 : 1, because at 20 : 1 it is a hairline the
    // antialiasing eats and at 6 : 1 it is a chimney. The shaft narrows to
    // 0.625 of its base half-width over the lower 0.901 of the height (the
    // old 0.82 was barely half the real taper), and the pyramidion is the
    // top 0.099 — a true triangle at 3.19 : 1. Entrance, observation windows
    // and the flagpole ring are all cut; none of them survive 11 px.
    if (abs(x) < DC_MON_HW + 0.0004 && h < DC_MON_TOP + 0.001) {
      float sh0 = DC_MON_TOP - (DC_MON_TOP - DC_MON_BASE) * DC_MON_PYR;
      float t = clamp((h - DC_MON_BASE) / (sh0 - DC_MON_BASE), 0.0, 1.0);
      float hw = DC_MON_HW * (1.0 - DC_MON_TPR * t);
      float shaft = step(abs(x), hw) * step(DC_MON_BASE, h) * step(h, sh0);
      float pk = clamp((h - sh0) / (DC_MON_TOP - sh0), 0.0, 1.0);
      float pyr = step(abs(x), hw * (1.0 - pk))
                * step(sh0, h) * step(h, DC_MON_TOP);
      // Free detail, and unmistakably this building: the marble changes tone
      // at 27% of the height, where construction stopped for the war and
      // resumed from a different quarry. A few per cent of value is all it
      // takes, and it only reads because the mass is lit rather than black.
      float seam = mix(0.95, 1.0,
                       step(DC_MON_BASE + 0.27 * (sh0 - DC_MON_BASE), h));
      r = mix(r, vec3(1.0, 0.18, seam), clamp(shaft + pyr, 0.0, 1.0));
    }

    // Jefferson Memorial, 1.27 km out and so the least hazy thing here.
    // 129 ft tall on a 165 ft diameter: WIDER than it is high, 0.78 : 1, and
    // the shallow saucer springs from a drum that runs the building's full
    // width. That is the entire difference from the Capitol, whose dome is
    // narrow on a tall drum — and it is why there is no finial. The dome has
    // no lantern and no spire; a spike here turns it into the one silhouette
    // it must not be mistaken for.
    //
    // The colonnade IS the building at this scale: what reads is the sky
    // BETWEEN the shafts, not lines ruled onto a solid mass. Softened,
    // because the gaps are a few pixels and step() would crawl with the pan.
    float jx = x - DC_JEFF;
    if (abs(jx) < 0.0215 && h < 0.0320) {
      float steps = step(abs(jx), 0.0210) * step(0.0007, h) * step(h, 0.0025);
      float stylo = step(abs(jx), 0.0198) * step(0.0025, h) * step(h, 0.0043);
      float body  = step(abs(jx), 0.0176) * step(0.0040, h) * step(h, 0.0180);
      float corn  = step(abs(jx), 0.0194) * step(0.0154, h) * step(h, 0.0188);
      float dome  = step(length(vec2(jx / 0.0176, (h - 0.0186) / 0.0132)), 1.0)
                  * step(0.0186, h);
      float gapU = abs(fract((jx + 0.0176) / 0.0044) - 0.5);
      float colGap = (1.0 - smoothstep(0.14, 0.30, gapU))
                   * step(0.0040, h) * step(h, 0.0118);
      float m = clamp(steps + stylo + body + corn + dome, 0.0, 1.0)
              * (1.0 - colGap * 0.84);
      r = mix(r, vec3(1.0, 0.12, 1.0), m);
    }
    return r;
  }

  // Facade relief follows each authored building family instead of laying one
  // grid over the entire city. Classical blocks get cornices and pilasters;
  // the Castle gets sparse slit windows; modern slabs get horizontal bands.
  float dcFederalRelief(float x, float h) {
    if (h < 0.002 || h > 0.0245) return 0.0;
    float classicalRange = step(0.034, x) * step(x, 0.216);
    float museumRange = (step(0.221, x) * step(x, 0.239))
                      + (step(0.293, x) * step(x, 0.354));
    float modernRange = (step(0.358, x) * step(x, 0.382))
                      + (step(0.418, x) * step(x, 0.442))
                      + step(abs(x - DC_HUD), 0.030);
    float castleRange = step(abs(x - DC_CASTLE), 0.030);
    float cornice = smoothstep(0.465, 0.499, abs(fract(h / 0.0041) - 0.5));
    float pilaster = smoothstep(0.455, 0.495, abs(fract(x * 165.0) - 0.5));
    float colonnade = smoothstep(0.43, 0.495, abs(fract(x * 230.0) - 0.5));
    float ribbons = smoothstep(0.44, 0.495, abs(fract(h / 0.0030) - 0.5));
    float castleSlits = smoothstep(0.44, 0.495, abs(fract(x * 285.0) - 0.5))
                      * step(0.006, h);
    return clamp(classicalRange * (0.62 * cornice + 0.34 * pilaster)
               + museumRange * colonnade * 0.56
               + modernRange * ribbons * 0.72
               + castleRange * castleSlits * 0.38, 0.0, 1.0);
  }

  vec3 dcDistrictTint(float x) {
    vec3 tint = vec3(1.0);
    if (abs(x - DC_NMAAHC) < 0.008)
      tint = vec3(1.18, 0.68, 0.34); // dark bronze corona
    if (abs(x - DC_WHITTEN) < 0.037)
      tint = vec3(1.07, 1.05, 0.95); // pale marble and red-tile roof warmth
    if (abs(x - DC_CASTLE) < 0.031)
      tint = vec3(1.12, 0.67, 0.54); // Seneca red sandstone
    if (abs(x - DC_HIRSH) < 0.015)
      tint = vec3(0.92, 0.82, 0.82); // pink-gray aggregate concrete
    if ((x > 0.358 && x < 0.382) || (x > 0.418 && x < 0.442))
      tint = vec3(0.88, 0.93, 1.02); // Forrestal/L'Enfant concrete
    if (abs(x - DC_HUD) < 0.031)
      tint = vec3(0.76, 0.84, 0.94); // Breuer's exposed precast concrete
    return tint;
  }

  float dcFacadeWindows(float x, float h) {
    float result = 0.0;
    vec2 classical = fract(vec2(x * 330.0, h * 330.0));
    float classicalPane = step(abs(classical.x - 0.5), 0.19)
                        * step(abs(classical.y - 0.5), 0.24);
    float classicalRange = step(0.034, x) * step(x, 0.216);
    result = max(result, classicalPane * classicalRange);

    vec2 museum = fract(vec2(x * 270.0, h * 300.0));
    float museumPane = step(abs(museum.x - 0.5), 0.13)
                     * step(abs(museum.y - 0.5), 0.23);
    float museumRange = (step(0.221, x) * step(x, 0.239))
                      + (step(0.293, x) * step(x, 0.354));
    result = max(result, museumPane * clamp(museumRange, 0.0, 1.0));

    vec2 castle = fract(vec2((x - DC_CASTLE) * 430.0, h * 250.0));
    float castlePane = step(abs(castle.x - 0.5), 0.10)
                     * step(abs(castle.y - 0.5), 0.18)
                     * step(abs(x - DC_CASTLE), 0.030);
    result = max(result, castlePane);

    vec2 modern = fract(vec2(x * 390.0, h * 430.0));
    float modernPane = step(abs(modern.x - 0.5), 0.30)
                     * step(abs(modern.y - 0.5), 0.12);
    float modernRange = (step(0.358, x) * step(x, 0.382))
                      + (step(0.418, x) * step(x, 0.442))
                      + step(abs(x - DC_HUD), 0.030);
    result = max(result, modernPane * clamp(modernRange, 0.0, 1.0));
    return result;
  }

  // Chappy's childhood home, reduced to the architectural cues that survive
  // at this distance: a tall two-storey white facade, black hipped roof and
  // shutters, a full-width porch with slim columns, and the yellow front
  // door. Returns overall coverage, dark trim, and door coverage. It lives
  // left of the Monument like a memory set just outside the literal skyline.
  vec4 dcHome(float x, float h) {
    // Seventy per cent of the previous angular width. The reference is a tall,
    // narrow two-storey house, but the memory-object must remain a quiet
    // foreground recollection beside the 555-foot Monument.
    float q = (x - DC_HOME) * DC_HOME_X_SCALE;
    if (q < -0.043 || q > 0.070 || h < 0.0004 || h > 0.050)
      return vec4(0.0);

    // Front facade plus the narrower right side plane: the reference is a
    // three-quarter view, not a flat elevation. The side's roof/eaves step
    // down slightly with perspective while the front remains dominant.
    float frontLower = step(-0.036, q) * step(q, 0.021)
                     * step(0.003, h) * step(h, 0.023);
    // The side/garage wing is deliberately subordinate to the front facade.
    // Its old 0.047-wide run was nearly as wide as the house front and read
    // as a second attached building after the overall scale came down.
    float sideLowerEdge = 0.052 - 0.12 * max(h - 0.004, 0.0);
    float sideLower = step(0.021, q) * step(q, sideLowerEdge)
                    * step(0.004, h) * step(h, 0.021);
    float frontUpper = step(-0.033, q) * step(q, 0.020)
                     * step(0.023, h) * step(h, 0.038);
    float sideUpperEdge = 0.049 - 0.13 * max(h - 0.021, 0.0);
    float sideUpper = step(0.020, q) * step(q, sideUpperEdge)
                    * step(0.021, h) * step(h, 0.036);

    // Low hip roof with a short ridge left of centre, then a longer falling
    // side plane toward the visible right wall.
    float rt = clamp((h - 0.038) / 0.011, 0.0, 1.0);
    float roofFront = step(-0.041 + 0.028 * rt, q)
                    * step(q, 0.029 - 0.018 * rt)
                    * step(0.037, h) * step(h, 0.049);
    float roofSide = step(0.020 - 0.008 * rt, q)
                   * step(q, 0.052 - 0.035 * rt)
                   * step(0.0355, h) * step(h, 0.0475);

    float porchRoof = step(-0.041, q) * step(q, 0.028)
                    * step(0.0190, h) * step(h, 0.0217);
    float porchDeck = step(-0.040, q) * step(q, 0.030)
                    * step(0.0012, h) * step(h, 0.0037);
    float columns = (step(abs(q + 0.031), 0.0009)
                   + step(abs(q + 0.014), 0.0008)
                   + step(abs(q - 0.004), 0.0008)
                   + step(abs(q - 0.022), 0.0009))
                  * step(0.0035, h) * step(h, 0.0200);
    float whole = clamp(frontLower + sideLower + frontUpper + sideUpper
                      + roofFront + roofSide + porchRoof + porchDeck + columns,
                        0.0, 1.0);

    // White-framed windows are knocked out of the black upper siding; a
    // smaller inset restores the dark glass and leaves a narrow pale frame.
    float upperRow = step(0.0270, h) * step(h, 0.0344);
    float upperOuter = (step(abs(q + 0.024), 0.0040)
                      + step(abs(q + 0.007), 0.0038)
                      + step(abs(q - 0.011), 0.0038)
                      + step(abs(q - 0.030), 0.0031)) * upperRow;
    float upperGlass = (step(abs(q + 0.024), 0.0026)
                      + step(abs(q + 0.007), 0.0025)
                      + step(abs(q - 0.011), 0.0025)
                      + step(abs(q - 0.030), 0.0020))
                     * step(0.0281, h) * step(h, 0.0333);
    upperOuter = clamp(upperOuter, 0.0, 1.0);
    upperGlass = clamp(upperGlass, 0.0, 1.0);
    float blackUpper = clamp(frontUpper + sideUpper, 0.0, 1.0)
                     * (1.0 - upperOuter) + upperGlass;

    // The ground floor remains white, with dark shutters around cool reflected
    // glass and a tall olive door just left of centre, as in the reference.
    float lowerGlass = (step(abs(q + 0.027), 0.0027)
                      + step(abs(q + 0.015), 0.0027)
                      + step(abs(q - 0.014), 0.0027)
                      + step(abs(q - 0.033), 0.0022))
                     * step(0.008, h) * step(h, 0.0153);
    float shutters = (step(abs(q + 0.031), 0.0012)
                    + step(abs(q + 0.011), 0.0012)
                    + step(abs(q - 0.018), 0.0012)
                    + step(abs(q - 0.037), 0.0010))
                   * step(0.0074, h) * step(h, 0.0160);
    // A porch only reads when there is space behind the columns. The source
    // photo's deep porch shadow is a stronger likeness cue than another row
    // of tiny window rectangles at this distance.
    float porchRecess = step(-0.033, q) * step(q, 0.020)
                      * step(0.0040, h) * step(h, 0.0187);
    float darkTrim = clamp(roofFront + roofSide + porchRoof + blackUpper
                         + lowerGlass + shutters + porchRecess, 0.0, 1.0);
    float door = step(abs(q + 0.0015), 0.0030)
               * step(0.0037, h) * step(h, 0.0184);
    float side = clamp(sideLower + sideUpper, 0.0, 1.0);
    return vec4(whole, darkTrim, door, side);
  }

  float dcHomeColumns(float x, float h) {
    float q = (x - DC_HOME) * DC_HOME_X_SCALE;
    return clamp(step(abs(q + 0.031), 0.00125)
               + step(abs(q + 0.014), 0.00110)
               + step(abs(q - 0.004), 0.00110)
               + step(abs(q - 0.022), 0.00125), 0.0, 1.0)
         * step(0.0035, h) * step(h, 0.0200);
  }

  // Cool blue-gray reflections restore the reference's glass instead of
  // letting every pane merge into the black shutters/siding. Kept separate
  // from dcHome's trim channel so the palette can remain theme-aware.
  float dcHomeWindows(float x, float h) {
    float q = (x - DC_HOME) * DC_HOME_X_SCALE;
    float upper = (step(abs(q + 0.024), 0.0026)
                 + step(abs(q + 0.007), 0.0025)
                 + step(abs(q - 0.011), 0.0025)
                 + step(abs(q - 0.030), 0.0020))
                * step(0.0281, h) * step(h, 0.0333);
    float lower = (step(abs(q + 0.027), 0.0027)
                 + step(abs(q + 0.015), 0.0027)
                 + step(abs(q - 0.014), 0.0027)
                 + step(abs(q - 0.033), 0.0022))
                * step(0.0080, h) * step(h, 0.0153);
    return clamp(upper + lower, 0.0, 1.0);
  }

  // Every window is illuminated at night. This is a memory-object, not a
  // literal occupancy simulation, and a partial pattern reads as an arbitrary
  // failure at this scale. Kept as a separate field so day still uses cool
  // reflected glass while night and the Potomac receive the warm treatment.
  float dcHomeLitWindows(float x, float h) {
    return dcHomeWindows(x, h);
  }

  // The source door has a glazed multi-pane top, not a solid yellow block.
  float dcHomeDoorGlass(float x, float h) {
    float q = (x - DC_HOME) * DC_HOME_X_SCALE;
    float pane = step(abs(q + 0.0015), 0.00215)
               * step(0.0130, h) * step(h, 0.0177);
    float mullions = clamp(step(abs(q + 0.0015), 0.00024)
                         + step(abs(h - 0.01535), 0.00022), 0.0, 1.0);
    return pane * (1.0 - mullions);
  }

  // The mature park canopy along the far bank — massing, not hero trees.
  // Individual crowns at this scale are noise, so this returns the HEIGHT of one low
  // irregular band and the caller decides coverage: two octaves of the same
  // value noise the air uses, and the silhouettes' plinths deliberately
  // disappear into it, because that is where the trees actually stand.
  // Returning the height rather than the mask is what lets the caller take a
  // top slice off it for the crowns without a second noise evaluation.
  float canopyTop(float az) {
    float n = 0.46 * vnoise(vec2(az * 5.5, 2.3))
            + 0.30 * vnoise(vec2(az * 16.0, 8.1))
            + 0.24 * vnoise(vec2(az * 78.0, 3.9));
    // Pushed off the middle: a band whose height wanders inside a narrow
    // range is a ruled line with a wobble on it, not a stand of trees.
    n = smoothstep(0.28, 0.78, n);
    // Mature elm, oak, and mixed park trees on the far shore — East and West
    // Potomac Park, 1.3 to 1.9 km out — which is 0.0018 to 0.0080 rad. The octaves above are
    // already right and only the amplitude needed moving: the 78× octave
    // gives cells about 0.013 rad wide and one crown at that range subtends
    // 0.011, so one cell is one tree. Any taller and the rounded humps stop
    // reading as a tree line and start reading as hills, which the Potomac
    // basin conspicuously does not have.
    //
    // The far shore is not one planting, and drawing it as one is what left
    // the whole left of the frame empty. The left park mass is older, taller,
    // and darker; the basin side is clipped lower and catches more open sky.
    // The caller re-derives the same ramp to shade them apart — it is one
    // smoothstep, and sharing it through a return value would cost the
    // reflection a second evaluation.
    float park = smoothstep(0.10, -0.24, az);
    return 0.0018 + 0.0062 * n + 0.0060 * n * park;
  }

  void main() {
    vec3 dir = normalize(vLocal);
    float e = dir.y;               // elevation: 0 at the horizon ring
    // Azimuth. The dome rides with the camera (SkyDome), so the traverse's
    // pan is applied here as a uniform instead of coming from parallax.
    // It used to come from parallax — the dome was pinned at MID_X while the
    // camera ran x 0→26.4 — and that put the camera 39% of the radius
    // off-centre at each end, where the near wall is 2.3× closer than the
    // far one. Degrees-per-pixel then collapsed near that wall and a single
    // floor(a * 64.0) city column ballooned into a hard-edged rectangle
    // hundreds of pixels wide, hazed to city colour: the "clipping in the
    // fog under Sutro" the owner reported. A rigid pan has uniform angular
    // scale everywhere, so the skyline reads the same at both ends.
    float a = atan(dir.z, dir.x) + uPan;

    vec3 zenithC  = mix(zenithL, zenithD, uDark);
    vec3 horizonC = mix(horizonL, horizonD, uDark);
    vec3 shadowC  = mix(shadowL, shadowD, uDark);
    vec3 emberC   = mix(emberL, emberD, uDark);
    vec3 cityC    = mix(cityL, cityD, uDark);
    vec3 windowC  = mix(windowL, windowD, uDark);

    // The morning arrives as you travel. The ember was already scroll-tied,
    // but a glow in one corner of the sky isn't a sunrise — the whole vault
    // has to warm and lift. Tinting the palette here (rather than the final
    // colour) carries the shift into the haze and the skyline too, so the
    // city warms with the sky instead of staying a cold cutout on a warm
    // backdrop. Held subtle on purpose: this is 3:45 → maybe 4:40am.
    vec3 dawnTint = vec3(1.0) + vec3(0.050, 0.025, -0.018) * uDawn;
    float dawnLift = 1.0 + uDawn * mix(0.10, 0.17, uDark);
    zenithC  *= dawnTint * dawnLift;
    horizonC *= dawnTint * dawnLift;
    shadowC  *= dawnTint * dawnLift;
    cityC    *= dawnTint;

    // Three-band, non-monotonic: shadow band AT the horizon, the brighter
    // slate band above it (the inversion that reads "sky", not "gradient"),
    // then the fall to zenith. Below the horizon the void deepens — hard in
    // the dark theme so the floor grounds, gently in light.
    //
    // v5: the zenith ramp was 0.08→0.45, but the frame only reaches e ≈ 0.20,
    // so the zenith hex never got past a quarter weight and the whole visible
    // sky was one flat horizon band. 0.045→0.30 lands the cool cap inside the
    // frame and gives the sky a vertical arc to read.
    vec3 col = skyBand(e, shadowC, horizonC, zenithC);
    // The room camera only sees roughly the bottom 0.20 elevation of this
    // enormous dome. Even after the v5 ramp correction, that meant the blue
    // zenith was still diluted by two warm bands and the light sky printed as
    // grey. Pull the blue cap down into the visible frame in LIGHT mode only,
    // preserving the dark sky byte-for-byte at uDark=1 and preserving the
    // damped theme crossfade at every value between. The low gate keeps the
    // paler, half-strength blue horizon intact behind the skyline. This second
    // pass makes the cap deliberately decisive: the previous 42% contribution
    // was still mostly neutralised by the paler base bands after ACES.
    float lightCap = (1.0 - uDark) * smoothstep(0.040, 0.180, e);
    col = mix(col, zenithC, lightCap * 0.84);
    col = mix(col, shadowC * mix(0.88, 0.45, uDark), smoothstep(0.02, 0.30, -e));

    // Air. Two octaves of very low-frequency drift over the band mix — a real
    // sky is never a clean interpolation, and the ±3% this adds is also what
    // keeps the shallow gradient from posterising into bands. Placed before
    // the ember/city so nothing structural shimmers; the drift rate is slow
    // enough (~3 min per cell) to read as weather, not animation.
    float hz = 0.65 * vnoise(vec2(a * 1.7, e * 5.5) + uTime * 0.0035)
             + 0.35 * vnoise(vec2(a * 4.1, e * 12.0) + 11.0 - uTime * 0.0025);
    col *= 1.0 + (hz - 0.5) * 0.06 * (1.0 - uSimplify);

    // Ember / low sun, azimuth-anchored near the end of the traverse so
    // travel pans toward it. Dark: grows from nothing (3:45 is fully dark)
    // to a first ember. Light: an always-warm glow that climbs as uDawn
    // rises, plus a whisper of horizon warmth everywhere. The degrade ladder
    // keeps the dawn — pow() with a negative base is undefined in GLSL ES,
    // so the gaussians square explicitly.
    float qa = (a + 1.15) / mix(0.42, 0.28, uDark);
    float azFall = exp(-(qa * qa));
    float emberElev = mix(0.030 + 0.10 * uDawn, 0.020, uDark);
    float emberW = mix(0.055, 0.020 + 0.015 * uDawn, uDark);
    // Light dawn growth 0.38+0.12→0.34+0.20 (v4)→0.26+0.36 (v5): the morning
    // has to VISIBLY arrive over the traverse — the flat curve read as a
    // static backdrop and starved the harness's dawn-delta gate. v5 needed
    // the extra travel because the retuned sky is warm at rest, so a glow
    // that only grows a little no longer separates from its own backdrop.
    float emberAmp = mix(0.26 + 0.36 * uDawn, 0.30 * uDawn, uDark);
    float qe = (e - emberElev) / emberW;
    float ember = exp(-(qe * qe)) * emberAmp * azFall;
    float qg = (e - 0.02) / 0.04;
    ember += (1.0 - uDark)
           * ${SKY_LIGHTING.atmosphere.horizonEmber.toFixed(3)}
           * exp(-(qg * qg));
    // Dark mode keeps the additive first-ember energy it was authored with.
    // In light mode the same broad gaussian must tint the existing air rather
    // than add HDR energy: additive light was the smooth near-white band over
    // SF that survived every cloud/fog retune and crushed title contrast.
    float lightEmber = min(ember, 1.0) * (1.0 - uDark);
    vec3 emberSky = mix(col, emberC, 0.38)
                  * ${SKY_LIGHTING.atmosphere.emberLift.toFixed(2)};
    col = mix(col, emberSky,
              lightEmber * ${SKY_LIGHTING.atmosphere.emberMix.toFixed(2)});
    col += emberC * ember * uDark;
    // Light theme only: the morning sky already sits on the ACES shoulder, so
    // adding energy there buys brightness and almost no colour — the glow
    // washed out instead of warming. The dawn therefore also TINTS, pulling
    // blue out of the band it lights, which is what a long scattering path
    // actually does to the sky around a low sun.
    col *= mix(vec3(1.0), vec3(1.035, 1.0, 0.93), lightEmber);

    // Capture the atmospheric colour and ember before the skyline is drawn.
    // The seated DC vista needs its own dusk contribution later, while San
    // Francisco's haze must converge on the shared air behind its buildings.
    vec3 sfHazeBase = col;

    // Production light mode keeps a source-less dawn. Cinematic+ compiles a
    // visible upper-left sun and a broad warm halo into its own material
    // variant. Occlusion-aware shafts come from the physical sun mesh and
    // post-process below, not from painted bands in the sky.
    float day = 1.0 - uDark;

#ifdef CINEMATIC_PLUS
    float localA = a - uPan;
    const float sunA = -1.82;
    const float sunE = 0.205;
    vec2 sunQ = vec2((localA - sunA) / 0.018, (e - sunE) / 0.018);
    float sunD = length(sunQ);
    float sunDisc = smoothstep(1.08, 0.82, sunD) * day;
    float sunHalo = exp(-sunD * sunD * 0.055) * day;

    col += vec3(1.0, 0.73, 0.40) * sunHalo * 0.16;
    col = mix(col, vec3(1.34, 1.12, 0.82), sunDisc * 0.94);
#endif

    // ---- The moon, dark theme only. It rises from behind the skyline,
    // crests near the middle of the traverse, then settles behind the city
    // again. It is painted before hills/buildings, so every silhouette
    // occludes it naturally instead of relying on a cutout mask.
    float night = uDark;
    if (night > 0.01) {
      float moonArc = sin(clamp(uDawn, 0.0, 1.0) * 3.14159265);
      float moonE = -0.009 + 0.142 * pow(max(moonArc, 0.0), 0.82);
      vec2 mq = vec2((a + 1.55) / 0.0125, (e - moonE) / 0.0125);
      float md = length(mq);
      float moonGate = smoothstep(-0.002, 0.020, moonE) * night;
      float disc = smoothstep(1.06, 0.91, md) * moonGate;
      float crater = 0.50 * vnoise(mq * 2.8 + 8.0)
                   + 0.50 * vnoise(mq * 5.7 + 21.0);
      vec3 moonC = mix(vec3(0.72, 0.77, 0.84),
                       vec3(0.94, 0.92, 0.83), crater * 0.24);
      float moonLimb = sqrt(max(0.0, 1.0 - md * md));
      moonC *= 0.79 + 0.21 * moonLimb;
      col = mix(col, moonC, disc * 0.92);
      float halo = exp(-md * md * 0.21) * (1.0 - disc * 0.70);
      col += vec3(0.42, 0.50, 0.66) * halo * moonGate * 0.20;
    }

    // ---- Thin daylight clouds, light theme only. High quality combines a
    // broad sheet with vertically compressed erosion. That produces long,
    // feathered strands instead of dark, rounded storm-cloud bodies. The low
    // program keeps only the cheaper camera-continuous wisp field.
    if (day > 0.01) {
      float cf = 0.0;
#ifdef SKY_CLOUD_DETAIL
        vec2 cp = vec2(
          a * 2.3 + uTime * ${SKY_LIGHTING.atmosphere.cloudDrift.toFixed(3)},
          e * 12.8
        );
        float macro = 0.68 * vnoise(cp * vec2(0.72, 1.05))
                    + 0.32 * vnoise(
                        vec2(cp.x * 1.42 + cp.y * 0.48, cp.y * 1.85)
                        + vec2(-uTime, uTime * 0.28)
                        * ${SKY_LIGHTING.atmosphere.cloudMorph.toFixed(3)}
                      );
        float erosion = 0.62 * vnoise(
                            cp * vec2(3.2, 5.0) + 19.0
                            + vec2(-uTime, uTime * 0.35)
                            * ${SKY_LIGHTING.atmosphere.cloudMorph.toFixed(3)}
                          )
                      + 0.38 * vnoise(
                            cp * vec2(5.8, 8.4) + 7.0
                            + vec2(uTime * 0.22, -uTime)
                            * ${SKY_LIGHTING.atmosphere.cloudMorph.toFixed(3)}
                          );
        float filament = smoothstep(0.54, 0.78, vnoise(
          vec2(cp.x * 2.15 + cp.y * 1.7, cp.y * 4.6) + 31.0
        ));
        // Fine noise only feathers existing sheets. It cannot create the
        // salt-and-pepper texture that made the old layer look synthetic.
        float shapedErosion = (erosion - 0.54) * 0.17;
        cf = macro + shapedErosion + filament * 0.055;
#endif
      // A second sparse, higher layer is camera-continuous (a - uPan). The
      // primary field remains world-anchored and supplies the obvious drift,
      // but its seeded slice was completely empty over the first two units
      // and only became cloudy near the end. This quiet layer guarantees a
      // few broken forms throughout the traverse without raising the primary
      // density threshold into overcast territory at the final units.
      float localA = a - uPan;
      float coverageSeed = ${SKY_LIGHTING.atmosphere.cloudCoverageSeed.toFixed(1)};
      float coverageDrift = uTime
                          * ${SKY_LIGHTING.atmosphere.cloudCoverageDrift.toFixed(4)};
      float coverage = 0.62 * vnoise(vec2(
                         localA * ${SKY_LIGHTING.atmosphere.cloudCoverageAzimuth[0].toFixed(2)}
                           + coverageSeed - coverageDrift,
                         e * ${SKY_LIGHTING.atmosphere.cloudCoverageElevation[0].toFixed(1)}
                           + coverageSeed * 0.37
                       ))
                     + 0.38 * vnoise(vec2(
                         localA * ${SKY_LIGHTING.atmosphere.cloudCoverageAzimuth[1].toFixed(2)}
                           - coverageSeed * 0.61
                           + coverageDrift * 0.5,
                         e * ${SKY_LIGHTING.atmosphere.cloudCoverageElevation[1].toFixed(1)}
                           + 11.0 + coverageSeed * 0.19
                           - coverageDrift * 0.7
                       ));
      cf = max(
        cf,
        coverage * ${SKY_LIGHTING.atmosphere.cloudCoverageScale.toFixed(2)}
      );
      // A deck sits in a band of sky: nothing on the deck at the horizon
      // (that is haze's job) and nothing at the zenith.
      float deck = smoothstep(
        ${SKY_LIGHTING.atmosphere.cloudDeckFadeIn[0].toFixed(2)},
        ${SKY_LIGHTING.atmosphere.cloudDeckFadeIn[1].toFixed(2)}, e
      ) * (1.0 - smoothstep(
        ${SKY_LIGHTING.atmosphere.cloudDeckFadeOut[0].toFixed(2)},
        ${SKY_LIGHTING.atmosphere.cloudDeckFadeOut[1].toFixed(2)}, e
      ));
      float cloud = smoothstep(
        ${SKY_LIGHTING.atmosphere.cloudDensityGate[0].toFixed(2)},
        ${SKY_LIGHTING.atmosphere.cloudDensityGate[1].toFixed(2)}, cf
      ) * deck * day;
      // Cirrus is mostly transmitted daylight. Lift the body toward a cool
      // white, then fold a little sky-coloured shade into its densest strands.
      // Keeping the shade shallow prevents a storm-cloud silhouette.
      float core = smoothstep(0.64, 0.82, cf);
      float rim = smoothstep(0.50, 0.60, cf) - smoothstep(0.69, 0.80, cf);
      vec3 cloudLight = mix(
        col,
        vec3(0.95, 0.97, 1.0),
        ${SKY_LIGHTING.atmosphere.cloudBodyLightMix.toFixed(2)}
      );
      cloudLight = mix(cloudLight, vec3(1.0, 0.96, 0.88), azFall * 0.07);
      vec3 underside = col * mix(
        ${SKY_LIGHTING.atmosphere.cloudBodyShade[0].toFixed(2)},
        ${SKY_LIGHTING.atmosphere.cloudBodyShade[1].toFixed(2)}, azFall
      );
      vec3 body = mix(cloudLight, underside, core * 0.30);
      float bodyLuma = dot(body, vec3(0.299, 0.587, 0.114));
      vec3 cloudGrey = bodyLuma * vec3(0.96, 1.0, 1.04);
      body = mix(
        body,
        cloudGrey,
        ${SKY_LIGHTING.atmosphere.cloudBodyDesaturation.toFixed(2)}
      );
      col = mix(col, body,
                cloud * ${SKY_LIGHTING.atmosphere.cloudBodyOpacity.toFixed(2)});
      col += mix(vec3(1.0, 0.93, 0.82), emberC, clamp(azFall * 0.85, 0.0, 0.85))
           * rim * deck * day
           * (${SKY_LIGHTING.atmosphere.cloudRimBase.toFixed(3)}
              + ${SKY_LIGHTING.atmosphere.cloudRimSun.toFixed(2)} * azFall);
    }

    // How much of the dome the seated vista owns. Hoisted this far up for two
    // reasons: the dusk glow has to be in the sky BEFORE skyBase is captured,
    // or every mass hazing toward skyBase would converge on a sky that isn't
    // the one behind it (which is exactly how the hard background edge got
    // reported twice); and the stars have to know about it. uSeat is zero
    // until somebody sits down, so the idle frame pays one multiply.
    // Azimuth relative to the Monument. Everything in the vista is written
    // in this, so retuning where the Monument sits moves the whole city
    // rigidly and cannot desynchronise one building from another.
    float dz = a - uDcAnchor;
    // Centred on the composition (which runs 0 → 0.47 rad right of the
    // Monument) rather than on the Monument itself, and wide enough that
    // both edges clear the frame at every pointer position and aspect: the
    // window's own falloff must never be findable as a seam in the sky.
    float dcWin = smoothstep(1.05, 0.80, abs(dz - 0.23));
    float seatWin = uSeat * dcWin;

    // Washington owns its own moment of day. Dark retains the established
    // twenty-minutes-after-sunset grade; light is a clear east-facing blue
    // morning. Reusing dusk for both themes was the muddy seated frame: it
    // pulled a cool morning vault toward umber before the river mirrored it.
    //
    // Elevation-graded and seat-faded, so there is no azimuthal seam to
    // find; authored for the composer and lifted when it is absent, since a
    // wide additive is exactly how a sky goes milky under Bloom.
    vec3 beltC = mix(emberC, vec3(1.0, 0.86, 0.88), 0.42);
    vec3 umbraC = zenithC * mix(0.40, 0.62, uDark);
    float dcShK = mix(1.00, 0.72, uDark);
    float dcBeltA = mix(0.150, 0.100, uDark) * mix(1.22, 1.0, uPost);
    float dcDim = mix(0.30, 1.0, uDark);
    if (seatWin > 0.002) {
      vec3 dcDay = skyBand(e, dcShadowL, dcHorizonL, dcZenithL);
      // Low-frequency blue-air variation adds depth without importing SF's
      // warm cloud deck into the Washington window.
      float dcAir = 0.58 * vnoise(vec2(dz * 1.8, e * 5.0) + uTime * 0.002)
                  + 0.42 * vnoise(vec2(dz * 4.2, e * 10.5) + 17.0);
      dcDay *= 0.975 + 0.050 * dcAir;
      // A separate, slowly drifting cloud layer gives the clear morning sky
      // a few broken strands without turning it into an overcast ceiling.
      vec3 dcWeather = dcCloudField(dz, e);
      float dcCf = dcWeather.x;
      float dcCloud = dcWeather.y;
      float dcCloudCore = smoothstep(0.50, 0.70, dcCf);
      vec3 dcCloudLight = mix(
        dcDay,
        vec3(0.94, 0.97, 1.0),
        ${DAYLIGHT_RENDERING.washington.cloudBodyLightMix.toFixed(2)}
      );
      vec3 dcCloudShade = dcDay * mix(
        ${DAYLIGHT_RENDERING.washington.cloudBodyShade[0].toFixed(2)},
        ${DAYLIGHT_RENDERING.washington.cloudBodyShade[1].toFixed(2)},
        dcCloudCore
      );
      vec3 dcCloudDay = mix(dcCloudLight, dcCloudShade, dcCloudCore * 0.28);
      dcDay = mix(
        dcDay,
        dcCloudDay,
        dcCloud * ${DAYLIGHT_RENDERING.washington.cloudBodyOpacity.toFixed(2)}
      );
      float dcCloudRim = (smoothstep(0.50, 0.60, dcCf)
                         - smoothstep(0.68, 0.78, dcCf)) * dcCloud;
      dcDay += dcHorizonL * dcCloudRim
             * ${DAYLIGHT_RENDERING.washington.cloudRimOpacity.toFixed(3)};
      // High veils catch more light and remain more translucent than the low
      // strands, which keeps the layer airy at a distance.
      vec3 dcWisp = mix(dcDay, vec3(0.93, 0.97, 1.0), 0.28);
      dcDay = mix(dcDay, dcWisp, dcWeather.z * 0.30);
      vec3 dcDusk = dcSkyGrade(col, e, umbraC, beltC,
                               dcShK, dcBeltA, dcDim);
      vec3 dcSky = mix(dcDay, dcDusk, uDark);
      vec3 dcCloudDusk = mix(dcSky * 0.74, beltC * 0.30,
                             smoothstep(0.54, 0.72, dcCf));
      dcSky = mix(dcSky, dcCloudDusk, dcCloud * uDark * 0.15);
      dcSky = mix(dcSky, dcSky * vec3(0.82, 0.86, 0.94),
                  dcWeather.z * uDark * 0.10);
      col = mix(col, dcSky, seatWin);
      // City skyglow, and it is doing real work. Washington is a low bright
      // city and after sunset the air over it holds a warm dome that is
      // strongest on the horizon and gone within three degrees. Without it
      // the unlit federal band is black against a sky the Earth's shadow has
      // also taken to black, and a black band on a black sky is nothing —
      // the band only gives the Monument something to be tall against if you
      // can see where it ends. Weighted to the city side, so the parkland
      // left of the Monument stays dark and the picture keeps a quiet half.
      //
      // Added BEFORE skyBase is captured, like the rest of the vista, so the
      // masses haze toward the sky that is actually behind them.
      float glowAz = smoothstep(-0.12, 0.10, dz)
                   * (1.0 - smoothstep(0.40, 0.68, dz));
      col += beltC * glowAz * exp(-max(e, -0.006) / 0.024)
           * mix(0.004, 0.018, uDark) * mix(1.22, 1.0, uPost) * seatWin;
    }

    // A small flock crosses the seated vista occasionally. It shares the
    // dome's analytic azimuth space, so the silhouettes stay in Washington
    // as the camera looks around rather than sliding with the screen. A
    // staggered shallow-M wing profile is enough at this distance; slow
    // fades at each edge keep the flock from popping into existence.
    // Keep this tiny six-bird silhouette even on the simplified sky rung.
    // It is analytic/no-texture and costs less than one noise octave; gating
    // it made the requested life in the DC view disappear precisely on the
    // mobile/lower-power devices that benefit most from a readable cue.
    if (seatWin > 0.002) {
      vec3 birdInk = mix(vec3(0.075, 0.105, 0.130),
                         vec3(0.42, 0.37, 0.44), uDark);
      col = mix(col, birdInk, dcBirdField(dz, e) * seatWin * 0.96);
    }

    // The sky as it stands BEFORE anything is drawn in front of it. Distant
    // masses haze toward whatever is behind them, and that is this — not a
    // fixed horizon hex. Captured ahead of the stars so a ridge doesn't
    // become faintly transparent to them.
    vec3 skyBase = col;

    // Stars, dark only — one procedural field with a magnitude distribution,
    // colour temperature, and elevation-dependent scintillation. This stays
    // inside the sky's existing draw call: a brighter, more varied night sky
    // costs no geometry, objects, textures, or React work.
    //
    // The twinkle is intentionally asymmetric. Stars overhead mostly hold
    // steady while low stars cross more turbulent air and vary a little more;
    // even there two incommensurate waves keep them from blinking like LEDs.
    // Rare bright stars get a larger, hotter core and let the existing bloom
    // produce their only aureole. Drawing diffraction spikes into the source
    // mask makes post-processing magnify them into soft crosses. A power curve
    // on magnitude is important here — equal-sized white dots read as snow,
    // not a sky.
    // Simplified halves the field instead of dropping it. Thinned again over
    // the basin: that window is at dusk, not at 3:45, and a full 3am field
    // hanging over an afterglow is the first thing that reads as wrong.
    // Thinned rather than cut, because blue hour does have stars in it and a
    // hard cut would pop as the seat eases in.
    float starGate = uDark * (1.0 - 0.35 * uDawn) * smoothstep(0.03, 0.22, e)
                   * (1.0 - 0.62 * seatWin);
    if (starGate > 0.001) {
      vec2 sc = vec2(a * 34.0, e * 34.0);
      vec2 cell = floor(sc);
      float present = step(hash2(cell), 0.22 * (1.0 - 0.5 * uSimplify));
      // Coherent per-cell branch: 78% of cells stop here before the hashes,
      // trigonometry, colour work, and glint shaping below. That makes the
      // richer field cheaper than evaluating even one extra wave everywhere.
      if (present > 0.5) {
        vec2 pos = vec2(hash2(cell + 17.0), hash2(cell + 43.0)) * 0.7 + 0.15;
        vec2 q = fract(sc) - pos;
        float d = length(q);
        float rawMag = hash2(cell + 29.0);
        float magnitude = rawMag * rawMag;
        float radius = mix(0.032, 0.078, magnitude);
        float core = smoothstep(radius, radius * 0.16, d);

        float phase = hash2(cell + 5.0) * 6.28318531;
        float rate = 0.55 + hash2(cell + 71.0) * 1.25;
        float scintillation = 1.0 - smoothstep(0.035, 0.24, e);
        float twinkleWave = 0.62 * sin(uTime * rate + phase)
                          + 0.38 * sin(uTime * rate * 1.73 + phase * 2.31);
        float twinkleDepth = mix(0.035, 0.18, scintillation)
                           * mix(0.55, 1.0, magnitude);
        float twinkle = 1.0 + twinkleWave * twinkleDepth;

        // Temperature is stable per star. The small time-varying bias on low
        // stars is atmospheric dispersion, not a full RGB colour cycle.
        float temperature = hash2(cell + 89.0);
        vec3 starCool = vec3(0.68, 0.80, 1.00);
        vec3 starNeutral = vec3(0.92, 0.94, 1.00);
        vec3 starWarm = vec3(1.00, 0.78, 0.55);
        vec3 starColor = temperature < 0.22
          ? mix(starWarm, starNeutral, temperature / 0.22)
          : mix(starNeutral, starCool, (temperature - 0.22) / 0.78);
        starColor = mix(
          starColor,
          vec3(0.72, 0.84, 1.0),
          max(twinkleWave, 0.0) * scintillation * 0.08
        );

        float brightness = 0.24 + 0.76 * magnitude;
        col += starColor * core * twinkle * brightness * starGate;
      }
    }

    // ---- Fireworks over the Golden Gate, fired by clicking the bridge.
    //
    // DEPTH FIRST, because that is what was wrong with them. This whole block
    // used to sit at the very END of main(), after the ridge and the skyline
    // had already been composited — so a burst additively lit the cables and
    // the hill it was supposed to be exploding behind, and the backdrop lost
    // its layering ("the fireworks should be behind the bridge and hill, not
    // in front of it"). There is no z position to fix: the entire backdrop is
    // one dome shader and depth here is WRITE ORDER. So the shells are drawn
    // into the sky HERE — after the stars, before hillMask and structures —
    // and the ridge, the towers and the cables paint over them, exactly as
    // they already paint over the stars. That also makes it independent of
    // the composer: nothing about it is a render pass.
    //
    // The bridge is shader geometry, so it has no pointer events of its own.
    // SkyDome puts an invisible hit target on it whose azimuth and elevation
    // are computed from the SAME GGB_* constants this shader draws with, so
    // the two cannot drift apart; each click claims a uFires slot, storing
    // seconds since launch, negative when idle. Those gates are frame-uniform —
    // costs one comparison until somebody clicks, the same trick the
    // satellite already uses — and the azimuth guard keeps the eight seconds
    // it IS running confined to the bay instead of the whole dome.
    //
    // Seven shells now instead of four, with four types, a spread of rise
    // heights and delays, and a double break on some of them. Two things pay
    // for that. The stars-per-shell work is skipped outside the shell's own
    // radius (r2 > rMax²), so away from a burst a shell costs one exp() and
    // not an atan() and a hash; and the degrade rung drops to four shells.
    //
    // The shells now leave from BELOW the roadway — from barges in the strait,
    // which is where they really go up from — so they climb out from behind
    // the deck instead of off it, which is the other half of reading as depth.
    //
    // Brightness is authored for the composer and lifted when it is absent,
    // not the other way round: additive glow COMPOUNDS in linear HDR, and a
    // burst tuned to look right with postfx off blows the frame out with
    // Bloom on. The spark cores are allowed over Bloom's 0.95 threshold
    // because they are a handful of pixels each; the soft burst flash is held
    // well under it, because a wide additive is exactly how a sky goes milky.
    // The per-shell amplitudes came DOWN with the shell count going up: at the
    // old 1.15 / 0.45, five shells alive at once is a different picture from
    // three.
    for (int fi = 0; fi < ${FIREWORK_LAYERS}; fi++) {
      float fireAge = uFires[fi];
      float fireSeed = uFireSeeds[fi];
      if (fireAge > 0.0 && fireAge < FIRE_WINDOW
          && abs(a + 2.04) < 0.32 && e > -0.05 && e < 0.28) {
      vec3 sparkAdd = vec3(0.0);
      vec3 glowAdd = vec3(0.0);
      float smoke = 0.0;
      for (int si = 0; si < 7; si++) {
        if (si >= 4 && uSimplify > 0.5) break;
        float fs = float(si);
        float h0 = hash1(fireSeed + fs * 4.1);
        float h1 = hash1(fireSeed + fs * 9.7);
        float h2 = hash1(fireSeed + fs * 2.3);
        float h3 = hash1(fireSeed + fs * 13.1);
        float h4 = hash1(fireSeed + fs * 6.7);
        // Staggered, and unevenly: the hash is nearly as large as the step, so
        // some shells crowd and some leave a hole. An even cadence is a
        // metronome, and a volley is not one.
        float t = fireAge - (fs * 0.46 + h0 * 0.34);
        if (t <= 0.0) continue;
        // Biased WEST of the bridge rather than centred on it: everything
        // that can occlude a burst — the portrait frame, the top shelf, the
        // placard — is east of this azimuth, and open sky is west.
        float az = -2.04 + (h1 - 0.72) * 0.170;
        float burstE = 0.106 + h2 * 0.044;
        float rise = 0.86 + h4 * 0.22;
        // Four shells, and each one is a real thing off a real firing script:
        // 0 peony (a sphere of streaks), 1 willow (long gold, heavy drop),
        // 2 ring (one uniform circle), 3 chrysanthemum with a pistil.
        float typ = floor(h3 * 4.0);
        float hh = hash1(fireSeed + fs * 21.3);
        vec3 hue = hh < 0.28 ? vec3(1.00, 0.84, 0.50)
                 : hh < 0.50 ? vec3(1.00, 0.42, 0.28)
                 : hh < 0.70 ? vec3(0.50, 0.76, 1.00)
                 : hh < 0.87 ? vec3(0.55, 0.95, 0.66)
                             : vec3(0.95, 0.58, 0.95);
        // A willow is gold by definition — it is burning charcoal, not a
        // colour star — so its hue is not up to the hash.
        if (typ == 1.0) hue = vec3(1.00, 0.80, 0.42);
        if (t < rise) {
          // The shell on its way up: one hot dot with a short flickering
          // trail under it, drifting a little downrange as it slows. No
          // smoke — at 8 km that is a grey pixel.
          float u = t / rise;
          float sy = mix(0.026, burstE, u * (2.0 - u));
          float dAz = a - az - 0.007 * u * u * (h4 - 0.5) * 2.0;
          float trail = smoothstep(0.014, 0.0, sy - e)
                      * step(0.022, e) * step(e, sy)
                      * smoothstep(0.0012, 0.0003, abs(dAz))
                      * (0.62 + 0.38 * sin(e * 900.0 + fireSeed + fs));
          float head = smoothstep(0.0023, 0.0005, length(vec2(dAz, e - sy)));
          sparkAdd += vec3(1.00, 0.72, 0.36)
                    * (head * (1.15 - 0.4 * u) + trail * 0.45);
          continue;
        }
        float age = t - rise;
        float dur = typ == 1.0 ? 3.4 : 2.6;
        if (age > dur) continue;
        float u = age / dur;
        vec2 p = vec2(a - az, e - burstE);
        // Undo gravity to get back into the ballistic frame: every spark
        // shares the same drop, so one add restores the expanding circle
        // and the whole burst can be tested as a radius. A willow's stars are
        // heavy and burn long, so they fall visibly — that IS the shell.
        p.y += (typ == 1.0 ? 0.027 : 0.015) * age * age;
        float r2 = dot(p, p);
        // The flash on the air, and the early-out. Outside the shell's own
        // radius there are no stars to test, so everything below this line —
        // the atan, the per-ray hash, three smoothsteps — is skipped for the
        // whole of the sky that isn't inside this particular burst.
        float glow = exp(-r2 * 2380.0);
        glowAdd += hue * glow * exp(-age * 3.4);
        smoke += glow * smoothstep(0.0, 0.25, u) * (1.0 - smoothstep(0.35, 1.0, u));
        // 0.118 rad: the widest shell (a willow at the top of its velocity
        // spread, plus its double break, plus the streak's own length).
        if (r2 > 0.0140) continue;
        float r = sqrt(r2);
        float ang = atan(p.y, p.x);
        // A ring is drawn with more, thinner rays because it has to close.
        float bins = typ == 2.0 ? 46.0 : 28.0;
        float bi = floor((ang + 3.14159265) / 6.28318531 * bins);
        // Every ray gets its own star velocity — which is what gives a peony
        // its depth — except a ring shell, whose whole point is that they are
        // all the same.
        float sp = typ == 2.0 ? 1.0
                 : 0.52 + 0.80 * hash1(bi * 1.37 + fireSeed + fs * 5.9);
        // Shell size, and it is the one number the whole display is judged on:
        // at the old 0.058 (and a willow at 0.072, spread to 0.095) a single
        // burst was as wide as the bridge's whole main span, which is not a
        // firework over the Golden Gate, it is a firework instead of it.
        float Rk = typ == 1.0 ? 0.060 : (typ == 2.0 ? 0.044 : 0.050);
        float R = Rk * (1.0 - exp(-3.6 * u)) * sp;
        float ca = (bi + 0.5) / bins * 6.28318531 - 3.14159265;
        float da = (ang - ca) * r;
        // Elongated along the radius: a spark is a streak, not a dot, and a
        // willow's is the longest streak in the sky.
        float len = typ == 1.0 ? 0.20 : (typ == 2.0 ? 0.46 : 0.34);
        float spark = smoothstep(0.0026, 0.0006, length(vec2((r - R) * len, da)));
        // The pistil — a small tight ring of stars at the centre of a
        // chrysanthemum, thrown by the shell's own inner break.
        if (typ == 3.0) {
          float Rp = 0.019 * (1.0 - exp(-5.4 * u));
          spark += 0.85 * smoothstep(0.0021, 0.0005,
                     length(vec2((r - Rp) * 0.55, da)));
        }
        // Double break. The stars split again about six tenths of a second
        // in, and the secondaries come off the SAME rays as the primary
        // rather than out of nowhere, because that is where they come from.
        if (h4 > 0.55) {
          float brk = smoothstep(0.58, 0.80, age)
                    * (1.0 - smoothstep(0.72, 1.0, u));
          float R2 = R + 0.017 * (1.0 - exp(-4.2 * max(age - 0.58, 0.0)));
          spark += brk * 0.75
                 * smoothstep(0.0020, 0.0005, length(vec2((r - R2) * 0.5, da)));
        }
        // Crackle: a chrysanthemum's stars are glitter, so they flicker hard.
        float twd = typ == 3.0 ? 0.62 : 0.38;
        float twinkle = (1.0 - twd)
                      + twd * (0.5 + 0.5 * sin(uTime * 41.0 + bi * 2.7 + fs));
        float fade = exp(-age * (typ == 1.0 ? 0.78 : 1.15))
                   * (1.0 - smoothstep(0.72, 1.0, u));
        // White-hot at the burst, into the shell's own colour, cooling to a
        // dim ember as it falls.
        // The white-hot phase is SHORT — a quarter of the burst at 0.24, on
        // top of an exp fade that puts most of the light in the first half
        // second, meant every shell read as white and the palette did nothing.
        vec3 sc = mix(vec3(1.0, 0.97, 0.90), hue, smoothstep(0.0, 0.11, u));
        sc = mix(sc, hue * vec3(0.70, 0.40, 0.30), smoothstep(0.45, 1.0, u));
        sparkAdd += sc * spark * twinkle * fade;
      }
      // Light theme keeps the shells rather than firing white blobs into a
      // morning sky: a daytime firework reads as a bright core and then a
      // puff that is DARKER than the sky behind it, which is the same lesson
      // the cloud deck learned on the ACES shoulder. So the additive is
      // pulled back and the smoke does most of the work.
      col = mix(col, col * 0.78,
                clamp(smoke, 0.0, 1.0) * 0.8 * (1.0 - uDark));
      col += sparkAdd * mix(1.45, 1.0, uPost) * 0.92 * mix(0.60, 1.0, uDark);
      col += glowAdd * mix(1.50, 1.0, uPost) * 0.34 * mix(0.30, 1.0, uDark);
      }
    }

    // ---- The city. Bimodal roofline — a flat residential carpet with one
    // tight downtown cluster punching out — is SF's actual silhouette
    // signature; a uniform hashed roofline is the generic-city shape.
    float colId = floor(a * 64.0);
    float dtown = smoothstep(0.42, 0.10, abs(a + 1.35));
    float roof = 0.012 + hash1(colId) * (0.016 + 0.042 * dtown);
    // Seated, this window is open water and parkland — the Potomac, its far
    // shore and the Mall behind it — so San Francisco's carpet goes to
    // NOTHING here, not merely flat. It is taken below the waterline so the
    // whole of it ends up submerged: a carpet left showing through the water
    // is what made the old version look like a city standing in its own bay.
    roof = mix(roof, -0.004, seatWin);
    float city = 1.0 - smoothstep(roof - 0.0015, roof + 0.0015, e);

    // Jasper is one restrained addition to the old skyline composition. A
    // shallow recessed crown is enough to keep its 39-storey slab distinct;
    // the facade deliberately inherits the city material below.
    float dJasper = a - JASPER_AZ;
    float jasperBody = sfBlock(a, e, JASPER_AZ, JASPER_HW, JASPER_TOP - 0.0025);
    float jasperCrown = sfBlock(a, e, JASPER_AZ, JASPER_HW * 0.82, JASPER_TOP);
    float jasper = max(jasperBody, jasperCrown);

    // Twin Peaks / Mt Davidson + Telegraph Hill — hazier and flatter than
    // the buildings, their east flanks catch the first light.
    //
    // These used to top out at 0.032 rad, which cleared the residential
    // roofline (0.028) by four milliradians — about six pixels. Six pixels
    // of a four-hundred-pixel-wide dome is a straight line, and since the
    // old hillCol sat 57% of the way to the horizon hex it was also roughly
    // TWICE the luminance of the sky at its own elevation. A pale flat-topped
    // bar hanging above the rooftops with nothing under it: the owner's
    // "hard edge in the background". Confirmed by ablation — zeroing hillMask
    // took the column at the bar from peak (59,67,102) back to a smooth
    // (28,37,60) → (38,51,82) ramp.
    //
    // So the ridge now stands tall enough to show its own curve, and hazes
    // toward skyBase (below) so it reads as a mass BEHIND the air rather
    // than a shape painted on top of it.
    float hillA = 0.050 * hump(a, -2.16, 0.30);
    float hillB = 0.038 * hump(a, -1.98, 0.24);
    float telegraph = 0.022 * hump(a, -1.90, 0.070);
    float hillH = max(hillA, max(hillB, telegraph));
    // A ridge eight kilometres off has no crisp silhouette; the edge is wide
    // on purpose, and the mask fades in rather than switching on, so the
    // flanks can't snap where the humps run out.
    float hillMask = (1.0 - smoothstep(hillH - 0.005, hillH + 0.005, e))
                   * smoothstep(0.0004, 0.006, hillH);

    // Sutro Tower ON its hill (tip 0.118 — the true tallest, 1,811 ft ASL):
    // two legs to a waist, then three prongs, lifted by the hill base.
    float sutro = 0.0;
    float dSut = a + 2.20;
    float eh = e - 0.030;
    if (abs(dSut) < 0.05 && eh < 0.095 && eh > -0.02) {
      float legSpread = mix(0.011, 0.0035, clamp(eh / 0.05, 0.0, 1.0));
      float legs = step(abs(abs(dSut) - legSpread), 0.0016) * step(eh, 0.055);
      float prongs = (step(abs(dSut), 0.0014) + step(abs(abs(dSut) - 0.0075), 0.0013)) * step(0.03, eh) * step(eh, 0.088);
      float waist = step(abs(eh - 0.052), 0.0016) * step(abs(dSut), 0.009);
      sutro = clamp(legs + prongs + waist, 0.0, 1.0);
    }

    // ---- Golden Gate Bridge, northwest at a = -2.04. Derived, not eyeballed.
    // This scene's own compass puts Sutro west (-2.20) and Telegraph Hill
    // north (-1.90), and the Golden Gate is northwest of every vantage the
    // rest of the skyline implies. The drawn elevations say what that vantage
    // is: Transamerica at 0.082 for 260 m solves to 3.2 km, Sutro at 0.125 for
    // 552 m ASL to 4.4 km, so the viewer stands 3-5 km south of downtown.
    // From the Mission, Potrero Hill and Bernal Heights the bridge's true
    // bearing falls 55%, 56% and 46% of the way along the Sutro-to-Telegraph
    // arc, i.e. a = -2.033, -2.033 and -2.061. The mean is -2.04, and -2.04 is
    // also the saddle between hillA (-2.16) and hillB (-1.98), where the drawn
    // ridge dips to 0.034 — so the span shows through the notch rather than
    // climbing a flank. Nearest neighbour is Sutro, 0.055 rad off the near
    // tower: nothing collides.
    //
    // The WIDTH is honest; the HEIGHT and the waterline are not, and that is
    // the whole of the cheat. Seen obliquely — the only way San Francisco ever
    // sees it — the 1,280 m main span subtends 0.063 to 0.105 rad from those
    // three vantages, and it is drawn at 0.110. But 227 m of tower at 8.5 km
    // subtends only 0.015 to 0.027, and the ridge here stands at 0.034: at
    // true height the bridge is under the hill and never visible at all. So
    // the towers are drawn ~2x, at 0.048 above their own waterline, and the
    // waterline itself is lifted from the horizon to e = 0.024 so the span
    // clears the notch. The Bay Bridge is drawn to legibility the same way
    // rather than to survey. Kept subordinate on purpose: 0.072 against
    // Transamerica's 0.082, so it still reads as farther off and lower than
    // downtown.
    //
    // What the oblique view buys is a drawable object. Broadside the span is
    // 5.6x the tower height and would run from Sutro to Telegraph Hill; end-on
    // from the south it is 2.3x, which is what is drawn. The north tower is 9%
    // shorter than the south because it stands 11% farther off.
    float ggb = 0.0;
    float ggbTower = 0.0;
    float ggbDeck = 0.0;
    float ggbCable = 0.0;
    float ggbDeckY = 0.0;
    float gx = (a + 2.04) / 0.055;
    if (abs(gx) < 1.58 && e > 0.024 && e < 0.078) {
      // The roadway crests at midspan, and the main cable is a PARABOLA
      // between the tower tops that comes down to touch the deck at the
      // centre — which is what the real cable does, and the same idiom the
      // Bay Bridge span already uses. The linear term tilts the curve
      // because the far tower is lower.
      float deckY = 0.0380 + 0.0022 * (1.0 - gx * gx);
      float towerTop = mix(0.0720, 0.0655, step(0.0, gx));
      // The reference tower has two straight outside legs. Do not staircase
      // or taper their outer edges: that turns the three open portals into a
      // stack of unrelated blocks at skyline scale.
      float dTw = abs(abs(gx) - 1.0) * 0.055;
      float towerHalfW = 0.00345;
      float legOffset = 0.00245;
      float legHalfW = 0.00074;
      float towerBand = step(0.0245, e) * step(e, towerTop);
      float towerLegs = step(abs(dTw - legOffset), legHalfW) * towerBand;
      float lowerBeamY = mix(deckY, towerTop, 0.34);
      float upperBeamY = mix(deckY, towerTop, 0.68);
      float portalBeams = clamp(
        step(abs(e - lowerBeamY), 0.00095)
        + step(abs(e - upperBeamY), 0.00085),
        0.0,
        1.0
      ) * step(dTw, towerHalfW) * towerBand;
      // The real tower terminates in a broad, flat cap wider than the tapered
      // legs. Keep it independent of the tapered half-width so the cable cannot turn the top
      // into a pointed silhouette after antialiasing and bloom.
      float towerCap = step(abs(e - towerTop), 0.00105)
                     * step(dTw, 0.00375);
      float tower = clamp(towerLegs + portalBeams + towerCap, 0.0, 1.0);
      // One hairline cable crosses the main span; matching side cables carry
      // the same curve from each tower down to its outside anchorage.
      float cableY = deckY + 0.0308 * gx * gx - 0.00325 * gx;
      float mainCable = step(abs(e - cableY), 0.00072)
                      * step(abs(gx), 1.0);
      float outsideT = clamp((abs(gx) - 1.0) / 0.55, 0.0, 1.0);
      float outsideCableY = mix(towerTop, deckY + 0.0018, outsideT);
      float outsideCable = step(abs(e - outsideCableY), 0.00072)
                         * step(1.0, abs(gx)) * step(abs(gx), 1.55);
      float cable = max(mainCable, outsideCable);
      ggbDeck = step(abs(e - deckY), 0.00115) * step(abs(gx), 1.55);
      // The roadway lights own the upper chord. A second, unlit lower chord
      // and sparse verticals keep it reading as a bridge deck rather than a
      // marquee string, without adding more bloom to the horizon.
      float trussY = deckY - 0.0028;
      float trussChord = step(abs(e - trussY), 0.00072) * step(abs(gx), 1.53);
      float trussPosts = step(abs(fract((gx + 1.55) * 10.0) - 0.5), 0.060)
                       * step(trussY, e) * step(e, deckY)
                       * step(abs(gx), 1.52);
      float deckTruss = clamp(trussChord + trussPosts, 0.0, 1.0);
      // Suspender ropes. Only legible near the towers — which is exactly the
      // stretch of span the ridge is not covering.
      float sus = 0.0;
      if (uSimplify < 0.5) {
        float mainSuspenders = step(abs(fract(gx * 9.0) - 0.5), 0.055)
                             * step(deckY, e) * step(e, cableY)
                             * step(abs(gx), 0.98);
        float outerSuspenders = step(
          abs(fract((abs(gx) - 1.0) * 14.0) - 0.5),
          0.055
        ) * step(deckY, e) * step(e, outsideCableY)
          * step(1.01, abs(gx)) * step(abs(gx), 1.52);
        sus = clamp(mainSuspenders + outerSuspenders, 0.0, 1.0);
      }
      ggbTower = tower;
      ggbDeckY = deckY;
      ggbCable = cable;
      ggb = clamp(
        towerLegs + portalBeams + towerCap + cable + ggbDeck + deckTruss + sus,
        0.0,
        1.0
      );
    }
    // An 8 km bridge stands BEHIND the ridge and the rooftops, but structures
    // composites after the hills — so without this the span would paint over
    // the hill it is standing behind, which is the same class of mistake that
    // made the ridge itself read as a bar hanging in the sky.
    float ggbVis = (1.0 - hillMask) * (1.0 - city);
    ggb *= ggbVis;
    ggbTower *= ggbVis;
    ggbDeck *= ggbVis;
    ggbCable *= ggbVis;

    // ---- Transamerica Pyramid. The WINGS are what turn "a triangle" into THE
    // pyramid, and they were drawn wrong in the one way that reads: as two
    // 1.2-milliradian sticks standing at a FIXED |dTr| = TR_HW, the pyramid's
    // half-width at its BASE, while the face beside them had already tapered
    // in to 0.004 by the height they stopped at. So they floated five
    // milliradians clear of the building with sky between — "is this supposed
    // to be transamerica? Why are there two lines next to it?"
    //
    // Drawn the way they are built instead. Both wings are vertical shafts —
    // the lifts on the east face, the stairwell and smoke tower on the west —
    // so their outer faces are PLUMB while the pyramid's faces slope in. Put
    // that plumb face at the half-width the pyramid has at the 29th floor,
    // where they break out, and everything else follows for free: they emerge
    // from the faces at zero width, are attached over their whole length,
    // widen as the faces recede, and are widest at the flat tops where they
    // stop. Then the spire steps back in and continues alone — and that step
    // is the silhouette. At TR_WING_T each wing is 3.0 mrad wide against the
    // 11.1 mrad the building is there, which is the real 30 ft shaft on a
    // ~100 ft floor plate.
    //
    // They are WINDOWLESS as well (shaft, stairwell, crushed-quartz cladding),
    // and so is the spire above them. transFace is the glass and nothing else,
    // which is what makes the wings read after dark rather than just widening
    // the blob.
    float trans = 0.0;
    float transFace = 0.0;
    float transWing = 0.0;
    float dTr = a + 1.62;
    if (abs(dTr) < 0.016 && e < TR_TOP + 0.002) {
      float hwT = TR_HW * (1.0 - e / TR_TOP);
      float pyr = step(abs(dTr), max(hwT, 0.0008)) * step(e, TR_TOP);
      float wingHW = TR_HW * (1.0 - TR_WING_B / TR_TOP);
      float wings = step(abs(dTr), wingHW)
                  * step(TR_WING_B, e) * step(e, TR_WING_T);
      trans = clamp(pyr + wings, 0.0, 1.0);
      transFace = pyr * step(0.002, e) * step(e, TR_WING_T);
      transWing = wings * (1.0 - pyr);
    }

    // ---- Salesforce Tower. It is the tallest thing on this skyline and it
    // reads at every unit, so it is drawn to the dimensions that describe it:
    // 1,070 ft to the crown, 970 ft to the roof, a broad lower shaft and a
    // distinctly narrower but still flat crown.
    //
    // The taper is deliberately eased: almost vertical through the lower
    // floors, then increasingly narrow through the upper shaft. A linear
    // taper made the whole building a simple trapezoid; a separate roof box
    // then turned its top into a mast. The real read is one continuous glass
    // volume ending in a flat, softly narrowed crown.
    //
    // The perforated-aluminium scrim and Pelli's "give out into the sky" are
    // still there — they are what the crown's own halo is for, below — but
    // they are LIGHT, not shape. Fading the geometry out was the mistake.
    float sales = 0.0;
    float crownT = 0.0;
    float crownM = 0.0;
    float sfHalfWidth = 0.0;
    float dSf = a + 1.28;
    float sTop = SF_TOP;
    if (abs(dSf) < 0.015 && e < SF_TOP + 0.002) {
      float st = clamp(e / SF_TOP, 0.0, 1.0);
      float easedTaper = st * (0.32 + 0.68 * st);
      sfHalfWidth = SF_HW * (1.0 - SF_TAPER * easedTaper);
      crownM = step(abs(dSf), sfHalfWidth) * step(e, SF_TOP);
      sales = crownM;
      crownT = st;
    }

    // Bay Bridge west span — parabola cable (the correct curve for a loaded
    // suspension deck), two towers, and the Bay Lights strung on the cable.
    // −1.09 rather than the surveyed −1.02: at −1.02 the whole span hides
    // behind the Systems shelf props at unit 6 on desktop. −1.09 keeps the
    // compass order (east of Salesforce and Jasper) and hangs the cables in
    // front of the ember glow.
    float bridge = 0.0;
    float bayLight = 0.0;
    float bx = (a + 1.09) / 0.055;
    if (abs(bx) < 1.15 && e < 0.036) {
      float towers = step(abs(abs(bx) - 1.0), 0.05) * step(0.002, e) * step(e, 0.030);
      float deck = step(abs(e - 0.0075), 0.0018) * step(abs(bx), 1.06);
      float cableE = 0.009 + 0.021 * bx * bx;
      float onSpan = step(abs(bx), 1.0);
      float cable = step(abs(e - cableE), 0.0012) * onSpan;
      bridge = clamp(towers + deck + cable, 0.0, 1.0);
      // Bay Lights 360 (relit 2026-03-20, dusk until dawn): dot sequencing
      // via a nested-sin phase warp — algorithmic, never marquee. Simplified
      // keeps a static dim string.
      float s = (bx + 1.0) * 12.0;
      float dotId = floor(s);
      float seq = 0.5;
      if (uSimplify < 0.5) {
        seq = 0.35 + 0.65 * (0.5 + 0.5 * sin(dotId * 1.7 + sin(dotId * 0.37 + uTime * 0.31) + uTime * 0.5));
      }
      float dotMask = step(abs(fract(s) - 0.5), 0.24) * step(abs(e - cableE), 0.0022) * onSpan;
      bayLight = dotMask * seq;
    }

    float ground = smoothstep(-0.10, -0.02, e);
    float structures = clamp(city + sutro + trans + sales + jasper + bridge + ggb, 0.0, 1.0) * ground;
    hillMask *= ground;

    // Sparse warm window glints — the city is mostly asleep. Scrolling
    // re-deals which windows are lit (uDawn folds into the hash); light
    // theme winks them out as the morning advances, dark wakes a few more.
    vec2 wc = vec2(a * 420.0, e * 300.0);
    vec2 wf = fract(wc);
    float inBox = step(abs(wf.x - 0.5), 0.22) * step(abs(wf.y - 0.45), 0.28);
    // Windows must never re-deal as a block. The old rig offset the hash by
    // floor(uDawn * 6.0), so six times across the traverse the entire city
    // blinked to a new pattern in one frame — the owner's "background
    // building lights seem to jump sometimes on movement". Now every window
    // keeps a fixed hash and crosses a smoothly-moving threshold, so they
    // wink out one at a time; a slow per-window phase turns a few over on
    // their own clock, which is what a city at 4am actually does.
    vec2 wcell = floor(wc);
    // Pointer response: the stretch of skyline under the cursor wakes a
    // little — a few more windows come on, and fade back out behind you.
    float hq = (a - uHover) / 0.06;
    float hoverNear = exp(-(hq * hq));
    float thresh = 0.05 * mix(1.0 - 0.7 * uDawn, 1.0 + 0.6 * uDawn, uDark)
                 * (1.0 + 2.4 * hoverNear);
    float lit = windowLit(wcell, thresh) * inBox;
    // The two named towers own their own facades entirely (see towerWin), so
    // the generic carpet stops at their outlines rather than laying a second,
    // differently-pitched grid over the bottom third of each of them.
    float winMask = lit * city * step(0.004, e) * step(e, roof - 0.005)
                  * (1.0 - sutro) * (1.0 - trans) * (1.0 - sales)
                  * (1.0 - jasper);

    // ---- The named towers' own windows.
    //
    // The carpet above is gated on the city mask, which stops at the residential
    // roofline — so everything ABOVE it was a flat dark solid, and the two
    // tallest and most recognisable buildings on the skyline were the only
    // two with no lights on at all ("why is it — and salesforce for that
    // matter — missing window lights"). Same rule as the city (fixed per-cell
    // hash, smoothly moving threshold, slow per-window phase, pointer
    // response, and the same wink-out through the dawn), on each building's
    // own facade grid. A touch above the carpet's threshold, because an
    // office tower at 3:45 has a cleaning crew in it and a walk-up does not.
    float towerWin = 0.0;
    if (transFace > 0.5) {
      // Transamerica reads as narrow VERTICAL bands — 3,678 windows in slender
      // strips, and the strips are what the eye keeps. True vertical columns
      // in azimuth rather than normalised to the taper, so the sloping faces
      // cut them off, which is what the real facade does. One band per three
      // real columns, because one real column is 1.4 px.
      vec2 tc = vec2(dTr * 470.0, e * 260.0);
      towerWin = windowLit(floor(tc), thresh * 2.0)
               * step(abs(fract(tc.x) - 0.5), 0.30)
               * step(abs(fract(tc.y) - 0.45), 0.34);
    }
    if (crownM > 0.5) {
      // Salesforce is a uniform glass grid on a tapering shaft, so its columns
      // are taken in the SHAFT's own normalised width and converge with it —
      // which is what a tapering curtain wall does and what a fixed azimuth
      // pitch would visibly get wrong against the eased 30% taper. Held clear of the
      // crown band, which has its own light and does not want a grid in it.
      float sfSt = clamp(e / SF_TOP, 0.0, 1.0);
      float hwSf = SF_HW * (1.0 - SF_TAPER * sfSt * (0.32 + 0.68 * sfSt));
      vec2 fc = vec2(dSf / max(hwSf, 1e-4) * 3.6, e * 336.0);
      towerWin = max(towerWin,
                     windowLit(floor(fc), thresh * 1.2)
                     * step(abs(fract(fc.x) - 0.5), 0.30)
                     * step(abs(fract(fc.y) - 0.45), 0.32)
                     * (1.0 - smoothstep(0.80, 0.86, crownT)));
    }
    towerWin *= step(0.004, e) * ground;
    // The wings are crushed white quartz with no glass in them, and after
    // dark that inverts: the glass face goes black between its lit strips
    // while the stone keeps catching the city's own skyglow. So the two
    // wings sit a shade LIGHTER than the face they are attached to, which is
    // what lets them read as two elements rather than as one wide blob — the
    // job the old detached sticks were doing badly.
    float wingLift = transWing * mix(0.16, 0.30, uDark);

    // Floor 33, one bay left of centre. The building remains an ordinary
    // skyline silhouette; only this single window owns an interaction.
    float jasperFloor33 = 0.004 + (JASPER_TOP - 0.006) * (32.5 / 39.0);
    float jasperApartment = jasper
      * smoothstep(0.00100, 0.00045,
          length(vec2(dJasper + JASPER_HW * 0.47,
                      (e - jasperFloor33) * 1.35)));
    float jasperShow = 0.0;
    if (uJasperShow >= 0.0 && uJasperShow < 8.0) {
      jasperShow = smoothstep(0.0, 0.35, uJasperShow)
                 * (1.0 - smoothstep(6.6, 8.0, uJasperShow));
    }
    float jasperLive = clamp(uJasperHover + jasperShow, 0.0, 1.0);

    // The silhouette dissolves toward the horizon band near the horizon
    // line — its own aerial haze; rooftops catch a kiss of the ember.
    // A narrow veil grounds the distant buildings without dissolving their
    // silhouette. The former 60% blend made the skyline nearly the same value
    // as the sky, especially after the blue-vault retune.
    float hazeAmt = (1.0 - smoothstep(0.0, 0.055, e))
                  * mix(${DAYLIGHT_RENDERING.skylineHaze.toFixed(2)}, 0.35, uDark);
    // Aerial perspective converges a distant mass on the sky BEHIND it, so
    // both the ridge and the skyline haze toward sfHazeBase. The ridge starts
    // darker than the buildings (it is unlit rock, not glass) and carries
    // more haze, which is what puts it plainly behind them.
    // Anchored to the sunless atmospheric base rather than to the skyline hex:
    // at 3:45 a ridge
    // eight kilometres out is very nearly the colour of the air in front of
    // it, a little darker and a little less blue. Deriving it from sfHazeBase
    // keeps that true through the dawn and through both themes, where a
    // fixed hex drifted warm and the ridge ended up warmer than the
    // buildings standing in front of it.
    vec3 hillCol = mix(sfHazeBase * mix(0.86, 0.74, uDark), cityC * 0.60, 0.22);
    hillCol = mix(hillCol, sfHazeBase, hazeAmt * 0.8);
    hillCol += emberC * 0.55 * emberAmp * smoothstep(-2.16, -1.95, a);
    vec3 cityCol = mix(cityC, sfHazeBase, hazeAmt);
    cityCol += emberC * ember * 0.25;
    // Salesforce's daylight crown stays in this same blue-grey glass/haze
    // grade. Its separate emissive installation is interaction-only below;
    // adding the horizon ember here made the top a beige block.
    // International Orange, hazed. In the light theme the paint reads as
    // itself, a warm line drawing inside the Karl the mist block already lays
    // over the west (~23% of it at this azimuth) — which is how the Golden
    // Gate actually looks from the city after dawn. At 3:45 it is a silhouette
    // like everything else and its lights do the work.
    //
    // So the distance haze is asymmetric: heavy in the dark, where the bridge
    // should recede behind its own lights, and light in the light, where
    // stacking a distance haze ON TOP of the Karl is exactly how the light
    // skyline became "a ghost doing zero compositional work" (audit §2.3).
    // International Orange has to read by being DARKER than a sky sitting on
    // the ACES shoulder, not warmer than it — the same lesson as the clouds.
    vec3 ggbPaint = vec3(
      ${DAYLIGHT_RENDERING.goldenGatePaintLinear[0].toFixed(3)},
      ${DAYLIGHT_RENDERING.goldenGatePaintLinear[1].toFixed(3)},
      ${DAYLIGHT_RENDERING.goldenGatePaintLinear[2].toFixed(3)}
    );
    vec3 ggbCol = mix(
      cityC,
      ggbPaint,
      mix(${DAYLIGHT_RENDERING.goldenGateDayPaintMix.toFixed(2)}, 0.14, uDark)
    );
    // The skyline already owns aerial perspective. In daylight the bridge
    // gets only a fraction of that veil; the old extra +10% haze made its
    // linear-HDR orange resolve as a translucent salmon overlay. Dark mode
    // keeps the deeper distance haze that lets the Bay Lights lead.
    float ggbDayHaze = hazeAmt
                     * ${DAYLIGHT_RENDERING.goldenGateDayHazeScale.toFixed(2)}
                     + ${DAYLIGHT_RENDERING.goldenGateDayExtraHaze.toFixed(2)};
    float ggbNightHaze = min(hazeAmt + 0.28, 0.92);
    ggbCol = mix(ggbCol, sfHazeBase,
                 mix(ggbDayHaze, ggbNightHaze, uDark));
    cityCol = mix(cityCol, ggbCol, ggb);
    cityCol *= 1.0 + wingLift;
    cityCol = mix(cityCol, windowC,
                  clamp(winMask + towerWin, 0.0, 1.0) * mix(0.45, 0.70, uDark));
    // In daylight the perforated crown still needs a quiet edge against a
    // similarly pale sky before anybody hovers it. The broad top glass is a
    // fraction darker, with a restrained side/top rim so the continuous taper
    // survives the additive installation wash below.
    cityCol *= 1.0 - (1.0 - uDark) * crownM
                    * smoothstep(0.82, 0.94, crownT) * 0.12;
    float crownRim = crownM * smoothstep(0.82, 0.90, crownT)
                   * max(smoothstep(0.60, 0.92,
                                    abs(dSf) / max(sfHalfWidth, 1e-4)),
                         smoothstep(0.965, 0.995, crownT));
    cityCol *= 1.0 - (1.0 - uDark) * crownRim * 0.18;

    col = mix(col, hillCol, hillMask);
    col = mix(col, cityCol, structures);
    col += windowC * bayLight * uDark * (1.0 - 0.8 * smoothstep(0.4, 1.0, uDawn)) * 0.85;
    // Same visual vocabulary as Salesforce's interactive crown: a smooth,
    // time-varying spectrum rather than a flashing indicator. At rest the
    // apartment is just another dim city window; hover wakes the rainbow and
    // click leaves it running briefly for touch visitors.
    vec3 jasperHue = 0.5 + 0.5 * cos(
      uTime * 0.82 + vec3(0.0, 2.09, 4.19)
    );
    vec3 apartmentC = mix(windowC, jasperHue, jasperLive);
    float apartmentIdle = mix(0.06, 0.22, uDark);
    col += apartmentC * jasperApartment
         * (apartmentIdle + jasperLive * mix(0.72, 1.15, uDark))
         * (1.0 - seatWin);

    // ---- Washington at dusk. uSeat is CameraRig's eased 0..1 out of
    // scene/seated.ts, so none of this costs anything — or exists — until
    // somebody sits down.
    //
    // The river gives the picture the one thing a 130 ft skyline cannot: a
    // mirror. Everything above the waterline is drawn once, by
    // dcCity/canopyTop as a function of height above e = 0, and then sampled
    // TWICE — upright, and again inverted and sheared by the swell.
    //
    // The waterline IS the horizon, exactly, and that is not a detail. The
    // old rig put it 0.0065 above, which at a kilometre is a water surface
    // six metres above eye level; every reflection in the frame was then
    // mirrored through a plane the buildings did not stand on.
    if (uSeat > 0.002) {
      float above = e;              // > 0 above the waterline
      float depth = -e;             // > 0 in the water

      // Two stones, and one tone axis between them. This is where all the
      // value separation in the picture comes from, and it is free and
      // truthful in both directions: the Monument is floodlit from its base
      // over its full height, the Jefferson's dome and colonnade are lit and
      // the Capitol's dome is — while the federal blocks are simply DARK,
      // with nothing but scattered window grids on them. Lit marble in front
      // of a sky the Earth's shadow has pulled down, and a black 130 ft band
      // under it. One silhouette with a tone channel, rather than the two
      // separate drawings the old two-signs construction needed.
      vec3 dcDark = mix(vec3(0.060, 0.080, 0.100), vec3(0.006, 0.008, 0.014), uDark);
      vec3 dcLit  = mix(vec3(0.96, 0.88, 0.73), vec3(0.66, 0.57, 0.44), uDark);

      // Haze varies with DISTANCE, which dcCity carries per element, plus a
      // height term for the low murk that sits on the river. Toward skyBase
      // — which already includes the dusk grade — never toward a fixed hex;
      // mixing distant mass toward a constant is what produced a hard edge
      // in the background twice.
      float murk = mix(0.075, 0.14, uDark)
                 * (1.0 - smoothstep(0.0, 0.045, max(above, 0.0)));

      // Mature mixed park canopy. It stays quieter than the marble and uses
      // natural olive/blue-green values in both themes; no ornamental pink
      // band or foreground specimen trees remain in this vista.
      vec3 canCol = mix(vec3(0.115, 0.175, 0.095),
                        vec3(0.020, 0.038, 0.028), uDark);

      // ---- The water.
      if (depth > -0.0016) {
        // Still water is a sky mirror, so its colour is the sky's own band
        // read at the mirrored elevation and graded by the same dusk. The
        // climb saturates at 0.24 rather than running free: past the
        // reflection zone the mapping would be reading the ZENITH into the
        // bottom of the frame, and water seen this obliquely mirrors the low
        // sky nearly everywhere. Saturating rather than min()-clamped,
        // because the clamp put a horizontal seam across the water exactly
        // where the mirror stopped climbing, and on a still sheet there is
        // nothing to blame that on.
        //
        // It is also what fills the bottom of the frame: the near water
        // mirrors HIGH sky, so the Belt of Venus lands as a rose sheen in
        // the foreground while the far water stays in the Earth's shadow.
        float mh = 0.24 * (1.0 - exp(-depth * REFLECT_K / 0.24));
        vec3 waterDay = skyBand(mh, dcShadowL, dcHorizonL, dcZenithL);
        vec3 waterDusk = dcSkyGrade(skyBand(mh, shadowC, horizonC, zenithC),
                                    mh, umbraC, beltC,
                                    dcShK, dcBeltA, dcDim);
        vec3 water = mix(waterDay, waterDusk, uDark);
        // Dark theme: water is darker than the sky it mirrors and much
        // darker close in, because a mirror seen at a grazing angle returns
        // nearly everything and one seen steeply returns a few per cent.
        //
        // Light theme is a SHEET, and that is not a dodge for the section
        // nav that sits on top of it — it is the earlier hour. With the sun
        // still up behind your left shoulder, wave facets throw the whole
        // west of the sky back at you while the east, which is what you are
        // looking at, has already begun to darken. Bright water under a
        // dimming sky is what a river actually does twenty minutes before
        // sunset.
        float dd = smoothstep(0.0, 0.22, depth);
        water *= mix(mix(1.08, 0.72, dd), mix(0.84, 0.26, dd), uDark);
        water = mix(
          water,
          dcWaterL,
          (1.0 - uDark) * mix(
            ${DAYLIGHT_RENDERING.washington.waterTint[0].toFixed(2)},
            ${DAYLIGHT_RENDERING.washington.waterTint[1].toFixed(2)},
            dd
          )
        );
        // Mirror the same moving cloud mask used by the sky. The reflection
        // is darker and softer, as a wind-ruffled river should be, but it now
        // participates in the weather instead of remaining a flat blue fill.
        vec3 waterWeather = dcCloudField(dz, mh);
        vec3 waterCloud = water
                        * mix(
                            ${DAYLIGHT_RENDERING.washington.waterCloudShade[0].toFixed(2)},
                            ${DAYLIGHT_RENDERING.washington.waterCloudShade[1].toFixed(2)},
                            smoothstep(0.50, 0.70, waterWeather.x)
                          );
        water = mix(
          water,
          waterCloud,
          waterWeather.y
            * ${DAYLIGHT_RENDERING.washington.waterCloudReflection.toFixed(2)}
            * (1.0 - uDark)
        );
        water = mix(water, water * vec3(0.86, 0.90, 0.96),
                    waterWeather.z * mix(0.12, 0.06, uDark));

        // The swell. Wave crests run ACROSS the basin, so every phase here is
        // a function of DEPTH, warped only gently by azimuth — a phase that
        // mixes the two axes at comparable rates draws its iso-lines on the
        // diagonal, and the first pass duly rendered a fan of light rays
        // across the water instead of ripple.
        //
        // sqrt(depth) rather than depth: looking across a plane, equal steps
        // of water take less and less of the frame the farther off they are,
        // so the bands have to CROWD toward the shoreline. A linear phase
        // gives evenly spaced stripes, which is corduroy, not water.
        float pz = sqrt(max(depth, 0.0));
        float rip = sin(pz * 210.0 + sin(a * 4.3) * 1.4 + uTime * 0.42);
        if (uSimplify < 0.5) {
          rip = 0.64 * rip
              + 0.36 * sin(pz * 390.0 + sin(a * 7.9 + 2.1) * 1.1 - uTime * 0.67);
        }
        // Small moving facet contrast gives the base water its own surface
        // response. Patch noise breaks the ripple phase into gusts so this
        // cannot become a stack of full-width horizontal stripes.
        float facetPatch = vnoise(vec2(
          dz * 6.7 + uTime * 0.012,
          pz * 23.0 - uTime * 0.018
        ));
        float facet = rip * (0.30 + 0.70 * facetPatch)
                    * smoothstep(0.003, 0.10, depth);
        water *= 1.0 + facet
               * ${DAYLIGHT_RENDERING.washington.waterFacetContrast.toFixed(2)}
               * (1.0 - uDark);
        // The mirror shears sideways and cuts into horizontal slices rather
        // than dissolving into a smear. Amplitude is zero AT the bank — where
        // the water meets the shore there is nothing to ripple, and that is
        // what keeps the waterline a line — and grows toward the viewer.
        float aR = dz + rip * (0.0009 + 0.017 * depth);
        float mhR = depth * REFLECT_K + rip * (0.0006 + 0.013 * depth);

        // Reflections fade with distance from the shore they belong to, and
        // the swell decides how much of the mirror survives each row. The
        // modulation is eased in over the first few pixels of water: near the
        // far shore the bands are only a pixel or two apart and switching
        // them hard on there would alias into a shimmer.
        //
        // The decay is 5.5 rather than the 15 the old rig used, and that is
        // what makes the hero reflection exist at all: the Monument's is 118
        // px long, and at 15 it had faded to nothing by its own waist.
        float rs = exp(-depth * 7.0)
                 * (1.0 - 0.34 * smoothstep(0.0, 0.014, depth) * (0.5 - 0.5 * rip));
        vec3 rSil = dcCity(aR, mhR);
        vec3 rStone = mix(dcDark, dcLit, rSil.z) * dcDistrictTint(aR);
        float chR = canopyTop(aR);
        float rCan = (1.0 - smoothstep(chR - 0.0032, chR + 0.0032, mhR))
                   * step(-0.0004, mhR) * rs * 0.88;
        water = mix(water, mix(rStone * 0.58, water, 0.40), rSil.x * rs);
        water = mix(water,
                    mix(mix(canCol, canCol * vec3(0.40, 0.46, 0.40),
                            smoothstep(0.10, -0.24, aR)) * 0.72, water, 0.34),
                    rCan);

        // The memory-house stands in front of the canopy, so its reflection
        // must do the same. Sampling every authored channel at the rippled
        // coordinates keeps roof, porch, panes, and lit rooms registered.
        vec4 rHome = dcHome(aR, mhR / DC_HOME_Y_SCALE);
        vec3 rHomeWall = mix(vec3(0.88, 0.89, 0.86),
                             vec3(0.115, 0.120, 0.125), uDark);
        vec3 rHomeSide = mix(rHomeWall * 0.72, rHomeWall * 0.64, uDark);
        vec3 rHomeTrim = mix(vec3(0.025, 0.030, 0.033),
                             vec3(0.008, 0.010, 0.014), uDark);
        vec3 rHomeGlass = mix(vec3(0.25, 0.48, 0.63),
                              vec3(0.055, 0.13, 0.21), uDark);
        vec3 rHomeDoor = mix(vec3(0.46, 0.50, 0.20),
                             vec3(0.38, 0.35, 0.12), uDark);
        float homeRs = rs * 0.58;
        water = mix(water, rHomeWall * 0.52, rHome.x * homeRs);
        water = mix(water, rHomeSide * 0.48, rHome.w * homeRs);
        water = mix(water, rHomeTrim * 0.52, rHome.y * homeRs);
        float rHomeWindows = dcHomeWindows(aR, mhR / DC_HOME_Y_SCALE);
        water = mix(water, rHomeGlass * 0.62, rHomeWindows * homeRs);
        water = mix(water, rHomeDoor * 0.58, rHome.z * homeRs);
        float rHomeLit = dcHomeLitWindows(aR, mhR / DC_HOME_Y_SCALE);
        vec3 homeGlow = vec3(1.00, 0.53, 0.16);
        water += homeGlow * rHomeLit * homeRs * uDark * 0.72;

        // The flock is distant and its reflection is appropriately fainter,
        // but it still interrupts the water in the same place and wing phase.
        // The shared aR/mhR coordinates let ripple break each shallow M into
        // the short ink strokes a real reflection would leave.
        float rBird = dcBirdField(aR, mhR);
        vec3 rBirdInk = mix(vec3(0.055, 0.075, 0.090),
                            vec3(0.25, 0.22, 0.28), uDark);
        water = mix(water, rBirdInk, rBird * rs * 0.42);

        // Grazing highlights where the swell catches the Belt of Venus, on
        // the same crowding phase so the crests that light up are the crests
        // that are there — but PATCHED, because a crest that lights along its
        // whole length lights the whole width of the frame at once, and a
        // stack of those is corduroy. Wind lands on water in patches, and the
        // patches are what stop the highlights reading as ruled lines. Keyed
        // to the mirrored elevation, so the sparkle sits in the foreground
        // water that is mirroring the belt, which is also the stretch of the
        // frame that had nothing in it.
        // Glitter, and it has to be POINTS. Crests are long horizontal lines
        // and the temptation is to light them, but what a wind-ruffled river
        // actually returns is one specular facet at a time — so this is a
        // cell field, not a phase: each cell holds one small highlight that
        // turns over on its own clock, and only about one in fifteen is lit
        // at once. Masking a crest phase down instead produced ruled pink
        // dashes across the whole lower frame, twice.
        //
        // The cells crowd toward the far shore on the same sqrt(depth) the
        // ripple uses, so the glitter has the same perspective as the water
        // it sits on, and the whole field is patched by the gust so it
        // arrives in gusts rather than evenly.
        vec2 gc = vec2(a * 340.0, pz * 62.0);
        vec2 gi = floor(gc);
        float gh = hash2(gi);
        vec2 gp = vec2(hash2(gi + 3.7), hash2(gi + 9.1)) * 0.6 + 0.2;
        float gOn = smoothstep(0.90, 0.97,
                               fract(gh * 7.1 + uTime * 0.13 * (0.5 + gh)));
        float gust = vnoise(vec2(a * 6.0, depth * 22.0 + uTime * 0.05));
        float bq = (mh - 0.150) / 0.100;
        float glint = smoothstep(0.34, 0.06, length((fract(gc) - gp) * vec2(1.0, 2.4)))
                    * gOn * smoothstep(0.42, 0.78, gust)
                    * smoothstep(0.0, 0.020, depth) * exp(-(bq * bq));
        water += beltC * glint * mix(0.60, 0.48, uDark) * mix(1.22, 1.0, uPost);

        col = mix(col, water, smoothstep(-0.0016, 0.0016, depth) * seatWin);
      }

      // ---- The far shore. Silhouettes first, then the canopy over them: the
      // plinths belong behind the trees, which is where they actually are.
      float edge = smoothstep(-0.0016, 0.0016, above) * seatWin;
      if (edge > 0.001) {
        vec3 sil = dcCity(dz, above);
        vec3 stone = mix(dcDark, dcLit, sil.z) * dcDistrictTint(dz);
        vec3 dcCol = mix(stone, skyBase,
                         clamp(sil.y * mix(0.95, 0.90, uDark) + murk, 0.0, 0.94));
        col = mix(col, dcCol, sil.x * edge);
        float federalRelief = dcFederalRelief(dz, above)
                            * sil.x * (1.0 - sil.z);
        vec3 reliefCol = mix(dcCol * 1.16, dcCol * 0.72, uDark);
        col = mix(col, reliefCol, federalRelief * edge * mix(0.34, 0.20, uDark));
        // Scattered window grids on the unlit federal band — the one thing
        // that is alive on it after dark, and the cheapest way to keep 0.4
        // rad of black bar from reading as a ruled line. Gated on tone so it
        // can never land on marble.
        // Occupancy is shared, but pane proportions come from the building
        // family: classical punched openings, Castle slits, and modern ribbon
        // windows should never collapse into one city-wide checkerboard.
        vec2 fw = vec2(dz * 410.0, above * 410.0);
        float fLit = step(hash2(floor(fw)), 0.24)
                   * dcFacadeWindows(dz, above);
        col = mix(col, mix(col, windowC, 0.62),
                  fLit * sil.x * (1.0 - sil.z) * edge
                  * smoothstep(0.35, 0.75, uDark) * 0.55);

        float ch = canopyTop(dz);
        float can = 1.0 - smoothstep(ch - 0.0026, ch + 0.0026, above);
        // Two kilometres of park canopy is not one value. Without this the
        // band is the flattest thing in the frame and reads as a sandbar.
        float canV = 0.52 + 0.48 * vnoise(vec2(dz * 2.2, 9.4));
        // Older elm/oak mass on the park side, lower mixed growth toward the basin.
        vec3 canS = mix(canCol, canCol * vec3(0.40, 0.46, 0.40),
                        smoothstep(0.10, -0.24, dz)) * canV;
        col = mix(col, canS, can * edge * 0.94);
        // The crowns, lifted rather than lit. A multiply keeps the top of the
        // band underneath the sky no matter how bright that sky is; an
        // additive here is what put a neon lip on the shoreline, and it would
        // have compounded again under Bloom.
        float crown = can * smoothstep(ch - 0.0070, ch - 0.0012, above);
        col = mix(col, canS * 1.42, crown * edge * 0.85);

        // The childhood home is a memory-object rather than a surveyed
        // landmark, but it must remain architecturally readable. It is on
        // the near edge of the far-shore trees, so paint it AFTER the canopy;
        // the previous ordering buried the porch and both storeys and left
        // only a roof shard plus a yellow square at the frame edge.
        // Uniform 0.70 scale relative to the previous memory-house, without
        // moving its shoreline contact.
        vec4 home = dcHome(dz, above / DC_HOME_Y_SCALE);
        vec3 homeWall = mix(vec3(0.88, 0.89, 0.86),
                            vec3(0.115, 0.120, 0.125), uDark);
        vec3 homeSide = mix(homeWall * 0.72, homeWall * 0.64, uDark);
        vec3 homeTrim = mix(vec3(0.025, 0.030, 0.033),
                            vec3(0.008, 0.010, 0.014), uDark);
        vec3 homeWindow = mix(vec3(0.25, 0.48, 0.63),
                              vec3(0.055, 0.13, 0.21), uDark);
        // The real entry reads olive-chartreuse, not school-bus yellow.
        vec3 homeDoor = mix(vec3(0.46, 0.50, 0.20),
                            vec3(0.38, 0.35, 0.12), uDark);
        col = mix(col, homeWall, home.x * edge * 0.96);
        // The darker right plane is the minimum depth cue that survives the
        // far-shore scale; without it the hipped roof and side wall collapse
        // into a flat front elevation.
        col = mix(col, homeSide, home.w * edge * 0.92);
        col = mix(col, homeTrim, home.y * edge * 0.985);
        float homeGlass = dcHomeWindows(dz, above / DC_HOME_Y_SCALE);
        col = mix(col, homeWindow, homeGlass * edge * 0.98);
        // Every room glows in dark mode. The warm layer is added after the
        // cool exterior glass, allowing Bloom to supply a restrained halo.
        float homeLit = dcHomeLitWindows(dz, above / DC_HOME_Y_SCALE);
        vec3 homeGlow = vec3(1.00, 0.53, 0.16);
        col = mix(col, homeGlow, homeLit * edge * uDark * 0.96);
        col += homeGlow * homeLit * edge * uDark * 0.20;
        float homeColumns = dcHomeColumns(dz, above / DC_HOME_Y_SCALE);
        col = mix(col, homeWall * 1.08, homeColumns * edge * 0.98);
        col = mix(col, homeDoor, home.z * edge);
        float doorGlass = dcHomeDoorGlass(dz, above / DC_HOME_Y_SCALE);
        vec3 entryGlass = mix(homeWindow * 1.08, homeGlow * 0.86, uDark);
        col = mix(col, entryGlass, doorGlass * edge * 0.98);
      }

      // The Monument's red aircraft warning lights — eight of them in life,
      // two per face, so this angle shows a pair. Same FAA unison rule as
      // Sutro's flashers, on its own clock so the two skylines never blink
      // together, plus the specks they put in the water, smeared by the same
      // swell that is breaking everything else.
      float dcNight = smoothstep(0.35, 0.75, uDark);
      float monLight = DC_MON_TOP - 0.0010;
      float dcFlash = step(fract(uTime * 0.3667), 0.15);
      float beacons =
          smoothstep(0.0014, 0.0004, length(vec2(dz + 0.0009, e - monLight)))
        + smoothstep(0.0014, 0.0004, length(vec2(dz - 0.0009, e - monLight)));
      float wob = sin(sqrt(max(depth, 0.0)) * 210.0 + sin(a * 4.3) * 1.4
                    + uTime * 0.42) * 0.004;
      float mirrorE = -monLight / REFLECT_K;
      beacons += 0.40 * exp(-depth * 5.5)
        * smoothstep(0.0030, 0.0009, length(vec2(dz + wob, e - mirrorE) * vec2(1.0, 0.45)));
      col += vec3(0.90, 0.12, 0.10) * beacons
           * (0.22 + 0.42 * dcFlash) * dcNight * seatWin;

      // The near bank. You are standing on the Mount Vernon Trail about ten
      // metres back from the seawall, and with the eye 2.3 m up that puts
      // its edge at −0.23 rad — which is exactly where the frame was running
      // out of picture and going to flat water. It carries no haze at all,
      // because it is ten metres away, and that alone gives the vista a
      // near, a middle and a far.
      float nb = -0.268 - 0.012 * vnoise(vec2(dz * 2.6, 1.9))
               + 0.022 * smoothstep(0.60, 0.97, vnoise(vec2(dz * 9.0, 6.4)));
      vec3 nearC = mix(vec3(0.050, 0.105, 0.070), vec3(0.009, 0.011, 0.017), uDark);
      // The grass at the lip catches the belt the same way the far canopy
      // does; below that it goes to nothing, because nothing is lighting it.
      nearC += beltC * smoothstep(nb - 0.022, nb, e) * mix(0.055, 0.040, uDark);
      col = mix(col, nearC,
                (1.0 - smoothstep(nb - 0.005, nb + 0.005, e)) * seatWin);
    }

    if (uSimplify < 0.5) {
      // Mist — three incommensurate azimuth sines, drift at cinema speed.
      // Dark: a thin cold inversion veiling the building bases. Light: Karl,
      // tallest and densest over the hills, thinning eastward.
      // Both are San Francisco weather and have no business over the
      // Potomac: Karl laid a white wash across the bottom 0.075 rad of the
      // seated frame, which is the marble, the federal band and the far
      // shore all at once. Gated off with the seat rather than moved.
      float m = 0.5 + 0.1667 * (sin(a * 3.1 + uTime * 0.021) + sin(a * 7.3 - uTime * 0.013) + sin(a * 13.7 + uTime * 0.017));
      float baseBand = smoothstep(0.020, 0.004, e) * step(-0.004, e);
      col = mix(col, mix(horizonC, zenithC, 0.35), baseBand * m * structures * 0.5 * uDark * (1.0 - seatWin));
      float west = smoothstep(-1.75, -2.15, a);
      float karlBand = smoothstep(0.075, 0.014, e) * step(-0.01, e);
      float karl = karlBand
                 * (${SKY_LIGHTING.atmosphere.karlBase.toFixed(2)}
                    + ${SKY_LIGHTING.atmosphere.karlWest.toFixed(2)} * west)
                 * (0.45 + 0.55 * m)
                 * (1.0 - uDark) * (1.0 - seatWin);
      col = mix(
        col,
        mix(horizonC, zenithC, 0.18),
        karl * ${SKY_LIGHTING.atmosphere.karlOpacity.toFixed(2)}
      );

      // Aviation lights, dark only. The red constellation of this skyline
      // belongs to Sutro Tower; the pyramid's apex and the Golden Gate's two
      // towers carry one each. Salesforce stays a single clean crown here —
      // at this scale a rooftop pair reads as dots detached from the form.
      vec3 avRed = vec3(0.90, 0.12, 0.10);
      float night = smoothstep(0.35, 0.75, uDark);
      float dApex = length(vec2(dTr, e - TR_TOP));
      col += avRed * smoothstep(0.0032, 0.0010, dApex) * 0.8 * night;
      float dT1 = length(vec2(a + 1.145, e - 0.030));
      float dT2 = length(vec2(a + 1.035, e - 0.030));
      col += avRed * (smoothstep(0.0030, 0.0010, dT1) * step(fract(uTime * 0.5 + 0.37), 0.14)
                    + smoothstep(0.0030, 0.0010, dT2) * step(fract(uTime * 0.5 + 0.71), 0.14)) * night;

      // Sutro Tower carries 42 warning lights, and at night they are all
      // that's visible of it: 18 steady-burning reds spread down the levels,
      // 9 medium-intensity flashers pulsing IN UNISON (FAA AC 70/7460-1L
      // §5.2) at Sutro's ~20/min, and 3 paler beacons on the prong tips.
      // The lattice itself is never lit — the legs were floodlit in 1973 and
      // public outcry had the tubes removed within months.
      if (abs(dSut) < 0.035 && eh > -0.01 && eh < 0.10) {
        float sutFlash = step(fract(uTime * 0.3333), 0.16);
        for (int li = 0; li < 3; li++) {
          float f = float(li);
          float lev = 0.016 + f * 0.019;
          float spread = mix(0.0105, 0.0045, f / 2.0);
          float dLa = length(vec2(dSut - spread, eh - lev));
          float dLb = length(vec2(dSut + spread, eh - lev));
          col += avRed * (smoothstep(0.0016, 0.0005, dLa)
                        + smoothstep(0.0016, 0.0005, dLb)) * 0.34 * night;
        }
        for (int pi = 0; pi < 3; pi++) {
          float dP = length(vec2(dSut - (float(pi) - 1.0) * 0.0075, eh - 0.086));
          col += avRed * smoothstep(0.0016, 0.0005, dP)
               * (0.20 + 0.42 * sutFlash) * night;
        }
      }

      // Golden Gate Bridge, overnight. Three sources, all documented:
      //   - 128 roadway lamp posts, high-pressure sodium 250 W behind amber
      //     acrylic lenses (low-pressure sodium 90 W until 1972; DOE's 2012
      //     GATEWAY study found no LED that fits the historic housings, so it
      //     is still sodium). A working highway, so it is lit all night, and
      //     it is STEADY — deliberately not sequenced, which is what keeps it
      //     from reading as a second Bay Lights half a sky away.
      //   - Tower floodlighting since 22 June 1987 (the 50th anniversary):
      //     12 x 400 W HPS per tower at sidewalk level, aimed UP. It was lit
      //     so the throw dies with height and the towers "disappear into the
      //     evening darkness", so this is a wash that FADES upward, not a
      //     floodlit tower — the opposite of what Sutro gets, which is nothing
      //     at all.
      //   - One 360-degree flashing red aircraft beacon at the very top of
      //     each tower (installed 1980, two 750 W lamps each), pulsing in
      //     unison per FAA AC 70/7460-1L §5.2 — the same rule Sutro's flashers
      //     follow, on its own ~26/min clock so the two skylines do not blink
      //     together.
      // The eight 116 W lights on each main cable are under a pixel at this
      // range. Their combined throw becomes one very low continuous lift on
      // the cable mask below, never eight dots or a second marquee string.
      // Midspan navigation lights remain omitted.
      // Amplitudes are LOW on purpose. This is one continuous 350 px line, not
      // the Bay Lights' isolated dots, so it accumulates far more bloom per
      // unit brightness — at the Bay Lights' own 0.85 it rendered as a blown
      // white bar. The beading is individual lamp posts, not sequencing.
      // Guarded on azimuth like Sutro's lamp loop: the two beacons alone are
      // two length() calls and two smoothsteps, and this is a fullscreen dome
      // pass, so paying for them on every fragment of the sky costs ~4% of the
      // frame for nothing.
      if (abs(gx) < 1.12 && e > 0.020 && e < 0.080) {
        vec3 hps = vec3(1.00, 0.62, 0.24);
        col += hps * ggbDeck * (0.68 + 0.32 * sin(gx * 116.0)) * 0.17 * night;
        col += hps * ggbCable * 0.012 * night;
        col += hps * ggbTower * exp(-max(e - ggbDeckY, 0.0) * 95.0) * 0.25 * night;
        float ggbFlash = step(fract(uTime * 0.4333), 0.13);
        float beaconOffset = 0.00215;
        float dGaL = length(vec2((gx + 1.0) * 0.055 - beaconOffset, e - 0.0732));
        float dGaR = length(vec2((gx + 1.0) * 0.055 + beaconOffset, e - 0.0732));
        float dGbL = length(vec2((gx - 1.0) * 0.055 - beaconOffset, e - 0.0667));
        float dGbR = length(vec2((gx - 1.0) * 0.055 + beaconOffset, e - 0.0667));
        col += avRed * (smoothstep(0.0016, 0.0005, dGaL)
                      + smoothstep(0.0016, 0.0005, dGaR)
                      + smoothstep(0.0016, 0.0005, dGbL)
                      + smoothstep(0.0016, 0.0005, dGbR))
             * (0.18 + 0.48 * ggbFlash) * ggbVis * night;
      }

      // Day for Night (Jim Campbell): 11,136 LEDs across the top SIX floors
      // of 61, facing INWARD so the light bounces off perforated aluminium —
      // a soft diffuse wash, never visible pixels. So it is a HORIZONTAL
      // band around the top ~12%, on all four faces. The old rig ran
      // sin(e * 240.0) over the top third: wrong axis, wrong extent, and it
      // scrolled vertically like a progress bar. At 3:45 the video diary is
      // already off (it runs dusk→2am) and only the Constellation starscape
      // is still alive until dawn, so this stays a dim drift rather than a
      // light show — and it brightens as the traverse approaches dawn.
      // v5: at 0.085 over a five-pixel-wide sliver this was invisible, and
      // the wash's 0.022 amplitude moved nothing anybody could see. It is
      // the brightest object on the skyline in real life — 11,136 LEDs
      // washing perforated aluminium — so it now runs bright enough to
      // clear Bloom's 0.95 threshold and grow its own halo, and the wash
      // sweeps the face in about two seconds instead of nine.
      //
      // And it is the one thing on this skyline you can wake up. Pointing at
      // the crown brings it half on; clicking it runs the installation for
      // nine seconds — the wash speeds up, the palette opens out, and a soft
      // pulse climbs the six lit floors twice — then it settles back to its
      // 3:45 idle. The vocabulary stays Campbell's: diffuse light off
      // perforated aluminium, never a marquee and never visible pixels.
      float sfLive = clamp(uSfHover, 0.0, 1.0);
      float sfShow = 0.0;
      if (uSfShow >= 0.0 && uSfShow < SF_SHOW) {
        sfShow = smoothstep(0.0, 0.5, uSfShow)
               * (1.0 - smoothstep(SF_SHOW - 1.6, SF_SHOW, uSfShow));
      }
      // By day the installation is truly off at rest, so the crown inherits
      // the tower's glass and atmospheric grade. Hover/click wakes the same
      // wash at a restrained level; dark mode keeps its existing visibility.
      float dayCrownActive = clamp(sfLive + sfShow, 0.0, 1.0);
      float crownVis = night + (1.0 - night)
                     * (${SKY_LIGHTING.salesforce.dayIdleEmission.toFixed(2)}
                        + ${SKY_LIGHTING.salesforce.dayActiveEmission.toFixed(2)}
                        * dayCrownActive);
      // The lit band is the top ~15% of the building — the six Day for Night
      // floors plus the glass crown standing above the 970 ft roof — and with
      // the dissolve gone it now ends where the building does, on a hard flat
      // horizon, instead of fading into the sky a third of the way through
      // itself.
      float crownBand = smoothstep(0.850, 0.888, crownT);
      float wash = 0.60 + 0.40 * sin(dSf * 240.0 + uTime * (0.85 + 3.0 * sfShow));
      float pulse = 1.0;
      if (sfShow > 0.001) {
        float ph = fract(uSfShow * 0.42 + uSfSeed);
        pulse += 2.1 * sfShow
               * smoothstep(0.085, 0.0, abs(crownT - mix(0.850, 1.010, ph)));
      }
      vec3 crownHue = mix(
        vec3(0.78, 0.70, 0.62),
        0.5 + 0.5 * cos(uTime * (0.105 + 0.62 * sfShow) + uSfSeed
                        + vec3(0.0, 2.09, 4.19)),
        0.30 + 0.40 * sfShow);
      // 0.70 -> 0.58: the crown mask got both wider and taller when the
      // dissolve came off, and the same per-fragment amplitude over a bigger
      // area rendered as one blown white rectangle with no glass in it.
      col += crownHue * wash * pulse * crownBand * crownM * crownVis
           * 0.58 * (1.0 + 0.85 * sfLive + 1.9 * sfShow);
      // The crown lights the air around itself. Without this the band is a
      // bright rectangle pasted on the sky; with it, the tower reads as the
      // source. Kept close in — a halo ten times the width of the thing
      // making it stops being light and becomes weather — and it is what
      // grows when the installation wakes, since a bigger halo is how a
      // brighter source actually announces itself.
      vec2 cq = vec2(dSf / (0.017 + 0.009 * sfShow),
                     (e - sTop * 0.930) / (0.011 + 0.005 * sfShow));
      col += crownHue * exp(-dot(cq, cq) * 2.2)
           * (0.20 + 0.05 * sin(uTime * 0.31) + 0.20 * sfLive + 0.55 * sfShow)
           * crownVis;

      // ---- Satellite — one dim, constant-velocity crossing every 92s
      // (Starlink-era truthful; the sophisticated cousin of a shooting
      // star). uTime-only gate is frame-uniform, so idle cost is nil. The
      // +84 seed lands the first pass ~8s after mount.
      //
      // The old few-pixel bus still collapsed to a dot after tone mapping.
      // Draw a narrow, tapered exposure streak with a brighter leading head:
      // not a comet tail, but the short smear a moving satellite leaves in a
      // long exposure. It flares: a slow swell as the panels come
      // through the specular angle, with a fine tumble on top. All of it is
      // still under the brightness of a mid star.
      float satT = mod(uTime + 84.0, 92.0);
      if (satT < 5.5) {
        float passId = floor((uTime + 84.0) / 92.0);
        float t01 = satT / 5.5;
        // e 0.10-0.17: the visible frame only reaches e ≈ 0.20 at desktop
        // aspect — anything higher crosses above the viewport unseen.
        float satE = 0.10 + hash1(passId + 7.3) * 0.07;
        float satDrift = (hash1(passId + 13.7) - 0.5) * 0.05;
        vec2 sat = vec2(-2.35 + hash1(passId + 0.5) * 0.45 + 1.15 * t01,
                        satE + satDrift * t01);
        // The track's own direction, so the bus and the panels lie ALONG it
        // rather than along the azimuth axis.
        vec2 fwd = normalize(vec2(1.15, satDrift));
        vec2 q = vec2(a, e) - sat;
        float along = dot(q, fwd);
        float across = q.x * fwd.y - q.y * fwd.x;
        // A compact head plus a 25–35 px tapered track makes direction
        // legible even on a high-DPI display.
        float bus = smoothstep(0.0016, 0.0004,
                               length(vec2(along * 0.65, across)));
        float panels = smoothstep(0.0013, 0.0004,
                                  length(vec2((abs(along) - 0.0017) * 0.9, across)));
        float trailGate = smoothstep(-0.026, -0.018, along)
                        * (1.0 - smoothstep(-0.001, 0.003, along));
        float trailTaper = smoothstep(-0.026, -0.006, along);
        float trail = trailGate * trailTaper
                    * smoothstep(0.00105, 0.00016, abs(across));
        float halo = trailGate * trailTaper
                   * smoothstep(0.0022, 0.00035, abs(across));
        // A flare peaks once per pass; the tumble is a fast small ripple on
        // it. Squared explicitly — pow() with a negative base is undefined in
        // GLSL ES, and half of this gaussian's argument is negative.
        float fq = (t01 - 0.30 - 0.4 * hash1(passId + 3.1)) / 0.16;
        float flare = 0.72 + 0.55 * exp(-(fq * fq))
                    + 0.10 * sin(uTime * 5.3 + passId);
        col += vec3(0.80, 0.85, 0.95)
             * (bus * 0.68 + panels * 0.28 + trail * 0.34 + halo * 0.06) * flare
             * night * (1.0 - 0.5 * uDawn);
      }

      // ---- The bird, light theme only, and the daytime answer to the
      // satellite: something small and alive crossing an otherwise empty sky,
      // every 74 seconds, gone in eleven. Two of them, out of phase, because
      // one bird alone reads as a bug on the screen and two read as birds.
      //
      // It has to be DARKER than the sky, not brighter — the morning sky sits
      // on the ACES shoulder, where an additive buys luminance and no shape at
      // all, which is the same lesson the cloud deck and the daylight fireworks
      // both learned. So it is a multiply, and what it draws is a silhouette:
      // four segments per bird, a shallow M, with the wingtips lagging the
      // elbows by a sixth of a beat (a real wingbeat is a travelling wave down
      // the wing, and drawing the wing rigid is what makes CG birds look like
      // scissors). The beat comes in bursts with glides between, which is how
      // a gull actually crosses a bay.
      float birdT = mod(uTime + 26.0, 74.0);
      if (day > 0.01 && birdT < 11.0) {
        float flock = floor((uTime + 26.0) / 74.0);
        float bt = birdT / 11.0;
        for (int bi2 = 0; bi2 < 2; bi2++) {
          float bf = float(bi2);
          vec2 org = vec2(-2.32 + hash1(flock + bf * 5.3) * 0.30 + 0.62 * bt,
                          0.108 + hash1(flock + bf * 11.7) * 0.052
                          + 0.010 * sin(bt * 4.1 + bf * 2.2));
          vec2 q = vec2(a, e) - org;
          if (dot(q, q) > 0.00016) continue;
          // 17-21 px of wingspan. Measured: at 13 px the silhouette was under
          // the sky's own dither by the time ACES had finished with it.
          float W = 0.0058 + 0.0012 * hash1(flock + bf * 2.9);
          float ph = uTime * (8.6 + 1.1 * bf) + bf * 2.1;
          // Beat in bursts, glide between.
          float amp = 0.30 + 0.70 * smoothstep(0.35, 0.75,
                        0.5 + 0.5 * sin(uTime * 0.55 + bf * 1.7 + flock));
          float el = sin(ph) * amp;
          float tp = sin(ph - 1.05) * amp;
          vec2 body = vec2(0.0, 0.0);
          vec2 elL = vec2(-W * 0.50, W * 0.34 * el);
          vec2 elR = vec2(W * 0.50, W * 0.34 * el);
          vec2 tpL = vec2(-W, W * 0.86 * tp - W * 0.06);
          vec2 tpR = vec2(W, W * 0.86 * tp - W * 0.06);
          float d = min(min(segD(q, body, elL), segD(q, elL, tpL)),
                        min(segD(q, body, elR), segD(q, elR, tpR)));
          float mask = smoothstep(0.0013, 0.0004, d)
                     + 0.7 * smoothstep(0.0011, 0.0004, length(q * vec2(0.6, 1.0)));
          // Fade in and out at the ends of the crossing so nothing pops.
          mask *= smoothstep(0.0, 0.10, bt) * (1.0 - smoothstep(0.88, 1.0, bt));
          // 0.50 x 0.85 was not a bird, it was a smudge: a multiply that deep
          // in LINEAR light comes back off the ACES shoulder as barely a fifth
          // of a stop, and the measured silhouette sat at luma 163 against a
          // 230 sky with no shape left in it.
          col = mix(col, col * 0.30, clamp(mask, 0.0, 1.0) * day * 0.95);
        }
      }
    }

#ifdef COORDINATION_SKY_FLICKER
    float coordinationFault = clamp(
      abs(uCoordinationFlicker - 1.0) * 1.65,
      0.0,
      1.0
    );
    float interference = step(
      0.12,
      sin(e * 720.0 + a * 41.0 + uTime * 103.0)
    );
    float shutter = mix(0.72, 1.08, interference);
    col *= uCoordinationFlicker
      * mix(1.0, shutter, coordinationFault * 0.48);
#endif
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// How much azimuth the full traverse sweeps, and where the sweep starts.
// Measured against the old parallax rig so the compass order and the
// landmarks' framing survive the change: solving the apparent azimuth of
// Salesforce Tower (dome-local 9.8, −32.6) from the camera at each end of
// the run gives −1.031 rad → −1.659 rad, and Sutro the same swing to within
// 0.05 rad — a near-rigid pan, which is exactly why replacing it with one is
// faithful rather than a simplification.
const PAN_SPAN = 0.6;
const PAN_BIAS = 0.25;

// The Golden Gate's hit target, in the shader's own terms. The bridge is
// drawn at azimuth GGB_AZ over |gx| < 1.12 at GGB_GX radians per gx, between
// GGB_E0 and GGB_E1 of elevation — so the target is DERIVED from the drawing
// and cannot drift out of sync with it the way a hand-placed box would.
const GGB_AZ = -2.04;
const GGB_GX = 0.055;
const GGB_HALF_A = 1.12 * GGB_GX;
const GGB_E0 = 0.028;
const GGB_E1 = 0.084;
// World z the target sits at. Scene.tsx parks a per-unit tap plane at z −0.3
// that calls stopPropagation on every click it sees, and every interactive
// prop sits in FRONT of it — which is exactly what makes that backstop work.
// So the sky's own target has to slot into the 0.02 between them: behind the
// props, ahead of the backstop. Put it out at the dome's radius instead and
// the tap plane eats the click before the sky ever hears it.
const GGB_HIT_Z = -0.28;
const GGB_HOVER = "sky:goldengate";
// Longest a launch runs: seven shells, the last let go at 3.10s, up to 1.08s
// of rise and a 3.4s willow on top. Matches the shader's own FIRE_WINDOW.
const FIRE_DURATION = 7.8;

// Salesforce Tower's crown, on the same rig. The shader draws the tower at
// a = −1.28 with the lit band over the top ~14% of sTop 0.100, so the target
// is a generous box around exactly that: wide enough to be pointable with a
// trackpad, and still nowhere near the bridge.
//
// The two sky targets MUST NOT overlap, because they claim the same hover
// slot mechanism and whichever the raycaster hits first would eat the other's
// click. They cannot: the bridge occupies a ∈ [−2.1016, −1.9784] and the
// crown a ∈ [−1.3100, −1.2500], which are 0.668 rad apart — twenty-five times
// the wider of the two half-widths — and their elevation bands ([0.028,
// 0.084] against [0.070, 0.112]) only overlap on 0.014 of elevation they
// never share an azimuth at. Both windows are derived from the constants the
// shader draws with, so the gap cannot be closed by a retune of either.
const SF_AZ = -1.28;
const SF_HALF_A = 0.03;
const SF_E0 = 0.07;
const SF_E1 = 0.112;
const SF_HIT_Z = -0.28;
const SF_HOVER = "sky:salesforce";
/** Matches the shader's SF_SHOW. */
const SF_SHOW_DURATION = 9.0;

// Jasper / 45 Lansing. The forgiving hit area covers the tower, while the
// shader response itself stays confined to the floor-33 left-side window.
const JASPER_AZ = -1.19;
const JASPER_HALF_A = 0.02;
const JASPER_E0 = 0.012;
const JASPER_E1 = 0.06;
const JASPER_HIT_Z = -0.28;
const JASPER_HOVER = "sky:jasper";
const JASPER_SHOW_DURATION = 8.0;

// ---- Where the Washington Monument goes.
//
// The vista is 0.468 rad wide from the Monument to the Capitol and the frame
// it has to live in is not: a 1440-wide desktop leaves 0.681 rad of sky
// beside the placard, and a portrait phone sees 0.333 rad in total. So the
// anchor is solved per frame instead of being a constant — the composition
// is placed against the viewport, and every element keeps its surveyed
// offset from it.
/** Monument → Capitol, plus the Capitol's own half-width. */
const DC_COMPOSITION = 0.498;
/** Pixels on the right owned by the live desktop dock, including its gutter.
 * Mirrors PlacardLayer's clamp expressions so the seated skyline is composed
 * against the glass edge at every desktop width. */
function placardPx(w: number): number {
  if (w < STACKS_DESKTOP_MIN_WIDTH) return 0;
  const panel = THREE.MathUtils.clamp(w * 0.225 + 13 * 16, 27 * 16, 40 * 16);
  const gutter = THREE.MathUtils.clamp(0.6 * 16 + w * 0.011, 1.25 * 16, 2 * 16);
  return panel + gutter;
}
// How much of the seated camera's pointer yaw the vista gives back.
//
// CameraRig swings the seated aim by about ±0.18 rad with a damped pointer,
// against limited total slack in the frame — so at the extremes the
// Monument walks off the left edge or the Capitol slides under the placard,
// and the state you are guaranteed to be in the instant you sit down is the
// worst one, because the pointer is still on the chair at the far left.
// Halving the swing keeps every element in frame across the whole range and
// is undetectable: the only other things in this window are the sky's own
// gradient and the water, both of which are functions of elevation alone.
const DC_COUNTER_PAN = 0.5;

function parkSkyTarget(
  mesh: THREE.Mesh | null,
  camera: THREE.Camera,
  pan: number,
  az: number,
  halfAz: number,
  e0: number,
  e1: number,
  z: number,
) {
  if (!mesh) return;
  const th = az - pan;
  const ph = (e0 + e1) * 0.5;
  const cp = Math.cos(ph);
  const dz = Math.sin(th) * cp;
  if (dz >= -0.05) return;
  const distance = (z - camera.position.z) / dz;
  mesh.position.set(
    camera.position.x + Math.cos(th) * cp * distance,
    camera.position.y + Math.sin(ph) * distance,
    z,
  );
  mesh.scale.set(2 * halfAz * distance, (e1 - e0) * distance, 1);
  updateManualWorldMatrix(mesh);
  mesh.lookAt(camera.position);
  updateManualWorldMatrix(mesh);
}

/** One clock owns the impossible exposure change. Sky and room illumination
 * read this same mutable scalar, so a blackout cannot leave lit props floating
 * against a dead vault. Unmounting the approved effect removes this frame
 * subscriber and restores neutral exposure. */
function CoordinationEnvironmentFault({
  coordinationFlickerSignal,
}: {
  coordinationFlickerSignal: CoordinationFlickerSignal;
}) {
  const handledSkyImpulse = useRef(getSceneImpulse().revision);
  const skyImpulseAge = useRef(Number.POSITIVE_INFINITY);
  const skyImpulseStrength = useRef(0);
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useEffect(
    () => () => {
      coordinationFlickerSignal.current = 1;
    },
    [coordinationFlickerSignal],
  );
  useFrame((_, delta) => {
    const impulse = getSceneImpulse();
    if (handledSkyImpulse.current !== impulse.revision) {
      handledSkyImpulse.current = impulse.revision;
      if (
        !reducedMotion &&
        impulse.palette === "coordination" &&
        impulse.strength > 0
      ) {
        skyImpulseAge.current = 0;
        skyImpulseStrength.current = impulse.strength;
      }
    }
    if (skyImpulseAge.current < SCENE_IMPULSE_SKY_DURATION) {
      coordinationFlickerSignal.current = sceneImpulseSkyScale(
        skyImpulseAge.current,
        skyImpulseStrength.current,
      );
      skyImpulseAge.current += Math.max(0, Math.min(delta, 0.1));
    } else {
      coordinationFlickerSignal.current = 1;
    }
  });
  return null;
}

function SkyDome({
  dark,
  simplify,
  cloudDetail,
  cinematicPlus,
  coordinationFlickerSignal,
}: {
  dark: boolean;
  simplify: boolean;
  cloudDetail: boolean;
  cinematicPlus: boolean;
  coordinationFlickerSignal: CoordinationFlickerSignal | null;
}) {
  const domeRef = useRef<THREE.Mesh>(null);
  const hitRef = useRef<THREE.Mesh>(null);
  const sfHitRef = useRef<THREE.Mesh>(null);
  const jasperHitRef = useRef<THREE.Mesh>(null);
  const fireStarts = useRef(new Array<number>(FIREWORK_LAYERS).fill(-1));
  const fireAges = useRef(new Array<number>(FIREWORK_LAYERS).fill(-1));
  const fireSeeds = useRef(new Array<number>(FIREWORK_LAYERS).fill(0));
  const pendingFire = useRef(0);
  const sfStart = useRef(-1);
  const pendingSf = useRef(false);
  const jasperStart = useRef(-1);
  const pendingJasper = useRef(false);
  const coordinationFlickerEnabled = coordinationFlickerSignal !== null;
  const viewDirection = useRef(new THREE.Vector3());
  const setHovered = useStacks((s) => s.setHovered);
  const sky = useMemo(() => {
    const c = (hex: string) => new THREE.Color(hex);
    const L = PALETTES.light;
    const D = PALETTES.dark;
    const uniforms = {
      uDark: { value: dark ? 1 : 0 },
      uDawn: { value: 0 },
      uPan: { value: -PAN_BIAS },
      // Seeded near the centre of the opening frame rather than "nowhere":
      // damping in from a sentinel would sweep the highlight across the
      // whole skyline on load.
      uHover: { value: -1.6 },
      uTime: { value: 0 },
      uCoordinationFlicker: { value: 1 },
      uSimplify: { value: 0 },
      uPost: { value: 0 },
      uFires: {
        value: fireAges.current,
      },
      uFireSeeds: {
        value: fireSeeds.current,
      },
      uSeat: { value: 0 },
      uDcAnchor: { value: 1.0 },
      uSfHover: { value: 0 },
      uSfShow: { value: -1 },
      uSfSeed: { value: 0 },
      uJasperHover: { value: 0 },
      uJasperShow: { value: -1 },
      zenithL: { value: c(L.skyTop) },
      zenithD: { value: c(D.skyTop) },
      horizonL: { value: c(L.skyHorizon) },
      horizonD: { value: c(D.skyHorizon) },
      shadowL: { value: c(L.skyShadow) },
      shadowD: { value: c(D.skyShadow) },
      emberL: { value: c(L.skyEmber) },
      emberD: { value: c(D.skyEmber) },
      dcZenithL: { value: c(L.dcSkyTop) },
      dcHorizonL: { value: c(L.dcSkyHorizon) },
      dcShadowL: { value: c(L.dcSkyShadow) },
      dcWaterL: { value: c(L.dcWater) },
      cityL: { value: c(L.skyline) },
      cityD: { value: c(D.skyline) },
      windowL: { value: c(L.skyWindow) },
      windowD: { value: c(D.skyWindow) },
    };
    const create = (detailed: boolean, plus = false) =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms,
        defines: {
          ...(detailed ? { SKY_CLOUD_DETAIL: 1 } : {}),
          ...(plus ? { CINEMATIC_PLUS: 1 } : {}),
          ...(coordinationFlickerEnabled
            ? { COORDINATION_SKY_FLICKER: 1 }
            : {}),
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
      });
    return {
      detailed: create(true),
      simple: create(false),
      detailedPlus: create(true, true),
      simplePlus: create(false, true),
    };
    // Theme flips still crossfade via uDark. The materials rebuild only when
    // the live Coordination diagnostic changes, compiling the off path
    // without the sky-flicker fragment work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinationFlickerEnabled]);
  const material = cloudDetail
    ? cinematicPlus
      ? sky.detailedPlus
      : sky.detailed
    : cinematicPlus
      ? sky.simplePlus
      : sky.simple;
  useEffect(
    () => () => {
      sky.detailed.dispose();
      sky.simple.dispose();
      sky.detailedPlus.dispose();
      sky.simplePlus.dispose();
    },
    [sky],
  );
  useEffect(() => {
    const bridge = hitRef.current;
    const crown = sfHitRef.current;
    const jasper = jasperHitRef.current;
    if (!bridge || !crown || !jasper) return;
    const activeUnits = [0, 1, 2, 3, 4, 5, 6];
    const skipMotion = () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const releaseBridge = registerSceneInteraction({
      id: GGB_HOVER,
      root: bridge,
      activeUnits,
      activation: {
        kind: "egg",
        run: () => {
          if (!skipMotion()) pendingFire.current += 1;
        },
        reducedMotion: "skip",
      },
      hover: { kind: "none" },
    });
    const releaseCrown = registerSceneInteraction({
      id: SF_HOVER,
      root: crown,
      activeUnits,
      activation: {
        kind: "egg",
        run: () => {
          if (!skipMotion()) pendingSf.current = true;
        },
        reducedMotion: "skip",
      },
      hover: { kind: "none" },
    });
    const releaseJasper = registerSceneInteraction({
      id: JASPER_HOVER,
      root: jasper,
      activeUnits,
      activation: {
        kind: "egg",
        run: () => {
          if (!skipMotion()) pendingJasper.current = true;
        },
        reducedMotion: "skip",
      },
      hover: { kind: "none" },
    });
    return () => {
      releaseBridge();
      releaseCrown();
      releaseJasper();
    };
  }, []);
  // Launch rides a WINDOW pointer event keyed off the hover slot, not r3f's
  // per-object onClick. Measured, not preferred, and the same conclusion
  // Grabbable already reached and wrote down (Grabbable.tsx:262-273): with
  // the scene connected to ScrollControls' scroll element, `onPointerOver`
  // on a mesh fires reliably and `onPointerDown` never dispatches at all —
  // and r3f will only deliver `onClick` to an object that was in the hit
  // list AT POINTERDOWN (events-*.esm.js:863 and :924), so a missing
  // pointerdown silently costs you the click too. Verified here: with logs
  // on all three, hover fired every time and down/up/click fired never.
  //
  // Keying off the hover slot is also what keeps this honest — the slot is
  // claimed by the same invisible plane the shader's own GGB constants
  // place, so the sky cannot be fired at from anywhere the bridge is not.
  // Touch has no durable hover, so it resolves that same registered plane
  // directly from the pointerdown coordinates.
  useEffect(() => {
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        down = null;
        return;
      }
      if (!e.isPrimary || e.button !== 0) {
        down = null;
        return;
      }
      down = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const from = down;
      down = null;
      const tappedEgg = useStacks.getState().hovered;
      if (e.button !== 0 || !from) return;
      // A drag across the scroll element is travel, not a tap — the same
      // 6px threshold every other trigger in the scene uses for r3f's delta.
      if (Math.hypot(e.clientX - from[0], e.clientY - from[1]) > 6) return;
      const s = useStacks.getState();
      if (s.dragging) return; // a throw, not a tap
      if (
        tappedEgg !== GGB_HOVER &&
        tappedEgg !== SF_HOVER &&
        tappedEgg !== JASPER_HOVER
      )
        return;
      const interaction = getSceneInteraction(tappedEgg);
      if (interaction?.activation?.kind === "egg") interaction.activation.run();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);
  useFrame(({ clock, camera, pointer, raycaster, size }, delta) => {
    const u = material.uniforms;
    u.uDark!.value = THREE.MathUtils.damp(
      u.uDark!.value as number,
      dark ? 1 : 0,
      3.5,
      delta,
    );
    u.uDawn!.value = progressRef.current;
    const pan = progressRef.current * PAN_SPAN - PAN_BIAS;
    u.uPan!.value = pan;
    // Which stretch of skyline the pointer is over. The dome rides with the
    // camera now, so the pointer ray's own direction IS the dome-local
    // direction — no raycast against geometry needed, and it agrees with
    // the shader's azimuth by construction. Damped so the lights swell
    // rather than snap as the cursor sweeps.
    raycaster.setFromCamera(pointer, camera);
    const dir = raycaster.ray.direction;
    const az = Math.atan2(dir.z, dir.x) + pan;
    u.uHover!.value = THREE.MathUtils.damp(
      u.uHover!.value as number,
      az,
      6,
      delta,
    );
    u.uTime!.value = clock.elapsedTime;
    if (coordinationFlickerSignal)
      u.uCoordinationFlicker!.value = coordinationFlickerSignal.current;
    u.uSimplify!.value = simplify ? 1 : 0;
    u.uPost!.value = useStacks.getState().postfx ? 1 : 0;
    // Seated cross-fade. CameraRig writes this every frame while it eases;
    // reading it here rather than subscribing keeps React out of the loop.
    u.uSeat!.value = getSeatAmount();

    // ---- Place Washington against the viewport.
    //
    // Seated, the camera looks +z, so the centre of the frame sits at
    // azimuth π/2 plus the pan — plus the ACTUAL damped camera yaw, which
    // is halved here (see DC_COUNTER_PAN). Deriving it from the quaternion
    // keeps this composition on the same clock as CameraRig's smoothed seated
    // pointer rather than independently following the raw pointer. Everything
    // after that is one solve: put the Capitol
    // just inside whatever edge the placard leaves, and if that would push
    // the Monument off the left of the frame, stop and let the Capitol go
    // instead — the Monument is the composition and the Capitol is the
    // haziest, farthest thing in it.
    const cam = camera as THREE.PerspectiveCamera;
    const halfA = Math.atan(
      Math.tan(THREE.MathUtils.degToRad(cam.fov ?? 40) * 0.5) *
        (cam.aspect || 1),
    );
    const tanH = Math.tan(halfA);
    const vw = size.width || 1;
    const visRight = (2 * (vw - placardPx(vw))) / vw - 1;
    camera.getWorldDirection(viewDirection.current);
    const worldAz = Math.atan2(
      viewDirection.current.z,
      viewDirection.current.x,
    );
    const yaw =
      THREE.MathUtils.euclideanModulo(
        worldAz - Math.PI * 0.5 + Math.PI,
        Math.PI * 2,
      ) - Math.PI;
    const centre = Math.PI * 0.5 + pan + DC_COUNTER_PAN * yaw;
    const anchor = Math.max(
      centre + Math.atan((visRight - 0.07) * tanH) - DC_COMPOSITION,
      centre + Math.atan(-0.62 * tanH),
    );
    u.uDcAnchor!.value = anchor;

    // Salesforce's crown, hovered. Damped so it swells rather than snaps,
    // on the same clock as the theme crossfade.
    const hoveredSlot = useStacks.getState().hovered;
    u.uSfHover!.value = THREE.MathUtils.damp(
      u.uSfHover!.value as number,
      hoveredSlot === SF_HOVER ? 1 : 0,
      5,
      delta,
    );
    u.uJasperHover!.value = THREE.MathUtils.damp(
      u.uJasperHover!.value as number,
      hoveredSlot === JASPER_HOVER ? 1 : 0,
      5,
      delta,
    );

    // Fireworks pool. Every click claims its own clock/seed slot, including
    // clicks coalesced before the next frame, so a new volley layers over
    // the launches already in flight instead of restarting them.
    const fireLaunches = pendingFire.current;
    pendingFire.current = 0;
    for (let launch = 0; launch < fireLaunches; launch += 1) {
      const slot = claimEffectLayer(
        fireStarts.current,
        clock.elapsedTime,
        FIRE_DURATION,
      );
      fireSeeds.current[slot] = Math.random() * 97;
    }
    effectLayerAges(
      fireStarts.current,
      clock.elapsedTime,
      FIRE_DURATION,
      fireAges.current,
    );
    // The crown's show clock, same shape. Clicking again while it runs
    // restarts it rather than queueing, which is what a light switch does.
    if (pendingSf.current) {
      pendingSf.current = false;
      sfStart.current = clock.elapsedTime;
      u.uSfSeed!.value = Math.random() * 6.28;
    }
    if (sfStart.current >= 0) {
      const age = clock.elapsedTime - sfStart.current;
      if (age > SF_SHOW_DURATION) sfStart.current = -1;
      u.uSfShow!.value = age;
    } else {
      u.uSfShow!.value = -1;
    }
    if (pendingJasper.current) {
      pendingJasper.current = false;
      jasperStart.current = clock.elapsedTime;
    }
    if (jasperStart.current >= 0) {
      const age = clock.elapsedTime - jasperStart.current;
      if (age > JASPER_SHOW_DURATION) jasperStart.current = -1;
      u.uJasperShow!.value = age;
    } else {
      u.uJasperShow!.value = -1;
    }

    // Park the bridge's hit target on the bridge. Azimuth follows the pan
    // exactly as the shader's does (the shader adds uPan to the fragment's
    // own azimuth, so the world azimuth of a drawn feature is its shader
    // azimuth MINUS the pan), and the plane is sized to subtend the same
    // angular window at whatever distance the fixed z puts it.
    // th stays in the third quadrant across the whole traverse for both
    // targets, so dz is always solidly negative. parkSkyTarget still guards
    // the degenerate case without allocating a closure on every frame.
    parkSkyTarget(
      hitRef.current,
      camera,
      pan,
      GGB_AZ,
      GGB_HALF_A,
      GGB_E0,
      GGB_E1,
      GGB_HIT_Z,
    );
    parkSkyTarget(
      sfHitRef.current,
      camera,
      pan,
      SF_AZ,
      SF_HALF_A,
      SF_E0,
      SF_E1,
      SF_HIT_Z,
    );
    parkSkyTarget(
      jasperHitRef.current,
      camera,
      pan,
      JASPER_AZ,
      JASPER_HALF_A,
      JASPER_E0,
      JASPER_E1,
      JASPER_HIT_Z,
    );
    // The sky is at infinity, so it must not parallax against the room — in
    // ANY axis. Copying only x left the dome fixed in y and z while the
    // camera bobs (CameraRig's idle sine plus pointer parallax) and dollies
    // back when a panel opens, so the horizon crept against the shelves.
    if (domeRef.current) {
      domeRef.current.position.copy(camera.position);
      updateManualWorldMatrix(domeRef.current);
    }
  });
  // renderOrder 1: draw after opaque geometry so early-Z rejects the covered
  // sky fragments (its depth-sort position otherwise changes during traverse).
  return (
    <>
      <mesh
        ref={domeRef}
        matrixAutoUpdate={false}
        matrixWorldAutoUpdate={false}
        position={[MID_X, 0, 0]}
        material={material}
        renderOrder={1}
      >
        <sphereGeometry args={[34, 160, 96]} />
      </mesh>
      {/* The Golden Gate's click target — see GGB_HIT_Z. Invisible the same
          way Scene's unit tap planes are (a zero-opacity basic material, not
          `visible={false}`, which r3f's raycaster treats inconsistently). */}
      <mesh
        ref={hitRef}
        matrixAutoUpdate={false}
        matrixWorldAutoUpdate={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(GGB_HOVER);
        }}
        onPointerOut={() => {
          // Clear only our own slot — a late out must never drop a prop's
          // freshly claimed hover.
          if (useStacks.getState().hovered === GGB_HOVER) setHovered(null);
        }}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Salesforce Tower's crown. Same rig, disjoint azimuth band — see
          SF_AZ — so the two can never take each other's clicks. */}
      <mesh
        ref={sfHitRef}
        matrixAutoUpdate={false}
        matrixWorldAutoUpdate={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(SF_HOVER);
        }}
        onPointerOut={() => {
          if (useStacks.getState().hovered === SF_HOVER) setHovered(null);
        }}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Jasper at 45 Lansing. The tower is forgiving to point at, but the
          shader's response remains confined to Chappy's floor-33 window. */}
      <mesh
        ref={jasperHitRef}
        matrixAutoUpdate={false}
        matrixWorldAutoUpdate={false}
        name={JASPER_HOVER}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(JASPER_HOVER);
        }}
        onPointerOut={() => {
          if (useStacks.getState().hovered === JASPER_HOVER) setHovered(null);
        }}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}

// Image-based lighting from hand-placed emitters — no HDRI file, no CDN.
// Gives the 37 standard materials something to reflect; intensity stays low
// so the lamps keep reading as the light source.
function ImageBasedEnvironmentFlicker({
  baseIntensity,
  flickerSignal,
}: {
  baseIntensity: number;
  flickerSignal: CoordinationFlickerSignal;
}) {
  const scene = useThree((state) => state.scene);
  useEffect(
    () => () => {
      scene.environmentIntensity = baseIntensity;
    },
    [baseIntensity, scene],
  );
  useFrame(() => {
    scene.environmentIntensity = baseIntensity * flickerSignal.current;
  });
  return null;
}

function RoomEnvironment({
  dark,
  flickerSignal,
}: {
  dark: boolean;
  flickerSignal: CoordinationFlickerSignal | null;
}) {
  const baseIntensity = dark ? 0.45 : DAYLIGHT_RENDERING.environmentIntensity;
  return (
    <>
      <Environment
        frames={1}
        resolution={256}
        environmentIntensity={baseIntensity}
      >
        <Lightformer
          form="rect"
          color={dark ? "#ffc98f" : "#ffe4cb"}
          intensity={dark ? 1.5 : DAYLIGHT_RENDERING.environmentWarmIntensity}
          position={[4, 3, 4]}
          scale={10}
          target={[0, 0, 0]}
        />
        {/* The cool fill IS the sky reflected — it tracks the v5 zenith hexes
            (#93a9c8 light, #1e2842 dark) so glass and metal report the same
            sky the dome is painting. */}
        <Lightformer
          form="rect"
          color={dark ? "#414f70" : "#8ca4bd"}
          intensity={dark ? 1.3 : DAYLIGHT_RENDERING.environmentCoolIntensity}
          position={[-5, 2, 1]}
          scale={8}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="circle"
          color={dark ? "#5b432c" : "#aeb4bb"}
          intensity={0.5}
          position={[0, -4, 2]}
          scale={8}
          target={[0, 0, 0]}
        />
      </Environment>
      {flickerSignal ? (
        <ImageBasedEnvironmentFlicker
          baseIntensity={baseIntensity}
          flickerSignal={flickerSignal}
        />
      ) : null}
    </>
  );
}

const DUST_VERTEX = `
  uniform float uTime;
  uniform float uViewportScale;
  uniform vec3 uCoordinationOrigin;
  uniform float uCoordinationRadius;
  uniform float uCoordinationEnergy;
  uniform float uCoordinationTravel;
  attribute vec4 aDust; // phase, apparent size, speed, warmth
  varying float vLife;
  varying float vWarmth;
  varying float vFocus;
  varying float vCoordination;
  varying float vCoordinationHue;
  #include <fog_pars_vertex>

  void main() {
    float phase = aDust.x;
    float coordinationDistance = distance(position, uCoordinationOrigin);
    float coordinationReach = 1.0 - smoothstep(
      uCoordinationRadius * 0.18,
      max(uCoordinationRadius, 0.001),
      coordinationDistance
    );
    float coordinationGlobal = uCoordinationEnergy
      * mix(0.68, 1.0, coordinationReach);
    float t = (
      uTime + uCoordinationTravel * mix(0.62, 1.0, coordinationReach)
    ) * aDust.z;
    vec3 p = position;

    // A shared low-frequency current carries the field while two individual
    // eddies stop it moving as one sheet. Every term is analytic in time, so
    // the CPU uploads one float per frame and never touches 380 positions.
    float current = sin(uTime * 0.075 + position.y * 1.8);
    p.x += current * 0.055
         + sin(t * 0.31 + phase) * (0.045 + 0.055 * aDust.y)
         + sin(t * 0.13 + phase * 2.7) * 0.025;
    p.y += sin(t * 0.23 + phase * 1.4) * (0.035 + 0.050 * aDust.y)
         + sin(t * 0.09 + position.x * 0.7) * 0.030;
    p.z += cos(t * 0.19 + phase * 1.9) * (0.035 + 0.060 * aDust.y);
    vec3 coordinationOut = position - uCoordinationOrigin;
    coordinationOut /= max(length(coordinationOut), 0.001);
    p += coordinationOut
       * coordinationReach
       * uCoordinationEnergy
       * (0.055 + 0.075 * aDust.y);

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = max(
      1.0,
      0.070 * aDust.y * uViewportScale / max(-mvPosition.z, 0.1)
    )
      * mix(1.0, 1.24, coordinationGlobal)
      * mix(1.0, 2.0, smoothstep(0.0, 0.68, coordinationGlobal));

    // Dust catches light intermittently as it tumbles. Most motes keep a high
    // floor and only shimmer; a deterministic 14% minority crosses much
    // narrower light volumes and can disappear on a long, irregular cycle.
    // That gives the field entrances/exits without making every point blink
    // like a firefly.
    float envelope = 0.5 + 0.5 * sin(t * 0.61 + phase * 3.1);
    float glint = 0.5 + 0.5 * sin(t * 1.73 + phase * 5.7);
    float shimmer = 0.64 + 0.28 * envelope + 0.08 * glint;
    float shaftMote = step(0.86, fract(phase * 2.7056));
    float shaftWave = 0.5 + 0.5 * sin(
      t * 0.17 + phase * 2.3 + 0.34 * sin(t * 0.071 + phase * 4.1)
    );
    float shaftLife = 0.02 + 0.98 * smoothstep(0.22, 0.78, shaftWave);
    vLife = mix(shimmer, shaftLife, shaftMote);
    vWarmth = aDust.w;
    vCoordination = coordinationGlobal;
    vCoordinationHue = fract(phase * 0.159 + aDust.w * 0.73);
    // Extreme foreground/background motes fade instead of clipping into
    // giant discs or becoming a hard one-pixel stipple.
    vFocus = smoothstep(3.8, 5.4, -mvPosition.z)
           * (1.0 - smoothstep(10.5, 13.0, -mvPosition.z));
    #include <fog_vertex>
  }
`;

const DUST_FRAGMENT = `
  uniform vec3 uCoreColor;
  uniform vec3 uHaloColor;
  uniform vec3 uCoordinationHuman;
  uniform vec3 uCoordinationAgent;
  uniform float uOpacity;
  varying float vLife;
  varying float vWarmth;
  varying float vFocus;
  varying float vCoordination;
  varying float vCoordinationHue;
  #include <fog_pars_fragment>

  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(q, q);
    if (r2 > 1.0) discard;

    // One sprite contains the former halo and core registrations. The soft
    // shoulder reads as out-of-focus reflected light; the compact centre
    // gives the mote a location instead of a generic bloom blob.
    float edge = smoothstep(1.0, 0.58, r2);
    float halo = exp(-r2 * 3.6) * edge;
    float core = smoothstep(0.13, 0.008, r2);
    vec3 temperature = mix(uHaloColor, uCoreColor, core);
    temperature = mix(temperature, temperature * vec3(1.05, 0.92, 0.76),
                      vWarmth * 0.18);
    vec3 coordinationColor = mix(
      uCoordinationHuman,
      uCoordinationAgent,
      step(0.5, vCoordinationHue)
    );
    float coordinationBrightness = mix(
      1.0,
      2.15,
      smoothstep(0.0, 0.75, vCoordination)
    );
    temperature = mix(
      temperature,
      coordinationColor * coordinationBrightness,
      smoothstep(0.0, 0.48, vCoordination)
    );
    float alpha = (halo * 0.42 + core * 0.58)
      * vLife
      * vFocus
      * uOpacity
      * mix(1.0, 1.9, smoothstep(0.0, 0.7, vCoordination));
    gl_FragColor = vec4(temperature, alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Dust({ palette, count = 380 }: { palette: Palette; count?: number }) {
  // Additive blending lands in linear HDR under the composer — the motes
  // read ~a third weaker there (audit §2.1 item 4).
  const postfx = useStacks((s) => s.postfx);
  const light = palette === PALETTES.light;
  const handledImpulse = useRef(getSceneImpulse().revision);
  const coordinationEnergy = useRef(0);
  const coordinationTravel = useRef(0);
  const dustTime = useRef<number | null>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const dust = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = -2 + rand(i, 21) * (TRAVEL_X + 4);
      positions[i * 3 + 1] = -1.3 + rand(i, 22) * 3.1;
      positions[i * 3 + 2] = -2.2 + rand(i, 23) * 3.4;
      dust[i * 4] = rand(i, 31) * Math.PI * 2;
      dust[i * 4 + 1] = 0.62 + rand(i, 32) * 1.05;
      dust[i * 4 + 2] = 0.72 + rand(i, 33) * 0.62;
      dust[i * 4 + 3] = rand(i, 34);
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    result.setAttribute("aDust", new THREE.BufferAttribute(dust, 4));
    result.computeBoundingSphere();
    return result;
  }, [count]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uViewportScale: { value: 1 },
      uCoreColor: { value: new THREE.Color(palette.dust) },
      uHaloColor: {
        value: new THREE.Color(light ? "#f2b63f" : "#ffe2bd"),
      },
      uOpacity: {
        value: palette.dustOpacity * (postfx ? (light ? 1.2 : 1.35) : 1),
      },
      uCoordinationOrigin: { value: new THREE.Vector3() },
      uCoordinationRadius: { value: 0 },
      uCoordinationEnergy: { value: 0 },
      uCoordinationTravel: { value: 0 },
      uCoordinationHuman: {
        value: new THREE.Color(COORDINATION_HUMAN_COLOR),
      },
      uCoordinationAgent: {
        value: new THREE.Color(COORDINATION_AGENT_COLOR),
      },
    }),
    [light, palette.dust, palette.dustOpacity, postfx],
  );
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    [uniforms],
  );
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock, size, viewport }, delta) => {
    const impulse = getSceneImpulse();
    if (handledImpulse.current !== impulse.revision) {
      handledImpulse.current = impulse.revision;
      if (impulse.palette === "coordination" && impulse.strength > 0) {
        uniforms.uCoordinationOrigin.value.set(impulse.x, impulse.y, impulse.z);
        uniforms.uCoordinationRadius.value = impulse.radius;
        coordinationEnergy.current = Math.max(
          coordinationEnergy.current,
          impulse.strength,
        );
      }
    }
    const boundedDelta = Math.min(delta, 1 / 30);
    const stacks = useStacks.getState();
    const coordinationEngaged =
      stacks.hovered === COORDINATION_GLOBE_INTERACTION_ID ||
      stacks.focusedInteraction === COORDINATION_GLOBE_INTERACTION_ID ||
      stacks.dragging === COORDINATION_GLOBE_INTERACTION_ID;
    if (coordinationEngaged) coordinationEnergy.current = 1;
    dustTime.current ??= clock.elapsedTime;
    dustTime.current += boundedDelta * (1 + coordinationEnergy.current);
    coordinationTravel.current +=
      boundedDelta * coordinationEnergy.current * 24;
    if (!coordinationEngaged)
      coordinationEnergy.current = THREE.MathUtils.damp(
        coordinationEnergy.current,
        0,
        1.55,
        boundedDelta,
      );
    uniforms.uTime.value = dustTime.current;
    uniforms.uViewportScale.value = size.height * viewport.dpr * 0.5;
    uniforms.uCoordinationEnergy.value = coordinationEnergy.current;
    uniforms.uCoordinationTravel.value = coordinationTravel.current;
  });
  return <points geometry={geometry} material={material} />;
}

function CinematicSunSource() {
  const sunRef = useRef<THREE.Mesh>(null);
  const screenPoint = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const sun = sunRef.current;
    if (!sun) return;
    return registerCinematicSun(sun);
  }, []);

  useFrame(({ camera }) => {
    const sun = sunRef.current;
    if (!sun) return;
    // Lock the source to a stable upper-left composition while the camera
    // travels. It remains far behind the shelves, so their real depth can
    // carve the radial light pass into visible shafts.
    screenPoint.set(-0.7, 0.58, 0.2).unproject(camera);
    screenPoint.sub(camera.position).normalize();
    sun.position.copy(camera.position).addScaledVector(screenPoint, 16);
  });

  return (
    <mesh ref={sunRef} frustumCulled={false}>
      <sphereGeometry args={[0.46, 32, 32]} />
      <meshBasicMaterial
        color="#ffd19a"
        transparent
        opacity={1}
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}

function SunShadowReceiver() {
  return (
    <mesh
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
      position={[MID_X, SHELF_GEOMETRY.groundY + 0.004, -0.35]}
      renderOrder={2}
    >
      <planeGeometry args={[TRAVEL_X + 9, 8]} />
      <shadowMaterial transparent opacity={0.24} depthWrite={false} />
    </mesh>
  );
}

function CinematicSunShadowRig({
  lightRef,
}: {
  lightRef: RefObject<THREE.DirectionalLight | null>;
}) {
  return (
    <>
      <directionalLight
        ref={lightRef}
        castShadow
        position={[-5.2, 7.8, 4.8]}
        intensity={1.48}
        color="#ffe1b8"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-4.8}
        shadow-camera-right={4.8}
        shadow-camera-top={4.2}
        shadow-camera-bottom={-2.8}
        shadow-camera-near={0.5}
        shadow-camera-far={22}
        shadow-bias={-0.00045}
        shadow-normalBias={0.022}
        shadow-radius={4}
      />
      <CinematicSunSource />
      <SunShadowReceiver />
    </>
  );
}

// Warm key light following the camera laterally so every unit reads the same.
// The normal path keeps the analytic grounding and has no shadow pass.
// Cinematic+ swaps in a bounded shadow-casting sun and disposes its map when
// the live control is switched off.
function KeyLight({
  dark,
  cinematicPlus,
  coordinationFlickerSignal,
}: {
  dark: boolean;
  cinematicPlus: boolean;
  coordinationFlickerSignal: CoordinationFlickerSignal | null;
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const scene = useThree((s) => s.scene);
  const dawnLight = useMemo(
    () => ({
      keyEarly: new THREE.Color("#fff3e6"),
      keyLate: new THREE.Color("#ffe5c8"),
      skyEarly: new THREE.Color("#eaf3ff"),
      skyLate: new THREE.Color("#fff0df"),
      groundEarly: new THREE.Color("#a8b2bf"),
      groundLate: new THREE.Color("#b8aea7"),
      // Night still has a warm frontal key, but its broad fill comes from the
      // blue hour sky.  The old ochre hemisphere multiplied every dark-theme
      // albedo toward the same brown and left low-facing props nearly black.
      // These sources touch lit materials only: the authored sky dome, moon,
      // skyline and DOM chrome are all outside this lighting path.
      keyDark: new THREE.Color("#efd0b1"),
      skyDark: new THREE.Color("#91a6c9"),
      groundDark: new THREE.Color("#33291f"),
    }),
    [],
  );
  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.target.position.set(MID_X, -0.5, 0);
    scene.add(light.target);
    return () => {
      scene.remove(light.target);
    };
  }, [scene]);
  useEffect(() => {
    if (!cinematicPlus) return;
    const light = lightRef.current;
    return () => {
      const shadow = light?.shadow;
      shadow?.map?.dispose();
      shadow?.mapPass?.dispose();
    };
  }, [cinematicPlus]);
  useFrame(({ camera }) => {
    const light = lightRef.current;
    const hemi = hemiRef.current;
    if (!light || !hemi) return;
    light.position.x = camera.position.x + (cinematicPlus ? -5.2 : 4);
    light.target.position.x = camera.position.x;
    if (dark) {
      // The traverse's dawn progression belongs to the light theme; night
      // keeps one bounded exposure all the way through the room.
      light.color.copy(dawnLight.keyDark);
      light.intensity = 1.35;
      hemi.color.copy(dawnLight.skyDark);
      hemi.groundColor.copy(dawnLight.groundDark);
      hemi.intensity = 1.2;
    } else {
      const dawn = THREE.MathUtils.smoothstep(progressRef.current, 0, 1);
      if (cinematicPlus) {
        light.position.y = 7.8;
        light.position.z = 4.8;
        light.color.set("#ffe1b8");
        light.intensity = 1.48;
      } else {
        light.position.y = 6.5;
        light.position.z = 6;
        light.color.lerpColors(dawnLight.keyEarly, dawnLight.keyLate, dawn);
        light.intensity = THREE.MathUtils.lerp(
          DAYLIGHT_RENDERING.directionalIntensity[0],
          DAYLIGHT_RENDERING.directionalIntensity[1],
          dawn,
        );
      }
      hemi.color.lerpColors(dawnLight.skyEarly, dawnLight.skyLate, dawn);
      hemi.groundColor.lerpColors(
        dawnLight.groundEarly,
        dawnLight.groundLate,
        dawn,
      );
      hemi.intensity = THREE.MathUtils.lerp(
        DAYLIGHT_RENDERING.hemisphereIntensity[0],
        DAYLIGHT_RENDERING.hemisphereIntensity[1],
        dawn,
      );
    }
    if (coordinationFlickerSignal) {
      const environmentScale = coordinationFlickerSignal.current;
      light.intensity *= environmentScale;
      hemi.intensity *= environmentScale;
    }
  });
  return (
    <>
      <hemisphereLight
        ref={hemiRef}
        color={dark ? "#91a6c9" : "#eaf3ff"}
        groundColor={dark ? "#33291f" : "#a8b2bf"}
        intensity={dark ? 1.2 : DAYLIGHT_RENDERING.hemisphereIntensity[0]}
      />
      {cinematicPlus ? (
        <CinematicSunShadowRig lightRef={lightRef} />
      ) : (
        <directionalLight
          key="production-key"
          ref={lightRef}
          position={[4, 6.5, 6]}
          intensity={dark ? 1.35 : DAYLIGHT_RENDERING.directionalIntensity[0]}
          // Dark key remains unchanged. The light key starts neutral-warm and
          // follows the scroll-driven morning in useFrame above.
          color={dark ? "#efd0b1" : "#fff3e6"}
        />
      )}
    </>
  );
}

export default function SceneEnvironment({
  palette,
  dark,
  quality,
}: {
  palette: Palette;
  dark: boolean;
  quality: Pick<SceneQualityPlan, "environment" | "butterflies" | "wildlife">;
}) {
  const { cinematicPlus } = useSceneQualityControls();
  const performanceSettings = useScenePerformanceSettings();
  const coordinationDiagnostics = useSyncExternalStore(
    coordinationGlobeDiagnosticsController.subscribe,
    coordinationGlobeDiagnosticsController.getSnapshot,
    coordinationGlobeDiagnosticsController.getSnapshot,
  );
  const coordinationFlickerSignal = useRef(1);
  const activeCoordinationFlickerSignal = coordinationDiagnostics.effectEnabled
    ? coordinationFlickerSignal
    : null;
  const freeRoam = useSyncExternalStore(
    freeRoamDiagnosticsController.subscribe,
    freeRoamDiagnosticsController.getSnapshot,
    freeRoamDiagnosticsController.getSnapshot,
  );
  const daylightCinematicPlus = cinematicPlus && !dark;
  const meadow = MEADOW_ENABLED && performanceSettings.meadow;
  // No meadow, nothing for the reveal gate to wait on — report ready NOW so
  // a ?nomeadow (or flag-off) boot reveals at the pre-meadow timing.
  useEffect(() => {
    if (!meadow) markMeadowReady();
  }, [meadow]);
  return (
    <>
      {activeCoordinationFlickerSignal ? (
        <CoordinationEnvironmentFault
          coordinationFlickerSignal={activeCoordinationFlickerSignal}
        />
      ) : null}
      {freeRoamFogVisible(freeRoam) ? (
        <fog attach="fog" args={[palette.fog, 8, 24]} />
      ) : null}
      <SkyDome
        dark={dark}
        simplify={false}
        cloudDetail={quality.environment.cloudDetail === "full"}
        cinematicPlus={daylightCinematicPlus}
        coordinationFlickerSignal={activeCoordinationFlickerSignal}
      />
      {meadow && (
        <Suspense fallback={null}>
          <Meadow
            key={MEADOW_LAYOUT_REVISION}
            dark={dark}
            rung={quality.environment.meadowRung}
            farGrassShader={quality.environment.farGrassShader}
            grassDeformation={quality.environment.grassDeformation}
            contentTier={quality.environment.contentTier}
            environmentFlickerSignal={activeCoordinationFlickerSignal}
          />
          {/* Inside the same gate as the field they fly over: ?nomeadow must
              not leave three butterflies over a bare floor. */}
          <Butterflies
            dark={dark}
            wingBlurSamples={quality.butterflies.wingBlurSamples}
            suspendOffscreen={quality.wildlife.suspendOffscreen}
          />
          {/* Same gate, same reason: petals off the meadow's own flowers have
              nothing to come from without the field. */}
          <Petals dark={dark} visibleLimit={quality.environment.petals} />
          {/* Habitat Residents share the field gate, while night moths bind
              to its registered Talks practical. No meadow means no animals
              left floating over a bare room. */}
          <Wildlife
            dark={dark}
            suspendOffscreen={quality.wildlife.suspendOffscreen}
          />
        </Suspense>
      )}
      <RoomEnvironment
        key={dark ? "env-d" : "env-l"}
        dark={dark}
        flickerSignal={activeCoordinationFlickerSignal}
      />
      <KeyLight
        dark={dark}
        cinematicPlus={daylightCinematicPlus}
        coordinationFlickerSignal={activeCoordinationFlickerSignal}
      />
      {quality.environment.dust && <Dust palette={palette} />}
    </>
  );
}

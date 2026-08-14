"use client";

// Atmosphere for the homepage 3D scene — gradient sky dome, fog-matched palette,
// hemisphere fill, camera-tracking key light with soft shadows, and dust.
import { progressRef, useStacks } from "../store";
import { PALETTES, type Palette, rand } from "../theme";
import { Environment, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, lazy, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { poolTexture } from "./GroundPool";
import { getSeatAmount } from "./seated";
import { MID_X, STACKS_DESKTOP_MIN_WIDTH, TRAVEL_X } from "./worldLayout";

// The meadow ships. React.lazy is still intentional: the chunk loads after
// boot (outside the route budget and the LCP window), and flipping this back
// to false re-parks it at zero production cost — the rejection path for the
// whole feature is this one line. `?nomeadow` gives the same A/B per visit.
const MEADOW_ENABLED = true;
const Meadow = lazy(() => import("./Meadow"));

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
// DARK at 3:45 (Day for Night runs dusk→2am) and catches the first ember
// before anything else in the city; the Bay
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
  #define DC_JEFF     0.3994
  #define DC_CAPITOL  0.4676
  // The memory-house is composed independently of the surveyed skyline. At
  // 0.005 it literally straddled the Monument; −0.045 centres the reduced
  // silhouette in the rendered gap between desktop nav and Monument.
  #define DC_HOME    -0.0450
  #define DC_BAND_L   0.0350
  #define DC_BAND_R   0.4450
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

  // Longest a fireworks launch runs: seven shells, the last let go at 3.10 s,
  // up to 1.08 s of rise and a 3.4 s willow on top. Mirrored by FIRE_DURATION
  // in the JS below, which stops feeding the clock.
  #define FIRE_WINDOW 7.8

  uniform float uDark;     // 0 light theme … 1 dark theme (damped crossfade)
  uniform float uDawn;     // scroll offset 0…1 — the traverse advances the morning
  uniform float uPan;      // azimuth the traverse has swept (see SkyDome)
  uniform float uHover;    // azimuth the pointer is over, or 99 for none
  uniform float uTime;
  uniform float uFrame;    // frame counter mod 64 — scrolls the IGN dither
  uniform float uSimplify; // degrade rung: 1 = two bands, no city/stars/ember
  uniform float uPost;     // 1 = composer owns the frame: skip the IGN dither
                           // (it would grain linear HDR; Noise runs in-chain)
  uniform float uFire;     // seconds since the bridge was clicked, < 0 idle
  uniform float uFireSeed; // re-deals the shells on every launch
  uniform float uSeat;     // 0 at the shelf … 1 seated (scene/seated.ts)
  uniform float uDcAnchor; // azimuth the Washington Monument is drawn at —
                           // solved per frame from the viewport (see SkyDome)
  uniform float uSfHover;  // 0…1 damped: pointer is on Salesforce's crown
  uniform float uSfShow;   // seconds since the crown was clicked, < 0 idle
  uniform float uSfSeed;   // re-deals the crown's palette on every wake
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
    if (abs(cx) < 0.0305 && h < 0.0296) {
      float blk = step(abs(cx), 0.0299) * step(0.0070, h) * step(h, 0.0150);
      blk *= 1.0 - step(0.0212, abs(cx)) * step(0.0132, h);
      float drum = step(abs(cx), 0.0034) * step(0.0150, h) * step(h, 0.0202);
      float dome = step(length(vec2(cx / 0.0040, (h - 0.0202) / 0.0066)), 1.0)
                 * step(0.0202, h);
      float lant = step(abs(cx), 0.0015) * step(0.0268, h) * step(h, 0.0284);
      float stat = step(abs(cx), 0.0007) * step(0.0284, h) * step(h, 0.0294);
      float m = clamp(blk + drum + dome + lant + stat, 0.0, 1.0);
      // The dome and the Statue are floodlit and the wings are not, so after
      // dark the whole building resolves to one small bright cap on a dark
      // block — which is all anyone pictures of it anyway.
      r = mix(r, vec3(1.0, 0.32, mix(0.12, 0.95, step(0.0150, h))), m);
    }

    // Old Post Office clock tower, 315 ft — 0.57 of the Monument, the third
    // tallest structure in Washington and the only thing in it that reads as
    // a tower. Two verticals of very different heights is a better
    // composition than one vertical alone, and there is no other candidate:
    // every memorial on the Mall is under a quarter of the Monument.
    float ox = x - DC_OLDPOST;
    if (abs(ox) < 0.0074 && h < 0.0374) {
      float shaft = step(abs(ox), 0.0055) * step(0.0018, h) * step(h, 0.0322);
      float corn  = step(abs(ox), 0.0071) * step(0.0322, h) * step(h, 0.0338);
      float pk = clamp((h - 0.0338) / 0.0034, 0.0, 1.0);
      float roof = step(abs(ox), 0.0071 * (1.0 - pk * 0.94))
                 * step(0.0338, h) * step(h, 0.0372);
      r = mix(r, vec3(1.0, 0.24, 0.42), clamp(shaft + corn + roof, 0.0, 1.0));
    }

    // The federal cornice band — the element that was missing entirely, and
    // the highest-value thing in the frame after the Monument itself. Not a
    // named monument: the USDA South Building, L'Enfant Plaza, the Forrestal
    // and the Southwest Federal Center, all built to the Height of Buildings
    // Act's 130 ft ceiling and running unbroken for more than twenty
    // degrees. That flat ceiling is what makes this read as Washington
    // rather than as a generic city with an obelisk in it, and it is what
    // gives the Monument something to be tall against.
    //
    // It STEPS UP left to right, and that is distance, not height: the
    // Federal Triangle behind the Old Post is 2.8 km out and the Southwest
    // Federal Center 2.0 km, so the same 130 ft subtends 0.0143 at one end
    // and 0.0209 at the other. Drawn as ONE band with a ragged top rather
    // than as individual boxes — there is no arrangement of boxes that is
    // elegant, and the flatness is the elegance.
    if (x > DC_BAND_L && x < DC_BAND_R) {
      float bt = smoothstep(DC_BAND_L, DC_BAND_R, x);
      float top = mix(0.0143, 0.0209, bt)
                + 0.0024 * (vnoise(vec2(x * 7.3, 3.1)) - 0.5)
                + 0.0044 * smoothstep(0.58, 0.94, vnoise(vec2(x * 21.0, 8.7)))
                + 0.0026 * smoothstep(0.72, 0.98, vnoise(vec2(x * 46.0, 2.4)));
      float ends = smoothstep(DC_BAND_L, DC_BAND_L + 0.010, x)
                 * smoothstep(DC_BAND_R, DC_BAND_R - 0.010, x);
      r = mix(r, vec3(1.0, 0.19, 0.0),
              step(0.0008, h) * step(h, top) * ends);
    }

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
    if (abs(jx) < 0.0200 && h < 0.0320) {
      float stylo = step(abs(jx), 0.0198) * step(0.0008, h) * step(h, 0.0040);
      float body  = step(abs(jx), 0.0176) * step(0.0040, h) * step(h, 0.0180);
      float corn  = step(abs(jx), 0.0192) * step(0.0154, h) * step(h, 0.0186);
      float dome  = step(length(vec2(jx / 0.0176, (h - 0.0186) / 0.0132)), 1.0)
                  * step(0.0186, h);
      float gapU = abs(fract((jx + 0.0176) / 0.0044) - 0.5);
      float colGap = (1.0 - smoothstep(0.14, 0.30, gapU))
                   * step(0.0040, h) * step(h, 0.0118);
      float m = clamp(stylo + body + corn + dome, 0.0, 1.0)
              * (1.0 - colGap * 0.84);
      r = mix(r, vec3(1.0, 0.12, 1.0), m);
    }
    return r;
  }

  // Chappy's childhood home, reduced to the architectural cues that survive
  // at this distance: a tall two-storey white facade, black hipped roof and
  // shutters, a full-width porch with slim columns, and the yellow front
  // door. Returns overall coverage, dark trim, and door coverage. It lives
  // left of the Monument like a memory set just outside the literal skyline.
  vec4 dcHome(float x, float h) {
    // Two-thirds of the previous angular width. The reference is a tall,
    // narrow two-storey house, but the earlier memory-object competed with
    // the 555-foot Monument and consumed the only gap beside the navigation.
    float q = (x - DC_HOME) * 1.77;
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
    float q = (x - DC_HOME) * 1.77;
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
    float q = (x - DC_HOME) * 1.77;
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

  // The source door has a glazed multi-pane top, not a solid yellow block.
  float dcHomeDoorGlass(float x, float h) {
    float q = (x - DC_HOME) * 1.77;
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
    // damped theme crossfade at every value between. The low 0.055 gate keeps
    // the pale tan horizon intact behind the skyline. This second pass makes
    // the cap deliberately decisive: the previous 42% contribution was still
    // mostly neutralised by the warm base bands after ACES.
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
    ember += (1.0 - uDark) * 0.10 * exp(-(qg * qg));
    col += emberC * ember;
    // Light theme only: the morning sky already sits on the ACES shoulder, so
    // adding energy there buys brightness and almost no colour — the glow
    // washed out instead of warming. The dawn therefore also TINTS, pulling
    // blue out of the band it lights, which is what a long scattering path
    // actually does to the sky around a low sun.
    col *= mix(vec3(1.0), vec3(1.035, 1.0, 0.93), min(ember, 1.0) * (1.0 - uDark));

    // Skyline haze must converge on the AIR behind the sun, not the emissive
    // disc itself. skyBase is captured later because the seated DC vista
    // needs its own dusk contribution, but using that sun-bearing value for
    // San Francisco made a hazed building partially transparent to the sun.
    // This base keeps the atmospheric colour and ember while excluding only
    // the hard solar layer drawn next.
    vec3 sfHazeBase = col;

    // ---- The sun, light theme only. It starts the traverse just under the
    // skyline — all you get is the ember — and clears the rooftops as the
    // morning advances, which is the same uDawn the whole vault is riding.
    // Drawn before the city so the buildings occlude it while it is low.
    float day = 1.0 - uDark;
    if (day > 0.01) {
      float sunE = -0.012 + 0.078 * uDawn;
      float sunGate = smoothstep(-0.006, 0.014, sunE) * day;
      vec2 sq = vec2((a + 1.15) / 0.0118, (e - sunE) / 0.0118);
      float sd = length(sq);
      // White-hot core, warm limb, and a wide soft forward-scatter halo —
      // the halo is most of what sells a low sun through thick air.
      // The morning sky already sits on the ACES shoulder, so a disc at
      // sky-brightness buys nothing — it has to be genuinely HDR to separate
      // from the air it's shining through, and the halo has to be tinted
      // rather than white or it disappears the same way.
      vec3 sunCore = mix(emberC, vec3(1.0, 0.965, 0.88), 0.60);
      col += sunCore * smoothstep(1.10, 0.92, sd) * 1.85 * sunGate;
      col += emberC * exp(-sd * sd * 0.055) * 0.55 * sunGate;
    }

    // ---- The moon, dark theme only. It rises from behind the skyline,
    // crests near the middle of the traverse, then settles behind the city
    // again. Like the sun it is painted before hills/buildings, so every
    // silhouette occludes it naturally instead of relying on a cutout mask.
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

    // ---- Cloud deck, light theme only. The morning sky was one clean
    // gradient doing no compositional work; a broken deck gives it depth and
    // something that moves on its own. Three octaves of the same value noise
    // the air already uses, squashed 3.5:1 so the cells read as flat-bottomed
    // cloud rather than as lumps, and drifting slowly enough (~2.5 min to
    // cross the frame) to be weather instead of animation.
    if (day > 0.01 && uSimplify < 0.5) {
      vec2 cp = vec2(a * 2.6 + uTime * 0.010, e * 9.1);
      float cf = 0.54 * vnoise(cp)
               + 0.29 * vnoise(cp * 2.1 + 19.0)
               + 0.17 * vnoise(cp * 4.3 + 7.0);
      // A deck sits in a band of sky: nothing on the deck at the horizon
      // (that is haze's job) and nothing at the zenith.
      float deck = smoothstep(0.030, 0.080, e) * (1.0 - smoothstep(0.15, 0.27, e));
      float cloud = smoothstep(0.50, 0.76, cf) * deck * day;
      // Cloud reads by being DARKER than the sky, not whiter. A white cloud
      // on a sky that is already near-white at the shoulder is invisible —
      // which is exactly what the first pass rendered. So the body shades
      // the sky it sits on, and only the edge facing the sun takes the
      // ember. Away from the sun the shading deepens, which is what gives
      // the deck its form.
      float rim = smoothstep(0.44, 0.54, cf) - smoothstep(0.56, 0.72, cf);
      vec3 body = col * mix(0.74, 0.93, azFall);
      col = mix(col, body, cloud * 0.88);
      col += mix(vec3(1.0, 0.93, 0.82), emberC, clamp(azFall * 0.85, 0.0, 0.85))
           * rim * deck * day * (0.06 + 0.42 * azFall);
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
      // A separate, slowly drifting cloud layer. The earlier low-frequency
      // grade moved too little and too faintly to read as weather; this keeps
      // the same soft air but gives it a few unmistakable, broken cloud forms.
      vec2 dcp = vec2(dz * 8.4 + uTime * 0.0065,
                      e * 18.5 - uTime * 0.0012);
      float dcCf = 0.54 * vnoise(dcp)
                 + 0.31 * vnoise(dcp * vec2(1.92, 1.34) + 11.4)
                 + 0.15 * vnoise(dcp * vec2(3.85, 2.20) + 3.7);
      float dcCloudBand = smoothstep(0.034, 0.070, e)
                        * (1.0 - smoothstep(0.19, 0.275, e));
      // A higher horizontal frequency plus a slightly harder island gate
      // keeps the weather in separated cottony groups. The earlier 3.15x
      // field formed one frame-wide strip, which read as haze rather than
      // clouds even though its values were moving.
      float dcCloudIslands = smoothstep(0.42, 0.67,
          vnoise(vec2(dz * 12.7 + uTime * 0.0042, 6.3)));
      float dcCloud = smoothstep(0.585, 0.735, dcCf)
                    * dcCloudBand * dcCloudIslands;
      vec3 dcCloudDay = mix(dcDay * 0.91, vec3(0.89, 0.94, 0.985),
                            smoothstep(0.50, 0.68, dcCf));
      dcDay = mix(dcDay, dcCloudDay, dcCloud * 0.42);
      vec3 dcDusk = dcSkyGrade(col, e, umbraC, beltC,
                               dcShK, dcBeltA, dcDim);
      vec3 dcSky = mix(dcDay, dcDusk, uDark);
      vec3 dcCloudDusk = mix(dcSky * 0.74, beltC * 0.30,
                             smoothstep(0.54, 0.72, dcCf));
      dcSky = mix(dcSky, dcCloudDusk, dcCloud * uDark * 0.15);
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
    float dcBirdT = mod(uTime, 30.0);
    // Keep this tiny six-bird silhouette even on the simplified sky rung.
    // It is analytic/no-texture and costs less than one noise octave; gating
    // it made the requested life in the DC view disappear precisely on the
    // mobile/lower-power devices that benefit most from a readable cue.
    if (seatWin > 0.002) {
      // Two half-cycle-staggered groups guarantee one flock is in the open
      // sky while the other enters or leaves. The single previous flock was
      // technically present yet routinely outside the capture window.
      for (int df = 0; df < 2; df++) {
        float ff = float(df);
        float bt = fract(dcBirdT / 30.0 + ff * 0.5);
        float flockId = floor(uTime / 30.0) + ff * 19.0;
        for (int db = 0; db < 3; db++) {
          float bf = float(db);
          vec2 org = vec2(-0.23 + 0.54 * bt + bf * 0.028,
                          0.108 + bf * 0.015 + ff * 0.018
                          + 0.008 * sin(bt * 4.0 + bf * 1.9));
          vec2 q = vec2(dz, e) - org;
          if (dot(q, q) > 0.00018) continue;
          float w = 0.0062 + 0.0008 * hash1(flockId + bf * 7.1);
          float beat = sin(uTime * (6.3 + bf * 0.35) + bf * 1.7);
          vec2 elbowL = vec2(-w * 0.52, w * 0.25 * beat);
          vec2 elbowR = vec2( w * 0.52, w * 0.25 * beat);
          vec2 tipL = vec2(-w, w * (0.48 * sin(uTime * 6.3 - 0.8 + bf) - 0.05));
          vec2 tipR = vec2( w, w * (0.48 * sin(uTime * 6.3 - 0.8 + bf) - 0.05));
          float d = min(min(segD(q, vec2(0.0), elbowL), segD(q, elbowL, tipL)),
                        min(segD(q, vec2(0.0), elbowR), segD(q, elbowR, tipR)));
          float bird = smoothstep(0.00155, 0.00038, d)
                     * smoothstep(0.0, 0.10, bt)
                     * (1.0 - smoothstep(0.88, 1.0, bt));
          vec3 birdInk = mix(vec3(0.075, 0.105, 0.130),
                             vec3(0.42, 0.37, 0.44), uDark);
          col = mix(col, birdInk, bird * seatWin * 0.96);
        }
      }
    }

    // The sky as it stands BEFORE anything is drawn in front of it. Distant
    // masses haze toward whatever is behind them, and that is this — not a
    // fixed horizon hex. Captured ahead of the stars so a ridge doesn't
    // become faintly transparent to them.
    vec3 skyBase = col;

    // Stars, dark only — hashed cells in azimuth/elevation space with
    // per-star phase and rate, horizon extinction, thinned by the dawn.
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
      vec2 pos = vec2(hash2(cell + 17.0), hash2(cell + 43.0)) * 0.7 + 0.15;
      float d = length(fract(sc) - pos);
      float core = smoothstep(0.10, 0.02, d);
      float tw = 0.75 + 0.25 * sin(uTime * (0.6 + hash2(cell + 71.0) * 1.6) + hash2(cell + 5.0) * 6.28);
      float bright = 0.35 + 0.65 * hash2(cell + 29.0);
      col += vec3(0.82, 0.88, 1.0) * present * core * tw * bright * starGate;
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
    // the two cannot drift apart; a click there writes uFire, seconds since
    // launch, negative when idle. That gate is frame-uniform — the whole pass
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
    if (uFire > 0.0 && uFire < FIRE_WINDOW
        && abs(a + 2.04) < 0.32 && e > -0.05 && e < 0.28) {
      vec3 sparkAdd = vec3(0.0);
      vec3 glowAdd = vec3(0.0);
      float smoke = 0.0;
      for (int si = 0; si < 7; si++) {
        if (si >= 4 && uSimplify > 0.5) break;
        float fs = float(si);
        float h0 = hash1(uFireSeed + fs * 4.1);
        float h1 = hash1(uFireSeed + fs * 9.7);
        float h2 = hash1(uFireSeed + fs * 2.3);
        float h3 = hash1(uFireSeed + fs * 13.1);
        float h4 = hash1(uFireSeed + fs * 6.7);
        // Staggered, and unevenly: the hash is nearly as large as the step, so
        // some shells crowd and some leave a hole. An even cadence is a
        // metronome, and a volley is not one.
        float t = uFire - (fs * 0.46 + h0 * 0.34);
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
        float hh = hash1(uFireSeed + fs * 21.3);
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
                      * (0.62 + 0.38 * sin(e * 900.0 + uFireSeed + fs));
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
                 : 0.52 + 0.80 * hash1(bi * 1.37 + uFireSeed + fs * 5.9);
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
    float ggbDeckY = 0.0;
    float gx = (a + 2.04) / 0.055;
    if (abs(gx) < 1.10 && e > 0.024 && e < 0.078) {
      // The roadway crests at midspan, and the main cable is a PARABOLA
      // between the tower tops that comes down to touch the deck at the
      // centre — which is what the real cable does, and the same idiom the
      // Bay Bridge span already uses. The linear term tilts the curve
      // because the far tower is lower.
      float deckY = 0.0380 + 0.0022 * (1.0 - gx * gx);
      float cableY = deckY + 0.0308 * gx * gx - 0.00325 * gx;
      float towerTop = mix(0.0720, 0.0655, step(0.0, gx));
      // Art Deco setbacks. A stepped tower is the one detail that makes this
      // the Golden Gate and not a generic suspension bridge, so the taper is
      // four discrete stages rather than the smooth ramp Salesforce uses.
      float tt = clamp((e - deckY) / (towerTop - deckY), 0.0, 1.0);
      float hw = 0.0027 - 0.00042 * min(floor(tt * 4.0), 3.0);
      float dTw = abs(abs(gx) - 1.0) * 0.055;
      float tower = step(dTw, hw) * step(0.0245, e) * step(e, towerTop);
      float cable = step(abs(e - cableY), 0.0011) * step(abs(gx), 1.0);
      ggbDeck = step(abs(e - deckY), 0.0010) * step(abs(gx), 1.06);
      // Suspender ropes. Only legible near the towers — which is exactly the
      // stretch of span the ridge is not covering.
      float sus = 0.0;
      if (uSimplify < 0.5) {
        sus = step(abs(fract(gx * 9.0) - 0.5), 0.055)
            * step(deckY, e) * step(e, cableY) * step(abs(gx), 0.98);
      }
      ggbTower = tower;
      ggbDeckY = deckY;
      ggb = clamp(tower + cable + ggbDeck + sus, 0.0, 1.0);
    }
    // An 8 km bridge stands BEHIND the ridge and the rooftops, but structures
    // composites after the hills — so without this the span would paint over
    // the hill it is standing behind, which is the same class of mistake that
    // made the ridge itself read as a bar hanging in the sky.
    float ggbVis = (1.0 - hillMask) * (1.0 - city);
    ggb *= ggbVis;
    ggbTower *= ggbVis;
    ggbDeck *= ggbVis;

    // Coit Tower on Telegraph Hill — slender shaft, gently flared arcade.
    // Silhouette only (nightly floodlighting is unverified).
    float coit = 0.0;
    if (uSimplify < 0.5) {
      float dCoit = a + 1.90;
      if (abs(dCoit) < 0.008 && e < 0.048) {
        float shaft = step(abs(dCoit), 0.0032) * step(0.010, e) * step(e, 0.040);
        float cap = step(abs(dCoit), 0.0046) * step(0.040, e) * step(e, 0.046);
        coit = max(shaft, cap);
      }
    }

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
    // compass order (east of Salesforce) and hangs the cables in front of
    // the ember glow.
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
    float structures = clamp(city + sutro + coit + trans + sales + bridge + ggb, 0.0, 1.0) * ground;
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
                  * (1.0 - sutro) * (1.0 - trans) * (1.0 - sales);

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

    // The silhouette dissolves toward the horizon band near the horizon
    // line — its own aerial haze; rooftops catch a kiss of the ember.
    // Light haze eased 0.75→0.60 (v4): the light skyline was a ghost doing
    // zero compositional work (audit §2.3).
    float hazeAmt = (1.0 - smoothstep(0.0, 0.055, e)) * mix(0.60, 0.35, uDark);
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
    // buildings standing in front of it. This is also what prevents the sun's
    // hard disc from being reintroduced inside a silhouette by aerial haze.
    vec3 hillCol = mix(sfHazeBase * mix(0.86, 0.74, uDark), cityC * 0.60, 0.22);
    hillCol = mix(hillCol, sfHazeBase, hazeAmt * 0.8);
    hillCol += emberC * 0.55 * emberAmp * smoothstep(-2.16, -1.95, a);
    vec3 cityCol = mix(cityC, sfHazeBase, hazeAmt);
    cityCol += emberC * ember * 0.25;
    // The crown catches the first ember before anything else in the city —
    // tallest, east-facing glass. Salesforce Tower announces the dawn.
    cityCol += emberC * smoothstep(0.55, 1.0, crownT) * ember * 2.5 * sales;
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
    vec3 ggbCol = mix(cityC, vec3(0.72, 0.235, 0.125), mix(0.74, 0.14, uDark));
    ggbCol = mix(ggbCol, sfHazeBase, min(hazeAmt + mix(0.10, 0.28, uDark), 0.92));
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
        water = mix(water, dcWaterL,
                    (1.0 - uDark) * mix(0.10, 0.24, dd));

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
        vec3 rStone = mix(dcDark, dcLit, rSil.z);
        float chR = canopyTop(aR);
        float rCan = (1.0 - smoothstep(chR - 0.0032, chR + 0.0032, mhR))
                   * step(-0.0004, mhR) * rs * 0.88;
        water = mix(water, mix(rStone * 0.58, water, 0.40), rSil.x * rs);
        water = mix(water,
                    mix(mix(canCol, canCol * vec3(0.40, 0.46, 0.40),
                            smoothstep(0.10, -0.24, aR)) * 0.72, water, 0.34),
                    rCan);

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
        vec3 stone = mix(dcDark, dcLit, sil.z);
        vec3 dcCol = mix(stone, skyBase,
                         clamp(sil.y * mix(0.95, 0.90, uDark) + murk, 0.0, 0.94));
        col = mix(col, dcCol, sil.x * edge);
        // Scattered window grids on the unlit federal band — the one thing
        // that is alive on it after dark, and the cheapest way to keep 0.4
        // rad of black bar from reading as a ruled line. Gated on tone so it
        // can never land on marble.
        // 320 cells per radian is about four pixels: at the 900 the first
        // pass used, each window was under a pixel and the grid aliased into
        // diagonal strokes across the band.
        vec2 fw = vec2(dz * 320.0, above * 320.0);
        float fLit = step(hash2(floor(fw)), 0.17)
                   * step(abs(fract(fw.x) - 0.5), 0.24)
                   * step(abs(fract(fw.y) - 0.5), 0.28);
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
        // The 0.79 elevation scale makes the silhouette 0.79 / 1.18 = 67%
        // of its previous height without moving its shoreline contact.
        vec4 home = dcHome(dz, above / 0.79);
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
        float homeGlass = dcHomeWindows(dz, above / 0.79);
        col = mix(col, homeWindow, homeGlass * edge * 0.98);
        float homeColumns = dcHomeColumns(dz, above / 0.79);
        col = mix(col, homeWall * 1.08, homeColumns * edge * 0.98);
        col = mix(col, homeDoor, home.z * edge);
        float doorGlass = dcHomeDoorGlass(dz, above / 0.79);
        col = mix(col, homeWindow * 1.08, doorGlass * edge * 0.98);
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
      float karl = karlBand * (0.15 + 0.85 * west) * (0.45 + 0.55 * m)
                 * (1.0 - uDark) * (1.0 - seatWin);
      col = mix(col, mix(horizonC, vec3(0.97, 0.985, 1.0), 0.50), karl * 0.68);

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
      // Left out on purpose: the eight 116 W lights on each main cable, and
      // the midspan navigation lights, which at this range are under a pixel.
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
        col += hps * ggbTower * exp(-max(e - ggbDeckY, 0.0) * 95.0) * 0.25 * night;
        float ggbFlash = step(fract(uTime * 0.4333), 0.13);
        float dGa = length(vec2((gx + 1.0) * 0.055, e - 0.0720));
        float dGb = length(vec2((gx - 1.0) * 0.055, e - 0.0655));
        col += avRed * (smoothstep(0.0026, 0.0009, dGa)
                      + smoothstep(0.0026, 0.0009, dGb))
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
      // Awake, the crown reads by day too — dimmer, because it is competing
      // with a morning sky, but a control that does nothing when you point at
      // it is not a control.
      float crownVis = night + (1.0 - night)
                     * (0.12 + 0.36 * clamp(sfLive + sfShow, 0.0, 1.0));
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
      // It used to be one 2-milliradian dot, which at this range is honest and
      // reads as a slow star. Given three parts instead it reads as a
      // SPACECRAFT without ever exceeding what the pixels can carry: a hot
      // elongated bus, and two dimmer panels a couple of pixels fore and aft
      // of it on the track — the arrangement everyone recognises. Behind it a
      // short trail, which is not a physical tail but the smear the eye leaves
      // on a moving point. And it flares: a slow swell as the panels come
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
        // Panels fore and aft, at 2.6 px each side; the bus between them.
        float bus = smoothstep(0.0016, 0.0004,
                               length(vec2(along * 0.65, across)));
        float panels = smoothstep(0.0013, 0.0004,
                                  length(vec2((abs(along) - 0.0017) * 0.9, across)));
        float trail = smoothstep(0.0075, 0.0, -along) * step(along, -0.0005)
                    * smoothstep(0.0011, 0.0002, abs(across));
        // A flare peaks once per pass; the tumble is a fast small ripple on
        // it. Squared explicitly — pow() with a negative base is undefined in
        // GLSL ES, and half of this gaussian's argument is negative.
        float fq = (t01 - 0.30 - 0.4 * hash1(passId + 3.1)) / 0.16;
        float flare = 0.72 + 0.55 * exp(-(fq * fq))
                    + 0.10 * sin(uTime * 5.3 + passId);
        col += vec3(0.80, 0.85, 0.95)
             * (bus * 0.55 + panels * 0.30 + trail * 0.13) * flare
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

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // Temporal IGN (Jimenez scroll folded into the fract) with the amplitude
    // shaped to the midtones — pure dither in the deep end, film grain where
    // the eye can actually resolve it. Skipped under the composer (both
    // includes above no-op there and dithering linear HDR reads as grain in
    // the wrong space — the chain's Noise effect takes over).
    if (uPost < 0.5) {
      float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)) + uFrame * 0.4076492));
      float lum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      float amp = 2.0 / 255.0 + (5.0 / 255.0) * (1.0 - abs(lum * 2.0 - 1.0));
      gl_FragColor.rgb += (n - 0.5) * amp;
    }
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
  mesh.lookAt(camera.position);
}

function SkyDome({ dark, simplify }: { dark: boolean; simplify: boolean }) {
  const domeRef = useRef<THREE.Mesh>(null);
  const hitRef = useRef<THREE.Mesh>(null);
  const sfHitRef = useRef<THREE.Mesh>(null);
  const fireStart = useRef(-1);
  const pendingFire = useRef(false);
  const sfStart = useRef(-1);
  const pendingSf = useRef(false);
  const viewDirection = useRef(new THREE.Vector3());
  const setHovered = useStacks((s) => s.setHovered);
  const material = useMemo(() => {
    const c = (hex: string) => new THREE.Color(hex);
    const L = PALETTES.light;
    const D = PALETTES.dark;
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uDark: { value: dark ? 1 : 0 },
        uDawn: { value: 0 },
        uPan: { value: -PAN_BIAS },
        // Seeded near the centre of the opening frame rather than "nowhere":
        // damping in from a sentinel would sweep the highlight across the
        // whole skyline on load.
        uHover: { value: -1.6 },
        uTime: { value: 0 },
        uFrame: { value: 0 },
        uSimplify: { value: 0 },
        uPost: { value: 0 },
        uFire: { value: -1 },
        uFireSeed: { value: 0 },
        uSeat: { value: 0 },
        uDcAnchor: { value: 1.0 },
        uSfHover: { value: 0 },
        uSfShow: { value: -1 },
        uSfSeed: { value: 0 },
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
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
    });
    // The material lives for the mount — theme flips crossfade via uDark.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => material.dispose(), [material]);
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
  useEffect(() => {
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      const from = down;
      down = null;
      if (e.button !== 0 || !from) return;
      // A drag across the scroll element is travel, not a tap — the same
      // 6px threshold every other trigger in the scene uses for r3f's delta.
      if (Math.hypot(e.clientX - from[0], e.clientY - from[1]) > 6) return;
      const s = useStacks.getState();
      if (s.dragging) return; // a throw, not a tap
      if (s.hovered === GGB_HOVER) pendingFire.current = true;
      else if (s.hovered === SF_HOVER) pendingSf.current = true;
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
    u.uFrame!.value = ((u.uFrame!.value as number) + 1) % 64;
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

    // Fireworks clock. The click handler can only raise a flag — it has no
    // clock of its own — so the launch time is stamped here, on the frame
    // after the click.
    if (pendingFire.current) {
      pendingFire.current = false;
      fireStart.current = clock.elapsedTime;
      u.uFireSeed!.value = Math.random() * 97;
    }
    if (fireStart.current >= 0) {
      const age = clock.elapsedTime - fireStart.current;
      if (age > FIRE_DURATION) fireStart.current = -1;
      u.uFire!.value = age;
    } else {
      u.uFire!.value = -1;
    }
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
    // The sky is at infinity, so it must not parallax against the room — in
    // ANY axis. Copying only x left the dome fixed in y and z while the
    // camera bobs (CameraRig's idle sine plus pointer parallax) and dollies
    // back when a panel opens, so the horizon crept against the shelves.
    if (domeRef.current) domeRef.current.position.copy(camera.position);
  });
  // renderOrder 1: draw after opaque geometry so early-Z rejects the covered
  // sky fragments (its depth-sort position otherwise changes during traverse).
  return (
    <>
      <mesh
        ref={domeRef}
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
    </>
  );
}

// Image-based lighting from hand-placed emitters — no HDRI file, no CDN.
// Gives the 37 standard materials something to reflect; intensity stays low
// so the lamps keep reading as the light source.
function RoomEnvironment({ dark }: { dark: boolean }) {
  return (
    <Environment
      frames={1}
      resolution={256}
      environmentIntensity={dark ? 0.45 : 0.38}
    >
      <Lightformer
        form="rect"
        color={dark ? "#ffc98f" : "#ffe4cb"}
        intensity={dark ? 1.5 : 1.8}
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
        intensity={dark ? 1.3 : 0.7}
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
  );
}

function Dust({ palette, count = 380 }: { palette: Palette; count?: number }) {
  const ref = useRef<THREE.Group>(null);
  // Additive blending lands in linear HDR under the composer — the motes
  // read ~a third weaker there (audit §2.1 item 4).
  const postfx = useStacks((s) => s.postfx);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = -2 + rand(i, 21) * (TRAVEL_X + 4);
      arr[i * 3 + 1] = -1.3 + rand(i, 22) * 3.1;
      arr[i * 3 + 2] = -2.2 + rand(i, 23) * 3.4;
    }
    return arr;
  }, [count]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = Math.sin(t * 0.18) * 0.07;
    ref.current.position.x = Math.sin(t * 0.11) * 0.1;
  });
  const light = palette === PALETTES.light;
  return (
    <group ref={ref}>
      {/* Light mode is two registrations of the SAME field: a broad, low
          opacity gold halo behind a small saturated amber core. More motes
          would read as snow; two-scale sprites read as individual fireflies
          and remain visible over both the white sky and darker furniture. */}
      {light && (
        <points>
          <bufferGeometry key={`halo-${count}`}>
            <bufferAttribute
              attach="attributes-position"
              args={[positions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            map={poolTexture()}
            size={0.09}
            color="#f2b63f"
            transparent
            opacity={0.42 * (postfx ? 1.2 : 1)}
            depthWrite={false}
            sizeAttenuation
          />
        </points>
      )}
      <points>
        <bufferGeometry key={`core-${count}`}>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        {/* Soft radial sprite map — untextured Points rasterize as 1-2px hard
            squares against dark wood (audit §1.7). */}
        <pointsMaterial
          map={poolTexture()}
          size={light ? 0.032 : 0.04}
          color={palette.dust}
          transparent
          opacity={palette.dustOpacity * (postfx ? 1.35 : 1)}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

// Warm key light following the camera laterally so every unit reads the same.
// It doesn't cast — grounding comes from the analytic ground pools
// (GroundPool.tsx), so there is no per-frame shadow pass at all.
function KeyLight({ dark }: { dark: boolean }) {
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
  useFrame(({ camera }) => {
    const light = lightRef.current;
    const hemi = hemiRef.current;
    if (!light || !hemi) return;
    light.position.x = camera.position.x + 4;
    light.target.position.x = camera.position.x;
    if (dark) {
      // The traverse's dawn progression belongs to the light theme; night
      // keeps one bounded exposure all the way through the room.
      light.color.copy(dawnLight.keyDark);
      light.intensity = 1.35;
      hemi.color.copy(dawnLight.skyDark);
      hemi.groundColor.copy(dawnLight.groundDark);
      hemi.intensity = 1.2;
      return;
    }
    const dawn = THREE.MathUtils.smoothstep(progressRef.current, 0, 1);
    light.color.lerpColors(dawnLight.keyEarly, dawnLight.keyLate, dawn);
    light.intensity = THREE.MathUtils.lerp(1.28, 1.42, dawn);
    hemi.color.lerpColors(dawnLight.skyEarly, dawnLight.skyLate, dawn);
    hemi.groundColor.lerpColors(
      dawnLight.groundEarly,
      dawnLight.groundLate,
      dawn,
    );
    hemi.intensity = THREE.MathUtils.lerp(1.0, 1.08, dawn);
  });
  return (
    <>
      <hemisphereLight
        ref={hemiRef}
        color={dark ? "#91a6c9" : "#eaf3ff"}
        groundColor={dark ? "#33291f" : "#a8b2bf"}
        intensity={dark ? 1.2 : 1.0}
      />
      <directionalLight
        ref={lightRef}
        position={[4, 6.5, 6]}
        intensity={dark ? 1.35 : 1.28}
        // Dark key remains unchanged. The light key starts neutral-warm and
        // follows the scroll-driven morning in useFrame above.
        color={dark ? "#efd0b1" : "#fff3e6"}
      />
    </>
  );
}

export default function SceneEnvironment({
  palette,
  dark,
  dustOff,
  skySimplify,
  degrade = 0,
}: {
  palette: Palette;
  dark: boolean;
  dustOff?: boolean;
  skySimplify?: boolean;
  /** PerformanceMonitor's one-way ladder rung (0 = full quality). */
  degrade?: number;
}) {
  // ?nomeadow joins the existing query family (?nopostfx) as the live A/B
  // escape. Read once — the search string cannot change without a reload.
  const meadow = useMemo(
    () =>
      MEADOW_ENABLED &&
      !(
        typeof window !== "undefined" &&
        window.location.search.includes("nomeadow")
      ),
    [],
  );
  // The degrade ladder maps straight onto the meadow's quality rungs: each
  // step down thins every band uniformly (never a bare plane), and rungs
  // 0–1 (degrade ≥ 2) also zero the flowers. One-way, so counts only shrink.
  const rung = (3 - Math.min(3, degrade)) as 0 | 1 | 2 | 3;
  return (
    <>
      <fog attach="fog" args={[palette.fog, 8, 24]} />
      <SkyDome dark={dark} simplify={!!skySimplify} />
      {meadow && (
        <Suspense fallback={null}>
          <Meadow dark={dark} rung={rung} />
        </Suspense>
      )}
      <RoomEnvironment key={dark ? "env-d" : "env-l"} dark={dark} />
      <KeyLight dark={dark} />
      {!dustOff && <Dust palette={palette} />}
    </>
  );
}

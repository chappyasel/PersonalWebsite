"use client";

// Atmosphere for The Stacks — gradient sky dome, fog-matched palette,
// hemisphere fill, camera-tracking key light with soft shadows, and dust.
import { Environment, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { PALETTES, type Palette, rand } from "../theme";
import { progressRef, useStacks } from "../store";
import { poolTexture } from "./GroundPool";
import { getSeatAmount } from "./seated";
import { MID_X, TRAVEL_X } from "./worldLayout";

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
// DARK at 3:45 (Day for Night runs dusk→2am) — it gets the FAA L-864 beacon
// and catches the first ember before anything else in the city; the Bay
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

  // The cherry canopy ringing the basin — massing, not trees. Individual
  // crowns at this scale are noise, so this returns the HEIGHT of one low
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
    // 30 ft Yoshinos on the far shore — East and West Potomac Park, 1.3 to
    // 1.9 km out — which is 0.0018 to 0.0080 rad. The octaves above are
    // already right and only the amplitude needed moving: the 78× octave
    // gives cells about 0.013 rad wide and one crown at that range subtends
    // 0.011, so one cell is one tree. Any taller and the rounded humps stop
    // reading as a tree line and start reading as hills, which the Potomac
    // basin conspicuously does not have.
    //
    // The far shore is not one planting, and drawing it as one is what left
    // the whole left of the frame empty. Right of the Monument is the Tidal
    // Basin rim and East Potomac Park — cherries, low and pale. Left of it is
    // West Potomac Park, which is mature elm and oak: half again as tall and
    // a great deal darker. The caller re-derives the same ramp to shade
    // them apart — it is one smoothstep, and sharing it through a return
    // value would cost the reflection a second evaluation.
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
    vec3 dawnTint = vec3(1.0) + vec3(0.115, 0.030, -0.070) * uDawn;
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
    col *= mix(vec3(1.0), vec3(1.05, 0.99, 0.72), min(ember, 1.0) * (1.0 - uDark));

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

    // The dusk grade over Washington. Both themes get the same moment —
    // the twenty minutes after sunset — because a vista dropped into a noon
    // sky reads as a decal, and because this is where the contrast comes
    // from: pulling the low sky DOWN is what lets floodlit marble sit in
    // front of it and be brighter than it. The old rig did the opposite,
    // glowing the horizon up and then drawing pale stone on top of it, and
    // the monuments came out as ghosts in both themes.
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
      col = mix(col, dcSkyGrade(col, e, umbraC, beltC, dcShK, dcBeltA, dcDim),
                seatWin);
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
           * mix(0.035, 0.018, uDark) * mix(1.22, 1.0, uPost) * seatWin;
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

    // Transamerica Pyramid — tapering triangle plus the two vertical wings
    // (they are what turn "a triangle" into THE pyramid).
    float trans = 0.0;
    float dTr = a + 1.62;
    if (abs(dTr) < 0.014 && e < 0.084) {
      float hwT = 0.0102 * (1.0 - e / 0.082);
      trans = step(abs(dTr), max(hwT, 0.0008)) * step(e, 0.082);
      float wings = step(abs(abs(dTr) - 0.0102), 0.0012) * step(e, 0.050);
      trans = max(trans, wings);
    }

    // Salesforce Tower — 1,070 ft on a 180 ft square footprint, tapering
    // CONTINUOUSLY to a slender rounded crown. Three things were wrong and
    // they compounded: the taper ran to 0.37 of the base, which pinched the
    // shaft into a mast; the crown was a cut, not a curve; and the dissolve
    // then ate the top 14% of what little width was left. The tower read as
    // a needle with a spike on it.
    //
    // Now the plates shrink to 0.61 of the base over the full height — every
    // floor smaller than the one below, which is the actual structure — and
    // a rounded shoulder closes the last few per cent, because the top of
    // this building is a curve. Aspect lands at 5.3 : 1 against the real
    // 5.9 : 1, a shade stout on purpose: at a true 5.9 the upper third is
    // four pixels and the antialiasing eats it, which is how it came to look
    // too narrow in the first place.
    //
    // The dissolve stays, softer, because it is Pelli's stated intent and
    // the physical perforated-aluminium scrim: the top is meant to give out
    // into the sky rather than end.
    float sales = 0.0;
    float crownT = 0.0;
    float crownM = 0.0;   // tower mask WITHOUT the dissolve — the crown is
                          // the brightest thing on the skyline, so it must
                          // not be faded out by the taper it sits on.
    float dSf = a + 1.28;
    float sTop = 0.100;
    if (abs(dSf) < 0.013 && e < sTop + 0.004) {
      float st = clamp(e / sTop, 0.0, 1.0);
      float shoulder = sqrt(max(1.0 - pow(st, 12.0), 0.0));
      float hwS = 0.0094 * (1.0 - 0.39 * st) * shoulder;
      float dissolve = smoothstep(sTop, sTop - 0.009, e);
      crownM = step(abs(dSf), hwS) * step(e, sTop);
      sales = crownM * dissolve;
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
    float wHash = hash2(wcell);
    // Pointer response: the stretch of skyline under the cursor wakes a
    // little — a few more windows come on, and fade back out behind you.
    float hq = (a - uHover) / 0.06;
    float hoverNear = exp(-(hq * hq));
    float thresh = 0.05 * mix(1.0 - 0.7 * uDawn, 1.0 + 0.6 * uDawn, uDark)
                 * (1.0 + 2.4 * hoverNear);
    float slow = 0.006 * sin(uTime * 0.05 + hash2(wcell + 3.0) * 6.2832);
    float lit = smoothstep(thresh + 0.004, thresh - 0.004, wHash + slow) * inBox;
    float winMask = lit * city * step(0.004, e) * step(e, roof - 0.005) * (1.0 - sutro);

    // The silhouette dissolves toward the horizon band near the horizon
    // line — its own aerial haze; rooftops catch a kiss of the ember.
    // Light haze eased 0.75→0.60 (v4): the light skyline was a ghost doing
    // zero compositional work (audit §2.3).
    float hazeAmt = (1.0 - smoothstep(0.0, 0.055, e)) * mix(0.60, 0.35, uDark);
    // Aerial perspective converges a distant mass on the sky BEHIND it, so
    // both the ridge and the skyline haze toward skyBase. The ridge starts
    // darker than the buildings (it is unlit rock, not glass) and carries
    // more haze, which is what puts it plainly behind them.
    // Anchored to the sky rather than to the skyline hex: at 3:45 a ridge
    // eight kilometres out is very nearly the colour of the air in front of
    // it, a little darker and a little less blue. Deriving it from skyBase
    // keeps that true through the dawn and through both themes, where a
    // fixed hex drifted warm and the ridge ended up warmer than the
    // buildings standing in front of it.
    vec3 hillCol = mix(skyBase * mix(0.86, 0.74, uDark), cityC * 0.60, 0.22);
    hillCol = mix(hillCol, skyBase, hazeAmt * 0.8);
    hillCol += emberC * 0.55 * emberAmp * smoothstep(-2.16, -1.95, a);
    vec3 cityCol = mix(cityC, skyBase, hazeAmt);
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
    ggbCol = mix(ggbCol, skyBase, min(hazeAmt + mix(0.10, 0.28, uDark), 0.92));
    cityCol = mix(cityCol, ggbCol, ggb);
    cityCol = mix(cityCol, windowC, winMask * mix(0.45, 0.70, uDark));

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
      vec3 dcDark = mix(vec3(0.085, 0.079, 0.072), vec3(0.006, 0.008, 0.014), uDark);
      vec3 dcLit  = mix(vec3(0.96, 0.88, 0.73), vec3(0.66, 0.57, 0.44), uDark);

      // Haze varies with DISTANCE, which dcCity carries per element, plus a
      // height term for the low murk that sits on the river. Toward skyBase
      // — which already includes the dusk grade — never toward a fixed hex;
      // mixing distant mass toward a constant is what produced a hard edge
      // in the background twice.
      float murk = mix(0.075, 0.14, uDark)
                 * (1.0 - smoothstep(0.0, 0.045, max(above, 0.0)));

      // Blossom. Yoshino is 70% of the trees and at peak bloom the mass is
      // WHITE with a pink flush — the saturated cultivar, Kwanzan, is 13% of
      // the park and opens a fortnight later, so there is no candy pink in
      // this picture. Yoshino also blooms before it leafs out, so the band is
      // flowers on bare branches: airy, and LIGHTER in value than the ground
      // it stands on.
      //
      // And with the sun behind the viewer the canopy is FRONTLIT, not
      // backlit, which inverts the old construction. It is also the safer
      // picture: the pink now lives on an object instead of being painted
      // onto the sky, where it smears into the pink fog this kept producing.
      // Kept well under the marble: brighter than the shadowed sky it stands
      // against, dimmer than anything with a floodlight on it. Authored as a
      // fixed value rather than tied to the sky's luminance, because the sky
      // at the waterline is now the darkest thing in the frame and dividing
      // by it is how the band became a lit filament ruled across the water.
      vec3 canCol = mix(dcLit, beltC, 0.34) * mix(0.19, 0.155, uDark);

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
        vec3 water = dcSkyGrade(skyBand(mh, shadowC, horizonC, zenithC),
                                mh, umbraC, beltC, dcShK, dcBeltA, dcDim);
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
        water *= mix(mix(2.30, 0.55, dd), mix(0.84, 0.26, dd), uDark);

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
        // Two kilometres of blossom is not one value. Without this the band
        // is the brightest continuous thing in the frame AND the flattest,
        // and it reads as a sandbar rather than as trees.
        float canV = 0.52 + 0.48 * vnoise(vec2(dz * 2.2, 9.4));
        // Elm and oak on the park side, blossom on the basin side.
        vec3 canS = mix(canCol, canCol * vec3(0.40, 0.46, 0.40),
                        smoothstep(0.10, -0.24, dz)) * canV;
        col = mix(col, canS, can * edge * 0.94);
        // The crowns, lifted rather than lit. A multiply keeps the top of the
        // band underneath the sky no matter how bright that sky is; an
        // additive here is what put a neon lip on the shoreline, and it would
        // have compounded again under Bloom.
        float crown = can * smoothstep(ch - 0.0070, ch - 0.0012, above);
        col = mix(col, canS * 1.42, crown * edge * 0.85);
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
      vec3 nearC = mix(vec3(0.085, 0.086, 0.062), vec3(0.009, 0.011, 0.017), uDark);
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

      // Aviation lights, dark only. Salesforce Tower gets NONE: no source
      // documents a red obstruction beacon on it, and a single point would
      // be lost against a 150ft glowing crown anyway. The red constellation
      // of this skyline belongs to Sutro Tower.
      vec3 avRed = vec3(0.90, 0.12, 0.10);
      float night = smoothstep(0.35, 0.75, uDark);
      float dApex = length(vec2(dTr, e - 0.082));
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
      float crownVis = night + (1.0 - night) * 0.34 * clamp(sfLive + sfShow, 0.0, 1.0);
      float crownBand = smoothstep(0.855, 0.900, crownT);
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
      col += crownHue * wash * pulse * crownBand * crownM * crownVis
           * 0.70 * (1.0 + 0.85 * sfLive + 1.9 * sfShow);
      // The crown lights the air around itself. Without this the band is a
      // bright rectangle pasted on the sky; with it, the tower reads as the
      // source. Kept close in — a halo ten times the width of the thing
      // making it stops being light and becomes weather — and it is what
      // grows when the installation wakes, since a bigger halo is how a
      // brighter source actually announces itself.
      vec2 cq = vec2(dSf / (0.017 + 0.009 * sfShow),
                     (e - sTop * 0.955) / (0.011 + 0.005 * sfShow));
      col += crownHue * exp(-dot(cq, cq) * 2.2)
           * (0.20 + 0.05 * sin(uTime * 0.31) + 0.20 * sfLive + 0.55 * sfShow)
           * crownVis;

      // Satellite — one dim, tailless, constant-velocity crossing every 92s
      // (Starlink-era truthful; the sophisticated cousin of a shooting
      // star). uTime-only gate is frame-uniform, so idle cost is nil. The
      // +84 seed lands the first pass ~8s after mount.
      float satT = mod(uTime + 84.0, 92.0);
      if (satT < 5.5) {
        float passId = floor((uTime + 84.0) / 92.0);
        float t01 = satT / 5.5;
        // e 0.10-0.17: the visible frame only reaches e ≈ 0.20 at desktop
        // aspect — anything higher crosses above the viewport unseen.
        vec2 sat = vec2(
          -2.35 + hash1(passId + 0.5) * 0.45 + 1.15 * t01,
          0.10 + hash1(passId + 7.3) * 0.07 + (hash1(passId + 13.7) - 0.5) * 0.05 * t01
        );
        float dSat = length(vec2(a, e) - sat);
        col += vec3(0.80, 0.85, 0.95) * smoothstep(0.0020, 0.0006, dSat) * 0.55 * night * (1.0 - 0.5 * uDawn);
      }
    }

    // ---- Fireworks over the bay, fired by clicking the Golden Gate.
    //
    // The bridge is shader geometry, so it has no pointer events of its own.
    // SkyDome puts an invisible hit target on it whose azimuth and elevation
    // are computed from the SAME GGB_* constants this shader draws with, so
    // the two cannot drift apart; a click there writes uFire, seconds since
    // launch, negative when idle. That gate is frame-uniform — the whole pass
    // costs one comparison until somebody clicks, the same trick the
    // satellite already uses — and the azimuth guard keeps the seven seconds
    // it IS running confined to the bay instead of the whole dome.
    //
    // The shells rise from the roadway rather than from the horizon, because
    // that is the object you clicked.
    //
    // Brightness is authored for the composer and lifted when it is absent,
    // not the other way round: additive glow COMPOUNDS in linear HDR, and a
    // burst tuned to look right with postfx off blows the frame out with
    // Bloom on. The spark cores are allowed over Bloom's 0.95 threshold
    // because they are a handful of pixels each; the soft burst flash is held
    // well under it, because a wide additive is exactly how a sky goes milky.
    if (uFire > 0.0 && uFire < 7.4
        && abs(a + 2.04) < 0.32 && e > -0.05 && e < 0.26) {
      float dayFire = 1.0 - uDark;
      vec3 sparkAdd = vec3(0.0);
      vec3 glowAdd = vec3(0.0);
      float smoke = 0.0;
      for (int si = 0; si < 4; si++) {
        float fs = float(si);
        float t = uFire - fs * 0.74 - hash1(uFireSeed + fs * 4.1) * 0.30;
        if (t <= 0.0) continue;
        // Biased WEST of the bridge rather than centred on it: everything
        // that can occlude a burst — the portrait frame, the top shelf, the
        // placard — is east of this azimuth, and open sky is west.
        float az = -2.04 + (hash1(uFireSeed + fs * 9.7) - 0.72) * 0.160;
        float burstE = 0.112 + hash1(uFireSeed + fs * 2.3) * 0.036;
        float rise = 0.92;
        float hsel = hash1(uFireSeed + fs * 13.1);
        vec3 hue = hsel < 0.42 ? vec3(1.00, 0.84, 0.50)
                 : (hsel < 0.76 ? vec3(1.00, 0.44, 0.30)
                                : vec3(0.52, 0.78, 1.00));
        if (t < rise) {
          // The shell on its way up: one hot dot easing off the deck with a
          // short trail under it. No smoke — at 8 km that is a grey pixel.
          float u = t / rise;
          float sy = mix(0.0400, burstE, u * (2.0 - u));
          float dAz = a - az;
          float trail = smoothstep(0.011, 0.0, sy - e)
                      * step(0.038, e) * step(e, sy)
                      * smoothstep(0.0011, 0.0003, abs(dAz));
          float head = smoothstep(0.0021, 0.0005, length(vec2(dAz, e - sy)));
          sparkAdd += vec3(1.00, 0.72, 0.36) * (head + trail * 0.5)
                    * (1.0 - u * 0.35);
        } else {
          float age = t - rise;
          float dur = 2.6;
          if (age > dur) continue;
          float u = age / dur;
          vec2 p = vec2(a - az, e - burstE);
          // Undo gravity to get back into the ballistic frame: every spark
          // shares the same drop, so one add restores the expanding circle
          // and the whole burst can be tested as a radius.
          p.y += 0.020 * age * age;
          float r = length(p);
          float ang = atan(p.y, p.x);
          float bins = 28.0;
          float bi = floor((ang + 3.14159265) / 6.28318531 * bins);
          float sp = 0.52 + 0.80 * hash1(bi * 1.37 + uFireSeed + fs * 5.9);
          float R = 0.058 * (1.0 - exp(-3.6 * u)) * sp;
          float ca = (bi + 0.5) / bins * 6.28318531 - 3.14159265;
          float da = (ang - ca) * r;
          // Elongated along the radius: a spark is a streak, not a dot.
          float spark = smoothstep(0.0026, 0.0006, length(vec2((r - R) * 0.34, da)));
          float twinkle = 0.62 + 0.38 * sin(uTime * 41.0 + bi * 2.7 + fs);
          float fade = exp(-age * 1.15) * (1.0 - smoothstep(0.72, 1.0, u));
          // White-hot at the burst, into the shell's own colour, cooling to a
          // dim ember as it falls.
          vec3 sc = mix(vec3(1.0, 0.97, 0.90), hue, smoothstep(0.0, 0.24, u));
          sc = mix(sc, hue * vec3(0.70, 0.40, 0.30), smoothstep(0.45, 1.0, u));
          sparkAdd += sc * spark * twinkle * fade;
          float glow = exp(-dot(p, p) * 2380.0);
          glowAdd += hue * glow * exp(-age * 3.4);
          smoke += glow * smoothstep(0.0, 0.25, u) * (1.0 - smoothstep(0.35, 1.0, u));
        }
      }
      // Light theme keeps the shells rather than firing white blobs into a
      // morning sky: a daytime firework reads as a bright core and then a
      // puff that is DARKER than the sky behind it, which is the same lesson
      // the cloud deck learned on the ACES shoulder. So the additive is
      // pulled back and the smoke does most of the work.
      col = mix(col, col * 0.78, clamp(smoke, 0.0, 1.0) * 0.8 * dayFire);
      col += sparkAdd * mix(1.45, 1.0, uPost) * 1.15 * mix(0.60, 1.0, uDark);
      col += glowAdd * mix(1.50, 1.0, uPost) * 0.45 * mix(0.30, 1.0, uDark);
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
// Longest a launch runs: four shells, the last delayed ~2.5s, rise 0.92s,
// burst 2.6s. Matches the shader's own uFire window.
const FIRE_DURATION = 7.4;

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
/** Pixels of the right of the frame the desktop placard owns, by breakpoint
 *  (w-[27rem] + right-5, then lg:right-8, then xl:w-[31rem]); below md it is
 *  hidden and the whole width is sky. */
function placardPx(w: number): number {
  if (w >= 1280) return 528;
  if (w >= 1024) return 464;
  if (w >= 768) return 452;
  return 0;
}
// How much of the seated camera's pointer yaw the vista gives back.
//
// CameraRig swings the seated aim by ±0.149 rad with the pointer, undamped,
// against 0.213 rad of total slack in the frame — so at the extremes the
// Monument walks off the left edge or the Capitol slides under the placard,
// and the state you are guaranteed to be in the instant you sit down is the
// worst one, because the pointer is still on the chair at the far left.
// Halving the swing keeps every element in frame across the whole range and
// is undetectable: the only other things in this window are the sky's own
// gradient and the water, both of which are functions of elevation alone.
const DC_COUNTER_PAN = 0.5;

function SkyDome({ dark, simplify }: { dark: boolean; simplify: boolean }) {
  const domeRef = useRef<THREE.Mesh>(null);
  const hitRef = useRef<THREE.Mesh>(null);
  const sfHitRef = useRef<THREE.Mesh>(null);
  const fireStart = useRef(-1);
  const pendingFire = useRef(false);
  const sfStart = useRef(-1);
  const pendingSf = useRef(false);
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
    // azimuth π/2 plus the pan — plus whatever yaw the pointer has added,
    // which CameraRig applies undamped and which is halved here (see
    // DC_COUNTER_PAN). Everything after that is one solve: put the Capitol
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
    const yaw = Math.atan2(6.0, -pointer.x * 0.9) - Math.PI * 0.5;
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
    const park = (
      mesh: THREE.Mesh | null,
      az: number,
      halfAz: number,
      e0: number,
      e1: number,
      z: number,
    ) => {
      if (!mesh) return;
      const th = az - pan;
      const ph = (e0 + e1) * 0.5;
      const cp = Math.cos(ph);
      const dz = Math.sin(th) * cp;
      // th stays in the third quadrant across the whole traverse for both
      // targets, so dz is always solidly negative — but a degenerate solve
      // would fling the plane to infinity, so it is guarded, not assumed.
      if (dz >= -0.05) return;
      const t = (z - camera.position.z) / dz;
      mesh.position.set(
        camera.position.x + Math.cos(th) * cp * t,
        camera.position.y + Math.sin(ph) * t,
        z,
      );
      mesh.scale.set(2 * halfAz * t, (e1 - e0) * t, 1);
      mesh.lookAt(camera.position);
    };
    park(hitRef.current, GGB_AZ, GGB_HALF_A, GGB_E0, GGB_E1, GGB_HIT_Z);
    park(sfHitRef.current, SF_AZ, SF_HALF_A, SF_E0, SF_E1, SF_HIT_Z);
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
        color={dark ? "#ffc98f" : "#ffd9b0"}
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
        color={dark ? "#414f70" : "#7a8ba4"}
        intensity={dark ? 1.3 : 0.7}
        position={[-5, 2, 1]}
        scale={8}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="circle"
        color={dark ? "#5b432c" : "#a97e54"}
        intensity={0.5}
        position={[0, -4, 2]}
        scale={8}
        target={[0, 0, 0]}
      />
    </Environment>
  );
}

function Dust({ palette, count = 380 }: { palette: Palette; count?: number }) {
  const ref = useRef<THREE.Points>(null);
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
  return (
    <points ref={ref}>
      <bufferGeometry key={count}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      {/* Soft radial sprite map — untextured Points rasterize as 1-2px hard
          white squares against dark wood (audit §1.7). */}
      <pointsMaterial
        map={poolTexture()}
        size={0.04}
        color={palette.dust}
        transparent
        opacity={palette.dustOpacity * (postfx ? 1.35 : 1)}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// Warm key light following the camera laterally so every unit reads the same.
// It doesn't cast — grounding comes from the analytic ground pools
// (GroundPool.tsx), so there is no per-frame shadow pass at all.
function KeyLight({ dark }: { dark: boolean }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
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
    if (!light) return;
    light.position.x = camera.position.x + 4;
    light.target.position.x = camera.position.x;
  });
  return (
    <directionalLight
      ref={lightRef}
      position={[4, 6.5, 6]}
      intensity={dark ? 1.15 : 1.35}
      // Dark key slightly desaturated (was #e8b57e) — the heavier orange
      // multiplied every albedo toward the same brown (audit §2.3).
      color={dark ? "#e3bd94" : "#ffe9cb"}
    />
  );
}

export default function SceneEnvironment({
  palette,
  dark,
  dustOff,
  skySimplify,
}: {
  palette: Palette;
  dark: boolean;
  dustOff?: boolean;
  skySimplify?: boolean;
}) {
  return (
    <>
      <fog attach="fog" args={[palette.fog, 8, 24]} />
      <SkyDome dark={dark} simplify={!!skySimplify} />
      <RoomEnvironment key={dark ? "env-d" : "env-l"} dark={dark} />
      <hemisphereLight
        color={dark ? "#a8825c" : "#fff2df"}
        groundColor={dark ? "#2a1c10" : "#b08c66"}
        intensity={dark ? 0.95 : 1.05}
      />
      <KeyLight dark={dark} />
      {!dustOff && <Dust palette={palette} />}
    </>
  );
}

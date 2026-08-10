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
  uniform float uDark;     // 0 light theme … 1 dark theme (damped crossfade)
  uniform float uDawn;     // scroll offset 0…1 — the traverse advances the morning
  uniform float uPan;      // azimuth the traverse has swept (see SkyDome)
  uniform float uHover;    // azimuth the pointer is over, or 99 for none
  uniform float uTime;
  uniform float uFrame;    // frame counter mod 64 — scrolls the IGN dither
  uniform float uSimplify; // degrade rung: 1 = two bands, no city/stars/ember
  uniform float uPost;     // 1 = composer owns the frame: skip the IGN dither
                           // (it would grain linear HDR; Noise runs in-chain)
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
    vec3 col = mix(shadowC, horizonC, smoothstep(0.0, 0.16, e));
    col = mix(col, zenithC, smoothstep(0.045, 0.30, e));
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

    // The sky as it stands BEFORE anything is drawn in front of it. Distant
    // masses haze toward whatever is behind them, and that is this — not a
    // fixed horizon hex. Captured ahead of the stars so a ridge doesn't
    // become faintly transparent to them.
    vec3 skyBase = col;

    // Stars, dark only — hashed cells in azimuth/elevation space with
    // per-star phase and rate, horizon extinction, thinned by the dawn.
    // Simplified halves the field instead of dropping it.
    float starGate = uDark * (1.0 - 0.35 * uDawn) * smoothstep(0.03, 0.22, e);
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

    // Salesforce Tower — obelisk taper with the crown DISSOLVING over the
    // top 14% (Pelli's stated intent). Dark at 3:45: Day for Night runs
    // dusk→2am, so the crown earns a beacon, not a light show.
    float sales = 0.0;
    float crownT = 0.0;
    float crownM = 0.0;   // tower mask WITHOUT the dissolve — the crown is
                          // the brightest thing on the skyline, so it must
                          // not be faded out by the taper it sits on.
    float dSf = a + 1.28;
    float sTop = 0.100;
    if (abs(dSf) < 0.012 && e < sTop + 0.004) {
      float hwS = mix(0.0092, 0.0034, clamp(e / sTop, 0.0, 1.0));
      float dissolve = smoothstep(sTop, sTop - 0.014, e);
      crownM = step(abs(dSf), hwS) * step(e, sTop);
      sales = crownM * dissolve;
      crownT = clamp(e / sTop, 0.0, 1.0);
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

    if (uSimplify < 0.5) {
      // Mist — three incommensurate azimuth sines, drift at cinema speed.
      // Dark: a thin cold inversion veiling the building bases. Light: Karl,
      // tallest and densest over the hills, thinning eastward.
      float m = 0.5 + 0.1667 * (sin(a * 3.1 + uTime * 0.021) + sin(a * 7.3 - uTime * 0.013) + sin(a * 13.7 + uTime * 0.017));
      float baseBand = smoothstep(0.020, 0.004, e) * step(-0.004, e);
      col = mix(col, mix(horizonC, zenithC, 0.35), baseBand * m * structures * 0.5 * uDark);
      float west = smoothstep(-1.75, -2.15, a);
      float karlBand = smoothstep(0.075, 0.014, e) * step(-0.01, e);
      float karl = karlBand * (0.15 + 0.85 * west) * (0.45 + 0.55 * m) * (1.0 - uDark);
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
      float crownBand = smoothstep(0.855, 0.900, crownT);
      float wash = 0.60 + 0.40 * sin(dSf * 240.0 + uTime * 0.85);
      vec3 crownHue = mix(vec3(0.78, 0.70, 0.62), 0.5 + 0.5 * cos(uTime * 0.105 + vec3(0.0, 2.09, 4.19)), 0.30);
      col += crownHue * wash * crownBand * crownM * 0.70 * night;
      // The crown lights the air around itself. Without this the band is a
      // bright rectangle pasted on the sky; with it, the tower reads as the
      // source. Kept close in — a halo ten times the width of the thing
      // making it stops being light and becomes weather.
      vec2 cq = vec2(dSf / 0.017, (e - sTop * 0.955) / 0.011);
      col += crownHue * exp(-dot(cq, cq) * 2.2)
           * (0.20 + 0.05 * sin(uTime * 0.31)) * night;

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

function SkyDome({ dark, simplify }: { dark: boolean; simplify: boolean }) {
  const domeRef = useRef<THREE.Mesh>(null);
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
  useFrame(({ clock, camera, pointer, raycaster }, delta) => {
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
    // The sky is at infinity, so it must not parallax against the room — in
    // ANY axis. Copying only x left the dome fixed in y and z while the
    // camera bobs (CameraRig's idle sine plus pointer parallax) and dollies
    // back when a panel opens, so the horizon crept against the shelves.
    if (domeRef.current) domeRef.current.position.copy(camera.position);
  });
  // renderOrder 1: draw after opaque geometry so early-Z rejects the covered
  // sky fragments (its depth-sort position otherwise changes during traverse).
  return (
    <mesh ref={domeRef} position={[MID_X, 0, 0]} material={material} renderOrder={1}>
      <sphereGeometry args={[34, 160, 96]} />
    </mesh>
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

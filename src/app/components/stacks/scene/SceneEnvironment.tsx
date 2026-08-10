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
    float hillA = 0.032 * hump(a, -2.16, 0.28);
    float hillB = 0.020 * hump(a, -1.98, 0.22);
    float telegraph = 0.018 * hump(a, -1.90, 0.065);
    float hillH = max(hillA, max(hillB, telegraph));
    float hillMask = (1.0 - smoothstep(hillH - 0.002, hillH + 0.002, e)) * step(0.0005, hillH);

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
    float structures = clamp(city + sutro + coit + trans + sales + bridge, 0.0, 1.0) * ground;
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
    vec3 hillCol = mix(cityC, horizonC, clamp(hazeAmt + mix(0.26, 0.35, uDark), 0.0, 1.0));
    hillCol += emberC * 0.55 * emberAmp * smoothstep(-2.16, -1.95, a);
    vec3 cityCol = mix(cityC, horizonC, hazeAmt);
    cityCol += emberC * ember * 0.25;
    // The crown catches the first ember before anything else in the city —
    // tallest, east-facing glass. Salesforce Tower announces the dawn.
    cityCol += emberC * smoothstep(0.55, 1.0, crownT) * ember * 2.5 * sales;
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

      // Day for Night (Jim Campbell): 11,136 LEDs across the top SIX floors
      // of 61, facing INWARD so the light bounces off perforated aluminium —
      // a soft diffuse wash, never visible pixels. So it is a HORIZONTAL
      // band around the top ~12%, on all four faces. The old rig ran
      // sin(e * 240.0) over the top third: wrong axis, wrong extent, and it
      // scrolled vertically like a progress bar. At 3:45 the video diary is
      // already off (it runs dusk→2am) and only the Constellation starscape
      // is still alive until dawn, so this stays a dim drift rather than a
      // light show — and it brightens as the traverse approaches dawn.
      float crownBand = smoothstep(0.86, 0.905, crownT);
      float wash = 0.74 + 0.26 * sin(dSf * 210.0 + uTime * 0.16);
      vec3 crownHue = mix(vec3(0.72, 0.62, 0.55), 0.5 + 0.5 * cos(uTime * 0.105 + vec3(0.0, 2.09, 4.19)), 0.40);
      col += crownHue * wash * crownBand * crownM * 0.085 * night;

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
    // The sky is at infinity, so it must not parallax against the room.
    if (domeRef.current) domeRef.current.position.x = camera.position.x;
  });
  // renderOrder 1: draw after opaque geometry so early-Z rejects the covered
  // sky fragments (its depth-sort position otherwise changes during traverse).
  return (
    <mesh ref={domeRef} position={[MID_X, 0, 0]} material={material} renderOrder={1}>
      <sphereGeometry args={[34, 32, 24]} />
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

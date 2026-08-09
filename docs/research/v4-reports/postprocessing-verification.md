Verification complete. Everything below is grounded in the installed source and the live registry, and I found two things that change the plan materially.

---

# Postprocessing stack compat verification

## 1. Compat matrix

| Package | Latest | Verdict | Evidence |
|---|---|---|---|
| `@react-three/postprocessing` | **3.0.5** | ✅ Compatible — but published **today (Aug 9, 2026)** | Peers: `react ^19.2.0`, `three >= 0.182.0`, `postprocessing ^6.36.0`, `@react-three/fiber >=9.7.0` — [registry](https://registry.npmjs.org/@react-three/postprocessing/latest) |
| `postprocessing` | **6.39.4** | ⚠️ Compatible, but three 0.185 is the **last supported minor** | Peer: `three: ">= 0.168.0 < 0.186.0"` — [registry](https://registry.npmjs.org/postprocessing/latest) |
| `n8ao` | **2.0.0** | ✅ Already a **direct dependency** of r-p-p 3.0.5 — do not install separately | `dependencies: { n8ao: "^2.0.0", maath: "^0.10.8" }` |

Your installed versions: `three 0.185.1`, `@react-three/fiber 9.7.0`, `@react-three/drei 10.7.8`, `react 19.2.4`, `next 16.1.6`. All satisfy every peer range — but note fiber 9.7.0 sits **exactly at the declared floor**, and three 0.185.1 sits one patch below `postprocessing`'s upper bound. **A routine `three@0.186` bump breaks the peer range**, and the `postprocessing` v7 line is still `beta` (`7.0.0-beta.16`), so there is no upgrade path waiting. Pin three until v7 lands.

Two caveats on freshness worth weighing before planning: r-p-p 3.0.5 and PRs #363–#369 (a **rewrite of the EffectComposer pass lifecycle**, new effect factories, reworked dispose handling) all merged Aug 5–9, 2026. This is days-old code. The rewrite fixed real bugs you'd otherwise hit (#353 StrictMode composer leak, #355 GPU leaks on `<primitive>` effects, #358 renderer property restoration), but it has had essentially no field soak time.

**Effect availability — all confirmed exported** from `dist/index.d.ts` of 3.0.5: `TiltShift2`, `Bloom`, `SelectiveBloom`, `Vignette`, `SMAA`, `Noise`, `DepthOfField`, `ToneMapping`, `N8AO`, `Selection`, `EffectComposer` (41 re-exports total). No open React-19-specific issues; the only React 19 report (#311) is from fiber 9.0.0-rc.2 in Jan 2025 and predates the v3 line.

## 2. Tone-mapping ownership — mostly automatic, one real breakage

I verified this against your installed `node_modules/three`, not just docs. **three r185 already neutralizes both of your manual includes inside a composer**, because the composer renders into a render target:

- `three/src/renderers/webgl/WebGLPrograms.js:176-182` — `toneMapping` is forced to `NoToneMapping` unless `currentRenderTarget === null`.
- `WebGLProgram.js:771-773` — `#define TONE_MAPPING`, `tonemapping_pars_fragment`, and the `toneMapping()` function are injected **only** when `parameters.toneMapping !== NoToneMapping`.
- `WebGLPrograms.js:212` — `outputColorSpace` becomes `ColorManagement.workingColorSpace` when rendering to a target.

So `SceneEnvironment.tsx:307-308` (`<tonemapping_fragment>` + `<colorspace_fragment>`) compile to **no-ops** inside the composer, automatically, with no source change. Standard materials stop double-tonemapping for the same reason. r-p-p additionally sets `gl.toneMapping = NoToneMapping` via a ref-counted guard and restores it on unmount.

**Your exposure survives untouched.** `WebGLRenderer.js:2709` pushes `renderer.toneMappingExposure` into any program declaring that uniform; `postprocessing`'s `tone-mapping.frag` does `#include <tonemapping_pars_fragment>` (which declares it) and aliases `toneMapping(texel)` → `ACESFilmicToneMapping(texel)` via a define, and three's ACES function multiplies by that uniform internally. r-p-p never writes `gl.toneMappingExposure`, so your `Exposure` component (`StacksCanvas.tsx:60-66`, 1.25 dark / 1.12 light) keeps working as-is.

**But you must set the mode explicitly.** `ToneMappingEffect`'s default is `ToneMappingMode.AGX`, *not* ACES — leaving it default silently changes your entire grade. And `ToneMappingMode` is **not re-exported** by r-p-p (confirmed: `src/index.ts` re-exports only local modules), so import it from `postprocessing` directly.

**The one genuine breakage — the sky dither block, `SceneEnvironment.tsx:309-315`.** It runs *after* `colorspace_fragment` and assumes display-space sRGB: `amp` is 2/255–7/255 (8-bit quantization units) and the `1.0 - abs(lum*2-1)` tent targets perceptual midtones. Once both includes no-op, this block grains **linear HDR** values that can exceed 1.0. The tent mis-targets (linear 0.5 is not perceptual mid), and a 2–7/255 amplitude is far below the visible threshold in the dark end where banding actually occurs — and a HalfFloat buffer doesn't band there anyway. The grain becomes both wrong and pointless. Gate it and move the grain into the chain.

**Also expect a real appearance shift in your transparent work.** Today, additive and alpha blending happen in **sRGB display space** on the default framebuffer (each material tonemaps itself, then blends). Under the composer, blending happens in **linear HDR** and tonemapping runs once at the end. Your additive dust sprite (`primitives.tsx:288-290`) and the soft-shadow ground quads (`GroundPool.tsx:54,87`) will look different — linear-space additive reads weaker in the midtones and blows out less; alpha-blended shadow pools generally read darker and more contrasty. Budget re-tuning time for those; this is not a bug you can configure away.

`<Environment>` is safe: yours (`SceneEnvironment.tsx:379-410`) is lighting-only with `frames={1}` and no `background`, so it bakes to a PMREM target once and is unaffected.

## 3. Integration recipe

```tsx
// scene/Effects.tsx — dynamically imported, desktop-only, never SSR'd.
import { EffectComposer, N8AO, Bloom, TiltShift2, Vignette, ToneMapping, Noise, SMAA } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing"; // r-p-p does NOT re-export this
import { HalfFloatType } from "three";

export default function Effects({ band }: { band: React.RefObject<number> }) {
  const tilt = useRef<any>(null);
  useFrame(() => {
    // Prop changes re-fingerprint (and may rebuild) the effect — mutate the
    // uniform directly for per-frame easing of the focus band.
    tilt.current?.uniforms.get("start").value.set(0.5, band.current);
    tilt.current?.uniforms.get("end").value.set(0.5, band.current + 0.45);
  });
  return (
    // multisampling={0}: SMAA replaces MSAA and dodges the iOS depth/stencil bug.
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType}>
      <N8AO halfRes quality="low" aoRadius={0.6} distanceFalloff={0.6} intensity={1.3} />
      <Bloom mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={0.35} />
      <TiltShift2 ref={tilt} blur={0.12} taper={0.6} samples={8} />
      <Vignette offset={0.28} darkness={0.5} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Noise premultiply opacity={0.025} />   {/* replaces the sky's own dither */}
      <SMAA />
    </EffectComposer>
  );
}
```

```tsx
// StacksCanvas.tsx — mount/unmount, never `enabled={false}` (see gotchas).
const Effects = dynamic(() => import("./scene/Effects"), { ssr: false });
<Canvas gl={{ antialias: false }} /* MSAA on the default FB is dead weight now */ >
  {!isTouch && degrade === 0 && <Effects band={bandRef} />}
</Canvas>
```

```glsl
// SceneEnvironment.tsx:309 — gate the dither; both includes above no-op in the
// composer's linear HDR target, so this would grain the wrong color space.
if (uPost < 0.5) {
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)) + uFrame * 0.4076492));
  float lum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float amp = 2.0 / 255.0 + (5.0 / 255.0) * (1.0 - abs(lum * 2.0 - 1.0));
  gl_FragColor.rgb += (n - 0.5) * amp;
}
```

Order rationale: N8AO is a `Pass` and needs raw scene depth, so it goes first. Bloom and TiltShift2 are convolutions and each force their own `EffectPass`. Vignette, ToneMapping, and Noise are non-convolution and **merge into a single shared `EffectPass`** in listed order. SMAA runs last so it antialiases the final display-referred image.

## 4. Cost and bundle

Gzipped, from Bundlephobia: `postprocessing@6.39.4` **112.2 KB**, `n8ao@2.0.0` **84.3 KB**, `@react-three/postprocessing@3.0.5` **98.7 KB**. Those don't sum to your real cost — `postprocessing` is `sideEffects: false` with an ESM build so unused effects shake out, leaving an irreducible core (EffectComposer, Pass, EffectPass, EffectMaterial, shaders). My estimate for the chain above is **~70–100 KB gzip**, plus **~84 KB more if N8AO ships**, because `n8ao` is a single monolithic `dist/N8AO.js` that tree-shakes poorly. N8AO is by far the largest single line item — roughly half the total for one effect.

Per-effect timings below are **estimates**, not measurements — I can't benchmark without installing. Basis: resolution scaling, sample counts, and pass structure, at ~1600×1000 CSS px / dpr 1.5 on Apple Silicon.

| Effect | Desktop (M-series) | Notes |
|---|---|---|
| Composer base | 0.3–0.6 ms | HalfFloat targets + final copy |
| `multisampling={8}` | 1.5–3 ms | Why the default is contested (open issue #346); use 0 |
| N8AO full-res, 16 spp | 3–6 ms | Dominant cost |
| N8AO `halfRes` | 1–2 ms | README claims 2–4× gain, depth-aware upsample on by default |
| Bloom (mipmapBlur) | 0.5–1.2 ms | Own pass |
| TiltShift2 | 0.8–2.0 ms | Own pass (convolution); scales with `samples` |
| SMAA | 0.4–0.8 ms | Cheaper than MSAA 8× |
| Vignette / ToneMapping / Noise | ~0.1 ms combined | Merged into one EffectPass |

Against a 16.6 ms budget with ~50 draw calls (~2–4 ms), the recommended chain lands around 3–5 ms of post — comfortable. Full-res N8AO plus MSAA 8× at dpr 2 would not be.

## 5. Gotchas

1. **`enabled={false}` is not a safe ladder switch.** Verified in the shipped 3.0.5 bundle: the tone-mapping guard's effect is `useEffect(() => (guard.acquire(gl, NoToneMapping), gl.toneMapping = NoToneMapping, () => guard.release(gl)), [gl])` — deps are `[gl]` only, **unconditional on `enabled`**. A mounted-but-disabled composer drops `useFrame` priority to 0 (R3F renders straight to screen) while the renderer is still pinned to `NoToneMapping` → **the scene renders untonemapped and blown out.** You must conditionally *unmount* to trigger the guard release.
2. **N8AO + your dpr ladder is a known-bad combination.** Open issue #280, "N8AO works incorrectly with adaptiveDpr," reports spurious reflection artifacts when DPR changes. Your ladder changes `dpr` at `degrade >= 1` (`StacksCanvas.tsx:115`). Mitigate by unmounting the composer at the same step that drops dpr, so the two never coexist.
3. **First mount/unmount costs a full shader recompile.** The program cache key includes `parameters.toneMapping` and `outputColorSpace` (`WebGLPrograms.js:441,484`), so screen-render and target-render are distinct program variants for *every* material. The first transition each direction compiles them; later toggles hit the cache. No context loss — only render targets are allocated. Warm it during your existing load crossfade.
4. **iOS: don't use MSAA.** postprocessing #412 documents scene depth/stencil corruption with multisampling on iOS 15.4+. Since N8AO needs depth, MSAA + depth is exactly the risky pairing. `multisampling={0}` + `<SMAA />`.
5. **`ToneMappingMode` must come from `postprocessing`**, not r-p-p (#265 still open), and the default is AgX, not ACES.
6. **`gl={{ antialias: true }}`** (`StacksCanvas.tsx:116`) becomes wasted memory and bandwidth once rendering goes through the composer. It's a context-creation flag, so it can't be toggled per-tier — set it `false` permanently and let SMAA cover the non-composer path too.
7. Bloom `mipmapBlur` has an open flickering report (#300); validate against your moving camera.

## 6. TiltShift2 specifics

Parameters: `blur` (0.15), `taper` (0.5), `start` ([0.5, 0.0]), `end` ([0.5, 1.0]), `samples` (10), `direction` ([1,1]), `blendFunction`. `start`/`end` define a screen-space line; the shader takes each pixel's perpendicular distance to it and applies a `smoothstep` falloff shaped by `taper`. So **yes, the focus band is freely positionable and orientable at runtime** — you can slide it, rotate it, or widen it.

The cost question is *how* you drive it. `wrapEffect` memoizes on `stableStringify(props)`, so easing `start`/`end` through React props re-fingerprints the effect every frame and risks a rebuild per frame. Drive it through a ref and mutate `effect.uniforms.get("start").value` inside `useFrame` — that's a uniform write, effectively free. (PR #367 migrated hand-rolled effects like TiltShift2 to `useLiveDefaults`, which is designed to push prop changes onto live uniforms instead of rebuilding, so props *may* now be safe — but it's days-old code and the ref path is guaranteed either way.)

## 7. Verdicts

**Desktop:** **Vignette — GO** (essentially free, merges into the shared pass). **SMAA — GO** (cheaper than your current MSAA and lets you delete it). **Bloom — GO** with a high `luminanceThreshold` (~0.95); a bright sky dome will bloom globally and look milky otherwise — prefer `<Selection>`-scoped bloom if you want it only on specific props. **TiltShift2 — GO-WITH-CAUTIONS**: cheap and controllable, but it's a convolution pass and a tilt-shift on an architectural/shelf scene is a strong stylistic commitment that reads as "miniature" — a look worth confirming visually before it's planned in. **N8AO — GO-WITH-CAUTIONS**: highest visual payoff here (contact darkening between props and shelves is exactly what this scene wants) but also the largest cost in both frame time and bundle, and it carries the `adaptiveDpr` bug that collides with your existing ladder. Ship it `halfRes` at `quality="low"`, and unmount it in lockstep with the dpr step-down.

**Mobile: NO-GO on the whole composer.** Between the iOS MSAA/depth bug, N8AO's cost on mid-tier mobile, and ~150–180 KB gzip, the composer should never even be *downloaded* on touch devices — hence the `dynamic(..., { ssr: false })` gate on `!isTouch`. Your existing ladder (dpr → dust → shadows) is the right mobile strategy and needs no post-processing to work.

**Overall: GO, with the sky-dither gate and the `enabled={false}` trap treated as required work, not polish** — and with the caveat that r-p-p 3.0.5's composer lifecycle is days old. If you want to de-risk, pin exactly `3.0.5`/`6.39.4` and hold three at 0.185.x.
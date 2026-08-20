import fs from "node:fs";
import { describe, expect, it } from "vitest";

// `@react-three/postprocessing` calls `composer.setSize` from an effect keyed
// on `useThree().size`, which is CSS pixels. A `dpr` change resizes the
// renderer's drawing buffer and never that size, so nothing resizes the
// composer's render targets and it blits a stale buffer to the screen.
//
// Harmless while the pixel ratio only moved at profile transitions. The
// resolution axis steps it twelve ways, so the wiring has to stay in place.

const source = fs.readFileSync(new URL("./Effects.tsx", import.meta.url), "utf8");

const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("composer pixel ratio contract", () => {
  it("mounts the corrector inside the composer, where the context lives", () => {
    const composer = code.slice(
      code.indexOf("<EffectComposer"),
      code.indexOf("</EffectComposer>"),
    );
    expect(composer).toContain("<ComposerPixelRatio />");
  });

  it("resizes the composer when the ratio moves", () => {
    expect(code).toMatch(/composer\.setSize\(/);
  });

  it("reads the ratio from the renderer, not from React state", () => {
    // `viewport.dpr` is the requested value. `gl.getPixelRatio()` is what the
    // drawing buffer was actually built at, which is the thing the render
    // targets have to agree with.
    const body = code.slice(code.indexOf("function ComposerPixelRatio"));
    expect(body).toMatch(/gl\.getPixelRatio\(\)/);
  });

  it("corrects inside the frame loop, so no frame is drawn stale", () => {
    // An effect fires after the commit, which can leave one mismatched frame
    // on screen. The composer renders at priority 1 and r3f runs subscribers
    // in ascending priority, so a default-priority useFrame lands first.
    const body = code.slice(
      code.indexOf("function ComposerPixelRatio"),
      code.indexOf("export default function"),
    );
    expect(body).toMatch(/useFrame\(/);
    expect(body).not.toMatch(/useEffect\(/);
  });
});

import fs from "node:fs";
import { describe, expect, it } from "vitest";

const environment = fs.readFileSync(
  new URL("./SceneEnvironment.tsx", import.meta.url),
  "utf8",
);
const models = fs.readFileSync(
  new URL("./ModelProp.tsx", import.meta.url),
  "utf8",
);
const effects = fs.readFileSync(
  new URL("./Effects.tsx", import.meta.url),
  "utf8",
);
const meadow = fs.readFileSync(
  new URL("./Meadow.tsx", import.meta.url),
  "utf8",
);

describe("Cinematic+ sunlight", () => {
  it("compiles the sun halo out of the normal sky", () => {
    expect(environment).toContain("CINEMATIC_PLUS: 1");
    expect(environment).toContain("#ifdef CINEMATIC_PLUS");
    expect(environment).toMatch(/cinematicPlus\s*\?\s*sky\.detailedPlus/);
  });

  it("mounts a bounded real-time shadow rig only for light-mode Cinematic+", () => {
    expect(environment).toContain("cinematicPlus && !dark");
    expect(environment).toContain("<CinematicSunShadowRig");
    expect(environment).toContain("castShadow");
    expect(environment).toContain("shadow-mapSize-width");
    expect(environment).toContain("<SunShadowReceiver");
  });

  it("lets loaded model props cast into the temporary shadow map", () => {
    expect(models).toContain("useSceneQualityControls");
    expect(models).toContain("mesh.castShadow = true");
  });

  it("uses a physical sun and an occlusion-aware god-rays pass", () => {
    expect(environment).toContain("<CinematicSunSource");
    expect(effects).toContain("GodRays");
    expect(effects).toMatch(/cinematicPlus\s*&&\s*!dark\s*&&\s*sun/);
  });

  it("makes the Cinematic+ meadow receive directional shadow maps", () => {
    expect(meadow).toContain("shadowmap_pars_vertex");
    expect(meadow).toContain("shadowmap_vertex");
    expect(meadow).toContain("shadowmap_pars_fragment");
    expect(meadow).toContain("shadowmask_pars_fragment");
    expect(meadow).toContain("getShadowMask()");
    expect(meadow).toMatch(/receiveShadow=\{daylightCinematicPlus\}/);
  });
});

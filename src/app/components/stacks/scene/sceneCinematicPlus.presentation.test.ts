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

  // The composer half of this — that god rays mount only for light-mode
  // Cinematic+ once a source is registered — is asserted against the rendered
  // chain in Effects.contract.test.tsx.
  it("publishes a physical sun for the composer to occlude", () => {
    expect(environment).toContain("<CinematicSunSource");
    expect(environment).toContain("registerCinematicSun");
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

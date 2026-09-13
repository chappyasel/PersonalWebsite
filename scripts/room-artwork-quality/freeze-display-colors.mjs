import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = "scripts/generate/room-artwork-inputs";
const geometry = JSON.parse(await readFile(`${root}/manifest.json`));
const extra = [
  "theme.ts",
  "StacksCanvas.tsx",
  "scene/Scene.tsx",
  "scene/SceneEnvironment.tsx",
  "scene/Effects.tsx",
  "scene/sceneColorGrade.ts",
  "scene/sceneGradeProfiles.ts",
  "scene/PhotoMaskPass.ts",
  "scene/projectArtifactLighting.ts",
  "scene/daylightRendering.ts",
  "scene/skyLighting.ts",
  "scene/sceneBackdrop.ts",
  "scene/lensGeometry.ts",
  "scene/PlantWindDriver.tsx",
  "scene/plantWind.ts",
  "illustration/restTransforms.ts",
  "scene/Meadow.tsx",
  "scene/skyDepthLayers.ts",
  "scene/OpticalBokehPrototype.tsx",
].map((p) => `src/app/components/stacks/${p}`);
const pipeline = [
  "capture-display",
  "render-display",
  "calibrate-display",
  "color-transfer",
  "apply-display-colors",
  "check-display-colors",
  "freeze-display-colors",
  "batch-display",
  "package",
  "repackage",
].map((p) => `scripts/room-artwork-quality/${p}.mjs`);
const files = [
  ...new Set([...extra, ...pipeline, "package.json", "pnpm-lock.yaml"]),
].sort();
const dependencies = await Promise.all(
  files.map(async (path) => ({
    path,
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
  })),
);
await writeFile(
  `${root}/display-colors/manifest.json`,
  JSON.stringify(
    {
      version: 1,
      geometrySourceFingerprint: geometry.sourceFingerprint,
      runtimeSourceRevision: "b776a99",
      referencePolicy:
        "Balanced preset, shipped grade, full environment, settled unit; DPR matches the immutable artwork raster. Phone means portrait viewport, not a guarantee of a particular device's adaptive quality.",
      dependencies,
    },
    null,
    2,
  ) + "\n",
);
console.log("FROZEN DISPLAY DEPENDENCIES", dependencies.length);

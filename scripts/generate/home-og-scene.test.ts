import {
  CAMERA,
  CAMERA_LOOK_Y,
  CAMERA_LOOK_Z_OFFSET,
} from "../../src/app/components/stacks/scene/worldLayout";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  HOME_OG_CAMERA_Y,
  HOME_OG_FOV,
  HOME_OG_LOOK_Y,
  HOME_OG_OUTPUT,
  HOME_OG_RESOLUTION_CEILING,
  HOME_OG_SCENE_CROP,
} from "./home-og-scene-config.mjs";

const generator = readFileSync(
  fileURLToPath(new URL("./home-og-scene.mjs", import.meta.url)),
  "utf8",
);
const cameraRig = readFileSync(
  fileURLToPath(
    new URL(
      "../../src/app/components/stacks/scene/CameraRig.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
describe("home OG scene capture", () => {
  it("renders the canvas crop above the final card's native dimensions", () => {
    expect(
      HOME_OG_SCENE_CROP.width * HOME_OG_RESOLUTION_CEILING,
    ).toBeGreaterThanOrEqual(HOME_OG_OUTPUT.width);
    expect(
      HOME_OG_SCENE_CROP.height * HOME_OG_RESOLUTION_CEILING,
    ).toBeGreaterThanOrEqual(HOME_OG_OUTPUT.height);
  });

  it("centers a head-on shelf on the capture optical axis", () => {
    expect(HOME_OG_SCENE_CROP.x + HOME_OG_SCENE_CROP.width / 2).toBe(
      HOME_OG_OUTPUT.width / 2,
    );
    expect(generator).toContain('url.searchParams.set("og-head-on", "1")');
    expect(cameraRig).toContain(
      "captureHeadOnFromSearch(window.location.search)",
    );
  });

  it("raises the horizon by about five percent with a higher, downward-looking camera", () => {
    const distance = CAMERA.z - CAMERA_LOOK_Z_OFFSET;
    const liveSlope = (CAMERA.y - CAMERA_LOOK_Y) / distance;
    const captureSlope = (HOME_OG_CAMERA_Y - HOME_OG_LOOK_Y) / distance;
    const horizonShiftFraction =
      (captureSlope - liveSlope) /
      (2 * Math.tan((HOME_OG_FOV * Math.PI) / 360));

    expect(HOME_OG_CAMERA_Y).toBe(0.4);
    expect(horizonShiftFraction).toBeGreaterThanOrEqual(0.05);
    expect(horizonShiftFraction).toBeLessThan(0.06);
    expect(generator).toContain(
      'url.searchParams.set("og-camera-y", HOME_OG_CAMERA_Y.toString())',
    );
    expect(cameraRig).toContain(
      "captureCameraYFromSearch(window.location.search)",
    );
  });

  it("persists the full cinematic effect stack with crop-aware lens geometry", () => {
    expect(generator).toContain('url.searchParams.set("quality", "cinematic")');
    expect(HOME_OG_RESOLUTION_CEILING).toBe(2);
    expect(generator).toContain(
      'url.searchParams.set("og-resolution", HOME_OG_RESOLUTION_CEILING.toString())',
    );
    expect(generator).not.toContain('url.searchParams.set("notiltshift", "1")');
    expect(generator).toContain(
      'url.searchParams.set("og-lens-center", HOME_OG_LENS_CENTER.toString())',
    );
    expect(HOME_OG_FOV).toBe(30);
    expect(generator).toContain(
      'url.searchParams.set("og-fov", HOME_OG_FOV.toString())',
    );
    expect(HOME_OG_LOOK_Y).toBe(-0.105);
    expect(generator).toContain(
      'url.searchParams.set("og-look-y", HOME_OG_LOOK_Y.toString())',
    );
    expect(cameraRig).toContain("captureFovFromSearch(window.location.search)");
    // The capture lens stays first in the chain: screenshot mode's lens sits
    // behind it, and the composition's own lens last.
    expect(cameraRig).toContain(
      "captureFov ??\n      (screenshot.enabled ? screenshot.fov : null) ??\n      composition.fov",
    );
    expect(cameraRig).toContain(
      "captureLookYFromSearch(window.location.search)",
    );
    expect(cameraRig).toContain("captureLookY ?? composition.lookY");
    expect(generator).not.toContain('url.searchParams.set("quality", "0")');
  });

  it("hides placard descendants while retaining their measured layout", () => {
    expect(generator).toContain(
      ".stacks-og-ui * { visibility: hidden !important; }",
    );
    expect(generator).toContain(
      'document.querySelector(\n      "[data-stacks-desktop-panel][data-stacks-active]",',
    );
    expect(generator).toContain("getComputedStyle(element).visibility");
  });

  it("captures the settled page locally without changing WebGL buffer semantics", () => {
    expect(generator).toContain("page.screenshot");
    expect(generator).toContain("clip: HOME_OG_SCENE_CROP");
    expect(generator).not.toContain("canvas.toDataURL");
    expect(generator).not.toContain("preserveDrawingBuffer");
    expect(generator).not.toContain("swiftshader");
  });
});

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
  HOME_OG_SCREENSHOT_PARAMS,
  ROOM_OG_CARDS,
  ROOM_OG_SLUGS,
} from "./room-og-config.mjs";

const generator = readFileSync(
  fileURLToPath(new URL("./room-og-scene.mjs", import.meta.url)),
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
const screenshotDriver = readFileSync(
  fileURLToPath(
    new URL(
      "../../src/app/components/stacks/scene/ScreenshotModeDriver.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
describe("home OG scene capture", () => {
  it("captures screenshot mode's still with the portrait kept, and lets the mode pick Cinematic+", () => {
    expect(HOME_OG_SCREENSHOT_PARAMS).toEqual({
      screenshot: "1",
      "screenshot-portrait": "1",
    });
    expect(ROOM_OG_CARDS.about.screenshotParams).toBe(
      HOME_OG_SCREENSHOT_PARAMS,
    );
    expect(generator).toContain("Object.entries(card.screenshotParams)");
    // The mode only lands on Cinematic+ when the URL does not pin a quality,
    // so the generator must not, and it refuses to run if it ever does.
    expect(generator).not.toContain('url.searchParams.set("quality"');
    expect(generator).toContain('if (url.searchParams.has("quality"))');
    expect(screenshotDriver).toContain(
      'if (forcedCinematic) sceneQualityController.setMode("cinematic+");',
    );
    expect(screenshotDriver).toContain(
      "searchPinsQuality(window.location.search)",
    );
  });

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
    expect(ROOM_OG_CARDS.about.cameraY).toBe(HOME_OG_CAMERA_Y);
    expect(generator).toContain(
      'url.searchParams.set("og-camera-y", card.cameraY.toString())',
    );
    expect(cameraRig).toContain(
      "captureCameraYFromSearch(window.location.search)",
    );
  });

  it("persists the full cinematic effect stack with crop-aware lens geometry", () => {
    expect(HOME_OG_RESOLUTION_CEILING).toBe(2);
    expect(generator).toContain(
      'url.searchParams.set("og-resolution", HOME_OG_RESOLUTION_CEILING.toString())',
    );
    expect(generator).not.toContain('url.searchParams.set("notiltshift", "1")');
    expect(generator).toContain(
      'url.searchParams.set("og-lens-center", HOME_OG_LENS_CENTER.toString())',
    );
    expect(HOME_OG_FOV).toBe(30);
    expect(ROOM_OG_CARDS.about.fov).toBe(HOME_OG_FOV);
    expect(generator).toContain(
      'url.searchParams.set("og-fov", card.fov.toString())',
    );
    expect(HOME_OG_LOOK_Y).toBe(-0.105);
    expect(ROOM_OG_CARDS.about.lookY).toBe(HOME_OG_LOOK_Y);
    expect(generator).toContain(
      'url.searchParams.set("og-look-y", card.lookY.toString())',
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

  it("uses Metal only for scratch framing captures, never for a committed card", () => {
    expect(generator).toContain('"--enable-gpu", "--use-angle=metal"');
    expect(generator).toContain(
      "--gpu and framing overrides are for trying a frame; pass --output to a scratch path.",
    );
  });

  it("refuses debug overlays, which paint over the scene", () => {
    expect(generator).toContain('if (url.searchParams.has("debug"))');
  });
});

describe("room OG cards", () => {
  it("has one card per room path plus the homepage", () => {
    expect(ROOM_OG_SLUGS).toEqual([
      "about",
      "projects",
      "musings",
      "talks",
      "golf",
    ]);
  });

  it("captures every card as screenshot mode's still of one stop", () => {
    const stops = Object.fromEntries(
      ROOM_OG_SLUGS.map((slug) => {
        const params: Readonly<Record<string, string>> =
          ROOM_OG_CARDS[slug].screenshotParams;
        return [slug, params["screenshot-unit"] ?? null];
      }),
    );
    expect(stops).toEqual({
      about: null,
      projects: "4",
      musings: "5",
      talks: "6",
      golf: "golf",
    });
    for (const slug of ROOM_OG_SLUGS) {
      expect(ROOM_OG_CARDS[slug].screenshotParams.screenshot).toBe("1");
      expect(ROOM_OG_CARDS[slug].screenshotParams).not.toHaveProperty(
        "quality",
      );
    }
  });

  it("writes the homepage card where it always was and the rest under og/", () => {
    expect(ROOM_OG_CARDS.about.image).toBe(
      "public/images/stacks/home-og-scene.jpg",
    );
    for (const slug of ROOM_OG_SLUGS.filter((slug) => slug !== "about")) {
      expect(ROOM_OG_CARDS[slug].image).toBe(
        `public/images/stacks/og/${slug}.jpg`,
      );
      expect(ROOM_OG_CARDS[slug].manifest).toBe(
        `public/images/stacks/og/${slug}.inputs.json`,
      );
    }
  });

  it("keeps each card's aim inside the range the camera accepts", () => {
    for (const slug of ROOM_OG_SLUGS) {
      const { fov, lookY, cameraY } = ROOM_OG_CARDS[slug];
      expect(fov).toBeGreaterThanOrEqual(24);
      expect(fov).toBeLessThanOrEqual(45);
      expect(lookY).toBeGreaterThanOrEqual(-0.4);
      expect(lookY).toBeLessThanOrEqual(0.2);
      expect(cameraY).toBeGreaterThanOrEqual(0);
      expect(cameraY).toBeLessThanOrEqual(1);
    }
  });
});

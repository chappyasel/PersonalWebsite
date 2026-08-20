import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  SCENE_PHOTO_EDGE,
  V8_PHOTOS_BY_UNIT,
  sceneHdPhotosDisabled,
  scenePhotoManifestMasterUrl,
  scenePhotoManifestUrl,
  scenePhotoUrl,
} from "./photoTextures";

describe("scene photo resolution policy", () => {
  it("supports a preview-only URL mode for clean A/B tests", () => {
    expect(sceneHdPhotosDisabled("?hdPhotos=0")).toBe(true);
    expect(sceneHdPhotosDisabled("?debug=1&hdPhotos=0")).toBe(true);
    expect(sceneHdPhotosDisabled("?hdPhotos=1")).toBe(false);
    expect(sceneHdPhotosDisabled("")).toBe(false);
  });

  it("uses role-sized local previews without rewriting other image sources", () => {
    expect(
      scenePhotoUrl("/images/stacks/v8/about-family.webp", "feature"),
    ).toBe("/images/stacks/v8/512/about-family.webp");
    expect(
      scenePhotoUrl("/images/stacks/v8/about-family.webp", "support"),
    ).toBe("/images/stacks/v8/256/about-family.webp");
    expect(scenePhotoUrl("/images/stacks/v8/about-family.webp", "hero")).toBe(
      "/images/stacks/v8/about-family.webp",
    );
    expect(scenePhotoUrl("/images/stacks/about-family.jpg", "support")).toBe(
      "/images/stacks/about-family.jpg",
    );
    expect(scenePhotoUrl("https://example.com/photo.jpg", "support")).toBe(
      "https://example.com/photo.jpg",
    );
  });

  it("keeps the per-unit preview and master manifests aligned", () => {
    const entries = Object.values(V8_PHOTOS_BY_UNIT).flat();
    expect(entries).toHaveLength(27);
    expect(new Set(entries.map((entry) => entry.name))).toHaveLength(27);
    expect(entries.map(scenePhotoManifestUrl)).toEqual(
      entries.map(
        (entry) =>
          `/images/stacks/v8/${SCENE_PHOTO_EDGE[entry.role]}/${entry.name}.webp`,
      ),
    );
    expect(entries.map(scenePhotoManifestMasterUrl)).toEqual(
      entries.map((entry) => `/images/stacks/v8/${entry.name}.webp`),
    );
  });

  it("ships every declared master within the hero edge", async () => {
    const entries = Object.values(V8_PHOTOS_BY_UNIT).flat();
    await Promise.all(
      entries.map(async (entry) => {
        const relativeUrl = scenePhotoManifestMasterUrl(entry).slice(1);
        const file = path.join(process.cwd(), "public", relativeUrl);
        expect(fs.existsSync(file), relativeUrl).toBe(true);
        const metadata = await sharp(file).metadata();
        expect(
          Math.max(metadata.width ?? 0, metadata.height ?? 0),
        ).toBeLessThanOrEqual(SCENE_PHOTO_EDGE.hero);
      }),
    );
  });

  it("keeps the initial About preview payload below 200 KiB", async () => {
    const aboutPreviews = V8_PHOTOS_BY_UNIT.about.map((entry) =>
      path.join(process.cwd(), "public", scenePhotoManifestUrl(entry).slice(1)),
    );
    const profile = await sharp(
      path.join(process.cwd(), "public/images/about/profile.jpg"),
    )
      .resize(384)
      .jpeg({ quality: 75 })
      .toBuffer();
    const bytes = aboutPreviews.reduce(
      (total, file) => total + fs.statSync(file).size,
      profile.length,
    );

    expect(bytes).toBeLessThan(200 * 1024);
  });
});

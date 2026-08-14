import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  SCENE_PHOTO_EDGE,
  V8_PHOTOS_BY_UNIT,
  scenePhotoManifestUrl,
  scenePhotoUrl,
} from "./photoTextures";

describe("scene photo resolution policy", () => {
  it("right-sizes local v8 photos without rewriting other image sources", () => {
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

  it("keeps the per-unit warm manifest complete, unique, and off masters", () => {
    const entries = Object.values(V8_PHOTOS_BY_UNIT).flat();
    expect(entries).toHaveLength(27);
    expect(new Set(entries.map((entry) => entry.name))).toHaveLength(27);
    expect(entries.map(scenePhotoManifestUrl)).not.toContainEqual(
      expect.stringMatching(/^\/images\/stacks\/v8\/[^/]+\.webp$/),
    );
  });

  it("ships every declared variant within its role edge", async () => {
    const entries = Object.values(V8_PHOTOS_BY_UNIT).flat();
    await Promise.all(
      entries.map(async (entry) => {
        const relativeUrl = scenePhotoManifestUrl(entry).slice(1);
        const file = path.join(process.cwd(), "public", relativeUrl);
        expect(fs.existsSync(file), relativeUrl).toBe(true);
        const metadata = await sharp(file).metadata();
        expect(
          Math.max(metadata.width ?? 0, metadata.height ?? 0),
        ).toBeLessThanOrEqual(SCENE_PHOTO_EDGE[entry.role]);
      }),
    );
  });
});

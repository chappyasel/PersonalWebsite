import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const sceneDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(sceneDirectory, "../../../../../public");

const inspectablePdfFaces = [
  "images/stacks/musings/gpt3-2021-page-1.webp",
  "images/stacks/musings/trust-2025-cover.webp",
] as const;

describe("inspectable PDF textures", () => {
  it.each(inspectablePdfFaces)(
    "keeps %s at 2x Letter resolution",
    async (file) => {
      const metadata = await sharp(path.join(publicDirectory, file)).metadata();

      expect(metadata.width).toBeGreaterThanOrEqual(1_200);
      expect(metadata.height).toBeGreaterThanOrEqual(1_500);
    },
  );
});

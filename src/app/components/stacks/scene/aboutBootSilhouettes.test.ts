import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ABOUT_BOOT_MODEL_SILHOUETTES } from "./aboutBootSilhouettes";

describe("generated About boot silhouettes", () => {
  it("stays synchronized with the exact source GLBs", () => {
    for (const silhouette of Object.values(ABOUT_BOOT_MODEL_SILHOUETTES)) {
      const source = fs.readFileSync(
        path.join(process.cwd(), silhouette.sourceFile),
      );
      const hash = crypto.createHash("sha256").update(source).digest("hex");

      expect(hash, `${silhouette.source} needs silhouette regeneration`).toBe(
        silhouette.sha256,
      );
      expect(silhouette.path.length).toBeGreaterThan(100);
      expect(silhouette.viewBox[2]).toBeGreaterThan(0);
      expect(silhouette.viewBox[3]).toBeGreaterThan(0);
    }
  });
});

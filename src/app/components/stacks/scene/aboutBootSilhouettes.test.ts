import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ABOUT_BOOT_MODEL_SILHOUETTES } from "./aboutBootSilhouettes";
import { tjMedallionSpecSignature } from "./tjMedallionGeometry";

const sha256 = (input: crypto.BinaryLike) =>
  crypto.createHash("sha256").update(input).digest("hex");

describe("generated About boot silhouettes", () => {
  // Two kinds of source, two ways of being stale. A GLB or an SVG is a file, so
  // its bytes are the contract. The medallion is authored geometry, and its
  // contract is the specification the scene renders from — not the file that
  // happens to contain it, which is what this used to hash.
  it("stays synchronized with the exact source it was traced from", () => {
    for (const silhouette of Object.values(ABOUT_BOOT_MODEL_SILHOUETTES)) {
      const digest =
        silhouette.sourceKind === "spec"
          ? sha256(tjMedallionSpecSignature())
          : sha256(
              fs.readFileSync(path.join(process.cwd(), silhouette.sourceFile)),
            );

      expect(digest, `${silhouette.source} needs silhouette regeneration`).toBe(
        silhouette.sha256,
      );
      expect(silhouette.path.length).toBeGreaterThan(100);
      expect(silhouette.viewBox[2]).toBeGreaterThan(0);
      expect(silhouette.viewBox[3]).toBeGreaterThan(0);
    }
  });

  it("names a source kind for every entry", () => {
    for (const silhouette of Object.values(ABOUT_BOOT_MODEL_SILHOUETTES)) {
      expect(["file", "spec"]).toContain(silhouette.sourceKind);
    }
  });

  // The medallion's digest must not be a file hash any more. If someone
  // reintroduces one, editing a neighbouring prop in AuthoredProps.tsx starts
  // failing a medallion test again.
  it("keys the medallion to its geometry, not to the file it lives in", () => {
    const medallion = ABOUT_BOOT_MODEL_SILHOUETTES["tj-medallion"];

    expect(medallion.sourceKind).toBe("spec");
    expect(medallion.sourceFile).toBe(
      "src/app/components/stacks/scene/tjMedallionGeometry.js",
    );
    expect(medallion.sha256).toBe(sha256(tjMedallionSpecSignature()));
    expect(medallion.sha256).not.toBe(
      sha256(
        fs.readFileSync(
          path.join(
            process.cwd(),
            "src/app/components/stacks/scene/AuthoredProps.tsx",
          ),
        ),
      ),
    );
  });
});

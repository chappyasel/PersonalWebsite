import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ABOUT_BOOT_MODEL_SILHOUETTES } from "./aboutBootSilhouettes";
import { ABOUT_LAMP_HEAD_QUATERNION } from "./aboutLampPose";
import { ABOUT_MODEL_POSES, type AboutModelPoseId } from "./aboutScenePose";
import {
  GLOBE_PIN_REACH,
  GLOBE_SPHERE_SEGMENTS,
  GLOBE_STAND_FOOTPRINT,
  GLOBE_STAND_HEIGHT,
} from "./globeBall";
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

  it("stays synchronized with each live model pose", () => {
    for (const [id, silhouette] of Object.entries(
      ABOUT_BOOT_MODEL_SILHOUETTES,
    )) {
      if (!("poseSha256" in silhouette)) continue;
      const pose = ABOUT_MODEL_POSES[id as AboutModelPoseId];
      expect(pose, `${id} needs a canonical live pose`).toBeDefined();
      expect(
        sha256(
          JSON.stringify({
            version: 1,
            pose,
            headQuaternion:
              id === "desk-lamp" ? ABOUT_LAMP_HEAD_QUATERNION : undefined,
            // The globe is redrawn at load (a mapped ball, trimmed pins, a
            // slimmer base); the generator traces that prop, so its shape
            // constants are part of the outline's signature.
            globeShape:
              id === "globe"
                ? {
                    footprint: GLOBE_STAND_FOOTPRINT,
                    height: GLOBE_STAND_HEIGHT,
                    pinReach: GLOBE_PIN_REACH,
                    segments: GLOBE_SPHERE_SEGMENTS,
                  }
                : undefined,
          }),
        ),
        `${id} needs silhouette regeneration after its pose changed`,
      ).toBe(silhouette.poseSha256);
      expect(silhouette.profile[0]).toBeGreaterThan(0);
      expect(silhouette.profile[1]).toBeGreaterThan(0);
      expect(silhouette.projection[0]).toBe(silhouette.projection[3]);
      expect(silhouette.projection[1]).toBe(0);
      expect(silhouette.projection[2]).toBe(0);
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

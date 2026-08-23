import crypto from "node:crypto";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  ABOUT_AWARD_SIZE_INCREASE,
  ABOUT_BOOT_LANDMARKS,
} from "./aboutBootComposition";
import { ABOUT_BOOT_MODEL_SILHOUETTES } from "./aboutBootSilhouettes";
import { ABOUT_TJ_LIGHT_YAW } from "./aboutCoordinationLayout";
import {
  TJ_MEDALLION_FACES,
  TJ_MEDALLION_POSE,
  TJ_MEDALLION_SOLIDS,
  tjMedallionFrontElevation,
  tjMedallionSolidGroup,
  tjMedallionSpecSignature,
} from "./tjMedallionGeometry";

/** The generator's raster envelope, kept in one place there and mirrored here
 * so this test predicts a viewBox from the specification rather than reading
 * the committed one back to itself. Must match `viewBoxFor` in
 * scripts/generate-about-boot-silhouettes.mjs, and the generator throws if its
 * own raster ever disagrees with the front elevation this module derives. */
const MAX_EDGE = 220;
const sha256 = (input: string) =>
  crypto.createHash("sha256").update(input).digest("hex");

function viewBoxFor(width: number, height: number) {
  const scale = MAX_EDGE / Math.max(width, height);
  return [Math.ceil(width * scale) + 2, Math.ceil(height * scale) + 2] as const;
}

describe("TJ medallion geometry specification", () => {
  // The point of the shared spec: the committed silhouette is a function of
  // these numbers. Predict its viewBox from them and it has to match.
  it("predicts the committed silhouette envelope", () => {
    const elevation = tjMedallionFrontElevation(THREE);
    const [width, height] = viewBoxFor(elevation.width, elevation.height);
    const committed = ABOUT_BOOT_MODEL_SILHOUETTES["tj-medallion"].viewBox;

    expect([width, height]).toEqual([committed[2], committed[3]]);
  });

  // The regression that matters. If the generator ever drifts back to a copy of
  // these numbers, moving one of them here stops moving the traced output, and
  // this fails.
  it("changes the derived envelope when the shape changes", () => {
    const before = tjMedallionFrontElevation(THREE);

    const rim = TJ_MEDALLION_SOLIDS.find((solid) => solid.id === "rim")!;
    const widened = {
      ...rim,
      args: [
        rim.args[0]! * 1.6,
        rim.args[1]! * 1.6,
        rim.args[2]!,
        rim.args[3]!,
      ],
    };
    const group = new THREE.Group();
    for (const solid of TJ_MEDALLION_SOLIDS) {
      const source = solid.id === "rim" ? widened : solid;
      const geometry =
        source.shape === "cylinder"
          ? new THREE.CylinderGeometry(
              source.args[0],
              source.args[1],
              source.args[2],
              source.args[3],
            )
          : new THREE.BoxGeometry(
              source.args[0],
              source.args[1],
              source.args[2],
            );
      const mesh = new THREE.Mesh(geometry);
      mesh.position.fromArray(source.position);
      mesh.rotation.fromArray(source.rotation);
      group.add(mesh);
    }
    group.rotation.y = TJ_MEDALLION_POSE.yaw;
    group.scale.setScalar(TJ_MEDALLION_POSE.scale);
    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(group);

    expect(box.max.x - box.min.x).toBeGreaterThan(before.width * 1.2);
    expect(
      viewBoxFor(box.max.x - box.min.x, box.max.y - box.min.y),
    ).not.toEqual(viewBoxFor(before.width, before.height));
  });

  // The generator traces the solids alone. That is only complete because the
  // two coplanar discs sit inside the rim's own circle, so they can never
  // reach the outline. Assert it instead of trusting it.
  it("keeps both faces inside the rim, so tracing the solids is complete", () => {
    const rim = TJ_MEDALLION_SOLIDS.find((solid) => solid.id === "rim")!;
    const rimRadius = rim.args[0]!;

    expect(TJ_MEDALLION_FACES.length).toBeGreaterThan(0);
    for (const face of TJ_MEDALLION_FACES) {
      expect(face.radius).toBeLessThanOrEqual(rimRadius);
      expect(face.position[0]).toBe(rim.position[0]);
      expect(face.position[1]).toBe(rim.position[1]);
    }
  });

  it("signs every number the silhouette depends on", () => {
    const signature = tjMedallionSpecSignature();

    expect(signature).toContain('"version":1');
    expect(JSON.parse(signature)).toEqual({
      version: 1,
      solids: TJ_MEDALLION_SOLIDS,
      faces: TJ_MEDALLION_FACES,
      pose: TJ_MEDALLION_POSE,
    });
  });

  // Solids and faces were shared first; the pose was not, and a copy of it on
  // each side is the same false contract in smaller print. The scene turns the
  // medallion by ABOUT_TJ_LIGHT_YAW and sizes it by the landmark's sceneScale,
  // and the outline is traced at exactly that yaw, so a second copy could be
  // re-posed without the silhouette noticing.
  it("poses the scene from the same values the digest signs", () => {
    expect(ABOUT_TJ_LIGHT_YAW).toBe(TJ_MEDALLION_POSE.yaw);
    expect(ABOUT_BOOT_LANDMARKS["tj-medallion"].sceneScale).toBe(
      TJ_MEDALLION_POSE.scale,
    );

    // Not merely equal by coincidence: the signed pose is these two values, and
    // the committed digest is a hash of the text containing them.
    const signed = JSON.parse(tjMedallionSpecSignature()) as {
      pose: { yaw: number; scale: number };
    };
    expect(signed.pose).toEqual({
      yaw: ABOUT_TJ_LIGHT_YAW,
      scale: ABOUT_BOOT_LANDMARKS["tj-medallion"].sceneScale,
    });
    expect(sha256(tjMedallionSpecSignature())).toBe(
      ABOUT_BOOT_MODEL_SILHOUETTES["tj-medallion"].sha256,
    );
  });

  it("moves the digest when either half of the pose moves", () => {
    const committed = ABOUT_BOOT_MODEL_SILHOUETTES["tj-medallion"].sha256;
    const signed = JSON.parse(tjMedallionSpecSignature()) as {
      pose: { yaw: number; scale: number };
    };

    for (const repose of [
      { ...signed.pose, yaw: signed.pose.yaw - 0.1 },
      { ...signed.pose, scale: signed.pose.scale * 1.1 },
    ]) {
      expect(sha256(JSON.stringify({ ...signed, pose: repose }))).not.toBe(
        committed,
      );
    }
  });

  // The scale is still the award group's, just held in one place. If the group
  // is resized, this fails and the medallion has to be retraced with it.
  it("keeps the medallion sized with the other lower-shelf awards", () => {
    expect(TJ_MEDALLION_POSE.scale).toBe(0.66 * ABOUT_AWARD_SIZE_INCREASE);
  });

  // Yaw is the half that reaches the outline, which is why tying it matters.
  it("traces a different envelope at a different yaw", () => {
    const posed = tjMedallionSolidGroup(THREE);
    const atSpecYaw = new THREE.Box3().setFromObject(posed);

    posed.rotation.y = TJ_MEDALLION_POSE.yaw + 0.6;
    posed.updateWorldMatrix(true, true);
    const turned = new THREE.Box3().setFromObject(posed);

    expect(turned.max.x - turned.min.x).not.toBeCloseTo(
      atSpecYaw.max.x - atSpecYaw.min.x,
      3,
    );
  });

  it("builds the same solids the scene renders", () => {
    const group = tjMedallionSolidGroup(THREE);

    expect(group.children).toHaveLength(TJ_MEDALLION_SOLIDS.length);
    expect(group.rotation.y).toBeCloseTo(TJ_MEDALLION_POSE.yaw, 10);
    expect(group.scale.x).toBeCloseTo(TJ_MEDALLION_POSE.scale, 10);
  });
});

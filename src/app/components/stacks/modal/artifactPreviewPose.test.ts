import { describe, expect, it } from "vitest";

import {
  type ArtifactPreviewBox,
  type ArtifactPreviewQuad,
  artifactPreviewPoseKeyframes,
  artifactPreviewPoseTransform,
  artifactPreviewQuadUsable,
} from "./artifactPreviewPose";

const ELEMENT = { width: 100, height: 80 };
const BOX: ArtifactPreviewBox = { left: 10, top: 20, width: 200, height: 160 };

function boxQuad(): [number, number][] {
  return [
    [BOX.left, BOX.top],
    [BOX.left + BOX.width, BOX.top],
    [BOX.left + BOX.width, BOX.top + BOX.height],
    [BOX.left, BOX.top + BOX.height],
  ];
}

function rotatedBoxQuad(angle: number): ArtifactPreviewQuad {
  const cx = BOX.left + BOX.width / 2;
  const cy = BOX.top + BOX.height / 2;
  return boxQuad().map(([x, y]) => [
    cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle),
    cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle),
  ]) as unknown as ArtifactPreviewQuad;
}

/** Apply the matrix3d string as the 2D homography it encodes, then the
 * viewer's own start-box transform (translate + uniform scale about the
 * top-left corner) — the exact composition the browser performs. */
function throughViewer(transform: string, x: number, y: number) {
  const values = transform.slice("matrix3d(".length, -1).split(",").map(Number);
  const [a, d, , g, b, e, , h, , , , , c, f, , i] = values;
  const w = g! * x + h! * y + i!;
  const localX = (a! * x + b! * y + c!) / w;
  const localY = (d! * x + e! * y + f!) / w;
  const scale = BOX.width / ELEMENT.width;
  return [BOX.left + localX * scale, BOX.top + localY * scale];
}

describe("artifact preview pose", () => {
  it("treats the axis-aligned box itself as a no-op", () => {
    expect(
      artifactPreviewPoseTransform(
        ELEMENT,
        BOX,
        boxQuad() as unknown as ArtifactPreviewQuad,
      ),
    ).toBeNull();
  });

  it("reproduces a rolled print's corners exactly through the viewer box", () => {
    const quad = rotatedBoxQuad(0.08);
    const transform = artifactPreviewPoseTransform(ELEMENT, BOX, quad);
    expect(transform).toMatch(/^matrix3d\(/);
    const corners = [
      [0, 0],
      [ELEMENT.width, 0],
      [ELEMENT.width, ELEMENT.height],
      [0, ELEMENT.height],
    ] as const;
    corners.forEach(([x, y], index) => {
      const [screenX, screenY] = throughViewer(transform!, x, y);
      expect(screenX).toBeCloseTo(quad[index]![0], 6);
      expect(screenY).toBeCloseTo(quad[index]![1], 6);
    });
  });

  it("carries perspective for a tilted print's trapezoid", () => {
    // Top edge narrower than the bottom: a print leaning away up top.
    const quad: ArtifactPreviewQuad = [
      [40, 24],
      [180, 24],
      [210, 180],
      [10, 180],
    ];
    const transform = artifactPreviewPoseTransform(ELEMENT, BOX, quad);
    expect(transform).toMatch(/^matrix3d\(/);
    const values = transform!
      .slice("matrix3d(".length, -1)
      .split(",")
      .map(Number);
    // The two perspective terms (4th entries of the x and y columns).
    expect(Math.abs(values[3]!) + Math.abs(values[7]!)).toBeGreaterThan(0);
    const [screenX, screenY] = throughViewer(transform!, 0, 0);
    expect(screenX).toBeCloseTo(40, 6);
    expect(screenY).toBeCloseTo(24, 6);
  });

  it("keeps the projected corners on the camera-relative plane mid-flight", () => {
    const quad: ArtifactPreviewQuad = [
      [42, 22],
      [178, 31],
      [207, 181],
      [8, 170],
    ];
    const frames = artifactPreviewPoseKeyframes(ELEMENT, BOX, quad, 4);
    expect(frames).toHaveLength(5);

    const middle = frames![2]!;
    expect(middle.offset).toBe(0.5);
    const corners = [
      [0, 0],
      [ELEMENT.width, 0],
      [ELEMENT.width, ELEMENT.height],
      [0, ELEMENT.height],
    ] as const;
    const target = boxQuad();
    corners.forEach(([x, y], index) => {
      const [screenX, screenY] = throughViewer(middle.transform, x, y);
      expect(screenX).toBeCloseTo((quad[index]![0] + target[index]![0]) / 2, 6);
      expect(screenY).toBeCloseTo((quad[index]![1] + target[index]![1]) / 2, 6);
    });
  });

  it("returns exact inverse endpoints for the closing flight", () => {
    const quad = rotatedBoxQuad(0.1);
    const frames = artifactPreviewPoseKeyframes(ELEMENT, BOX, quad, 6)!;
    expect(frames[0]!.transform).toBe(
      artifactPreviewPoseTransform(ELEMENT, BOX, quad),
    );
    expect(frames.at(-1)!.transform).toBe(
      "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
    );
    expect([...frames].reverse().map(({ transform }) => transform)).toEqual(
      frames.map(({ transform }) => transform).reverse(),
    );
  });

  it("keeps subtle tilt until the true identity endpoint", () => {
    const frames = artifactPreviewPoseKeyframes(
      ELEMENT,
      BOX,
      rotatedBoxQuad(0.003),
      24,
    )!;
    expect(frames.at(-2)!.transform).not.toBe(frames.at(-1)!.transform);
  });

  it("refuses degenerate and flipped quads", () => {
    const flipped: ArtifactPreviewQuad = [
      [210, 40],
      [10, 40],
      [210, 180],
      [10, 180],
    ];
    expect(artifactPreviewQuadUsable(flipped)).toBe(false);
    expect(artifactPreviewPoseTransform(ELEMENT, BOX, flipped)).toBeNull();
    const line: ArtifactPreviewQuad = [
      [0, 0],
      [100, 0],
      [200, 0],
      [300, 0],
    ];
    expect(artifactPreviewPoseTransform(ELEMENT, BOX, line)).toBeNull();
    expect(
      artifactPreviewPoseTransform(
        ELEMENT,
        { ...BOX, width: 0 },
        rotatedBoxQuad(0.1),
      ),
    ).toBeNull();
  });
});

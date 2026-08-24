// The photo viewer opens a preview from an axis-aligned box, but the print
// it enlarges is rendered rolled, yawed, and in perspective. This module
// turns the print's projected face (a screen quad) into one CSS matrix3d
// that, applied to the preview element while the viewer sits in its start
// box, puts the element exactly over the rendered print. The inspector
// applies it at the first frame of the open and releases it to identity, so
// the morph starts FROM the print's real pose instead of snapping it
// straight; closing plays the same matrix back.
import type { ProjectedScreenPoint } from "../scene/interactionRegistry";

import type { ArtifactPreviewSize } from "./artifactPreviewFit";

export type ArtifactPreviewQuad = readonly [
  ProjectedScreenPoint,
  ProjectedScreenPoint,
  ProjectedScreenPoint,
  ProjectedScreenPoint,
];

export type ArtifactPreviewBox = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

/** Row-major 3x3 homogeneous matrix. */
type Homography = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

const EPSILON = 1e-9;

function cross(
  a: ProjectedScreenPoint,
  b: ProjectedScreenPoint,
  c: ProjectedScreenPoint,
) {
  return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
}

/** A usable pose quad is convex and wound the way its corners are named
 * (TL, TR, BR, BL — clockwise with screen y growing downward). A print seen
 * edge-on or from behind projects a degenerate or flipped quad, and a
 * homography onto one would fold the preview through itself. */
export function artifactPreviewQuadUsable(quad: ArtifactPreviewQuad) {
  for (let index = 0; index < 4; index += 1) {
    if (
      cross(
        quad[index]!,
        quad[(index + 1) % 4]!,
        quad[(index + 2) % 4]!,
      ) <= EPSILON
    )
      return false;
  }
  return true;
}

/** Homography mapping the unit square (0,0) (1,0) (1,1) (0,1) onto the quad
 * (TL, TR, BR, BL). The classic closed form. */
function unitSquareToQuad(quad: ArtifactPreviewQuad): Homography | null {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const denominator = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denominator) < EPSILON) return null;
  const g = (sx * dy2 - sy * dx2) / denominator;
  const h = (dx1 * sy - dy1 * sx) / denominator;
  return [
    [x1 - x0 + g * x1, x3 - x0 + h * x3, x0],
    [y1 - y0 + g * y1, y3 - y0 + h * y3, y0],
    [g, h, 1],
  ];
}

/** The corrective transform for a preview element `element` pixels large,
 * whose viewer starts it in the axis-aligned `box`, over a print rendered at
 * `quad`. Returns a `matrix3d(...)` value for transform-origin `0 0`, or
 * null when the quad is degenerate or the correction is a no-op. */
export function artifactPreviewPoseTransform(
  element: ArtifactPreviewSize,
  box: ArtifactPreviewBox,
  quad: ArtifactPreviewQuad,
): string | null {
  if (
    element.width <= 0 ||
    element.height <= 0 ||
    box.width <= 0 ||
    box.height <= 0 ||
    !artifactPreviewQuadUsable(quad)
  )
    return null;
  const toQuad = unitSquareToQuad(quad);
  if (!toQuad) return null;

  // local (element px) -> screen: divide into the unit square first.
  const matrix = toQuad.map((row) => [
    row[0] / element.width,
    row[1] / element.height,
    row[2],
  ]) as Homography;
  // screen -> the viewer's start box frame: untranslate, then unscale. The
  // viewer scales the element uniformly about its top-left corner.
  const scale = box.width / element.width;
  for (const axis of [0, 1] as const) {
    const offset = axis === 0 ? box.left : box.top;
    for (const column of [0, 1, 2] as const) {
      matrix[axis][column] =
        (matrix[axis][column] - offset * matrix[2][column]) / scale;
    }
  }
  // Normalize so the identity comparison below is meaningful.
  const w = matrix[2][2];
  if (Math.abs(w) < EPSILON) return null;
  const [a, b, c] = matrix[0].map((value) => value / w);
  const [d, e, f] = matrix[1].map((value) => value / w);
  const [g, h] = matrix[2].map((value) => value / w);

  const deviation = Math.max(
    Math.abs(a! - 1),
    Math.abs(e! - 1),
    Math.abs(b!),
    Math.abs(d!),
    Math.abs(c!) / Math.max(1, element.width),
    Math.abs(f!) / Math.max(1, element.height),
    Math.abs(g!) * element.width,
    Math.abs(h!) * element.height,
  );
  if (deviation < 0.002) return null;

  const n = (value: number) =>
    Math.abs(value) < 1e-10 ? "0" : value.toPrecision(12);
  return `matrix3d(${n(a!)}, ${n(d!)}, 0, ${n(g!)}, ${n(b!)}, ${n(e!)}, 0, ${n(h!)}, 0, 0, 1, 0, ${n(c!)}, ${n(f!)}, 0, 1)`;
}

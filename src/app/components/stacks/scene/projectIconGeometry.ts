import { PROJECT_ARTIFACT_DIMENSIONS } from "./units/unitShelfLayout";

/** Physical billet proportions shared by the live ProjectIcon and boot SVG. */
export function projectIconBody(
  size: number = PROJECT_ARTIFACT_DIMENSIONS.icon,
) {
  return {
    size,
    depth: size * 0.125,
    /** Reach of each continuous corner along the silhouette. */
    radius: size * 0.4,
    /** Bevel where the front cap meets the walls (projectIconSlab.ts). */
    edgeRadius: size * 0.045,
    faceInset: size * 0.04375,
    fallbackFaceDepth: 0.012,
    fallbackFaceRadius: 0.005,
  } as const;
}

export const PROJECT_ICON_BODY = projectIconBody();

/** Minimal path interface shared by Three shapes and the boot SVG. */
type IconOutlinePath = {
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  bezierCurveTo(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x: number,
    y: number,
  ): unknown;
};

/** App-icon-style continuous corners. Each corner uses two cubic curves:
 * curvature starts at zero against the straight edge and joins smoothly at
 * the diagonal. This is an approximation, not a platform's proprietary mask.
 */
export function traceProjectIconOutline(
  path: IconOutlinePath,
  size: number,
  radius: number,
) {
  const half = size / 2;
  const r = Math.min(radius, half);
  path.moveTo(-half + r, -half);
  for (let corner = 0; corner < 4; corner++) {
    const rotate = (x: number, y: number): [number, number] => {
      switch (corner) {
        case 1:
          return [-y, x];
        case 2:
          return [-x, -y];
        case 3:
          return [y, -x];
        default:
          return [x, y];
      }
    };
    // Bottom-right corner, rotated successively around the tile.
    const point = (x: number, y: number) =>
      rotate(half - r + x * r, -half + y * r);
    path.lineTo(...point(0, 0));
    path.bezierCurveTo(...point(0.45, 0), ...point(0.6, 0), ...point(0.8, 0.2));
    path.bezierCurveTo(...point(1, 0.4), ...point(1, 0.55), ...point(1, 1));
  }
}

export function projectIconOutlineSvg(size: number, radius: number) {
  const commands: string[] = [];
  traceProjectIconOutline(
    {
      moveTo: (x, y) => commands.push(`M${x},${y}`),
      lineTo: (x, y) => commands.push(`L${x},${y}`),
      bezierCurveTo: (...points) => commands.push(`C${points.join(",")}`),
    },
    size,
    radius,
  );
  return `${commands.join(" ")} Z`;
}

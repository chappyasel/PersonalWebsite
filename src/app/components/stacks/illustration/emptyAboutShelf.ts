import type { AboutBootCamera, Point3 } from "../scene/aboutBootPerspective";
import type { SHELF_GEOMETRY, SHELF_PLANKS } from "../scene/shelfGeometry";

/** Self-contained for parsing-time execution. The scene supplies all camera
 * and geometry values; tests compare this with About's normal projector. */
export function emptyAboutShelf(
  camera: AboutBootCamera,
  planks: typeof SHELF_PLANKS,
  geometry: typeof SHELF_GEOMETRY,
  scale: number,
) {
  const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: Point3, b: Point3): Point3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const normalize = (a: Point3): Point3 => {
    const n = Math.hypot(...a) || 1;
    return [a[0] / n, a[1] / n, a[2] / n];
  };
  const forward = normalize(
    camera.aim.map((v, i) => v - camera.eye[i]!) as unknown as Point3,
  );
  const right = normalize(cross(forward, [0, 1, 0])),
    up = cross(right, forward);
  const origin = camera.eye.map((v) => -v) as unknown as Point3;
  const cos = Math.cos(camera.unitYaw),
    sin = Math.sin(camera.unitYaw);
  const project = ([x, y, z]: Point3) => {
    const p: Point3 = [
      x * cos + z * sin - camera.eye[0],
      y - camera.eye[1],
      -x * sin + z * cos - camera.eye[2],
    ];
    const ratio = dot(origin, forward) / Math.max(1e-6, dot(p, forward));
    return [
      (dot(p, right) * ratio - dot(origin, right)) * scale,
      -(dot(p, up) * ratio - dot(origin, up)) * scale,
    ];
  };
  const fixed = (v: number) => Number(v.toFixed(3));
  const quad = (corners: Point3[]) =>
    corners.map((p) => project(p).map(fixed).join(",")).join(" ");
  const box = (
    x: number,
    w: number,
    z: number,
    d: number,
    top: number,
    bottom: number,
  ) => {
    const l = x - w / 2,
      r = x + w / 2,
      n = z + d / 2,
      f = z - d / 2;
    const t = top,
      b = bottom;
    const ex = camera.eye[0] * cos - camera.eye[2] * sin;
    const ez = camera.eye[0] * sin + camera.eye[2] * cos;
    const face = (corners: Point3[], visible: boolean) => ({
      points: quad(corners),
      visible,
    });
    const faces = {
      top: face(
        [
          [l, t, f],
          [r, t, f],
          [r, t, n],
          [l, t, n],
        ],
        camera.eye[1] > t,
      ),
      front: face(
        [
          [l, t, n],
          [r, t, n],
          [r, b, n],
          [l, b, n],
        ],
        ez > n,
      ),
      right: face(
        [
          [r, t, n],
          [r, t, f],
          [r, b, f],
          [r, b, n],
        ],
        ex > r,
      ),
      left: face(
        [
          [l, t, f],
          [l, t, n],
          [l, b, n],
          [l, b, f],
        ],
        ex < l,
      ),
      back: face(
        [
          [r, t, f],
          [l, t, f],
          [l, b, f],
          [r, b, f],
        ],
        ez < f,
      ),
      bottom: face(
        [
          [l, b, n],
          [r, b, n],
          [r, b, f],
          [l, b, f],
        ],
        camera.eye[1] < b,
      ),
    };
    const points = [-w / 2, w / 2].flatMap((dx) =>
      [-d / 2, d / 2].flatMap((dz) =>
        [top, bottom].map((y) => project([x + dx, y, z + dz])),
      ),
    );
    const xs = points.map((p) => p[0]!),
      ys = points.map((p) => p[1]!);
    return {
      faces,
      x: fixed(Math.min(...xs)),
      y: fixed(Math.min(...ys)),
      width: fixed(Math.max(...xs) - Math.min(...xs)),
      height: fixed(Math.max(...ys) - Math.min(...ys)),
    };
  };
  const faces = planks.map((p) => {
    const { faces } = box(
      0,
      p.width,
      p.centerZ,
      p.depth,
      p.centerY + p.thickness / 2,
      p.centerY - p.thickness / 2,
    );
    return {
      id: p.id,
      top: faces.top.points,
      front: faces.front.points,
      left: faces.left,
      right: faces.right,
    };
  });
  const s = geometry.support;
  const supports = [-1, 1].map((side) => {
    const x = side * (geometry.width / 2 - geometry.strapInsetX),
      z = geometry.strapZ,
      g = geometry.groundY;
    return {
      side,
      upright: box(
        x,
        s.width,
        z,
        s.width,
        geometry.top.centerY - geometry.top.thickness / 2,
        g + s.footHeight,
      ),
      foot: box(x, s.footWidth, z, s.footDepth, g + s.footHeight, g),
    };
  });
  const ys = faces.flatMap((face) =>
    [face.top, face.front].flatMap((points) =>
      points.split(" ").map((point) => Number(point.split(",")[1])),
    ),
  );
  for (const support of supports)
    for (const part of [support.upright, support.foot])
      ys.push(part.y, part.y + part.height);
  return { faces, supports, centerY: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

// Throwaway 2D renderer of the live Books layout. Capture once per handoff,
// never per frame. SVG replaces material lighting with a few flat face colors.
import { proxiedBookCover } from "../stacks/scene/bookCoverTexture";
import { type BookInteractionRow } from "../stacks/scene/bookInteractions";
import {
  COVER_H,
  COVER_W,
  FEATURED_COVER_Z,
  coverSeat,
  flatVolumeHeights,
  flatVolumeSeats,
  packedBookDepth,
} from "../stacks/scene/primitives";
import {
  SHELF_GEOMETRY,
  SHELF_PLANKS,
  SHELF_SURFACE,
} from "../stacks/scene/shelfGeometry";
import {
  LOWER_FEATURED_ROW_Z,
  LOWER_PACKED_ROW_Z,
  TOP_FEATURED_ROW_Z,
  TOP_PACKED_ROW_OFFSET_X,
  TOP_PACKED_ROW_Z,
} from "../stacks/scene/units/UnitBooks";
import { unitPose } from "../stacks/scene/worldLayout";
import { PALETTES, rand } from "../stacks/theme";
import { Color, Euler, Vector3 } from "three";

type Point = { x: number; y: number; depth: number };
type Vec = [number, number, number];
type Polygon = { points: Point[]; color: string; depth: number };
export type ShelfDrawingLayer = {
  key: string;
  polygons: Polygon[];
  depth: number;
  cover?: { id: string; title: string; src: string; corners: Point[] };
};
export type BooksShelfDrawing = {
  width: number;
  height: number;
  layers: ShelfDrawingLayer[];
  bookCount: number;
};

export function drawBooksShelf(
  rows: BookInteractionRow[],
  projectWorld: (x: number, y: number, z: number) => Point | null,
  viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    dark: document.documentElement.classList.contains("dark"),
  },
): BooksShelfDrawing {
  const { dark } = viewport;
  const palette = PALETTES[dark ? "dark" : "light"];
  const pose = unitPose(1);
  const unitRotation = new Euler(...pose.rotation);
  const layers: ShelfDrawingLayer[] = [];
  let bookCount = 0;
  const project = (point: Vec) => {
    const world = new Vector3(...point).applyEuler(unitRotation);
    world.add(new Vector3(...pose.position));
    const projected = projectWorld(world.x, world.y, world.z);
    if (!projected) throw new Error("The live shelf camera is unavailable");
    return projected;
  };
  function object(key: string, center: Vec, rotation: Vec = [0, 0, 0]) {
    const euler = new Euler(...rotation);
    const point = (p: Vec) => {
      const local = new Vector3(...p)
        .applyEuler(euler)
        .add(new Vector3(...center));
      return project(local.toArray());
    };
    const layer: ShelfDrawingLayer = {
      key,
      polygons: [],
      depth: point([0, 0, 0]).depth,
    };
    layers.push(layer);
    function box(
      w: number,
      h: number,
      d: number,
      color: string,
      offset: Vec = [0, 0, 0],
    ) {
      const corners = Array.from({ length: 8 }, (_, i) =>
        point([
          (i & 1 ? w : -w) / 2 + offset[0],
          (i & 2 ? h : -h) / 2 + offset[1],
          (i & 4 ? d : -d) / 2 + offset[2],
        ]),
      );
      const faces = [
        [0, 1, 3, 2],
        [4, 6, 7, 5],
        [0, 2, 6, 4],
        [1, 5, 7, 3],
        [2, 3, 7, 6],
        [0, 4, 5, 1],
      ];
      const tones = [0.72, 1, 0.78, 0.88, 1.16, 0.65];
      faces.forEach((face, i) => {
        const points = face.map((index) => corners[index]!);
        layer.polygons.push({
          points,
          color: new Color(color).multiplyScalar(tones[i]!).getStyle(),
          depth: points.reduce((sum, p) => sum + p.depth, 0) / 4,
        });
      });
    }
    return { layer, point, box };
  }
  const geometry = SHELF_GEOMETRY;
  for (const side of [-1, 1]) {
    const x = side * (geometry.width / 2 - geometry.strapInsetX);
    object(`support-${side}`, [x, geometry.groundY / 2, geometry.strapZ]).box(
      geometry.support.width,
      -geometry.groundY,
      geometry.support.width,
      palette.strap,
    );
    object(`foot-${side}`, [x, geometry.groundY + 0.025, geometry.strapZ]).box(
      geometry.support.footWidth,
      geometry.support.footHeight,
      geometry.support.footDepth,
      palette.strap,
    );
  }
  for (const plank of SHELF_PLANKS) {
    object(`plank-${plank.id}`, [0, plank.centerY, plank.centerZ]).box(
      plank.width,
      plank.thickness,
      plank.depth,
      palette.wood,
    );
  }
  const furnitureCount = layers.length;
  for (const row of rows) {
    const top = row.shelf === "top";
    const y = SHELF_SURFACE[row.shelf];
    const packed = row.role === "packed";
    const z = packed
      ? top
        ? TOP_PACKED_ROW_Z
        : LOWER_PACKED_ROW_Z
      : top
        ? TOP_FEATURED_ROW_Z
        : LOWER_FEATURED_ROW_Z;
    const offsetX = packed && top ? TOP_PACKED_ROW_OFFSET_X : 0;
    if (packed) {
      object(
        `bookend-${row.shelf}`,
        [top ? -1.31 : -1.3, y + 0.11, z],
        [0, 0, top ? 0.046 : -0.046],
      ).box(0.012, 0.22, 0.16, palette.metal);
    }
    row.items.forEach((item, i) => {
      const key = `${row.shelf}-${row.role}-${i}`;
      if (item.kind === "cover") {
        bookCount++;
        const s = item.s ?? 1;
        const thickness = item.thickness ?? 0.048;
        const book = object(
          key,
          [
            item.x,
            y + coverSeat(s, item.lean ?? 0, item.riser ?? 0),
            z + FEATURED_COVER_Z + (item.dz ?? 0),
          ],
          [0, item.yaw ?? 0, item.lean ?? 0],
        );
        book.box(
          COVER_W * s,
          COVER_H * s,
          thickness * s,
          item.color ?? palette.cover,
          [0, 0, (-thickness * s) / 2],
        );
        book.layer.cover = {
          id: item.key,
          title: item.label ?? item.key,
          src: proxiedBookCover(item.url, 384),
          corners: [
            [-0.17, 0.25, 0.005],
            [0.17, 0.25, 0.005],
            [-0.17, -0.25, 0.005],
          ].map((p) => book.point(p.map((v) => v * s) as Vec)),
        };
      } else if (item.kind === "spine" || item.kind === "lean") {
        bookCount++;
        const roll =
          item.kind === "lean"
            ? (item.angle ?? 0.17)
            : (item.roll ?? rand(i, row.salt + 5) * 0.04 - 0.02);
        const depth = packedBookDepth(item.h, i, row.salt);
        const seat =
          (item.h / 2) * Math.cos(roll) +
          (item.w / 2) * Math.abs(Math.sin(roll));
        const book = object(
          key,
          [item.x + offsetX, y + seat, z + (depth - 0.3) / 2],
          [0, 0, roll],
        );
        book.box(item.w, item.h, depth, item.color);
        book.box(item.w * 0.74, 0.008, 0.002, palette.pages, [
          0,
          item.h * 0.34,
          depth / 2 + 0.001,
        ]);
        book.box(item.w * 0.74, 0.008, 0.002, palette.pages, [
          0,
          -item.h * 0.34,
          depth / 2 + 0.001,
        ]);
      } else {
        const heights = flatVolumeHeights(item);
        const seats = flatVolumeSeats(item);
        item.colors.forEach((color, j) => {
          bookCount++;
          const volume = item.volumes?.[j];
          const w = volume?.width ?? item.width ?? 0.32;
          const d = volume?.depth ?? item.depth ?? 0.24;
          const h = heights[j]!;
          const book = object(
            `${key}-${j}`,
            [
              item.x + offsetX + (volume?.x ?? j * (item.staggerX ?? 0.012)),
              y + seats[j]!,
              z + (volume?.z ?? 0),
            ],
            [0, volume?.yaw ?? rand(i + j, row.salt + 9) * 0.16 - 0.08, 0],
          );
          book.box(w, h, d, color);
          book.box(w * 0.97, h * 0.64, 0.002, palette.pages, [
            0,
            0,
            d / 2 + 0.001,
          ]);
        });
      }
    });
  }
  layers.forEach((layer) => layer.polygons.sort((a, b) => b.depth - a.depth));
  // These books sit above their planks, but a plank's centre can be closer to
  // the camera than a book's centre. Sorting whole objects together therefore
  // paints wood over the book's lower edge. Paint the supporting furniture
  // first, then depth-sort its contents so overlapping books keep their order.
  const furniture = layers
    .slice(0, furnitureCount)
    .sort((a, b) => b.depth - a.depth);
  const contents = layers
    .slice(furnitureCount)
    .sort((a, b) => b.depth - a.depth);
  return {
    width: viewport.width,
    height: viewport.height,
    layers: [...furniture, ...contents],
    bookCount,
  };
}

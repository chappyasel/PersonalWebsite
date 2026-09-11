import type { BookInteractionRow } from "../stacks/scene/bookInteractions";
import { unitPose } from "../stacks/scene/worldLayout";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { drawBooksShelf } from "./booksShelfDrawing";

const rows: BookInteractionRow[] = (["top", "lower"] as const).flatMap(
  (shelf) => [
    {
      shelf,
      role: "featured" as const,
      salt: 16,
      items: [
        {
          kind: "cover" as const,
          key: `${shelf}-cover`,
          url: "https://example.com/cover.jpg",
          x: 0,
          color: "#a84f35",
        },
      ],
    },
    {
      shelf,
      role: "packed" as const,
      salt: 15,
      items: [
        { kind: "spine" as const, x: -0.7, w: 0.12, h: 0.44, color: "#3f7355" },
      ],
    },
  ],
);

describe("Books SVG shelf occlusion", () => {
  it.each([
    ["boot", 0, 0.16, 4.9, 1],
    ["desktop", 0.9, 0.25, 3.6, 1.6],
    ["portrait", 0, 0.3, 5.5, 0.6],
  ] as const)(
    "paints the supporting plank before the books in the %s camera",
    (_, eyeX, eyeY, eyeZ, aspect) => {
      const [x, , z] = unitPose(1).position;
      const camera = new PerspectiveCamera(33, aspect, 0.1, 100);
      camera.position.set(x + eyeX, eyeY, z + eyeZ);
      camera.lookAt(x, -0.23, z);
      camera.updateMatrixWorld(true);
      const drawing = drawBooksShelf(
        rows,
        (px, py, pz) => {
          const p = new Vector3(px, py, pz).project(camera);
          return { x: (p.x + 1) * 400, y: (1 - p.y) * 400, depth: p.z };
        },
        { width: 800, height: 800, dark: false },
      );
      for (const row of rows) {
        const plank = drawing.layers.findIndex(
          (layer) => layer.key === `plank-${row.shelf}`,
        );
        const book = drawing.layers.findIndex(
          (layer) => layer.key === `${row.shelf}-${row.role}-0`,
        );
        expect(plank).toBeGreaterThanOrEqual(0);
        expect(book).toBeGreaterThan(plank);
      }
    },
  );
});

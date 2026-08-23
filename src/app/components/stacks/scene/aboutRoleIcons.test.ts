import { describe, expect, it } from "vitest";

import { ABOUT_BOOT_LANDMARKS } from "./aboutBootComposition";
import { aboutShelfIntervals } from "./aboutCoordinationLayout";
import {
  ABOUT_ROLES,
  ABOUT_ROLE_ICON_GAP,
  ABOUT_ROLE_ICON_SIZE,
  ABOUT_ROLE_STACK_HEIGHT,
  ABOUT_ROLE_STACK_WIDTH,
  aboutRoleIconOffset,
} from "./aboutRoleIcons";
import { LOWER_SHELF_HEADROOM, SHELF_GEOMETRY } from "./shelfGeometry";
import { projectIconBody } from "./units/ProjectArtifacts";
import { PROJECT_ARTIFACT_DIMENSIONS } from "./units/unitShelfLayout";

describe("About Role Icons", () => {
  it("names four distinct organizations, each with its own Door and artwork", () => {
    expect(ABOUT_ROLES.map((role) => role.id)).toEqual([
      "madrona",
      "roam",
      "susa",
      "weightlifting",
    ]);
    expect(new Set(ABOUT_ROLES.map((role) => role.href)).size).toBe(4);
    expect(new Set(ABOUT_ROLES.map((role) => role.artwork)).size).toBe(4);
    for (const role of ABOUT_ROLES) {
      expect(role.href).toMatch(/^https:\/\//);
      expect(role.doorLabel.length).toBeGreaterThan(0);
      expect(role.artwork).toMatch(/^\/images\/stacks\/v8\/512\/.+\.webp$/);
      expect(role.fallbackColor).toMatch(/^#[\da-f]{6}$/i);
      expect(role.bootColor.light).toMatch(/^#[\da-f]{6}$/i);
      expect(role.bootColor.dark).toMatch(/^#[\da-f]{6}$/i);
    }
  });

  it("stacks two by two: a full bottom row and a top row resting on it", () => {
    const cells = ABOUT_ROLES.map((role) => `${role.column},${role.row}`);
    expect(new Set(cells).size).toBe(4);
    expect(cells.sort()).toEqual(["0,0", "0,1", "1,0", "1,1"]);

    for (const role of ABOUT_ROLES) {
      const [dx, dy] = aboutRoleIconOffset(role);
      expect(Math.abs(dx)).toBeCloseTo(
        (ABOUT_ROLE_ICON_SIZE + ABOUT_ROLE_ICON_GAP) / 2,
        10,
      );
      // A top tile sits exactly on the tile below: same column, one edge up.
      expect(dy).toBeCloseTo(role.row * ABOUT_ROLE_ICON_SIZE, 10);
    }
    expect(ABOUT_ROLE_STACK_WIDTH).toBeCloseTo(
      ABOUT_ROLE_ICON_SIZE * 2 + ABOUT_ROLE_ICON_GAP,
      10,
    );
    expect(ABOUT_ROLE_STACK_HEIGHT).toBeCloseTo(ABOUT_ROLE_ICON_SIZE * 2, 10);
  });

  it("is the Projects die's edge and half the Project Icon's", () => {
    expect(ABOUT_ROLE_ICON_SIZE).toBe(PROJECT_ARTIFACT_DIMENSIONS.die);
    expect(ABOUT_ROLE_ICON_SIZE).toBe(PROJECT_ARTIFACT_DIMENSIONS.icon / 2);
  });

  it("keeps the half-size billet's rounded extrusions physically valid", () => {
    const body = projectIconBody(ABOUT_ROLE_ICON_SIZE);
    expect(body.depth).toBeGreaterThan(body.radius * 2);
    expect(body.fallbackFaceDepth).toBeGreaterThan(body.fallbackFaceRadius * 2);
    expect(body.size - body.faceInset * 2).toBeGreaterThan(
      body.fallbackFaceRadius * 2,
    );
  });

  it("fits between the Apple mark and the reading fan with honest air", () => {
    const intervals = aboutShelfIntervals("lower");
    const apple = intervals.find(({ id }) => id === "apple")!;
    const icons = intervals.find(({ id }) => id === "role-icons")!;
    const reading = intervals.find(({ id }) => id === "reading-stack")!;

    expect(icons.right - icons.left).toBeCloseTo(ABOUT_ROLE_STACK_WIDTH, 10);
    expect(icons.left - apple.right).toBeGreaterThan(0.04);
    expect(reading.left - icons.right).toBeGreaterThan(0.04);
    expect(ABOUT_ROLE_STACK_HEIGHT).toBeLessThan(LOWER_SHELF_HEADROOM);
    // The billets sit on the awards' own depth line, inside the plank.
    expect(Math.abs(SHELF_GEOMETRY.lower.centerZ)).toBeLessThan(
      SHELF_GEOMETRY.lower.depth / 2 - ABOUT_ROLE_ICON_SIZE * 0.375,
    );
    expect(ABOUT_BOOT_LANDMARKS["role-icons"].glyph).toBe("role-icons");
  });
});

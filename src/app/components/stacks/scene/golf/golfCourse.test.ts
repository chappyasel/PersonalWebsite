import { meadowHeight } from "../meadowField";
import { unitPose } from "../worldLayout";
import { describe, expect, it } from "vitest";

import {
  GOLF_CLUB_VEGETATION_CLEARANCE,
  GOLF_COURSE_CENTER,
  GOLF_CUP,
  GOLF_CUP_WORLD_CENTER,
  GOLF_FLAG_LOCAL,
  GOLF_GREEN,
  GOLF_GREEN_CENTER_LOCAL,
  GOLF_VEGETATION_CLEARANCE,
  golfCourseLocalPoint,
  golfSurfaceAt,
  suppressGolfVegetation,
} from "./golfCourse";
import { GOLF_CLUB_REST_BASE } from "./golfLayout";

describe("golf course field", () => {
  it("clears only the grass that would intersect the resting clubhead", () => {
    const pose = unitPose(2);
    const c = Math.cos(pose.rotation[1]);
    const s = Math.sin(pose.rotation[1]);
    const club = {
      x:
        pose.position[0] +
        GOLF_CLUB_REST_BASE.x * c +
        GOLF_CLUB_REST_BASE.z * s,
      z:
        pose.position[2] -
        GOLF_CLUB_REST_BASE.x * s +
        GOLF_CLUB_REST_BASE.z * c,
    };
    expect(suppressGolfVegetation(club.x, club.z, 0)).toEqual({
      grassScale: 0,
      flowers: false,
    });
    expect(GOLF_CLUB_VEGETATION_CLEARANCE).toBeLessThan(0.5);
  });

  it("classifies the green, fringe and rough around the pole", () => {
    expect(golfSurfaceAt(GOLF_COURSE_CENTER.x, GOLF_COURSE_CENTER.z)).toBe(
      "green",
    );
    const c = Math.cos(GOLF_COURSE_CENTER.yaw);
    const s = Math.sin(GOLF_COURSE_CENTER.yaw);
    const worldAtLocal = (x: number, z: number) => ({
      x: GOLF_COURSE_CENTER.x + x * c + z * s,
      z: GOLF_COURSE_CENTER.z - x * s + z * c,
    });
    const fringe = worldAtLocal(GOLF_GREEN.width / 2 + 0.2, 0);
    const rough = worldAtLocal(
      GOLF_GREEN.width / 2 + GOLF_GREEN.fringe + 0.2,
      0,
    );
    expect(golfSurfaceAt(fringe.x, fringe.z)).toBe("fringe");
    expect(golfSurfaceAt(rough.x, rough.z)).toBe("rough");
    expect(golfCourseLocalPoint(fringe.x, fringe.z).x).toBeCloseTo(2.8, 5);
  });

  it("aligns the visible recessed cup with the authored flag and physics", () => {
    const local = golfCourseLocalPoint(
      GOLF_CUP_WORLD_CENTER.x,
      GOLF_CUP_WORLD_CENTER.z,
    );
    expect(local.x).toBeCloseTo(
      GOLF_FLAG_LOCAL[0] - GOLF_GREEN_CENTER_LOCAL[0],
      5,
    );
    expect(local.z).toBeCloseTo(
      GOLF_FLAG_LOCAL[1] - GOLF_GREEN_CENTER_LOCAL[1],
      5,
    );
    expect(GOLF_CUP.radius).toBe(0.125);
    expect(GOLF_CUP.depth).toBe(0.12);
  });

  it("keeps the green continuous and suppresses flowers and long turf", () => {
    const center = meadowHeight(GOLF_COURSE_CENTER.x, GOLF_COURSE_CENTER.z);
    expect(Number.isFinite(center)).toBe(true);
    expect(
      Math.abs(
        meadowHeight(GOLF_COURSE_CENTER.x, GOLF_COURSE_CENTER.z + 0.01) -
          center,
      ),
    ).toBeLessThan(0.01);
    expect(
      suppressGolfVegetation(GOLF_COURSE_CENTER.x, GOLF_COURSE_CENTER.z, 0.1),
    ).toEqual({ grassScale: 0, flowers: false });
    expect(GOLF_GREEN_CENTER_LOCAL).toEqual([-1.55, -17.2]);
    expect(GOLF_FLAG_LOCAL).toEqual([-1.55, -18.1]);
    expect(GOLF_FLAG_LOCAL[0] - GOLF_GREEN_CENTER_LOCAL[0]).toBeCloseTo(0, 5);
    expect(GOLF_FLAG_LOCAL[1] - GOLF_GREEN_CENTER_LOCAL[1]).toBeCloseTo(
      -0.9,
      5,
    );
    expect(GOLF_GREEN.fringe).toBe(0.2);
    const c = Math.cos(GOLF_COURSE_CENTER.yaw);
    const s = Math.sin(GOLF_COURSE_CENTER.yaw);
    const fringeX = GOLF_COURSE_CENTER.x + (GOLF_GREEN.width / 2 + 0.1) * c;
    const fringeZ = GOLF_COURSE_CENTER.z - (GOLF_GREEN.width / 2 + 0.1) * s;
    expect(golfSurfaceAt(fringeX, fringeZ)).toBe("fringe");
    expect(suppressGolfVegetation(fringeX, fringeZ, 0)).toEqual({
      grassScale: 0,
      flowers: false,
    });
  });

  it("keeps tall tufts behind the green and preserves the foreground opening", () => {
    const c = Math.cos(GOLF_COURSE_CENTER.yaw);
    const s = Math.sin(GOLF_COURSE_CENTER.yaw);
    const worldAtLocal = (x: number, z: number) => ({
      x: GOLF_COURSE_CENTER.x + x * c + z * s,
      z: GOLF_COURSE_CENTER.z - x * s + z * c,
    });
    const outerZ = GOLF_GREEN.depth / 2 + GOLF_GREEN.fringe;
    const behind = worldAtLocal(
      0,
      -(outerZ + GOLF_VEGETATION_CLEARANCE.back - 0.05),
    );
    const foreground = worldAtLocal(
      0,
      outerZ + GOLF_VEGETATION_CLEARANCE.front - 0.05,
    );
    const beyondOpening = worldAtLocal(
      0,
      outerZ + GOLF_VEGETATION_CLEARANCE.front + 0.2,
    );
    const cupSightline = worldAtLocal(
      0,
      outerZ + GOLF_VEGETATION_CLEARANCE.cupSightlineFront - 0.05,
    );
    const besideCupSightline = worldAtLocal(
      GOLF_VEGETATION_CLEARANCE.cupSightlineHalfWidth + 0.12,
      outerZ + GOLF_VEGETATION_CLEARANCE.front + 0.2,
    );
    const leftBank = worldAtLocal(
      -(GOLF_GREEN.width / 2 + GOLF_GREEN.fringe + 0.12),
      0,
    );
    expect(golfSurfaceAt(behind.x, behind.z)).toBe("rough");
    expect(suppressGolfVegetation(behind.x, behind.z, 0)).toEqual({
      grassScale: 0,
      flowers: false,
    });
    expect(suppressGolfVegetation(foreground.x, foreground.z, 0)).toEqual({
      grassScale: 0,
      flowers: false,
    });
    expect(suppressGolfVegetation(beyondOpening.x, beyondOpening.z, 0)).toEqual(
      { grassScale: 0, flowers: false },
    );
    expect(suppressGolfVegetation(cupSightline.x, cupSightline.z, 0)).toEqual({
      grassScale: 0,
      flowers: false,
    });
    expect(
      suppressGolfVegetation(besideCupSightline.x, besideCupSightline.z, 0),
    ).toEqual({ grassScale: 1, flowers: true });
    expect(suppressGolfVegetation(leftBank.x, leftBank.z, 0)).toEqual({
      grassScale: 1,
      flowers: true,
    });
  });

  it("holds the authored two-percent pitch through the green interior", () => {
    const c = Math.cos(GOLF_COURSE_CENTER.yaw);
    const s = Math.sin(GOLF_COURSE_CENTER.yaw);
    const atLocalZ = (z: number) => ({
      x: GOLF_COURSE_CENTER.x + z * s,
      z: GOLF_COURSE_CENTER.z + z * c,
    });
    const low = atLocalZ(-0.5);
    const high = atLocalZ(0.5);
    expect(
      meadowHeight(high.x, high.z) - meadowHeight(low.x, low.z),
    ).toBeCloseTo(0.02, 4);
  });
});

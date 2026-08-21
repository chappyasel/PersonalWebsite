import { describe, expect, it } from "vitest";

import {
  GOLF_BALL_FINISH,
  GOLF_BALL_LOW_RES_MAX_SCALE,
  GOLF_CLUB_FINISH,
  GOLF_CONFETTI_COLORS,
  GOLF_DARK_GREEN_FINAL_CEILING,
  GOLF_FOG_POLICY,
  GOLF_GREEN_BALL_SCALE,
  GOLF_GREEN_COLORS,
  GOLF_GREEN_FOG_SCALE,
  GOLF_SOUND_POLICY,
  golfBallRenderedScale,
  golfBallResolutionScale,
  golfBallVisualScale,
  golfColorChroma,
  golfColorLuminance,
  golfLinearToSrgb,
  golfVisualSpinStep,
} from "./golfPresentation";

describe("golf presentation policy", () => {
  it("keeps both themes darker and chromatic before distance fog", () => {
    expect(GOLF_GREEN_COLORS.lightLow).toEqual([0.11, 0.3, 0.08]);
    expect(GOLF_GREEN_COLORS.lightHigh).toEqual([0.22, 0.49, 0.14]);
    expect(golfColorLuminance(GOLF_GREEN_COLORS.lightHigh)).toBeLessThan(0.52);
    expect(golfColorLuminance(GOLF_GREEN_COLORS.darkHigh)).toBeLessThan(0.24);
    expect(golfColorLuminance(GOLF_GREEN_COLORS.darkHigh)).toBeLessThan(0.1);
    expect(golfColorChroma(GOLF_GREEN_COLORS.lightHigh)).toBeGreaterThan(0.24);
    expect(golfColorChroma(GOLF_GREEN_COLORS.darkHigh)).toBeGreaterThan(0.018);
    expect(GOLF_GREEN_COLORS.darkHigh[1]).toBeGreaterThan(
      GOLF_GREEN_COLORS.darkHigh[0] * 2,
    );
    expect(GOLF_GREEN_FOG_SCALE.light).toBeLessThan(0.6);
    expect(GOLF_GREEN_FOG_SCALE.dark).toBeLessThan(GOLF_GREEN_FOG_SCALE.light);
    expect(golfLinearToSrgb(GOLF_DARK_GREEN_FINAL_CEILING[1])).toBeLessThan(
      0.3,
    );
  });

  it("uses a complete fixed pastel rainbow instead of runtime instance colors", () => {
    expect(GOLF_CONFETTI_COLORS).toHaveLength(8);
    expect(new Set(GOLF_CONFETTI_COLORS).size).toBe(8);
    expect(GOLF_CONFETTI_COLORS).not.toContain("#000000");
  });

  it("finishes the clubhead and shaft as cool silver metal", () => {
    expect(GOLF_CLUB_FINISH.light).toBe("#b8c2c9");
    expect(GOLF_CLUB_FINISH.dark).toBe("#87949e");
    expect(GOLF_CLUB_FINISH.metalness).toBeGreaterThan(0.7);
    expect(GOLF_CLUB_FINISH.roughness).toBeLessThan(0.35);
  });

  it("keeps dark golf balls bright and clear of scene fog", () => {
    expect(GOLF_BALL_FINISH.dark).toBe("#d8dfe2");
    expect(GOLF_BALL_FINISH.darkMark).toBe("#34434b");
    expect(GOLF_BALL_FINISH.darkRoughness).toBeLessThan(0.7);
    expect(GOLF_BALL_FINISH.fog).toBe(false);
  });

  it("softens the in-flight shrink only at low render resolution", () => {
    expect(golfBallResolutionScale(2)).toBe(1);
    expect(golfBallResolutionScale(1)).toBe(1);
    expect(golfBallResolutionScale(0.8)).toBeCloseTo(1.075);
    expect(golfBallResolutionScale(0.6)).toBe(GOLF_BALL_LOW_RES_MAX_SCALE);
    expect(golfBallResolutionScale(0.4)).toBe(GOLF_BALL_LOW_RES_MAX_SCALE);
    expect(golfBallRenderedScale(1, 0.6)).toBe(1);
    expect(golfBallRenderedScale(GOLF_GREEN_BALL_SCALE, 1)).toBe(
      GOLF_GREEN_BALL_SCALE,
    );
    expect(
      golfBallRenderedScale(GOLF_GREEN_BALL_SCALE, 0.6),
    ).toBeCloseTo(GOLF_GREEN_BALL_SCALE * GOLF_BALL_LOW_RES_MAX_SCALE);
  });

  it("does not let scene fog recolor the flag or pastel confetti", () => {
    expect(GOLF_FOG_POLICY.flag(false)).toBe(false);
    expect(GOLF_FOG_POLICY.flag(true)).toBe(false);
    expect(GOLF_FOG_POLICY.confetti).toBe(false);
  });

  it("keeps a restrained turf impact without bounce or cheering recordings", () => {
    expect(GOLF_SOUND_POLICY.turfImpact).toBe(true);
    expect(GOLF_SOUND_POLICY.cheer).toBe(false);
  });

  it("keeps fast physical backspin legible instead of aliasing between frames", () => {
    const fast = golfVisualSpinStep({ x: 160, y: 0, z: 0 }, 1 / 60);
    const rolling = golfVisualSpinStep({ x: 20, y: 0, z: 0 }, 1 / 60);
    expect(fast.x).toBeGreaterThan(0.5);
    expect(fast.x).toBeLessThan(1);
    expect(rolling.x).toBeCloseTo(20 / 60, 5);
  });

  it("shrinks the foreground ball to two-thirds size by the green", () => {
    const start = { x: 0, y: 0.05, z: 0 };
    const cup = { x: 0, y: 0, z: -12 };
    const ball = {
      phase: "flight" as const,
      start,
      position: { ...start },
      impacts: 0,
    };
    expect(golfBallVisualScale(ball, cup)).toBe(1);
    ball.position.z = -4.5;
    expect(golfBallVisualScale(ball, cup)).toBeLessThan(1);
    expect(golfBallVisualScale(ball, cup)).toBeGreaterThan(
      GOLF_GREEN_BALL_SCALE,
    );
    ball.position.z = -9;
    expect(golfBallVisualScale(ball, cup)).toBeCloseTo(GOLF_GREEN_BALL_SCALE);
    ball.impacts = 1;
    ball.position.z = -7;
    expect(golfBallVisualScale(ball, cup)).toBeCloseTo(GOLF_GREEN_BALL_SCALE);
  });
});

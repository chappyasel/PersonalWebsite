import { afterEach, describe, expect, it } from "vitest";

import {
  DEVELOP_IDENTITY,
  HUE_BANDS,
  SCENE_GRADE_PROFILES,
  SCENE_GRADE_PROFILE_DEFAULT,
  developDisplay,
  developIsIdentity,
  gradeProfileFromSearch,
  gradeValuesJson,
  hueBandWeights,
  mixerIsIdentity,
  sceneGradeLookFor,
  sceneGradeProfileController,
  sceneGradeProfileValues,
  sceneGradeUrl,
} from "./sceneGradeProfiles";
import {
  CINEMATIC_PLUS_SCENE_COLOR_GRADE,
  DEFAULT_SCENE_COLOR_GRADE,
} from "./sceneColorGrade";

// The Lightroom match was fitted in NumPy against the owner's graded frame.
// These are that model's outputs for sixteen probe colours under the fitted
// parameters, rounded to five places. `developDisplay` is the CPU reference
// the shader transcribes, so if it drifts from the model that produced the
// numbers in SCENE_GRADE_PROFILES.lightroom, the profile stops meaning what
// its comment says.
const LIGHTROOM_MODEL_SAMPLES: ReadonlyArray<
  readonly [
    readonly [number, number, number],
    readonly [number, number],
    readonly [number, number, number],
  ]
> = [
  [[0.05, 0.05, 0.05], [0.0, 0.0], [0.01588, 0.0141, 0.01191]],
  [[0.5, 0.5, 0.5], [0.8, 0.6], [0.47999, 0.43913, 0.38751]],
  [[0.95, 0.95, 0.95], [-0.95, 0.9], [0.78863, 0.77921, 0.74073]],
  [[0.9, 0.2, 0.1], [0.3, -0.2], [1.0, 0.16505, 0.0]],
  [[0.2, 0.8, 0.2], [0.0, 0.0], [0.0, 0.75494, 0.1691]],
  [[0.2, 0.3, 0.9], [0.8, 0.6], [0.0, 0.25191, 0.81604]],
  [[0.9, 0.8, 0.1], [-0.95, 0.9], [0.78863, 0.71708, 0.0]],
  [[0.1, 0.8, 0.9], [0.3, -0.2], [0.0, 0.92743, 0.75043]],
  [[0.7, 0.2, 0.8], [0.0, 0.0], [0.79661, 0.0, 0.85035]],
  [[0.42, 0.51, 0.31], [0.8, 0.6], [0.31997, 0.43599, 0.10189]],
  [[0.59, 0.69, 0.82], [-0.95, 0.9], [0.43546, 0.56787, 0.64698]],
  [[0.57, 0.66, 0.69], [0.3, -0.2], [0.60878, 0.66362, 0.63432]],
  [[0.8, 0.6, 0.4], [0.0, 0.0], [0.93412, 0.59797, 0.20291]],
  [[0.3, 0.4, 0.2], [0.8, 0.6], [0.17032, 0.31731, 0.0]],
  [[0.95, 0.9, 0.7], [-0.95, 0.9], [0.78863, 0.75381, 0.4248]],
  [[0.15, 0.2, 0.35], [0.3, -0.2], [0.0, 0.1116, 0.2798]],
];

describe("the develop stage on the CPU", () => {
  it("is the identity when every value is at identity", () => {
    for (const [input, frame] of LIGHTROOM_MODEL_SAMPLES) {
      const out = developDisplay([...input], DEVELOP_IDENTITY, frame);
      out.forEach((c, i) => expect(c).toBeCloseTo(input[i]!, 6));
    }
    expect(developIsIdentity(DEVELOP_IDENTITY)).toBe(true);
    expect(
      developIsIdentity(SCENE_GRADE_PROFILES.lightroom.values.develop.light),
    ).toBe(false);
  });

  it("reproduces the fitted Lightroom model to within a display step", () => {
    const fitted = SCENE_GRADE_PROFILES.lightroom.values.develop.light;
    for (const [input, frame, expected] of LIGHTROOM_MODEL_SAMPLES) {
      const out = developDisplay([...input], fitted, frame);
      out.forEach((c, i) =>
        expect(Math.abs(c - expected[i]!)).toBeLessThan(2 / 255),
      );
    }
  });

  it("partitions hue between neighbouring bands", () => {
    for (const hue of [0, 0.05, 0.2, 0.41, 0.55, 0.7, 0.9]) {
      const weights = hueBandWeights(hue);
      expect(weights.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 6);
      expect(weights.filter((w) => w > 0).length).toBeLessThanOrEqual(2);
    }
    // Pure green sits on its own centre.
    expect(hueBandWeights(1 / 3)[HUE_BANDS.indexOf("green")]).toBeCloseTo(
      1,
      6,
    );
  });

  it("leaves neutrals alone in the mixer", () => {
    const fitted = SCENE_GRADE_PROFILES.lightroom.values.develop.light;
    const grey = developDisplay([0.5, 0.5, 0.5], fitted, null);
    // The white balance warms it; the mixer must not tint it further, so
    // the result is still a single hue ramp with no channel crossing.
    expect(grey[0]).toBeGreaterThan(grey[1]);
    expect(grey[1]).toBeGreaterThan(grey[2]);
  });
});

describe("grade profiles", () => {
  afterEach(() => sceneGradeProfileController.reset());

  it("ships a mixer-free develop on top of whichever print grade the mode uses", () => {
    const snapshot = sceneGradeProfileController.getSnapshot();
    expect(snapshot).toBe(SCENE_GRADE_PROFILE_DEFAULT);
    const plain = sceneGradeLookFor(snapshot, DEFAULT_SCENE_COLOR_GRADE);
    const plus = sceneGradeLookFor(snapshot, CINEMATIC_PLUS_SCENE_COLOR_GRADE);
    expect(plain.base).toEqual(DEFAULT_SCENE_COLOR_GRADE);
    expect(plus.base).toEqual(CINEMATIC_PLUS_SCENE_COLOR_GRADE);
    // The live room never runs the mixer: it rings the additive motes.
    for (const theme of ["light", "dark"] as const) {
      expect(developIsIdentity(plain.develop[theme])).toBe(false);
      expect(mixerIsIdentity(plain.develop[theme])).toBe(true);
      expect(mixerIsIdentity(SCENE_GRADE_PROFILES.bolder.values.develop[theme])).toBe(true);
      expect(SCENE_GRADE_PROFILES.flat.values.develop[theme]).toBe(DEVELOP_IDENTITY);
    }
  });

  it("keeps the Lightroom fit light-only", () => {
    const { develop } = SCENE_GRADE_PROFILES.lightroom.values;
    expect(developIsIdentity(develop.light)).toBe(false);
    expect(develop.dark).toBe(DEVELOP_IDENTITY);
  });

  it("forks into Custom from the profile being left, then keeps it", () => {
    sceneGradeProfileController.setProfile("bolder");
    sceneGradeProfileController.updateDevelop("light", { exposure: -0.2 });

    let snapshot = sceneGradeProfileController.getSnapshot();
    expect(snapshot.profile).toBe("custom");
    expect(snapshot.custom?.develop.light.exposure).toBe(-0.2);
    expect(snapshot.custom?.develop.light.contrast).toBe(
      SCENE_GRADE_PROFILES.bolder.values.develop.light.contrast,
    );
    expect(snapshot.custom?.develop.dark).toBe(
      SCENE_GRADE_PROFILES.bolder.values.develop.dark,
    );

    sceneGradeProfileController.setProfile("lightroom");
    sceneGradeProfileController.setProfile("custom");
    snapshot = sceneGradeProfileController.getSnapshot();
    expect(snapshot.custom?.develop.light.exposure).toBe(-0.2);
  });

  it("edits one mixer band of one theme", () => {
    sceneGradeProfileController.setBand("blue");
    sceneGradeProfileController.updateMixer("dark", "blue", { sat: 0.4 });

    const values = sceneGradeProfileValues(
      sceneGradeProfileController.getSnapshot(),
    );
    expect(values.develop.dark.mixer.blue).toEqual({
      hue: 0,
      sat: 0.4,
      lum: 0,
    });
    expect(values.develop.dark.mixer.green).toEqual(
      DEVELOP_IDENTITY.mixer.green,
    );
    // Forked from Shipped, so the other theme is Shipped's own develop.
    expect(values.develop.light).toBe(
      SCENE_GRADE_PROFILES.shipped.values.develop.light,
    );
  });

  it("round-trips a tuned look through the URL", () => {
    sceneGradeProfileController.setProfile("lightroom");
    sceneGradeProfileController.updateDevelop("light", { vignette: -0.5 });
    sceneGradeProfileController.updateMixer("dark", "aqua", { hue: 0.25 });
    const snapshot = sceneGradeProfileController.getSnapshot();

    const url = sceneGradeUrl("https://example.test/?screenshot=1", snapshot);
    const seeded = gradeProfileFromSearch(new URL(url).search);

    expect(new URL(url).searchParams.get("screenshot")).toBe("1");
    expect(seeded?.profile).toBe("custom");
    expect(seeded?.custom?.develop.light.vignette).toBe(-0.5);
    expect(seeded?.custom?.develop.light.temp).toBe(
      SCENE_GRADE_PROFILES.lightroom.values.develop.light.temp,
    );
    expect(seeded?.custom?.develop.dark.mixer.aqua.hue).toBe(0.25);
  });

  it("names a profile in the URL and ignores what it cannot read", () => {
    expect(gradeProfileFromSearch("?grade=bolder")).toEqual({
      profile: "bolder",
      custom: null,
    });
    expect(gradeProfileFromSearch("?grade=vivid")).toBeNull();
    expect(gradeProfileFromSearch("?quality=cinematic")).toBeNull();
    expect(
      gradeProfileFromSearch("?grade=custom&grade-values=%7Bnot-json"),
    ).toEqual({ profile: "custom", custom: null });
    const sloppy = gradeProfileFromSearch(
      `?grade=custom&grade-values=${encodeURIComponent(
        JSON.stringify({
          develop: {
            light: { exposure: "loud", contrast: 0.3, mixer: { green: { sat: 1 } } },
          },
        }),
      )}`,
    );
    expect(sloppy?.custom?.develop.light.exposure).toBe(0);
    expect(sloppy?.custom?.develop.light.contrast).toBe(0.3);
    expect(sloppy?.custom?.develop.light.mixer.green.sat).toBe(1);
    expect(sloppy?.custom?.develop.dark).toEqual(DEVELOP_IDENTITY);
  });

  it("writes only the values that moved", () => {
    const flat = JSON.parse(
      gradeValuesJson(SCENE_GRADE_PROFILES.flat.values),
    ) as { develop: { light: object; dark: object } };
    expect(flat.develop.light).toEqual({});
    expect(flat.develop.dark).toEqual({});

    const lightroom = JSON.parse(
      gradeValuesJson(SCENE_GRADE_PROFILES.lightroom.values),
    ) as { develop: { light: Record<string, unknown>; dark: object } };
    expect(lightroom.develop.light.temp).toBe(0.704);
    expect(lightroom.develop.light).toHaveProperty("mixer.green.lum", -0.278);
    expect(lightroom.develop.dark).toEqual({});
  });

  it("seeds once from the URL and resets to shipped", () => {
    sceneGradeProfileController.seed("?grade=bolder");
    expect(sceneGradeProfileController.getSnapshot().profile).toBe("bolder");
    sceneGradeProfileController.seed("?nothing");
    expect(sceneGradeProfileController.getSnapshot().profile).toBe("bolder");
    sceneGradeProfileController.reset();
    expect(sceneGradeProfileController.getSnapshot()).toBe(
      SCENE_GRADE_PROFILE_DEFAULT,
    );
  });
});

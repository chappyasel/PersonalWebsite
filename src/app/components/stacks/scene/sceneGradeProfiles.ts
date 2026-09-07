"use client";

// Grade profiles: named looks the Scene console can put on the room, and the
// develop stage they drive.
//
// The print grade (sceneColorGrade.ts, GRADE_FRAGMENT in Effects.tsx) stays
// exactly what it is. A profile adds a second, Lightroom-shaped stage after
// it, in display space, with the controls a photographer expects: exposure,
// white balance, the six tone sliders, vibrance and saturation, an
// eight-band colour mixer, and a post vignette.
//
// "Shipped" is what every visitor sees since 2026-09-06: a constrained
// develop with no mixer. "Flat" is that stage at identity, the print as it
// was before, kept so the two can be compared. "Bolder" is one step toward
// the owner's Lightroom pass, still without the mixer.
//
// "Lightroom match" is not authored by eye. The owner graded a Cinematic+
// screenshot in Lightroom; the two frames were compared pixel for pixel and
// the develop parameters below were fitted to that pair by least squares
// (RMSE at the floor a 25^3 colour LUT reaches on the same pair, so the
// parametric model loses nothing a global colour map could keep). The fit is
// against a light-theme frame; dark stays at identity under that profile.
// It uses the mixer, and the mixer rings the additive sky motes and bands
// cloud edges in the live room, so it is a still-frame profile.
//
// Session-only like every diagnostics override: nothing here is persisted,
// and a reload without `?grade=` returns the shipped print.
import { useSyncExternalStore } from "react";

import {
  type SceneColorGradeSettings,
  type SceneColorGradeTheme,
  type SceneColorGradeThemeSettings,
} from "./sceneColorGrade";

export const GRADE_PARAM = "grade";
export const GRADE_VALUES_PARAM = "grade-values";

export const HUE_BANDS = [
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
  "magenta",
] as const;
export type HueBand = (typeof HUE_BANDS)[number];

/** Band centres in degrees, Lightroom's eight. The weights form a triangular
 * partition of unity between neighbouring centres, so the mixer never adds
 * or removes chroma between bands. */
export const HUE_BAND_CENTERS: Readonly<Record<HueBand, number>> =
  Object.freeze({
    red: 0,
    orange: 30,
    yellow: 60,
    green: 120,
    aqua: 180,
    blue: 240,
    purple: 270,
    magenta: 300,
  });

export type HueBandAdjust = Readonly<{
  /** 1 == 60 degrees toward the next band. */
  hue: number;
  /** Multiplier on saturation: +1 is 2.5x, -1 removes it. */
  sat: number;
  /** Multiplier on value: +1 is 1.5x, -1 halves it. */
  lum: number;
}>;

export type SceneDevelopSettings = Readonly<{
  /** Stops, applied in linear display light. */
  exposure: number;
  /** Positive is warmer, like the Lightroom slider. */
  temp: number;
  /** Positive is magenta. */
  tint: number;
  contrast: number;
  blacks: number;
  whites: number;
  shadows: number;
  highlights: number;
  saturation: number;
  vibrance: number;
  /** Negative darkens the corners, like Lightroom's post-crop amount. */
  vignette: number;
  /** Frame radius where the vignette starts, 0.2 (nearly everywhere) to 0.9
   * (corners only). */
  vignetteMidpoint: number;
  mixer: Readonly<Record<HueBand, HueBandAdjust>>;
}>;

export type SceneDevelopSliderKey = Exclude<
  keyof SceneDevelopSettings,
  "mixer"
>;
export const DEVELOP_SLIDER_KEYS: readonly SceneDevelopSliderKey[] = [
  "exposure",
  "temp",
  "tint",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "vibrance",
  "saturation",
  "vignette",
  "vignetteMidpoint",
];

export const HUE_BAND_IDENTITY: HueBandAdjust = Object.freeze({
  hue: 0,
  sat: 0,
  lum: 0,
});

const identityMixer = () =>
  Object.freeze(
    Object.fromEntries(HUE_BANDS.map((band) => [band, HUE_BAND_IDENTITY])),
  ) as Readonly<Record<HueBand, HueBandAdjust>>;

export const DEVELOP_IDENTITY: SceneDevelopSettings = Object.freeze({
  exposure: 0,
  temp: 0,
  tint: 0,
  contrast: 0,
  blacks: 0,
  whites: 0,
  shadows: 0,
  highlights: 0,
  saturation: 0,
  vibrance: 0,
  vignette: 0,
  vignetteMidpoint: 0.5,
  mixer: identityMixer(),
});

export function mixerIsIdentity(settings: SceneDevelopSettings) {
  for (const band of HUE_BANDS) {
    const adjust = settings.mixer[band];
    if (adjust.hue !== 0 || adjust.sat !== 0 || adjust.lum !== 0) return false;
  }
  return true;
}

export function developIsIdentity(settings: SceneDevelopSettings) {
  for (const key of DEVELOP_SLIDER_KEYS)
    if (settings[key] !== DEVELOP_IDENTITY[key]) return false;
  return mixerIsIdentity(settings);
}

function develop(
  sliders: Partial<Omit<SceneDevelopSettings, "mixer">>,
  mixer: Partial<Record<HueBand, Partial<HueBandAdjust>>> = {},
): SceneDevelopSettings {
  return Object.freeze({
    ...DEVELOP_IDENTITY,
    ...sliders,
    mixer: Object.freeze(
      Object.fromEntries(
        HUE_BANDS.map((band) => [
          band,
          Object.freeze({ ...HUE_BAND_IDENTITY, ...mixer[band] }),
        ]),
      ),
    ) as Readonly<Record<HueBand, HueBandAdjust>>,
  });
}

export type SceneDevelopByTheme = Readonly<
  Record<SceneColorGradeTheme, SceneDevelopSettings>
>;

/** A profile's values: partial overrides on the print grade the quality mode
 * already prints with, and a complete develop stage per theme. Overrides
 * rather than a full base so a profile follows the Cinematic+ swap. */
export type SceneGradeProfileValues = Readonly<{
  base: Readonly<
    Record<SceneColorGradeTheme, Partial<SceneColorGradeThemeSettings>>
  >;
  develop: SceneDevelopByTheme;
}>;

/** What the composer renders with: the resolved print grade and the develop
 * stage for each theme. */
export type SceneGradeLook = Readonly<{
  base: SceneColorGradeSettings;
  develop: SceneDevelopByTheme;
}>;

export const SCENE_GRADE_PROFILE_IDS = [
  "shipped",
  "bolder",
  "lightroom",
  "flat",
  "custom",
] as const;
export type SceneGradeProfileId = (typeof SCENE_GRADE_PROFILE_IDS)[number];
export type NamedGradeProfileId = Exclude<SceneGradeProfileId, "custom">;

export function isSceneGradeProfileId(
  value: unknown,
): value is SceneGradeProfileId {
  return (SCENE_GRADE_PROFILE_IDS as readonly unknown[]).includes(value);
}

export type SceneGradeProfile = Readonly<{
  id: NamedGradeProfileId;
  label: string;
  help: string;
  values: SceneGradeProfileValues;
}>;

const NO_BASE_OVERRIDES = Object.freeze({
  light: Object.freeze({}),
  dark: Object.freeze({}),
});

/** Fitted against the owner's Lightroom pass on a Cinematic+ light frame
 * (scratch fit, 2026-09-06). The eight-band mixer carries most of the colour
 * work: his pass pulled the grass darker and toward teal, and pushed the sky
 * a long way into saturated cyan-blue, which no global slider reaches. */
const LIGHTROOM_DEVELOP_LIGHT = develop(
  {
    exposure: -0.866,
    temp: 0.704,
    tint: 0.055,
    contrast: 0.616,
    blacks: -0.019,
    whites: 0.667,
    shadows: 0.122,
    highlights: 0.06,
    saturation: 0.04,
    vibrance: -0.255,
    vignette: -0.222,
    vignetteMidpoint: 0.578,
  },
  {
    red: { hue: 0.056, sat: 0.062, lum: 0.007 },
    orange: { hue: 0.078, sat: 0.185, lum: 0.046 },
    yellow: { hue: 0.03, sat: 0.464, lum: 0.071 },
    green: { hue: 0.285, sat: 0.18, lum: -0.278 },
    aqua: { hue: -0.228, sat: 0.667, lum: 0.056 },
    blue: { hue: -0.167, sat: 0.667, lum: 0.053 },
    purple: { hue: 0.315, sat: 0.005, lum: -0.195 },
    magenta: { hue: -0.109, sat: 0.237, lum: 0.087 },
  },
);

/** The shipped develop: what the Lightroom pass gets right, kept small. The
 * warmer key, real blacks under the fog lift, a touch of contrast and
 * vibrance, and a soft vignette. No colour mixer, on purpose: a first cut
 * carried the pass's per-band saturation at two thirds strength and the
 * owner rejected it as far too vibrant, with rings around the motes and torn
 * cloud edges. The mixer only acts above a saturation gate, so a white mote
 * or cloud fading into blue sky crosses the gate and wears a band of boosted
 * blue. Keeping every band at zero also lets the shader skip that block.
 * Dark gets a quieter version of the same sliders. */
const SHIPPED_DEVELOP_LIGHT = develop({
  exposure: -0.25,
  temp: 0.3,
  tint: 0.02,
  contrast: 0.22,
  blacks: -0.1,
  whites: 0.2,
  shadows: 0.05,
  highlights: -0.05,
  vibrance: 0.12,
  vignette: -0.14,
  vignetteMidpoint: 0.6,
});

const SHIPPED_DEVELOP_DARK = develop({
  exposure: -0.05,
  temp: 0.08,
  contrast: 0.12,
  blacks: -0.06,
  whites: 0.1,
  vibrance: 0.05,
  vignette: -0.08,
  vignetteMidpoint: 0.6,
});

/** Roughly halfway from the shipped sliders to the Lightroom pass's global
 * ones, still without the mixer, so the sky keeps its own blue and nothing
 * can ring. */
const BOLDER_DEVELOP_LIGHT = develop({
  exposure: -0.45,
  temp: 0.45,
  tint: 0.03,
  contrast: 0.38,
  blacks: -0.1,
  whites: 0.38,
  shadows: 0.08,
  highlights: -0.02,
  saturation: 0.06,
  vibrance: 0.06,
  vignette: -0.18,
  vignetteMidpoint: 0.58,
});

const BOLDER_DEVELOP_DARK = develop({
  exposure: -0.08,
  temp: 0.12,
  contrast: 0.18,
  blacks: -0.08,
  whites: 0.15,
  vibrance: 0.06,
  vignette: -0.1,
  vignetteMidpoint: 0.6,
});

export const SCENE_GRADE_PROFILES: Readonly<
  Record<NamedGradeProfileId, SceneGradeProfile>
> = Object.freeze({
  shipped: Object.freeze({
    id: "shipped",
    label: "Shipped",
    help: "What visitors see: a constrained develop after the print grade. Warmer key, real blacks, a touch of contrast and vibrance, a soft vignette, no colour mixer. Dark gets a quieter version.",
    values: Object.freeze({
      base: NO_BASE_OVERRIDES,
      develop: Object.freeze({
        light: SHIPPED_DEVELOP_LIGHT,
        dark: SHIPPED_DEVELOP_DARK,
      }),
    }),
  }),
  bolder: Object.freeze({
    id: "bolder",
    label: "Bolder",
    help: "One step from Shipped toward the Lightroom pass: more warmth, contrast, and whites, a little saturation, a deeper vignette. Still no colour mixer.",
    values: Object.freeze({
      base: NO_BASE_OVERRIDES,
      develop: Object.freeze({
        light: BOLDER_DEVELOP_LIGHT,
        dark: BOLDER_DEVELOP_DARK,
      }),
    }),
  }),
  lightroom: Object.freeze({
    id: "lightroom",
    label: "Lightroom match",
    help: "Fitted pixel for pixel to the owner's Lightroom pass on a Cinematic+ screenshot. Light theme only; dark stays at identity. Its mixer rings the sky motes in the live room, so treat it as a still-frame look.",
    values: Object.freeze({
      base: NO_BASE_OVERRIDES,
      develop: Object.freeze({
        light: LIGHTROOM_DEVELOP_LIGHT,
        dark: DEVELOP_IDENTITY,
      }),
    }),
  }),
  flat: Object.freeze({
    id: "flat",
    label: "Flat",
    help: "The develop stage at identity: the print grade alone, as it shipped before 2026-09-06.",
    values: Object.freeze({
      base: NO_BASE_OVERRIDES,
      develop: Object.freeze({
        light: DEVELOP_IDENTITY,
        dark: DEVELOP_IDENTITY,
      }),
    }),
  }),
});

export function resolveSceneGradeLook(
  values: SceneGradeProfileValues,
  base: SceneColorGradeSettings,
): SceneGradeLook {
  return {
    base: {
      light: { ...base.light, ...values.base.light },
      dark: { ...base.dark, ...values.base.dark },
    },
    develop: values.develop,
  };
}

export type SceneGradeProfileSnapshot = Readonly<{
  profile: SceneGradeProfileId;
  /** The custom values, or null until the owner first forks a profile. */
  custom: SceneGradeProfileValues | null;
  /** The mixer band the console's three band sliders edit. */
  band: HueBand;
}>;

export const SCENE_GRADE_PROFILE_DEFAULT: SceneGradeProfileSnapshot =
  Object.freeze({
    profile: "shipped",
    custom: null,
    band: "green",
  });

/** The profile values in force for a snapshot. Custom with nothing forked
 * yet reads as Shipped, which is also what the `custom` fork seeds from. */
export function sceneGradeProfileValues(
  snapshot: SceneGradeProfileSnapshot,
): SceneGradeProfileValues {
  if (snapshot.profile === "custom")
    return snapshot.custom ?? SCENE_GRADE_PROFILES.shipped.values;
  return SCENE_GRADE_PROFILES[snapshot.profile].values;
}

export function sceneGradeLookFor(
  snapshot: SceneGradeProfileSnapshot,
  base: SceneColorGradeSettings,
): SceneGradeLook {
  return resolveSceneGradeLook(sceneGradeProfileValues(snapshot), base);
}

/** The theme whose develop values the console sliders read and write. The
 * registry has no React context, so it reads the document like the shade
 * probe does. */
export function activeGradeTheme(): SceneColorGradeTheme {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Reads a develop stage out of untrusted JSON, taking only the keys it
 * knows and only finite numbers, so a hand-edited URL can misspell a slider
 * without poisoning the shader. Anything unreadable falls back to identity. */
export function developFromJson(value: unknown): SceneDevelopSettings {
  if (!value || typeof value !== "object") return DEVELOP_IDENTITY;
  const record = value as Record<string, unknown>;
  const sliders: Partial<Record<SceneDevelopSliderKey, number>> = {};
  for (const key of DEVELOP_SLIDER_KEYS) {
    const raw = record[key];
    if (isFiniteNumber(raw)) sliders[key] = raw;
  }
  const mixer: Partial<Record<HueBand, Partial<HueBandAdjust>>> = {};
  const rawMixer =
    record.mixer && typeof record.mixer === "object"
      ? (record.mixer as Record<string, unknown>)
      : {};
  for (const band of HUE_BANDS) {
    const raw = rawMixer[band];
    if (!raw || typeof raw !== "object") continue;
    const adjust = raw as Record<string, unknown>;
    mixer[band] = {
      ...(isFiniteNumber(adjust.hue) ? { hue: adjust.hue } : {}),
      ...(isFiniteNumber(adjust.sat) ? { sat: adjust.sat } : {}),
      ...(isFiniteNumber(adjust.lum) ? { lum: adjust.lum } : {}),
    };
  }
  return develop(sliders, mixer);
}

export function gradeValuesFromJson(
  value: unknown,
): SceneGradeProfileValues | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const developRecord =
    record.develop && typeof record.develop === "object"
      ? (record.develop as Record<string, unknown>)
      : null;
  if (!developRecord) return null;
  return Object.freeze({
    base: NO_BASE_OVERRIDES,
    develop: Object.freeze({
      light: developFromJson(developRecord.light),
      dark: developFromJson(developRecord.dark),
    }),
  });
}

/** A profile named in the URL. `?grade=custom` on its own is Shipped under
 * the custom name; with `grade-values` it carries the whole develop stage,
 * which is how a tuned look travels to a second browser or a headless
 * capture. */
export function gradeProfileFromSearch(
  search: string | URLSearchParams,
): Pick<SceneGradeProfileSnapshot, "profile" | "custom"> | null {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const raw = params.get(GRADE_PARAM);
  if (raw === null) return null;
  if (!isSceneGradeProfileId(raw)) return null;
  if (raw !== "custom") return { profile: raw, custom: null };
  const values = params.get(GRADE_VALUES_PARAM);
  let custom: SceneGradeProfileValues | null = null;
  if (values !== null) {
    try {
      custom = gradeValuesFromJson(JSON.parse(values));
    } catch {
      custom = null;
    }
  }
  return { profile: "custom", custom };
}

/** Compact JSON of the develop stage the owner has tuned, for pasting into a
 * note or handing to whoever makes it the shipped grade. Only non-identity
 * sliders and bands are written, so the text stays readable. */
export function gradeValuesJson(values: SceneGradeProfileValues) {
  const themes: Record<string, unknown> = {};
  for (const theme of ["light", "dark"] as const) {
    const settings = values.develop[theme];
    const sliders: Record<string, number> = {};
    for (const key of DEVELOP_SLIDER_KEYS)
      if (settings[key] !== DEVELOP_IDENTITY[key])
        sliders[key] = round3(settings[key]);
    const mixer: Record<string, Record<string, number>> = {};
    for (const band of HUE_BANDS) {
      const adjust = settings.mixer[band];
      const entry: Record<string, number> = {};
      if (adjust.hue !== 0) entry.hue = round3(adjust.hue);
      if (adjust.sat !== 0) entry.sat = round3(adjust.sat);
      if (adjust.lum !== 0) entry.lum = round3(adjust.lum);
      if (Object.keys(entry).length > 0) mixer[band] = entry;
    }
    themes[theme] = {
      ...sliders,
      ...(Object.keys(mixer).length > 0 ? { mixer } : {}),
    };
  }
  return JSON.stringify({ develop: themes });
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** The URL that reproduces the current grade, alongside whatever else the
 * page already carries (screenshot mode, quality). */
export function sceneGradeUrl(
  href: string,
  snapshot: SceneGradeProfileSnapshot,
) {
  const url = new URL(href);
  url.searchParams.delete(GRADE_PARAM);
  url.searchParams.delete(GRADE_VALUES_PARAM);
  if (snapshot.profile !== "shipped") {
    url.searchParams.set(GRADE_PARAM, snapshot.profile);
    if (snapshot.profile === "custom" && snapshot.custom)
      url.searchParams.set(
        GRADE_VALUES_PARAM,
        gradeValuesJson(snapshot.custom),
      );
  }
  return url.toString();
}

class SceneGradeProfileController {
  private snapshot: SceneGradeProfileSnapshot = SCENE_GRADE_PROFILE_DEFAULT;
  private listeners = new Set<() => void>();

  readonly getSnapshot = () => this.snapshot;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(next: SceneGradeProfileSnapshot) {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  setProfile(profile: SceneGradeProfileId) {
    if (this.snapshot.profile === profile) return;
    // Entering Custom for the first time starts from the look being left,
    // so "tune Recommended a little" is one slider away rather than a
    // rebuild from identity. A custom already tuned is kept.
    const custom =
      profile === "custom" && this.snapshot.custom === null
        ? sceneGradeProfileValues(this.snapshot)
        : this.snapshot.custom;
    this.publish({ ...this.snapshot, profile, custom });
  }

  /** Touching any slider forks the active profile into Custom, like moving
   * a slider under a Lightroom preset. */
  private fork(): SceneGradeProfileValues {
    if (this.snapshot.profile === "custom" && this.snapshot.custom)
      return this.snapshot.custom;
    return sceneGradeProfileValues(this.snapshot);
  }

  private publishCustom(custom: SceneGradeProfileValues) {
    this.publish({ ...this.snapshot, profile: "custom", custom });
  }

  updateDevelop(
    theme: SceneColorGradeTheme,
    patch: Partial<Omit<SceneDevelopSettings, "mixer">>,
  ) {
    const values = this.fork();
    const current = values.develop[theme];
    const next = { ...current, ...patch };
    if (
      this.snapshot.profile === "custom" &&
      DEVELOP_SLIDER_KEYS.every((key) => Object.is(next[key], current[key]))
    )
      return;
    this.publishCustom({
      ...values,
      develop: { ...values.develop, [theme]: next },
    });
  }

  updateMixer(
    theme: SceneColorGradeTheme,
    band: HueBand,
    patch: Partial<HueBandAdjust>,
  ) {
    const values = this.fork();
    const current = values.develop[theme];
    const adjust = { ...current.mixer[band], ...patch };
    if (
      this.snapshot.profile === "custom" &&
      Object.is(adjust.hue, current.mixer[band].hue) &&
      Object.is(adjust.sat, current.mixer[band].sat) &&
      Object.is(adjust.lum, current.mixer[band].lum)
    )
      return;
    this.publishCustom({
      ...values,
      develop: {
        ...values.develop,
        [theme]: {
          ...current,
          mixer: { ...current.mixer, [band]: adjust },
        },
      },
    });
  }

  setBand(band: HueBand) {
    if (this.snapshot.band === band) return;
    this.publish({ ...this.snapshot, band });
  }

  /** Seed from the URL once, at canvas mount, like screenshot mode. */
  seed(search: string | URLSearchParams) {
    const seeded = gradeProfileFromSearch(search);
    if (!seeded) return;
    this.publish({ ...this.snapshot, ...seeded });
  }

  reset() {
    if (this.snapshot === SCENE_GRADE_PROFILE_DEFAULT) return;
    this.publish(SCENE_GRADE_PROFILE_DEFAULT);
  }
}

export const sceneGradeProfileController = new SceneGradeProfileController();

/** Every reader of this hook lives inside the canvas or the console drawer,
 * neither of which is server-rendered, so the live snapshot doubles as the
 * server snapshot, as the print grade's hook does. */
export function useSceneGradeProfile() {
  return useSyncExternalStore(
    sceneGradeProfileController.subscribe,
    sceneGradeProfileController.getSnapshot,
    sceneGradeProfileController.getSnapshot,
  );
}

// ---------------------------------------------------------------------------
// The develop stage on the CPU. This is the reference the shader in
// Effects.tsx (DEVELOP_GLSL) is a transcription of, and what the shade probe
// runs so its readings stay honest under a profile. The numbers in it are
// the model the Lightroom fit was made with; change one here and the fitted
// profile above no longer means what it says.

const LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];
type Rgb = [number, number, number];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const luma = (rgb: Rgb) =>
  rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2];
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function rgbToHsv(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const v = max;
  const s = max > 1e-6 ? delta / max : 0;
  if (delta <= 1e-6) return [0, s, v];
  let h: number;
  if (max === r) h = ((((g - b) / delta) % 6) + 6) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return [h / 6, s, v];
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const h6 = (((h % 1) + 1) % 1) * 6;
  const i = Math.floor(h6) % 6;
  const f = h6 - Math.floor(h6);
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  switch (i) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

const BAND_CENTERS_TURNS = HUE_BANDS.map(
  (band) => HUE_BAND_CENTERS[band] / 360,
);

/** Triangular weights over the eight band centres for a hue in turns. */
export function hueBandWeights(hue: number): number[] {
  const n = BAND_CENTERS_TURNS.length;
  return BAND_CENTERS_TURNS.map((center, i) => {
    const left = BAND_CENTERS_TURNS[(i + n - 1) % n]!;
    const right = BAND_CENTERS_TURNS[(i + 1) % n]!;
    const toLeft = (((center - left) % 1) + 1) % 1;
    const toRight = (((right - center) % 1) + 1) % 1;
    const d = ((((hue - center + 0.5) % 1) + 1) % 1) - 0.5;
    return d < 0 ? clamp01(1 + d / toLeft) : clamp01(1 - d / toRight);
  });
}

/**
 * Applies a develop stage to one display-space pixel (values in 0..1 after
 * the print grade, before the 2.2 encode back to the composer's buffer).
 * `frame` is the pixel's position in the frame, -1..1 on each axis, or null
 * to skip the vignette (the shade probe reads the centre of a prop, where
 * the vignette is zero anyway).
 */
export function developDisplay(
  display: Rgb,
  settings: SceneDevelopSettings,
  frame: readonly [number, number] | null = null,
): Rgb {
  // White balance and exposure in linear display light.
  const wb: Rgb = [
    1 + 0.25 * settings.temp + 0.1 * settings.tint,
    1 - 0.15 * settings.tint,
    1 - 0.25 * settings.temp + 0.1 * settings.tint,
  ];
  const wbLuma = luma(wb);
  const gain = Math.pow(2, settings.exposure);
  let x = display.map((c, i) =>
    Math.pow(Math.pow(clamp01(c), 2.2) * (wb[i]! / wbLuma) * gain, 1 / 2.2),
  ) as Rgb;

  // Tone. Blacks and whites are quadratic end-weighted lifts, shadows and
  // highlights are band-limited bumps, contrast is the smoothstep S about
  // mid grey (or a flattening toward it).
  x = x.map((c) => c + settings.blacks * 0.5 * (1 - c) * (1 - c)) as Rgb;
  x = x.map((c) => c + settings.whites * 0.75 * c * c) as Rgb;
  x = x.map(clamp01) as Rgb;
  x = x.map(
    (c) =>
      c +
      settings.shadows *
        0.5 *
        (smoothstep(0, 0.25, c) * (1 - smoothstep(0.25, 0.7, c))),
  ) as Rgb;
  x = x.map(
    (c) =>
      c +
      settings.highlights *
        0.5 *
        (smoothstep(0.3, 0.75, c) * (1 - smoothstep(0.75, 1, c))),
  ) as Rgb;
  x = x.map(clamp01) as Rgb;
  x = x.map((c) => {
    if (settings.contrast >= 0)
      return c + (c * c * (3 - 2 * c) - c) * settings.contrast;
    return c + (0.5 + (c - 0.5) * 0.6 - c) * -settings.contrast;
  }) as Rgb;

  // Saturation and vibrance about luma; vibrance weights the less
  // saturated pixels.
  const [, s] = rgbToHsv(x);
  const l = luma(x);
  const chroma = 1 + settings.saturation + settings.vibrance * (1 - s);
  x = x.map((c) => clamp01(l + (c - l) * chroma)) as Rgb;

  // The mixer: per-band hue, saturation and value, gated off near grey so
  // the bands cannot tint a neutral.
  const [h, mixedS, v] = rgbToHsv(x);
  const gate = clamp01(mixedS / 0.15);
  const weights = hueBandWeights(h);
  let dh = 0;
  let ds = 0;
  let dv = 0;
  HUE_BANDS.forEach((band, i) => {
    const w = weights[i]! * gate;
    dh += w * settings.mixer[band].hue;
    ds += w * settings.mixer[band].sat;
    dv += w * settings.mixer[band].lum;
  });
  x = hsvToRgb(
    h + dh * (60 / 360),
    clamp01(mixedS * (1 + ds * (ds >= 0 ? 1.5 : 1))),
    clamp01(v * (1 + dv * 0.5)),
  );

  // Post vignette, elliptical with the frame.
  if (frame) {
    const r = Math.hypot(frame[0], frame[1]);
    const fall =
      1 + settings.vignette * smoothstep(settings.vignetteMidpoint, 1.42, r);
    x = x.map((c) => c * fall) as Rgb;
  }
  return x.map(clamp01) as Rgb;
}

// Seeded from the URL before any render, like the diagnostics runtime, so
// the first frame under `?grade=` already wears the profile and no publish
// lands mid-render. Server snapshots stay at the default.
if (typeof window !== "undefined")
  sceneGradeProfileController.seed(window.location.search);

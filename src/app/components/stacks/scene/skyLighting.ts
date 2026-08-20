/** Pure lighting constraints interpolated into the analytic sky shader. */
export const SKY_LIGHTING = {
  salesforce: {
    /** Daylight glass inherits the tower until the installation is engaged. */
    dayIdleEmission: 0,
    dayActiveEmission: 0.4,
  },
  atmosphere: {
    /** Keep the thin cloud band clear of the skyline and upper blue cap. */
    cloudDeckFadeIn: [0.085, 0.12],
    cloudDeckFadeOut: [0.16, 0.235],
    cloudDensityGate: [0.54, 0.76],
    /** Pale daylight body with only a faint cool underside. */
    cloudBodyShade: [0.92, 0.97],
    cloudBodyLightMix: 0.38,
    cloudBodyOpacity: 0.54,
    cloudBodyDesaturation: 0.12,
    cloudRimBase: 0.018,
    cloudRimSun: 0.09,
    cloudDrift: 0.012,
    cloudMorph: 0.004,
    /** Camera-continuous wisps prevent empty runs without forming an overcast deck. */
    cloudCoverageSeed: 33,
    cloudCoverageAzimuth: [3.6, 7.5],
    cloudCoverageElevation: [28, 58],
    cloudCoverageScale: 0.91,
    cloudCoverageDrift: 0.0005,
    /** A localized sunrise already exists; keep the rest of the horizon blue. */
    horizonEmber: 0.035,
    /** Blend the sunrise into the air; never add enough HDR energy to bleach it. */
    emberMix: 0.42,
    emberLift: 1.04,
    /** Karl remains local weather, but no longer turns SF into white wash. */
    karlBase: 0.01,
    karlWest: 0.12,
    karlOpacity: 0.18,
  },
} as const;

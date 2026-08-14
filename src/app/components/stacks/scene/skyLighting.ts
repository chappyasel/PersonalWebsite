/** Pure lighting constraints interpolated into the analytic sky shader. */
export const SKY_LIGHTING = {
  salesforce: {
    /** Daylight glass inherits the tower until the installation is engaged. */
    dayIdleEmission: 0,
    dayActiveEmission: 0.4,
  },
  atmosphere: {
    /** Keep clouds above the skyline instead of veiling its full height. */
    cloudDeckFadeIn: [0.07, 0.11],
    cloudDensityGate: [0.48, 0.7],
    cloudBodyShade: [0.68, 0.88],
    cloudBodyOpacity: 0.78,
    cloudBodyDesaturation: 0.32,
    cloudRimBase: 0.03,
    cloudRimSun: 0.16,
    cloudDrift: 0.012,
    cloudMorph: 0.004,
    /** Camera-continuous high deck prevents empty cloud runs between units. */
    cloudCoverageSeed: 33,
    cloudCoverageAzimuth: [4.2, 9],
    cloudCoverageElevation: [20, 40],
    cloudCoverageScale: 0.96,
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

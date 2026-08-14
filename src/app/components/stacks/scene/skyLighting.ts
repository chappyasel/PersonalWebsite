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
    cloudDensityGate: [0.5, 0.76],
    cloudBodyOpacity: 0.68,
    cloudRimBase: 0.025,
    cloudRimSun: 0.2,
    cloudDrift: 0.012,
    cloudMorph: 0.004,
    /** Camera-continuous high deck prevents empty cloud runs between units. */
    cloudCoverageSeed: 33,
    cloudCoverageScale: 0.78,
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

/**
 * Light-theme rendering values shared by the sky and foreground.
 *
 * Keeping these together prevents the three scene pipelines (analytic sky,
 * lit props, and textured prints) from drifting into unrelated exposures.
 */
export const DAYLIGHT_RENDERING = {
  /** Aerial perspective should soften the skyline, not erase its silhouette. */
  skylineHaze: 0.18,
  /** Reflections are supporting fill; the directional light owns the form. */
  environmentIntensity: 0.28,
  environmentWarmIntensity: 1.4,
  environmentCoolIntensity: 0.55,
  /** Broad sky fill stays below the key so pale props retain modelling. */
  hemisphereIntensity: [0.72, 0.78],
  directionalIntensity: [1.18, 1.3],
  /** App screenshots keep neutral whites instead of inheriting the photo grade. */
  projectImageGrade: 0.02,
  /**
   * Shadowed International Orange in linear space. The old display-like
   * literal was interpreted as HDR energy and ACES rolled it into pastel.
   */
  goldenGatePaintLinear: [0.3, 0.07, 0.025],
  goldenGateDayPaintMix: 0.64,
  /** Do not stack a second veil on the bridge after skyline aerial haze. */
  goldenGateDayHazeScale: 0.8,
  goldenGateDayExtraHaze: 0,
  washington: {
    cloudBodyShade: [0.91, 0.96],
    cloudBodyLightMix: 0.36,
    cloudBodyOpacity: 0.54,
    cloudRimOpacity: 0.035,
    waterCloudShade: [0.86, 0.94],
    waterCloudReflection: 0.24,
    waterFacetContrast: 0.04,
    waterTint: [0.12, 0.3],
  },
} as const;

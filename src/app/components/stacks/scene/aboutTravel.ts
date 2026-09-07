// Where the About globe's marks come from.
//
// Two kinds. Countries he has been to are baked into the ball's texture by
// scripts/generate/globe-map.ts, which reads VISITED_PLACES offline and fills
// them on a Natural Earth map; no geodata reaches the browser. AI Collective
// chapters and places Chappy has lived are points, and the ball carries them
// live as separate small-mark layers (globeBall.ts).
import { AIC_CHAPTERS } from "./aicChapters";
import {
  GLOBE_LIVED_MARKS_NAME,
  GLOBE_MARKS_NAME,
  GLOBE_VISITED_MARKS_NAME,
  type GlobeMarker,
  type SpinPartMap,
} from "./globeBall";

export type VisitedPlace = GlobeMarker &
  Readonly<{
    /** `properties.name` in world-atlas countries-50m (Natural Earth 50m). The
     * generator fails loudly on a name it cannot find. */
    country: string;
    /** Visitor-facing name for the point marker. */
    name: string;
    /** Only one part of a multi-part country was visited: the generator fills
     * the ring containing this point and leaves the rest of the country as
     * ordinary land. */
    part?: Readonly<{ label: string; lon: number; lat: number }>;
    /** Rings that belong to the country politically but were not part of the
     * trip, named by a point inside each. */
    omit?: readonly Readonly<{ label: string; lon: number; lat: number }>[];
    /** Keep only rings that start inside this lon/lat box. For countries whose
     * Natural Earth polygon scatters overseas territories across the map. */
    within?: Readonly<{
      lon: readonly [number, number];
      lat: readonly [number, number];
    }>;
  }>;

export const VISITED_PLACES: readonly VisitedPlace[] = [
  {
    country: "United States of America",
    name: "United States",
    lat: 39.8283,
    lon: -98.5795,
  },
  { country: "Canada", name: "Canada", lat: 56.1304, lon: -106.3468 },
  {
    country: "Dominican Rep.",
    name: "Dominican Republic",
    lat: 18.7357,
    lon: -70.1627,
  },
  { country: "Haiti", name: "Haiti", lat: 18.9712, lon: -72.2852 },
  { country: "Barbados", name: "Barbados", lat: 13.1939, lon: -59.5432 },
  {
    country: "Costa Rica",
    name: "Costa Rica",
    lat: 9.7489,
    lon: -83.7534,
  },
  {
    country: "South Africa",
    name: "South Africa",
    lat: -30.5595,
    lon: 22.9375,
  },
  { country: "Iceland", name: "Iceland", lat: 64.9631, lon: -19.0208 },
  // Natural Earth keeps the Canaries inside Spain and French Guiana, Réunion
  // and the Antilles inside France. Mainland plus the near islands only.
  {
    country: "Spain",
    name: "Spain",
    lat: 40.4637,
    lon: -3.7492,
    within: { lon: [-10, 5], lat: [35, 44] },
  },
  {
    country: "France",
    name: "France",
    lat: 46.2276,
    lon: 2.2137,
    within: { lon: [-6, 10], lat: [41, 52] },
  },
  { country: "Italy", name: "Italy", lat: 41.8719, lon: 12.5674 },
  { country: "Greece", name: "Greece", lat: 39.0742, lon: 21.8243 },
  { country: "Hungary", name: "Hungary", lat: 47.1625, lon: 19.5033 },
  { country: "Czechia", name: "Czechia", lat: 49.8175, lon: 15.473 },
  { country: "Austria", name: "Austria", lat: 47.5162, lon: 14.5501 },
  { country: "Germany", name: "Germany", lat: 51.1657, lon: 10.4515 },
  { country: "India", name: "India", lat: 20.5937, lon: 78.9629 },
  { country: "China", name: "China", lat: 35.8617, lon: 104.1954 },
  {
    country: "South Korea",
    name: "South Korea",
    lat: 35.9078,
    lon: 127.7669,
  },
  { country: "Taiwan", name: "Taiwan", lat: 23.6978, lon: 120.9605 },
  { country: "Malaysia", name: "Malaysia", lat: 4.2105, lon: 101.9758 },
  { country: "Vietnam", name: "Vietnam", lat: 14.0583, lon: 108.2772 },
  { country: "Cambodia", name: "Cambodia", lat: 12.5657, lon: 104.991 },
  { country: "Thailand", name: "Thailand", lat: 15.87, lon: 100.9925 },
  // The island, not the archipelago.
  {
    country: "Indonesia",
    name: "Bali, Indonesia",
    lat: -8.4095,
    lon: 115.1889,
    part: { label: "Bali", lon: 115.19, lat: -8.41 },
  },
];

export const ABOUT_GLOBE_MAP_URLS = {
  light: "/models/globe-map-light.webp",
  dark: "/models/globe-map-dark.webp",
} as const;

/** The AI Collective mark on the shelf below is this orange (CollectiveLogo
 * in UnitAbout); the chapter marks borrow it so the two read as one thing. */
export const ABOUT_GLOBE_MARKER_COLOR = "#ff9b50";
export const ABOUT_GLOBE_VISITED_MARKER_COLOR = "#2f974d";

export type LivedPlace = GlobeMarker &
  Readonly<{
    id: string;
    name: string;
    current?: boolean;
  }>;

export const LIVED_PLACES: readonly LivedPlace[] = [
  {
    id: "san-francisco",
    name: "San Francisco, California",
    lat: 37.7749,
    lon: -122.4194,
    current: true,
  },
  {
    id: "seattle",
    name: "Seattle, Washington",
    lat: 47.6062,
    lon: -122.3321,
  },
  {
    id: "washington-dc",
    name: "Washington, D.C.",
    lat: 38.9072,
    lon: -77.0369,
  },
  {
    id: "beijing",
    name: "Beijing, China",
    lat: 39.9042,
    lon: 116.4074,
  },
  {
    id: "marthas-vineyard",
    name: "Martha's Vineyard",
    lat: 41.3805,
    lon: -70.6455,
  },
];

/** A cartographic red, lifted above the chapter marks where the two overlap. */
export const ABOUT_GLOBE_LIVED_MARKER_COLOR = "#d62828";

/** Pins the screenshot globe on the Atlantic. Combined with the model's
 * authored -0.7 yaw, this puts roughly 44° W at the centre and keeps the
 * densest America-Europe span on the visible hemisphere. */
export const ABOUT_GLOBE_SCREENSHOT_SPIN_Y = -0.1;

/** The stand and meridian ring sample one cell of the palette atlas in each
 * theme (#443a2d by day, #241d14 at night, measured off the GLB's UVs). He
 * wanted them out of the way, a dark grey rather than the brown, so the globe
 * gets a private atlas copy with that one cell swapped; every other prop on
 * the shared atlas is untouched. Module-level for the same memo-dep reason
 * as ABOUT_GLOBE_MAP. */
export const ABOUT_GLOBE_STAND_ATLAS = {
  light: {
    colorSwaps: [{ from: "#443a2d", to: "#4b4d52", tolerance: 6 }],
  },
  dark: {
    colorSwaps: [{ from: "#241d14", to: "#2a2c31", tolerance: 6 }],
  },
} as const;

/** One module-level object on purpose: it lands in ModelProp's memo deps, and
 * an inline literal at the call site would rebuild the model on every parent
 * render. */
export const ABOUT_GLOBE_MAP: SpinPartMap = {
  light: ABOUT_GLOBE_MAP_URLS.light,
  dark: ABOUT_GLOBE_MAP_URLS.dark,
  markerLayers: [
    {
      name: GLOBE_MARKS_NAME,
      markers: AIC_CHAPTERS,
      color: ABOUT_GLOBE_MARKER_COLOR,
    },
    {
      name: GLOBE_VISITED_MARKS_NAME,
      markers: VISITED_PLACES,
      color: ABOUT_GLOBE_VISITED_MARKER_COLOR,
      radiusScale: 1.05,
      lift: 1.025,
      nightEmissive: 0.04,
    },
    {
      name: GLOBE_LIVED_MARKS_NAME,
      markers: LIVED_PLACES,
      color: ABOUT_GLOBE_LIVED_MARKER_COLOR,
      radiusScale: 1.15,
      lift: 1.035,
      nightEmissive: 0.06,
    },
  ],
};

/**
 * The east-facing traverse from the main 3D site's dome shader
 * (SceneEnvironment.tsx), as one shared geometry consumed by the page
 * skyline (Skyline.tsx) and the OG cards (scripts/generate/og-daylight.tsx).
 *
 * Drawn at 1440x52 so a full-width desktop hero renders it 1:1 — narrower
 * viewports compress it into a finer, denser distant city, and nothing is
 * ever inflated. Baseline is y=52; the height hierarchy follows the survey:
 * Sutro on its hill is tallest in view, then Salesforce, then Transamerica,
 * then the bridge towers. Three opacity tiers fake the atmosphere: far
 * ridgeline lightest, the residential fabric between, landmarks full.
 */

export const SKYLINE_VIEWBOX = "0 0 1440 52";

export type SkylineShape =
  | { kind: "fill"; d: string; opacity?: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; opacity?: number }
  | { kind: "stroke"; d: string; width: number; opacity?: number };

const rect = (
  x: number,
  y: number,
  w: number,
  opacity?: number,
): SkylineShape => ({ kind: "rect", x, y, w, h: 52 - y, opacity });

export const SKYLINE_SHAPES: SkylineShape[] = [
  // Twin Peaks / Mt Davidson ridgeline, hazed back
  {
    kind: "fill",
    d: "M0 40.5 Q45 33.5 95 35.5 Q135 33 172 33 Q225 33.5 268 42 Q305 48 350 49.5 L350 52 L0 52 Z",
    opacity: 0.5,
  },
  // Sutro Tower: splayed trapezoid to the waist, three masts above two
  // crossarms, the center mast tallest — the tallest thing in view
  { kind: "fill", d: "M164 33 L169 15 L181 15 L186 33 Z", opacity: 0.8 },
  { kind: "rect", x: 165.9, y: 5, w: 1.5, h: 10, opacity: 0.8 },
  { kind: "rect", x: 174.25, y: 2, w: 1.5, h: 13, opacity: 0.8 },
  { kind: "rect", x: 182.6, y: 5, w: 1.5, h: 10, opacity: 0.8 },
  { kind: "rect", x: 164, y: 15, w: 22, h: 1.3, opacity: 0.8 },
  { kind: "rect", x: 166.5, y: 8.5, w: 17, h: 1, opacity: 0.8 },
  // Residential fabric: stepped rooftops, no individual statements
  {
    kind: "fill",
    d: "M350 52 L350 48.2 L360 48.2 L360 46.4 L369 46.4 L369 47.8 L380 47.8 L380 45.6 L388 45.6 L388 47.2 L399 47.2 L399 46 L408 46 L408 48.4 L419 48.4 L419 45.2 L427 45.2 L427 47 L437 47 L437 45.8 L446 45.8 L446 48 L456 48 L456 46.2 L464 46.2 L464 47.6 L474 47.6 L474 44.8 L481 44.8 L481 46.8 L491 46.8 L491 45.4 L500 45.4 L500 47.4 L510 47.4 L510 46 L518 46 L518 48.2 L528 48.2 L528 46.6 L536 46.6 L536 47.8 L545 47.8 L545 49 L552 49 L552 52 Z",
    opacity: 0.72,
  },
  // A lone rooftop water tank in the fabric
  { kind: "rect", x: 431, y: 42.6, w: 3.4, h: 1.8, opacity: 0.72 },
  { kind: "rect", x: 432.3, y: 44.4, w: 0.8, h: 1.4, opacity: 0.72 },
  // Telegraph Hill with Coit's slender shaft and flared arcade
  {
    kind: "fill",
    d: "M538 52 Q568 43.5 598 45 Q620 45.8 642 50 L642 52 Z",
    opacity: 0.72,
  },
  rect(581.5, 27, 7),
  { kind: "rect", x: 580, y: 25.3, w: 10, h: 2 },
  { kind: "rect", x: 583, y: 23.8, w: 4, h: 1.5 },
  // Low downtown before Transamerica: slender, varied, a few crown ticks
  rect(642, 44.5, 9),
  rect(654, 41, 7),
  rect(664, 43.5, 12),
  rect(679, 38.5, 8),
  { kind: "rect", x: 682, y: 37, w: 2, h: 1.5 },
  rect(690, 42, 10),
  rect(703, 36.5, 8),
  { kind: "rect", x: 705, y: 35, w: 4, h: 1.5 },
  rect(714, 40, 11),
  rect(728, 44, 13),
  rect(744, 39, 8),
  rect(755, 42.5, 10),
  rect(768, 45, 12),
  rect(783, 41, 9),
  rect(794, 44.5, 8),
  // Transamerica: slim truncated pyramid, spire, the two wing flanges
  { kind: "fill", d: "M803 46 L816.4 12.8 L818.6 12.8 L832 46 L832 52 L803 52 Z" },
  { kind: "rect", x: 816.8, y: 9.8, w: 1.4, h: 3.6 },
  rect(804.5, 30, 3),
  rect(827.5, 30, 3),
  // Downtown cluster: 345 California's twin masts, one stepped crown
  rect(836, 33, 10),
  rect(848, 26.5, 9),
  { kind: "rect", x: 850, y: 22.5, w: 1.2, h: 4 },
  { kind: "rect", x: 854.5, y: 22.5, w: 1.2, h: 4 },
  rect(859, 36, 11),
  rect(872, 29, 8),
  rect(882, 34.5, 12),
  rect(896, 25, 10),
  { kind: "rect", x: 898.5, y: 23, w: 5, h: 2 },
  rect(908, 37, 9),
  rect(919, 31, 10),
  rect(931, 27, 8),
  rect(941, 35, 12),
  rect(955, 30, 9),
  rect(966, 38.5, 12),
  rect(980, 33, 9),
  rect(991, 41, 13),
  // Salesforce Tower: smooth taper to the flat crown at ~55% base width
  {
    kind: "fill",
    d: "M1008 52 L1008 31 C1008 19 1011.5 11.5 1016.5 8.2 L1037.5 8.2 C1042.5 11.5 1046 19 1046 31 L1046 52 Z",
  },
  // 181 Fremont's sloped crown and needle, then Millennium and Jasper slabs
  { kind: "fill", d: "M1051 52 L1051 21.5 L1062.5 17.5 L1062.5 52 Z" },
  { kind: "rect", x: 1060.8, y: 13, w: 1.1, h: 6 },
  rect(1067, 28.5, 10),
  rect(1080, 31, 12),
  // Waterfront steps down to the anchorage
  rect(1095, 40, 9),
  rect(1106, 44, 10),
  rect(1118, 47, 12),
  rect(1132, 48.5, 14),
  rect(1152, 34.5, 6),
  // Bay Bridge, western crossing: double deck, two cross-braced towers,
  // catenaries with suspenders, vanishing into Yerba Buena at the edge
  { kind: "rect", x: 1155, y: 37.6, w: 273, h: 1.1 },
  { kind: "rect", x: 1155, y: 40.6, w: 273, h: 0.9 },
  { kind: "rect", x: 1226.8, y: 15, w: 2.4, h: 37 },
  { kind: "rect", x: 1232.8, y: 15, w: 2.4, h: 37 },
  { kind: "rect", x: 1226.8, y: 15.2, w: 8.4, h: 1.7 },
  { kind: "rect", x: 1226.8, y: 24, w: 8.4, h: 1.2 },
  { kind: "rect", x: 1226.8, y: 31.5, w: 8.4, h: 1.2 },
  { kind: "rect", x: 1339.8, y: 15, w: 2.4, h: 37 },
  { kind: "rect", x: 1345.8, y: 15, w: 2.4, h: 37 },
  { kind: "rect", x: 1339.8, y: 15.2, w: 8.4, h: 1.7 },
  { kind: "rect", x: 1339.8, y: 24, w: 8.4, h: 1.2 },
  { kind: "rect", x: 1339.8, y: 31.5, w: 8.4, h: 1.2 },
  { kind: "stroke", d: "M1231 16 Q1287.5 35 1344 16", width: 1.3 },
  { kind: "stroke", d: "M1231 16 Q1200 30 1163 37.5", width: 1.1 },
  { kind: "stroke", d: "M1344 16 Q1378 30 1416 37.5", width: 1.1 },
  { kind: "stroke", d: "M1244.6 20 L1244.6 38", width: 0.6 },
  { kind: "stroke", d: "M1258.1 22.9 L1258.1 38", width: 0.6 },
  { kind: "stroke", d: "M1271.7 24.8 L1271.7 38", width: 0.6 },
  { kind: "stroke", d: "M1287.5 25.5 L1287.5 38", width: 0.6 },
  { kind: "stroke", d: "M1303.3 24.8 L1303.3 38", width: 0.6 },
  { kind: "stroke", d: "M1316.9 22.9 L1316.9 38", width: 0.6 },
  { kind: "stroke", d: "M1330.4 20 L1330.4 38", width: 0.6 },
  { kind: "stroke", d: "M1205.2 26.2 L1205.2 38", width: 0.6 },
  { kind: "stroke", d: "M1184.7 32.4 L1184.7 38", width: 0.6 },
  { kind: "stroke", d: "M1371.8 26.2 L1371.8 38", width: 0.6 },
  { kind: "stroke", d: "M1393.6 32.4 L1393.6 38", width: 0.6 },
  // Yerba Buena rising off the right edge, swallowing the deck
  { kind: "fill", d: "M1396 52 Q1422 40 1440 34 L1440 52 Z" },
];

// The Role Icons: four app-icon billets on the About lower shelf, one per
// organization Chappy currently works with, stacked two by two beside the
// Apple mark the way the Projects dice pile beside the Project Icons. Each is
// a Door to that organization. Client-safe, dependency-free: the boot SVG,
// the live unit, and the layout tests all read this one list.

/** Same edge as a Projects die, so the two stacks rhyme across the room. */
export const ABOUT_ROLE_ICON_SIZE = 0.16;
/** Air between the two columns. Zero (owner: "close together, no gap"): the
 * tiles stand flush, and the rows touch too, the top row resting on the
 * bottom. Shared edges are the same contact the dice pyramid uses so a
 * supporting tile wakes the one above it once the solver is warm. Flush
 * neighbours must share a yaw within a row, or their corners intersect. */
export const ABOUT_ROLE_ICON_GAP = 0;
/** One casual yaw per row, not per tile, because the columns touch. The top
 * row is turned a hair more than the bottom so the block still reads as
 * stacked by hand rather than machined. */
const BOTTOM_ROW_YAW = 0.02;
const TOP_ROW_YAW = 0.04;

export type AboutRole = {
  id: "madrona" | "roam" | "susa" | "weightlifting";
  name: string;
  href: string;
  /** Door Label title: the organization, which is also where the Door goes. */
  doorLabel: string;
  /** Door Label detail lines: the role there. */
  doorDetail: readonly string[];
  /** Full-bleed square artwork; the rounded billet face clips the corners. */
  artwork: string;
  /** Solid face color while the unit is still untextured. */
  fallbackColor: string;
  /** Flat tile fills for the boot silhouette, light and dark theme. */
  bootColor: { light: string; dark: string };
  /** 0 = left column, 1 = right column. */
  column: 0 | 1;
  /** 0 = on the shelf, 1 = resting on the tile below. */
  row: 0 | 1;
  /** Casual authored yaw, shared across a row (see the gap note above). */
  yaw: number;
};

/** Door Labels carry the role itself (owner: "the tooltip should actually
 * describe"): the title is the organization, which is also where the Door
 * goes, and the detail line is what he does there. The three firm titles are
 * quoted from Susa Ventures' own 2025-2026 fellows announcement; the app one
 * is from his résumé. */
export const ABOUT_ROLES: readonly AboutRole[] = [
  {
    id: "madrona",
    name: "Madrona",
    href: "https://www.madrona.com/",
    doorLabel: "Madrona",
    doorDetail: ["Venture Scout"],
    artwork: "/images/stacks/v8/512/about-madrona-icon.webp",
    fallbackColor: "#004a37",
    bootColor: { light: "#004a37", dark: "#0b3b2e" },
    column: 0,
    row: 1,
    yaw: TOP_ROW_YAW,
  },
  {
    id: "roam",
    name: "Roam",
    href: "https://ro.am/",
    doorLabel: "Roam",
    doorDetail: ["Advisor to the CEO"],
    artwork: "/images/stacks/v8/512/about-roam-icon.webp",
    fallbackColor: "#111113",
    bootColor: { light: "#1a1a1e", dark: "#0c0c0e" },
    column: 1,
    row: 1,
    yaw: TOP_ROW_YAW,
  },
  {
    id: "susa",
    name: "Susa Ventures",
    href: "https://susaventures.com/",
    doorLabel: "Susa Ventures",
    doorDetail: ["Venture Fellow"],
    // Susa's sage (their own theme accent) under the gorilla in their paper.
    artwork: "/images/stacks/v8/512/about-susa-icon.webp",
    fallbackColor: "#607771",
    bootColor: { light: "#607771", dark: "#3f524c" },
    column: 0,
    row: 0,
    yaw: BOTTOM_ROW_YAW,
  },
  {
    id: "weightlifting",
    name: "Weightlifting App",
    href: "https://apps.apple.com/us/app/id1266077653",
    doorLabel: "Weightlifting App",
    doorDetail: ["Founder"],
    // The same master the Projects shelf shows at twice the size.
    artwork: "/images/stacks/v8/512/projects-weightlifting-icon.webp",
    fallbackColor: "#6961d8",
    bootColor: { light: "#6961d8", dark: "#4d47a8" },
    column: 1,
    row: 0,
    yaw: BOTTOM_ROW_YAW,
  },
];

export const ABOUT_ROLE_STACK_WIDTH =
  ABOUT_ROLE_ICON_SIZE * 2 + ABOUT_ROLE_ICON_GAP;
export const ABOUT_ROLE_STACK_HEIGHT = ABOUT_ROLE_ICON_SIZE * 2;

/** Unit-local offset of one tile from the stack's shelf mark: x is the tile
 * centre, y is its bottom contact. Shared by the live shelf and the boot SVG
 * so neither can drift from the other. */
export function aboutRoleIconOffset(role: AboutRole): [number, number] {
  const column = role.column === 0 ? -1 : 1;
  return [
    (column * (ABOUT_ROLE_ICON_SIZE + ABOUT_ROLE_ICON_GAP)) / 2,
    role.row * ABOUT_ROLE_ICON_SIZE,
  ];
}

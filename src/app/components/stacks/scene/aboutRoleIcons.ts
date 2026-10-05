// The Role Icons: five app-icon billets on the About lower shelf, one per
// organization Chappy has worked with, stacked two, two, and one beside the
// Vision Pro the way the Projects dice pile beside the Project Icons. Each is
// a Portal to that organization. Client-safe, dependency-free: the boot SVG,
// the live unit, and the layout tests all read this one list.
import { projectIconBody } from "./projectIconGeometry";

/** Same edge as a Projects die, so the two stacks rhyme across the room. */
export const ABOUT_ROLE_ICON_SIZE = 0.16;
/** Air between the two columns. Zero (owner: "close together, no gap"): the
 * tiles stand flush, and the rows touch too, each row resting on the one
 * below. Shared edges are the same contact the dice pyramid uses so a
 * supporting tile wakes the one above it once the solver is warm. Flush
 * neighbours must share a yaw within a row, or their corners intersect. */
export const ABOUT_ROLE_ICON_GAP = 0;
/** The editor draft turned the four carriers by slightly different amounts,
 * which broke the shared edges. A least-squares fit through those four centers
 * resolves to one -0.14 radian yaw for the complete rectangle. */
export const ABOUT_ROLE_STACK_YAW = -0.14;
/** The apex row: one tile standing across the seam of the two below it. */
export const ABOUT_ROLE_TOP_ROW = 2;

export type AboutRole = {
  id: "ewor" | "madrona" | "roam" | "susa" | "weightlifting";
  name: string;
  href: string;
  /** Portal Label title: the organization, which is where the Portal goes. */
  portalLabel: string;
  /** Portal Label detail lines: the role there. */
  portalDetail: readonly string[];
  /** Full-bleed square artwork; the rounded billet face clips the corners. */
  artwork: string;
  /** Solid face color while the unit is still untextured. */
  fallbackColor: string;
  /** Flat tile fills for the boot silhouette, light and dark theme. */
  bootColor: { light: string; dark: string };
  /** Left and right are the two columns; center straddles their seam. */
  column: "left" | "center" | "right";
  /** 0 = on the shelf, 1 = on the bottom row, 2 = the apex. */
  row: 0 | 1 | 2;
  /** Shared authored yaw. Equal values keep all touching faces coplanar. */
  yaw: number;
};

/** Portal Labels carry the role itself (owner: "the tooltip should actually
 * describe"): the title is the organization, which is also where the Portal
 * goes, and the detail line is what he does there. The Madrona, Roam, and
 * Susa titles are quoted from Susa Ventures' own 2025-2026 fellows
 * announcement; the app one is from his résumé; the EWOR one is his own
 * (owner, 2026-10-05). Listed in reading order: the apex, then each row left
 * to right. */
export const ABOUT_ROLES: readonly AboutRole[] = [
  {
    id: "weightlifting",
    name: "Weightlifting App",
    href: "https://apps.apple.com/us/app/id1266077653",
    portalLabel: "Weightlifting App",
    portalDetail: ["Founder"],
    // The same master the Projects shelf shows at twice the size.
    artwork: "/images/stacks/v8/512/projects-weightlifting-icon.webp",
    fallbackColor: "#6961d8",
    bootColor: { light: "#6961d8", dark: "#4d47a8" },
    column: "center",
    row: ABOUT_ROLE_TOP_ROW,
    yaw: ABOUT_ROLE_STACK_YAW,
  },
  {
    id: "ewor",
    name: "EWOR",
    href: "https://www.ewor.com/",
    portalLabel: "EWOR",
    portalDetail: ["Venture Scout"],
    // Their white wordmark on their own dark gradient, as on their share card.
    artwork: "/images/stacks/v8/512/about-ewor-icon.webp",
    fallbackColor: "#1e1c21",
    bootColor: { light: "#2c2932", dark: "#1e1c21" },
    column: "left",
    row: 1,
    yaw: ABOUT_ROLE_STACK_YAW,
  },
  {
    id: "madrona",
    name: "Madrona",
    href: "https://www.madrona.com/",
    portalLabel: "Madrona",
    portalDetail: ["Venture Scout"],
    artwork: "/images/stacks/v8/512/about-madrona-icon.webp",
    fallbackColor: "#004a37",
    bootColor: { light: "#004a37", dark: "#0b3b2e" },
    column: "right",
    row: 1,
    yaw: ABOUT_ROLE_STACK_YAW,
  },
  {
    id: "susa",
    name: "Susa Ventures",
    href: "https://susaventures.com/",
    portalLabel: "Susa Ventures",
    portalDetail: ["Former Venture Fellow"],
    // Susa's sage (their own theme accent) under the gorilla in their paper.
    artwork: "/images/stacks/v8/512/about-susa-icon.webp",
    fallbackColor: "#607771",
    bootColor: { light: "#607771", dark: "#3f524c" },
    column: "left",
    row: 0,
    yaw: ABOUT_ROLE_STACK_YAW,
  },
  {
    id: "roam",
    name: "Roam",
    href: "https://ro.am/",
    portalLabel: "Roam",
    portalDetail: ["Advisor to the CEO"],
    artwork: "/images/stacks/v8/512/about-roam-icon.webp",
    fallbackColor: "#111113",
    bootColor: { light: "#1a1a1e", dark: "#0c0c0e" },
    column: "right",
    row: 0,
    yaw: ABOUT_ROLE_STACK_YAW,
  },
];

export const ABOUT_ROLE_STACK_WIDTH =
  ABOUT_ROLE_ICON_SIZE * 2 + ABOUT_ROLE_ICON_GAP;
export const ABOUT_ROLE_STACK_HEIGHT =
  ABOUT_ROLE_ICON_SIZE * (ABOUT_ROLE_TOP_ROW + 1);
const ABOUT_ROLE_BODY_DEPTH = projectIconBody(ABOUT_ROLE_ICON_SIZE).depth;
export const ABOUT_ROLE_STACK_PROFILE_WIDTH =
  Math.abs(Math.cos(ABOUT_ROLE_STACK_YAW)) * ABOUT_ROLE_STACK_WIDTH +
  Math.abs(Math.sin(ABOUT_ROLE_STACK_YAW)) * ABOUT_ROLE_BODY_DEPTH;

const COLUMN_SIDE = { left: -1, center: 0, right: 1 } as const;

/** Unit-local offset of one tile from the stack's shelf mark: x is the tile
 * centre, y is its bottom contact. Shared by the live shelf and the boot SVG
 * so neither can drift from the other. */
export function aboutRoleIconOffset(role: AboutRole): [number, number, number] {
  const localX =
    (COLUMN_SIDE[role.column] * (ABOUT_ROLE_ICON_SIZE + ABOUT_ROLE_ICON_GAP)) /
    2;
  return [
    Math.cos(ABOUT_ROLE_STACK_YAW) * localX,
    role.row * ABOUT_ROLE_ICON_SIZE,
    -Math.sin(ABOUT_ROLE_STACK_YAW) * localX,
  ];
}

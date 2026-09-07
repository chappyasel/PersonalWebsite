/** The map texture and boot-screen globe both read this palette. Each map
 * colour is 20% less saturated than the previous cut. */
export const ABOUT_GLOBE_THEME_COLORS = {
  light: {
    ocean: "#6889b8",
    land: "#91b570",
    coast: "#749959",
    border: "#749959",
    visited: "#4a7d40",
    visitedEdge: "#33572c",
  },
  dark: {
    ocean: "#485b7f",
    land: "#63814d",
    coast: "#4b663a",
    border: "#4b663a",
    visited: "#355d31",
    visitedEdge: "#233e20",
  },
} as const;

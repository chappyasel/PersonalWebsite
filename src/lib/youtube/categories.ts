/** YouTube category productivity weights — 1.0 = fully productive, 0 = no value */
export const CATEGORY_VALUES: Record<number, number> = {
  28: 1.0, // Science & Technology
  27: 1.0, // Education
  25: 0.5, // News & Politics
  22: 0.2, // People & Blogs
  26: 0.2, // Howto & Style
  // Everything else: 0
};

export const CATEGORY_NAMES: Record<number, string> = {
  1: "Film & Animation",
  2: "Autos & Vehicles",
  10: "Music",
  15: "Pets & Animals",
  17: "Sports",
  19: "Travel & Events",
  20: "Gaming",
  22: "People & Blogs",
  23: "Comedy",
  24: "Entertainment",
  25: "News & Politics",
  26: "Howto & Style",
  27: "Education",
  28: "Science & Technology",
  29: "Nonprofits & Activism",
};

export function getCategoryValue(categoryId: number | null): number {
  return CATEGORY_VALUES[categoryId ?? -1] ?? 0;
}

/** Quality tier colors for frontend */
export const TIER_COLORS = {
  high: "hsl(142 76% 36%)", // green
  medium: "hsl(45 93% 47%)", // yellow
  low: "hsl(0 72% 51%)", // red
} as const;

export type QualityTier = keyof typeof TIER_COLORS;

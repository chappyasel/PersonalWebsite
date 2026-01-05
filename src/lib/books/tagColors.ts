/**
 * Maps book tags to consistent badge colors using soft pastel backgrounds
 */

type BadgeColors = {
  bg: string;
  fg: string;
  border: string;
};

// Helper function to generate badge colors
function getBadgeColors(
  hue: number,
  saturationAdjust?: number,
  lightnessAdjust?: number,
): BadgeColors {
  const s =
    saturationAdjust !== undefined
      ? `${saturationAdjust}%`
      : "var(--badge-bg-saturation)";

  const bgL =
    lightnessAdjust !== undefined
      ? `${lightnessAdjust}%`
      : "var(--badge-bg-lightness)";

  const fgL =
    lightnessAdjust !== undefined
      ? `${Math.max(lightnessAdjust - 50, 20)}%` // Darker text for custom lightness
      : "var(--badge-fg-lightness)";

  return {
    bg: `hsl(${hue},${s},${bgL})`,
    fg: `hsl(${hue},${s},${fgL})`,
    border: `hsla(${hue},${s},${fgL},0.3)`,
  };
}

// Tag configuration with hue and optional saturation/lightness adjustments
const tagConfig: Record<
  string,
  { hue: number; saturationAdjust?: number; lightnessAdjust?: number }
> = {
  // Business - Soft green
  "Business Strategy": { hue: 150 },
  "Business Operations": { hue: 150 },
  Entrepreneurship: { hue: 150 },
  Innovation: { hue: 150 },
  Leadership: { hue: 150 },
  Management: { hue: 150 },

  // Technology - Soft blue
  "Information Technology": { hue: 210 },
  "Emerging Technology": { hue: 210 },
  AI: { hue: 210 },
  Futurism: { hue: 210 },

  // Science - Soft purple
  "Pure Science": { hue: 270 },
  "Applied Science": { hue: 270 },
  "Stats & data": { hue: 270 },
  "Physical Health": { hue: 270 },

  // Social Sciences - Soft tan/beige
  Sociology: { hue: 30 },
  Politics: { hue: 30 },
  Macroeconomics: { hue: 30 },
  Microeconomics: { hue: 30 },
  "Contemporary Issues": { hue: 30 },

  // Psychology - Soft yellow/cream
  "Clinical Psychology": { hue: 45 },
  "Cognitive Psychology": { hue: 45 },
  "Habits & Biases": { hue: 45 },

  // Personal Development - Very light gray/white
  "Personal Growth": { hue: 0, saturationAdjust: 0 },
  Productivity: { hue: 0, saturationAdjust: 0 },
  "Personal Finance": { hue: 0, saturationAdjust: 0 },

  // Philosophy & Interpersonal - Soft pink
  Interpersonal: { hue: 330 },
  Philosophy: { hue: 330 },
  "Happiness & Success": { hue: 330 },

  // History - Darker gray
  "History (Pre-WWII)": { hue: 0, saturationAdjust: 0, lightnessAdjust: 80 },
  "History (Post-WWII)": { hue: 0, saturationAdjust: 0, lightnessAdjust: 80 },
  Biographies: { hue: 0, saturationAdjust: 0, lightnessAdjust: 80 },

  // Literature - Light pink/peach
  "Classical Literature": {
    hue: 15,
  },
  "Contemporary Literature": {
    hue: 15,
  },
  "Science Fiction": { hue: 15 },
};

// Default tag order (curated)
export const defaultTagOrder = [
  "Business Strategy",
  "Business Operations",
  "Entrepreneurship",
  "Innovation",
  "Leadership",
  "Management",
  "Information Technology",
  "Emerging Technology",
  "AI",
  "Futurism",
  "Pure Science",
  "Applied Science",
  "Stats & data",
  "Physical Health",
  "Sociology",
  "Politics",
  "Macroeconomics",
  "Microeconomics",
  "Contemporary Issues",
  "Clinical Psychology",
  "Cognitive Psychology",
  "Habits & Biases",
  "Personal Growth",
  "Productivity",
  "Personal Finance",
  "Interpersonal",
  "Philosophy",
  "Happiness & Success",
  "History (Pre-WWII)",
  "History (Post-WWII)",
  "Biographies",
  "Classical Literature",
  "Contemporary Literature",
  "Science Fiction",
];

/**
 * Gets the badge color configuration for a given tag
 */
export function getTagColor(tag: string): BadgeColors {
  const config = tagConfig[tag];
  if (!config) {
    // Default to neutral gray for unknown tags
    return getBadgeColors(0, 0, 93);
  }
  return getBadgeColors(
    config.hue,
    config.saturationAdjust,
    config.lightnessAdjust,
  );
}

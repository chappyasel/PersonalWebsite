/**
 * Maps book tags to consistent badge colors using soft pastel backgrounds
 */
import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import {
  AlienIcon,
  BinocularsIcon,
  BookIcon,
  BookmarksIcon,
  BrainIcon,
  BriefcaseIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  CircuitryIcon,
  ClockCounterClockwiseIcon,
  CompassIcon,
  CrownIcon,
  CurrencyDollarIcon,
  FlaskIcon,
  GavelIcon,
  GearIcon,
  GlobeHemisphereWestIcon,
  HandshakeIcon,
  HardDrivesIcon,
  HeartIcon,
  HourglassIcon,
  IdentificationCardIcon,
  LightbulbIcon,
  NewspaperIcon,
  PlantIcon,
  RepeatIcon,
  RocketLaunchIcon,
  ScrollIcon,
  SparkleIcon,
  StethoscopeIcon,
  StorefrontIcon,
  SunIcon,
  UsersThreeIcon,
  WrenchIcon,
} from "@phosphor-icons/react/dist/ssr";

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
  "Business Strategy": { hue: 120 },
  "Business Operations": { hue: 120 },
  Entrepreneurship: { hue: 120 },
  Innovation: { hue: 120 },
  Leadership: { hue: 120 },
  Management: { hue: 120 },

  // Technology - Soft blue
  "Information Technology": { hue: 165 },
  "Emerging Technology": { hue: 165 },
  AI: { hue: 165 },
  Futurism: { hue: 165 },

  // Science - Soft purple
  "Pure Science": { hue: 210 },
  "Applied Science": { hue: 210 },
  "Stats & data": { hue: 210 },
  "Physical Health": { hue: 210 },

  // Psychology - Soft yellow/cream
  "Clinical Psychology": { hue: 255 },
  "Cognitive Psychology": { hue: 255 },
  "Habits & Biases": { hue: 255 },

  // Personal Development - Very light gray/white
  "Personal Growth": { hue: 300 },
  Productivity: { hue: 300 },
  "Personal Finance": { hue: 300 },

  // Philosophy & Interpersonal - Soft pink
  Interpersonal: { hue: 345 },
  Philosophy: { hue: 345 },
  "Happiness & Success": { hue: 345 },

  // Social Sciences - Soft tan/beige
  Sociology: { hue: 30 },
  Politics: { hue: 30 },
  Macroeconomics: { hue: 30 },
  Microeconomics: { hue: 30 },
  "Contemporary Issues": { hue: 30 },

  // History - Darker gray
  "History (Pre-WWII)": { hue: 0, saturationAdjust: 0 },
  "History (Post-WWII)": { hue: 0, saturationAdjust: 0 },
  Biographies: { hue: 0, saturationAdjust: 0 },

  // Literature - Light pink/peach
  "Classical Literature": {
    hue: 60,
  },
  "Contemporary Literature": {
    hue: 60,
  },
  "Science Fiction": { hue: 60 },
};

// Tag to icon mapping
const tagIconMap: Record<string, Icon> = {
  // Business (6)
  "Business Strategy": CompassIcon,
  "Business Operations": GearIcon,
  Entrepreneurship: RocketLaunchIcon,
  Innovation: LightbulbIcon,
  Leadership: CrownIcon,
  Management: BriefcaseIcon,

  // Technology (4)
  "Information Technology": HardDrivesIcon,
  "Emerging Technology": CircuitryIcon,
  AI: SparkleIcon,
  Futurism: BinocularsIcon,

  // Science (4)
  "Pure Science": FlaskIcon,
  "Applied Science": WrenchIcon,
  "Stats & data": ChartLineUpIcon,
  "Physical Health": HeartIcon,

  // Social Sciences (5)
  Sociology: UsersThreeIcon,
  Politics: GavelIcon,
  Macroeconomics: GlobeHemisphereWestIcon,
  Microeconomics: StorefrontIcon,
  "Contemporary Issues": NewspaperIcon,

  // Psychology (3)
  "Clinical Psychology": StethoscopeIcon,
  "Cognitive Psychology": BrainIcon,
  "Habits & Biases": RepeatIcon,

  // Personal Development (3)
  "Personal Growth": PlantIcon,
  Productivity: CheckCircleIcon,
  "Personal Finance": CurrencyDollarIcon,

  // Philosophy (3)
  Interpersonal: HandshakeIcon,
  Philosophy: ScrollIcon,
  "Happiness & Success": SunIcon,

  // History (3)
  "History (Pre-WWII)": HourglassIcon,
  "History (Post-WWII)": ClockCounterClockwiseIcon,
  Biographies: IdentificationCardIcon,

  // Literature (3)
  "Classical Literature": BookmarksIcon,
  "Contemporary Literature": BookIcon,
  "Science Fiction": AlienIcon,
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
  "Clinical Psychology",
  "Cognitive Psychology",
  "Habits & Biases",
  "Personal Growth",
  "Productivity",
  "Personal Finance",
  "Interpersonal",
  "Philosophy",
  "Happiness & Success",
  "Sociology",
  "Politics",
  "Macroeconomics",
  "Microeconomics",
  "Contemporary Issues",
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

/**
 * Gets the icon component for a given tag
 */
export function getTagIcon(tag: string): Icon {
  return tagIconMap[tag] ?? BookIcon;
}

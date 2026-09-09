import type { Icon } from "@phosphor-icons/react";
import {
  AlarmIcon,
  ArrowsClockwiseIcon,
  BarbellIcon,
  BooksIcon,
  CalendarCheckIcon,
  ChatCircleTextIcon,
  ChatsCircleIcon,
  CoffeeIcon,
  CompassIcon,
  DnaIcon,
  FolderOpenIcon,
  HandshakeIcon,
  LightbulbIcon,
  MapTrifoldIcon,
  MegaphoneIcon,
  MoonIcon,
  MoonStarsIcon,
  PillIcon,
  PulseIcon,
  RocketLaunchIcon,
  ScalesIcon,
  StackIcon,
  SunIcon,
  WallIcon,
  WrenchIcon,
} from "@phosphor-icons/react/dist/ssr";

/**
 * Notion's section emojis become Phosphor duotone glyphs at render time;
 * Notion itself keeps the emojis. Sections resolve by id first so a re-picked
 * emoji upstream cannot silently swap a glyph, then by emoji so a brand-new
 * section degrades to something sensible before it earns a dedicated entry.
 */
const iconById: Record<string, Icon> = {
  // routine
  "why-early": AlarmIcon,
  morning: SunIcon,
  evening: MoonStarsIcon,
  "supp-stacks": PillIcon,
  "sinusoidal-vs-square-wave-alertness": PulseIcon,
  caffeine: CoffeeIcon,
  "sleep-duration": MoonIcon,
  "getting-back-on-track": ArrowsClockwiseIcon,
  // manual
  "personality-strengths-blind-spots": DnaIcon,
  "how-we-collaborate": HandshakeIcon,
  communication: MegaphoneIcon,
  feedback: ChatCircleTextIcon,
  hobbies: BarbellIcon,
  // systems: the four sections, then the seven layers
  "at-a-glance": MapTrifoldIcon,
  "the-seven-layers": StackIcon,
  considerations: ScalesIcon,
  "tips-for-getting-started": LightbulbIcon,
  "further-reading": BooksIcon,
  foundations: WallIcon,
  "direction-strategy": CompassIcon,
  "planning-review-cycles": CalendarCheckIcon,
  "execution-systems": RocketLaunchIcon,
  "feedback-counsel": ChatsCircleIcon,
  "domain-systems": FolderOpenIcon,
  "tools-infrastructure": WrenchIcon,
};

const iconByEmoji: Record<string, Icon> = {
  "⏰": AlarmIcon,
  "🌅": SunIcon,
  "🌆": MoonStarsIcon,
  "💊": PillIcon,
  "📈": PulseIcon,
  "☕": CoffeeIcon,
  "💤": MoonIcon,
  "🔄": ArrowsClockwiseIcon,
  "🧬": DnaIcon,
  "🤝": HandshakeIcon,
  "📣": MegaphoneIcon,
  "💬": ChatCircleTextIcon,
  "💪": BarbellIcon,
  "🗺️": MapTrifoldIcon,
  "🥞": StackIcon,
  "💡": LightbulbIcon,
  "📚": BooksIcon,
  "🧱": WallIcon,
  "🧭": CompassIcon,
  "📆": CalendarCheckIcon,
  "🚀": RocketLaunchIcon,
  "🗂️": FolderOpenIcon,
  "🛠️": WrenchIcon,
};

/**
 * Every glyph carries a family from the fixed daylight palette. The timeline
 * arms keep their axis colors (ochre morning, dusk-slate evening); the other
 * sections each take one of the muted families defined in daylight.css by
 * topic. The palette is closed — a new section picks from these seven, it
 * does not invent an eighth.
 */
export type Accent =
  | "am"
  | "pm"
  | "moss"
  | "coral"
  | "coffee"
  | "indigo"
  | "plum";

const accentById: Record<string, Accent> = {
  // routine
  "why-early": "am", // dawn
  morning: "am", // the axis's own ochre
  evening: "pm", // the axis's own dusk slate
  "supp-stacks": "moss",
  "sinusoidal-vs-square-wave-alertness": "coral", // pulse
  caffeine: "coffee",
  "sleep-duration": "indigo",
  "getting-back-on-track": "plum",
  // manual
  "personality-strengths-blind-spots": "plum",
  "how-we-collaborate": "am",
  communication: "pm",
  feedback: "moss",
  hobbies: "coral",
  // systems
  "at-a-glance": "indigo",
  "the-seven-layers": "am",
  considerations: "pm",
  "tips-for-getting-started": "moss",
  "further-reading": "coffee",
  foundations: "plum",
  "direction-strategy": "indigo",
  "planning-review-cycles": "am",
  "execution-systems": "coral",
  "feedback-counsel": "moss",
  "domain-systems": "coffee",
  "tools-infrastructure": "pm",
};

const accentClass: Record<Accent, string> = {
  am: "text-[hsl(var(--dl-am))]",
  pm: "text-[hsl(var(--dl-pm))]",
  moss: "text-[hsl(var(--dl-ic-moss))]",
  coral: "text-[hsl(var(--dl-ic-coral))]",
  coffee: "text-[hsl(var(--dl-ic-coffee))]",
  indigo: "text-[hsl(var(--dl-ic-indigo))]",
  plum: "text-[hsl(var(--dl-plum))]",
};

/** The text class for one of the seven daylight accents, for glyphs that are
 * not sections (site destinations in running text). */
export function daylightAccentClass(accent: Accent): string {
  return accentClass[accent];
}

export function sectionIcon(id: string, emoji?: string): Icon | null {
  return iconById[id] ?? (emoji ? (iconByEmoji[emoji] ?? null) : null);
}

/** The accent family itself, for renderers that cannot take a Tailwind
 * class (the satori OG cards paint it from NIGHT_ACCENT). */
export function sectionAccent(id: string): Accent | null {
  return accentById[id] ?? null;
}

export function sectionAccentClass(id: string): string | null {
  const accent = sectionAccent(id);
  return accent ? accentClass[accent] : null;
}

export function SectionIcon({
  id,
  emoji,
  size = 18,
  className,
}: {
  id: string;
  emoji?: string;
  size?: number;
  className?: string;
}) {
  const Glyph = sectionIcon(id, emoji);
  if (!Glyph) {
    return emoji ? <span className={className}>{emoji}</span> : null;
  }
  const color = sectionAccentClass(id) ?? "text-muted-foreground/85";
  return (
    <Glyph
      size={size}
      weight="duotone"
      className={`${color} ${className ?? ""}`}
    />
  );
}

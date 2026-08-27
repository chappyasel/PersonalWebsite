import type { Icon } from "@phosphor-icons/react";
import {
  AlarmIcon,
  ArrowsClockwiseIcon,
  BarbellIcon,
  ChatCircleTextIcon,
  CoffeeIcon,
  DnaIcon,
  HandshakeIcon,
  MegaphoneIcon,
  MoonIcon,
  MoonStarsIcon,
  PillIcon,
  PulseIcon,
  SunIcon,
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
};

export function sectionIcon(id: string, emoji?: string): Icon | null {
  return iconById[id] ?? (emoji ? (iconByEmoji[emoji] ?? null) : null);
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
  return <Glyph size={size} weight="duotone" className={className} />;
}

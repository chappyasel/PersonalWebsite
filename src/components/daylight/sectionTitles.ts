/**
 * Phone-width stand-ins for the section titles that wrap on a narrow screen.
 * Notion keeps the full title; the page shows it from the `sm` breakpoint up,
 * and the OG card uses the same short form so the two never disagree. Keyed
 * by section id like the icons, so an upstream rename cannot silently drop
 * one.
 */
const shortTitleById: Record<string, string> = {
  "personality-strengths-blind-spots": "Personality & Strengths",
};

export function sectionShortTitle(id: string): string | null {
  return shortTitleById[id] ?? null;
}

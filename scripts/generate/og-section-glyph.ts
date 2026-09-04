/**
 * The section glyph the page shows, drawn for the night OG cards: the same
 * icon and accent family as sectionIcons.tsx, in the night palette.
 */
import {
  sectionAccent,
  sectionIcon,
} from "../../src/components/daylight/sectionIcons";
import { NIGHT, NIGHT_ACCENT } from "../../src/lib/og/daylight";
import { phosphorSvg } from "../../src/lib/og/phosphor";
import React, { type ReactElement } from "react";

export function sectionGlyph(id: string, size: number): ReactElement | null {
  const Glyph = sectionIcon(id);
  if (!Glyph) return null;
  const accent = sectionAccent(id);
  return phosphorSvg(Glyph, {
    size,
    color: accent ? NIGHT_ACCENT[accent] : NIGHT.inkMuted,
  });
}

/**
 * The section labels as centred rows of glyph + text, split as evenly as
 * the count allows (eight becomes 4 + 4, five becomes 3 + 2).
 */
export function sectionLabelRows(
  sections: { id: string; text: string }[],
  {
    fontSize,
    glyphSize,
    gap = "34px",
    rowGap = "12px",
    rows = 2,
  }: {
    fontSize: number;
    glyphSize: number;
    gap?: string;
    rowGap?: string;
    rows?: number;
  },
): ReactElement {
  const perRow = Math.ceil(sections.length / rows);
  const chunks: { id: string; text: string }[][] = [];
  for (let i = 0; i < sections.length; i += perRow) {
    chunks.push(sections.slice(i, i + perRow));
  }
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: rowGap,
        fontSize: `${fontSize}px`,
      },
    },
    ...chunks.map((chunk, r) =>
      React.createElement(
        "div",
        { key: r, style: { display: "flex", alignItems: "center", gap } },
        ...chunk.map((s) =>
          React.createElement(
            "span",
            {
              key: s.id,
              style: {
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: NIGHT.inkFaint,
              },
            },
            sectionGlyph(s.id, glyphSize),
            s.text,
          ),
        ),
      ),
    ),
  );
}

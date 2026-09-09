import type { BookLookup, ManualHeroPanel } from "../types";
import { Fragment } from "react";

import DaylightSection from "~/components/daylight/DaylightSection";
import { NotionBlockRenderer } from "~/components/notion";

/**
 * The hero's panels as the page's first section. The first panel gives the
 * section its heading and anchor (`tl-dr` today, from Notion's slug), and
 * every panel after it is a subheading inside that section with its blocks
 * under it, at the H3 the section bodies already use for theirs.
 *
 * The panels used to be three bordered cards between the sky and the rail.
 * That put the rail a screen below the hero and left the TL;DR off it, even
 * though it is the one part of the page a reader is most likely to want to
 * jump back to.
 *
 * Positional, like the sync: the site still does not know the panels by
 * name, so a renamed or added panel flows through. Only the glyph is keyed
 * to the id (sectionIcons.tsx).
 */
export default function ManualOverview({
  panels,
  bookLookup,
}: {
  panels: ManualHeroPanel[];
  bookLookup?: BookLookup;
}) {
  const [opener, ...rest] = panels;
  if (!opener) return null;

  return (
    <DaylightSection id={opener.id} title={opener.title}>
      <div className="dl-prose pt-5">
        {opener.blocks.map((block, i) => (
          <NotionBlockRenderer key={i} block={block} bookLookup={bookLookup} />
        ))}
        {rest.map((panel) => (
          <Fragment key={panel.id}>
            <h3 id={panel.id} className="scroll-mt-24">
              {panel.title}
            </h3>
            {panel.blocks.map((block, i) => (
              <NotionBlockRenderer
                key={i}
                block={block}
                bookLookup={bookLookup}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </DaylightSection>
  );
}

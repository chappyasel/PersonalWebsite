import type { BookLookup, ManualSection as ManualSectionType } from "../types";

import AnchorLink from "~/components/daylight/AnchorLink";
import { SectionIcon } from "~/components/daylight/sectionIcons";
import { sectionShortTitle } from "~/components/daylight/sectionTitles";
import { NotionBlockRenderer } from "~/components/notion";

export default function ManualSection({
  section,
  bookLookup,
}: {
  section: ManualSectionType;
  bookLookup?: BookLookup;
}) {
  const shortTitle = sectionShortTitle(section.id);

  return (
    <section id={section.id} className="scroll-mt-24">
      <div className="group/sec flex items-center gap-2.5 border-b border-border/80 pb-2">
        <SectionIcon
          id={section.id}
          emoji={section.icon}
          size={18}
          className="shrink-0"
        />
        <h2 className="dl-h2">
          {shortTitle ? (
            <>
              <span className="sm:hidden">{shortTitle}</span>
              <span className="hidden sm:inline">{section.title}</span>
            </>
          ) : (
            section.title
          )}
        </h2>
        <AnchorLink id={section.id} />
      </div>
      <div className="space-y-3 pt-3.5 text-[0.9375rem] text-muted-foreground">
        {section.blocks.map((block, i) => (
          <NotionBlockRenderer key={i} block={block} bookLookup={bookLookup} />
        ))}
      </div>
    </section>
  );
}

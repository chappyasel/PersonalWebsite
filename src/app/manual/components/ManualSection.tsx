import AnchorLink from "~/components/daylight/AnchorLink";
import { SectionIcon } from "~/components/daylight/sectionIcons";
import { NotionBlockRenderer } from "~/components/notion";

import type { BookLookup, ManualSection as ManualSectionType } from "../types";

export default function ManualSection({
  section,
  bookLookup,
}: {
  section: ManualSectionType;
  bookLookup?: BookLookup;
}) {
  return (
    <section id={section.id} className="scroll-mt-24">
      <div className="group/sec flex items-center gap-2.5 border-b border-border/80 pb-2">
        <SectionIcon
          id={section.id}
          emoji={section.icon}
          size={18}
          className="shrink-0"
        />
        <h2 className="dl-h2">{section.title}</h2>
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

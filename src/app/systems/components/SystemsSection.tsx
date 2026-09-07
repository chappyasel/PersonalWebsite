import type { SystemsSection as SystemsSectionType } from "../types";

import AnchorLink from "~/components/daylight/AnchorLink";
import { SectionIcon } from "~/components/daylight/sectionIcons";
import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup } from "~/components/notion/types";

import LayerSections from "./LayerSections";

/**
 * One top-level section. A flat section renders its blocks; the layered
 * section hands its seven layers to the accordion, which owns their anchors.
 */
export default function SystemsSection({
  section,
  bookLookup,
}: {
  section: SystemsSectionType;
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
      {section.layers ? (
        <LayerSections layers={section.layers} bookLookup={bookLookup} />
      ) : (
        <div className="space-y-3 pt-3.5 text-[0.9375rem] text-muted-foreground">
          {section.blocks.map((block, i) => (
            <NotionBlockRenderer
              key={i}
              block={block}
              bookLookup={bookLookup}
              relaxedLists
            />
          ))}
        </div>
      )}
    </section>
  );
}

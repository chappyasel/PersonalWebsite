import type { SystemsSection as SystemsSectionType } from "../types";

import DaylightSection from "~/components/daylight/DaylightSection";
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
    <DaylightSection id={section.id} emoji={section.icon} title={section.title}>
      {section.layers ? (
        <LayerSections layers={section.layers} bookLookup={bookLookup} />
      ) : (
        <div className="dl-prose pt-5">
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
    </DaylightSection>
  );
}

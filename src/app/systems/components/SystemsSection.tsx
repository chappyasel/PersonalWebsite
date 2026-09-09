import type { SystemsSection as SystemsSectionType } from "../types";

import DaylightSection from "~/components/daylight/DaylightSection";
import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup } from "~/components/notion/types";

import LayerSections from "./LayerSections";

/** Sections that start folded (owner's call, 2026-09-09: Considerations
 * pushed Further Reading a screen further down). A deep link, a rail click,
 * or a search result still opens them. */
const FOLDED_BY_DEFAULT = new Set(["further-reading"]);

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
    <DaylightSection
      id={section.id}
      emoji={section.icon}
      title={section.title}
      defaultOpen={!FOLDED_BY_DEFAULT.has(section.id)}
    >
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

import type { RoutineSection as RoutineSectionType } from "../types";

import DaylightSection from "~/components/daylight/DaylightSection";
import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup } from "~/components/notion/types";

export default function RoutineSection({
  section,
  bookLookup,
  defaultOpen = true,
}: {
  section: RoutineSectionType;
  bookLookup?: BookLookup;
  defaultOpen?: boolean;
}) {
  return (
    <DaylightSection
      id={section.id}
      emoji={section.icon}
      title={section.title}
      defaultOpen={defaultOpen}
    >
      <div className="dl-prose pb-4 pt-5">
        {section.blocks.map((block, i) => (
          <NotionBlockRenderer key={i} block={block} bookLookup={bookLookup} />
        ))}
      </div>
    </DaylightSection>
  );
}

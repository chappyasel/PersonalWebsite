import type { BookLookup, ManualSection as ManualSectionType } from "../types";

import DaylightSection from "~/components/daylight/DaylightSection";
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
    <DaylightSection
      id={section.id}
      emoji={section.icon}
      title={
        shortTitle ? (
          <>
            <span className="sm:hidden">{shortTitle}</span>
            <span className="hidden sm:inline">{section.title}</span>
          </>
        ) : (
          section.title
        )
      }
    >
      <div className="dl-prose pt-5">
        {section.blocks.map((block, i) => (
          <NotionBlockRenderer key={i} block={block} bookLookup={bookLookup} />
        ))}
      </div>
    </DaylightSection>
  );
}

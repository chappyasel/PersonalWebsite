"use client";

import { useId, useState } from "react";

import type {
  BookLookup,
  NotionBlock,
  RichText,
} from "~/components/notion/types";
import { DisclosureCaret, DisclosurePanel } from "~/components/ui/disclosure";

import NotionBlockRenderer from "./NotionBlockRenderer";
import RichTextRenderer from "./RichTextRenderer";

export default function NotionToggle({
  title,
  blocks,
  bookLookup,
}: {
  title: RichText[];
  blocks: NotionBlock[];
  bookLookup?: BookLookup;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div>
      <button
        type="button"
        aria-controls={contentId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        // The caret sits in the gutter where a sibling list's bullets are (the
        // renderer's lists are ml-4), so the title and the body start on the
        // list text's column.
        className="-ml-1 flex w-full items-start gap-2 rounded-sm py-1 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <DisclosureCaret open={open} />
        <span className="font-medium">
          <RichTextRenderer content={title} bookLookup={bookLookup} />
        </span>
      </button>
      <DisclosurePanel id={contentId} open={open}>
        <div className="space-y-2 pb-2 pl-4 pt-1">
          {blocks.map((block, i) => (
            <NotionBlockRenderer
              key={i}
              block={block}
              bookLookup={bookLookup}
            />
          ))}
        </div>
      </DisclosurePanel>
    </div>
  );
}

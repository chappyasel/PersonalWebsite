"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import { Fragment, useId, useState } from "react";

import type {
  BookLookup,
  NotionBlock,
  RichText,
} from "~/components/notion/types";
import { DisclosureCaret, DisclosurePanel } from "~/components/ui/disclosure";

import NotionBlockRenderer from "./NotionBlockRenderer";
import RichTextRenderer from "./RichTextRenderer";

const LEADING_ARROW = /^\s*→\s*/u;

function ToggleTitle({
  title,
  bookLookup,
}: {
  title: RichText[];
  bookLookup?: BookLookup;
}) {
  return title.map((run, index) => {
    const match = LEADING_ARROW.exec(run.text);
    if (!match) {
      return (
        <RichTextRenderer key={index} content={[run]} bookLookup={bookLookup} />
      );
    }

    const remaining = run.text.slice(match[0].length);
    return (
      <Fragment key={index}>
        <ArrowRightIcon
          aria-hidden="true"
          data-notion-toggle-arrow=""
          size={15}
          weight="bold"
          className="mx-1 inline-block -translate-y-px text-muted-foreground/55"
        />
        {remaining && (
          <RichTextRenderer
            content={[{ ...run, text: remaining }]}
            bookLookup={bookLookup}
          />
        )}
      </Fragment>
    );
  });
}

export default function NotionToggle({
  title,
  blocks,
  bookLookup,
  variant,
}: {
  title: RichText[];
  blocks: NotionBlock[];
  bookLookup?: BookLookup;
  /** "note": an aside, styled apart from content dropdowns (daylight.css). */
  variant?: "note";
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div data-notion-toggle={variant ?? ""}>
      <button
        data-notion-toggle-trigger=""
        type="button"
        aria-controls={contentId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        // The caret sits in the gutter where a sibling list's bullets are (the
        // renderer's lists are ml-4), so the title and the body start on the
        // list text's column. No vertical padding: the row is one line tall,
        // like a list item, and .dl-prose spaces it like one.
        className="group/notion-toggle flex w-full items-start gap-2 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <DisclosureCaret
          open={open}
          className="group-hover/notion-toggle:text-foreground"
        />
        <span className="font-medium">
          <ToggleTitle title={title} bookLookup={bookLookup} />
        </span>
      </button>
      <DisclosurePanel id={contentId} open={open}>
        <div className="dl-prose pb-1 pl-6 pt-1.5">
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

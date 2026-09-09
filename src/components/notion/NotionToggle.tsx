"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import { Fragment, useId, useState } from "react";

import type {
  BookLookup,
  NotionBlock,
  RichText,
} from "~/components/notion/types";
import { DisclosureCaret, DisclosurePanel } from "~/components/ui/disclosure";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import NotionBlockRenderer from "./NotionBlockRenderer";
import RichTextRenderer from "./RichTextRenderer";
import { STATUS_DOT_GLUE, statusDotClassName } from "./StatusDot";
import { SYSTEM_STATUS_LABEL, type SystemStatus } from "./systemStatus";

const LEADING_ARROW = /^\s*→\s*/u;

/**
 * The title's runs, with the arrow run's "→" drawn as an icon. A status dot
 * sits right after the system's name: before the arrow when the title has
 * one, else after the last run.
 */
function ToggleTitle({
  title,
  bookLookup,
  status,
}: {
  title: RichText[];
  bookLookup?: BookLookup;
  status?: SystemStatus;
}) {
  const arrowAt = title.findIndex((run) => LEADING_ARROW.test(run.text));
  const dot = status ? <StatusDot status={status} /> : null;
  const runs = title.map((run, index) => {
    const match = LEADING_ARROW.exec(run.text);
    if (!match) {
      return (
        <RichTextRenderer key={index} content={[run]} bookLookup={bookLookup} />
      );
    }

    const remaining = run.text.slice(match[0].length);
    return (
      <Fragment key={index}>
        {index === arrowAt && dot}
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
  return (
    <>
      {runs}
      {arrowAt === -1 && dot}
    </>
  );
}

/**
 * The system's implementation state as a small dot after its name, named
 * on hover, or on a tap where there is no hover. There is no legend: the
 * tooltip is the only place a state is named. A live (unmarked) system
 * draws nothing.
 *
 * The dot lives inside the dropdown's button, so its click is stopped
 * there: a tap on the dot names the state and leaves the dropdown alone. An
 * invisible halo (the ::after box) makes the 9px dot a finger-sized target
 * without moving anything on the line.
 */
function StatusDot({ status }: { status: SystemStatus }) {
  const label = SYSTEM_STATUS_LABEL[status];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip allowTapFirst>
        <TooltipTrigger asChild>
          <span
            data-system-status={status}
            onClick={(event) => {
              // Stop: the dropdown button behind the dot. Prevent: Radix
              // closes a tooltip on its trigger's click unless the click was
              // default-prevented, which would shut the one a tap just
              // opened on pointer-up.
              event.preventDefault();
              event.stopPropagation();
            }}
            className={statusDotClassName(
              status,
              "relative ml-1 cursor-help after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
            )}
          >
            {STATUS_DOT_GLUE}
            <span className="sr-only">{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function NotionToggle({
  title,
  blocks,
  bookLookup,
  variant,
  status,
}: {
  title: RichText[];
  blocks: NotionBlock[];
  bookLookup?: BookLookup;
  /** "note": an aside, styled apart from content dropdowns (daylight.css). */
  variant?: "note";
  /** Implementation state (systems page); absent means live. */
  status?: SystemStatus;
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
          <ToggleTitle title={title} bookLookup={bookLookup} status={status} />
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

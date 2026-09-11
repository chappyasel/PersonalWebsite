"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import { Fragment, useEffect, useId, useRef, useState } from "react";

import AnchorLink from "~/components/daylight/AnchorLink";
import { releaseHash } from "~/components/daylight/hashTarget";
import { SECTION_JUMP_EVENT } from "~/components/daylight/sectionJump";
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
        <RichTextRenderer
          key={index}
          content={[run]}
          bookLookup={bookLookup}
          secondary={arrowAt !== -1 && index > arrowAt}
        />
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
            secondary
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
  relaxedLists = false,
  marker,
  id,
}: {
  title: RichText[];
  blocks: NotionBlock[];
  bookLookup?: BookLookup;
  /** "note": an aside, styled apart from content dropdowns (daylight.css). */
  variant?: "note";
  /** Implementation state (systems page); absent means live. */
  status?: SystemStatus;
  /** Passed down so a dropdown in a relaxed list keeps that rhythm inside. */
  relaxedLists?: boolean;
  /** A list number to draw on the title's own line, in the gutter where the
   * list's native marker would sit (see ListItem). */
  marker?: string;
  /** Page-unique anchor. Opening the dropdown puts it in the address bar
   * (replaced, never pushed) so the URL can be copied and sent; a URL that
   * carries it opens the dropdown on arrival, along with every dropdown
   * around it, and scrolls it under the sticky rail. */
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    function handle() {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      const self = ref.current;
      if (!hash || !self) return;
      if (hash === id) {
        setOpen(true);
        const scroll = () =>
          self.scrollIntoView({ behavior: "smooth", block: "start" });
        // Once now, then after the layer's and the panel's own folds have
        // added their height; scroll-margin-top clears the rail.
        requestAnimationFrame(scroll);
        window.setTimeout(scroll, 380);
        window.setTimeout(scroll, 720);
        return;
      }
      // A dropdown nested inside this one is the target: open, and let it
      // scroll itself.
      const target = document.getElementById(hash);
      if (target && self.contains(target)) setOpen(true);
    }
    handle();
    window.addEventListener("hashchange", handle);
    window.addEventListener(SECTION_JUMP_EVENT, handle);
    return () => {
      window.removeEventListener("hashchange", handle);
      window.removeEventListener(SECTION_JUMP_EVENT, handle);
    };
  }, [id]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!id) return;
    if (next) window.history.replaceState(null, "", `#${id}`);
    else if (window.location.hash === `#${id}`) releaseHash();
  };

  return (
    <div
      ref={ref}
      id={id}
      data-notion-toggle={variant ?? ""}
      className={id ? "scroll-mt-24" : undefined}
    >
      <div className="group/sec flex items-start gap-1">
        <button
          data-notion-toggle-trigger=""
          type="button"
          aria-controls={contentId}
          aria-expanded={open}
          onClick={toggle}
          // The caret sits in the gutter where a sibling list's bullets are (the
          // renderer's lists are ml-4), so the title and the body start on the
          // list text's column. No vertical padding: the row is one line tall,
          // like a list item, and .dl-prose spaces it like one.
          className="group/notion-toggle relative flex w-full items-start gap-2 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {marker && (
            <span
              aria-hidden="true"
              data-notion-toggle-marker=""
              className="absolute right-full top-0 mr-[0.3em] select-none tabular-nums text-muted-foreground/40"
            >
              {marker}
            </span>
          )}
          <DisclosureCaret
            open={open}
            className="group-hover/notion-toggle:text-foreground"
          />
          <span className="font-medium">
            <ToggleTitle
              title={title}
              bookLookup={bookLookup}
              status={status}
            />
          </span>
        </button>
        {id && <AnchorLink id={id} />}
      </div>
      <DisclosurePanel id={contentId} open={open}>
        <div className="dl-prose pb-3 pl-6 pt-1.5">
          {blocks.map((block, i) => (
            <NotionBlockRenderer
              key={i}
              block={block}
              bookLookup={bookLookup}
              relaxedLists={relaxedLists}
            />
          ))}
        </div>
      </DisclosurePanel>
    </div>
  );
}

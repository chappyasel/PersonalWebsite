"use client";

import type { SystemsLayer } from "../types";
import { useEffect, useMemo, useState } from "react";

import AnchorLink from "~/components/daylight/AnchorLink";
import { releaseHash } from "~/components/daylight/hashTarget";
import { SectionIcon } from "~/components/daylight/sectionIcons";
import { SECTION_JUMP_EVENT } from "~/components/daylight/sectionJump";
import { NotionBlockRenderer } from "~/components/notion";
import type { BookLookup } from "~/components/notion/types";
import { DisclosureCaret } from "~/components/ui/disclosure";

/** Tailwind's `sm` breakpoint, the width at which the layers stop folding. */
const WIDE = "(min-width: 640px)";

/** Layers that stay folded at every width until opened (owner's call: the
 * Domain Systems layer is 19 dropdowns long). A deep link still opens them. */
const FOLDED_BY_DEFAULT = new Set(["domain-systems"]);

/**
 * A layer with no explicit choice is "auto": open from `sm` up, folded on a
 * phone. The stylesheet decides that (`sm:data-[open=auto]:grid-rows-[1fr]`),
 * so the server render is right at every width before any script runs.
 */
type Choice = Record<string, boolean>;

function scrollToLayer(id: string) {
  const scroll = () =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  // Once now, once after the fold animation has added the layer's own
  // height below the header; scroll-margin-top clears the sticky TOC.
  requestAnimationFrame(scroll);
  window.setTimeout(scroll, 380);
}

/**
 * The seven layers. On a phone they are an accordion: one open at a time,
 * so a page of 46 dropdowns stays a list of seven headings until one is
 * tapped. From `sm` up every layer is open and each folds on its own. A
 * deep link (#foundations, the At a Glance title links, a search
 * result) opens its layer at any width and scrolls to it.
 */
export default function LayerSections({
  layers,
  bookLookup,
}: {
  layers: SystemsLayer[];
  bookLookup?: BookLookup;
}) {
  const ids = useMemo(() => layers.map((layer) => layer.id), [layers]);
  const [choice, setChoice] = useState<Choice>({});
  // False until mounted, so aria-expanded is only ever wrong for the first
  // paint on a wide screen; the fold itself is CSS and never wrong.
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    function handle() {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!ids.includes(hash)) return;
      setChoice((current) =>
        window.matchMedia(WIDE).matches
          ? { ...current, [hash]: true }
          : { [hash]: true },
      );
      scrollToLayer(hash);
    }
    handle();
    window.addEventListener("hashchange", handle);
    window.addEventListener(SECTION_JUMP_EVENT, handle);
    return () => {
      window.removeEventListener("hashchange", handle);
      window.removeEventListener(SECTION_JUMP_EVENT, handle);
    };
  }, [ids]);

  const toggle = (id: string) => {
    releaseHash(); // drop the deep-link target so it stops forcing the fold
    setChoice((current) => {
      const isOpen = current[id] ?? (wide && !FOLDED_BY_DEFAULT.has(id));
      if (wide) return { ...current, [id]: !isOpen };
      // Accordion: an explicit choice for this layer alone, every other
      // layer back to auto (folded at this width).
      return { [id]: !isOpen };
    });
  };

  return (
    <div className="space-y-4">
      {layers.map((layer) => {
        const state = choice[layer.id];
        const folded = FOLDED_BY_DEFAULT.has(layer.id);
        const expanded = state ?? (wide && !folded);
        return (
          <section
            key={layer.id}
            id={layer.id}
            data-systems-layer
            className="scroll-mt-24"
          >
            <div
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              onClick={() => toggle(layer.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle(layer.id);
                }
              }}
              className="group/sec flex w-full cursor-pointer items-center gap-2.5 py-3.5 text-left"
            >
              <div className="flex shrink-0 items-center gap-1.5">
                {layer.number !== null && (
                  <span
                    data-systems-layer-number=""
                    className="w-3 shrink-0 text-center font-serif text-sm tabular-nums text-muted-foreground/60"
                  >
                    {layer.number}
                  </span>
                )}
                <SectionIcon
                  id={layer.id}
                  emoji={layer.icon}
                  size={20}
                  className="shrink-0"
                />
              </div>
              <h3
                data-systems-layer-title=""
                className="text-[1.375rem] font-semibold leading-tight text-foreground"
              >
                {layer.title}
              </h3>
              <AnchorLink id={layer.id} />
              <DisclosureCaret
                data-systems-caret
                open={expanded}
                className="ml-auto group-hover/sec:text-foreground"
              />
            </div>
            <div
              data-systems-fold
              data-open={
                state === undefined
                  ? folded
                    ? "folded"
                    : "auto"
                  : String(state)
              }
              className="duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] grid grid-rows-[0fr] transition-[grid-template-rows] data-[open=true]:grid-rows-[1fr] sm:data-[open=auto]:grid-rows-[1fr]"
            >
              <div className="overflow-hidden">
                <div
                  data-systems-layer-body=""
                  className="dl-prose pb-5 pl-1 pt-1"
                >
                  {layer.blocks.map((block, i) => (
                    <NotionBlockRenderer
                      key={i}
                      block={block}
                      bookLookup={bookLookup}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

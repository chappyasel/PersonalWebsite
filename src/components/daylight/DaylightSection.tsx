"use client";

import { type ComponentPropsWithoutRef, type ReactNode, useState } from "react";

import { cn } from "~/lib/util";

import { DisclosureCaret } from "~/components/ui/disclosure";

import AnchorLink from "./AnchorLink";
import { releaseHash, useHashTarget } from "./hashTarget";
import { SectionIcon } from "./sectionIcons";

/**
 * A top-level document section that folds. Every section on the daylight
 * pages (manual, routine, systems) is one of these, open unless the page
 * says otherwise; the systems page's Domain Systems layer folds by default
 * inside its own accordion (LayerSections). A deep link or a rail click
 * opens a folded section (useHashTarget), and the `:target` rule in
 * daylight.css opens it before any script runs.
 */
export default function DaylightSection({
  id,
  title,
  emoji,
  defaultOpen = true,
  className,
  children,
  ...rest
}: Omit<ComponentPropsWithoutRef<"section">, "id" | "title"> & {
  id: string;
  title: ReactNode;
  /** Fallback glyph when the id has no dedicated icon. */
  emoji?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useHashTarget(id, setOpen);

  const toggle = () => {
    releaseHash(); // drop the deep-link target so :target stops forcing open
    setOpen((v) => !v);
  };

  return (
    <section
      id={id}
      className={cn("dl-collapsible scroll-mt-24", className)}
      {...rest}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="group/sec flex w-full cursor-pointer items-center gap-3 border-b border-border/80 pb-2.5 text-left"
      >
        <SectionIcon id={id} emoji={emoji} size={22} className="shrink-0" />
        <h2 className="dl-h2">{title}</h2>
        <AnchorLink id={id} />
        <DisclosureCaret
          data-dl-caret
          open={open}
          className="ml-auto group-hover/sec:text-foreground"
        />
      </div>
      <div
        data-dl-collapse
        data-open={open}
        className="duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] grid grid-rows-[0fr] transition-[grid-template-rows] data-[open=true]:grid-rows-[1fr]"
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </section>
  );
}

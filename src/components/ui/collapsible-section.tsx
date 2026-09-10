"use client";

import { type ReactNode, useId } from "react";

import { cn } from "~/lib/utils";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./accordion";
import { Card } from "./card";

export function CollapsibleSection({
  icon,
  title,
  defaultOpen = true,
  children,
  cardClassName,
}: {
  icon: ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  cardClassName?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <Accordion
        type="single"
        collapsible
        defaultValue={defaultOpen ? "content" : undefined}
      >
        <AccordionItem value="content" className="border-0">
          <AccordionTrigger
            id={headingId}
            className="mb-4 gap-2 py-0 font-rounded text-lg font-medium text-neutral-700 hover:no-underline hover:opacity-80 dark:text-neutral-200 [&>svg]:text-neutral-400 dark:[&>svg]:text-neutral-500"
          >
            <span className="flex items-center gap-2">
              {icon}
              <span>{title}</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <Card
              className={cn(
                "border-neutral-200 bg-white p-4 shadow-none dark:border-neutral-700 dark:bg-neutral-800",
                cardClassName,
              )}
            >
              {children}
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

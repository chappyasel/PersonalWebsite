import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

import { Card } from "~/components/ui/card";

/**
 * One part of the owner's editor in a card, always open. Plan and Set
 * points show their title, since a phone's nav names them with an icon
 * only. The Weeks table is the page itself and goes without one.
 */
export function EditorSection({
  title,
  icon,
  showTitle = true,
  cardClassName,
  children,
}: {
  title: string;
  icon?: ReactNode;
  showTitle?: boolean;
  cardClassName?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3">
      {showTitle ? (
        <h2 className="flex items-center gap-2 font-rounded text-lg font-medium text-neutral-700 dark:text-neutral-200">
          {icon}
          {title}
        </h2>
      ) : null}
      <Card
        className={cn(
          "border-neutral-200 bg-white p-3 shadow-none dark:border-neutral-700 dark:bg-neutral-800 sm:p-4",
          cardClassName,
        )}
      >
        {children}
      </Card>
    </section>
  );
}

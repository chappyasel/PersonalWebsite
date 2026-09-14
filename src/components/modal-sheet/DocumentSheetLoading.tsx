import type { ComponentProps, ReactNode } from "react";

import SkyFooter from "~/components/daylight/SkyFooter";
import { Spinner } from "~/components/ui/spinner";

import ManualHero from "~/app/manual/components/ManualHero";
import MusingHero, { type MusingHeader } from "~/app/musings/MusingHero";
import MusingsHero from "~/app/musings/MusingsHero";
import RoutineHero from "~/app/routine/components/RoutineHero";
import SystemsHero from "~/app/systems/components/SystemsHero";

export type DocumentSheetHeaders = {
  manual: Omit<ComponentProps<typeof ManualHero>, "bookLookup">;
  routine: Omit<ComponentProps<typeof RoutineHero>, "bookLookup">;
  systems: Omit<ComponentProps<typeof SystemsHero>, "bookLookup">;
  musings: Record<string, MusingHeader>;
};

export default function DocumentSheetLoading({
  label,
  href,
  headers,
}: {
  label: string;
  href: string;
  headers: DocumentSheetHeaders;
}) {
  let header: ReactNode;
  if (href === "/systems") header = <SystemsHero {...headers.systems} />;
  else if (href === "/manual") header = <ManualHero {...headers.manual} />;
  else if (href === "/routine") header = <RoutineHero {...headers.routine} />;
  else {
    const article = headers.musings[href];
    header = article ? <MusingHero article={article} /> : <MusingsHero />;
  }

  return (
    <div
      className={`daylight-root flex min-h-full flex-col bg-background text-foreground ${href === "/routine" ? "dl-ground-arc" : "dl-ground-wash"}`}
    >
      {header}
      <div className="flex min-h-24 flex-1 items-center justify-center py-10">
        <Spinner
          aria-label={`Loading ${label}`}
          className="size-5 text-muted-foreground/50 motion-reduce:animate-none"
        />
      </div>
      <SkyFooter />
    </div>
  );
}

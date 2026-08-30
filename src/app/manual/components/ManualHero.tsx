import { BookOpenTextIcon } from "@phosphor-icons/react/dist/ssr";
import React from "react";

import DaylightHeroMeta from "~/components/daylight/HeroMeta";
import SkyHero from "~/components/daylight/SkyHero";
import { ThemeToggle } from "~/components/ui/theme-toggle";

import type { ManualData } from "../types";

function HeroPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--dl-border-strong))] bg-foreground/[0.03] p-6">
      <h3 className="mb-3 font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      {children}
    </div>
  );
}

export default function ManualHero({
  hero,
  lastUpdated,
}: {
  hero: ManualData["hero"];
  lastUpdated: string;
}) {
  return (
    <>
      <SkyHero>
        <div className="space-y-3">
          {/* The toggle keeps the corner it has always had; the wayfinding
              line that used to share this row now sits under the
              description. */}
          <div className="flex justify-end">
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-3">
            <BookOpenTextIcon
              size={28}
              weight="duotone"
              className="shrink-0 text-[hsl(var(--dl-sky-ink))]"
            />
            <h1 className="dl-hero-title">
              <span className="sm:hidden">Chappy&apos;s POM</span>
              <span className="hidden sm:inline">
                Chappy&apos;s Personal Operating Manual
              </span>
            </h1>
          </div>

          <p className="max-w-[34rem] text-[0.9375rem]">
            A guide to how I work, communicate, and collaborate
          </p>

          <DaylightHeroMeta lastUpdated={lastUpdated} />
        </div>
      </SkyHero>

      <div className="mx-auto mt-10 max-w-[45rem] space-y-6 px-4">
        {hero.intro.length > 0 && (
          <HeroPanel label="My 30-Second Introduction">
            <div className="space-y-2">
              {hero.intro.map((line, i) => (
                <p key={i} className="leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </HeroPanel>
        )}

        {hero.missionStatement && (
          <HeroPanel label="My Personal Mission Statement">
            <p className="leading-relaxed italic">{hero.missionStatement}</p>
          </HeroPanel>
        )}

        {hero.goldenRule && (
          <HeroPanel label="The Golden Rule of Working With Me">
            <p className="leading-relaxed">{hero.goldenRule}</p>
          </HeroPanel>
        )}
      </div>
    </>
  );
}

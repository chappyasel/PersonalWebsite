import {
  ArrowLeftIcon,
  BookOpenTextIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import React from "react";

import { ThemeToggle } from "~/components/ui/theme-toggle";

import type { ManualData } from "../types";

export default function ManualHero({
  hero,
  lastUpdated,
}: {
  hero: ManualData["hero"];
  lastUpdated: string;
}) {
  return (
    <div className="space-y-8">
      {/* Title — left aligned */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <BookOpenTextIcon
            size={28}
            weight="duotone"
            className="text-foreground"
          />
          <h1 className="flex-1 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            <span className="sm:hidden">Chappy&apos;s POM</span>
            <span className="hidden sm:inline">
              Chappy&apos;s Personal Operating Manual
            </span>
          </h1>
          <ThemeToggle />
        </div>
        <p className="text-sm text-muted-foreground">
          A guide to how I work, communicate, and collaborate
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
          <Link
            href="https://chappyasel.com"
            className="flex items-center gap-1.5 transition-colors hover:text-muted-foreground"
          >
            <ArrowLeftIcon size={12} weight="bold" />
            chappyasel.com
          </Link>
          <span>·</span>
          <span>
            Last updated{" "}
            {new Date(lastUpdated).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      {hero.intro.length > 0 && (
        <div className="rounded-2xl border border-foreground/[0.06] bg-muted/40 p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground/50">
            My 30-Second Introduction
          </h3>
          <div className="space-y-2">
            {hero.intro.map((line, i) => (
              <p key={i} className="leading-relaxed">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {hero.missionStatement && (
        <div className="rounded-2xl border border-foreground/[0.06] bg-muted/40 p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground/50">
            My Personal Mission Statement
          </h3>
          <p className="leading-relaxed italic">{hero.missionStatement}</p>
        </div>
      )}

      {hero.goldenRule && (
        <div className="rounded-2xl border border-foreground/[0.06] bg-muted/40 p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground/50">
            The Golden Rule of Working With Me
          </h3>
          <p className="leading-relaxed">{hero.goldenRule}</p>
        </div>
      )}

    </div>
  );
}

"use client";

// The semantic vertical home page — SEO baseline, reduced-motion, and
// WebGL-failure fallback. Renders the server-rendered section slots in the
// same order and shell as the pre-Stacks home page.
import { Fragment } from "react";

import { GrainientBackground } from "~/components/ui/grainient-background";

import { type StacksSlots } from "./data";

const FLAT_ORDER = [
  "about",
  "books",
  "training",
  "manual",
  "routine",
  "talks",
  "blog",
  "projects",
  "quotes",
] as const;

export default function FlatHome({ slots }: { slots: StacksSlots }) {
  return (
    <GrainientBackground>
      <main className="relative m-auto flex max-w-screen-md flex-col items-center justify-center gap-20 overflow-visible scroll-smooth bg-transparent p-4 pb-28 font-serif text-muted-foreground">
        {FLAT_ORDER.map((name) => (
          <Fragment key={name}>{slots[name]}</Fragment>
        ))}
      </main>
    </GrainientBackground>
  );
}

"use client";

// The semantic vertical home page — SEO baseline, reduced-motion, and
// WebGL-failure fallback. Renders the server-rendered section slots in the
// 3D world's canonical order.
import { Fragment } from "react";

import { GrainientBackground } from "~/components/ui/grainient-background";

import { type StacksSlots, UNITS } from "./data";

const FLAT_ORDER: ReadonlyArray<keyof StacksSlots> = [
  ...UNITS.map((unit) => unit.slug),
  "quotes",
];

export default function FlatHome({
  slots,
  animated = true,
}: {
  slots: StacksSlots;
  animated?: boolean;
}) {
  return (
    // `stacks-flat` is the hook the pre-paint boot script hides this behind
    // while the world loads. It stays in the DOM either way — it is the
    // crawlable copy of this page, and the fallback if the world never
    // arrives.
    <GrainientBackground className="stacks-flat" animated={animated}>
      <main className="relative m-auto flex max-w-screen-md flex-col items-center justify-center gap-20 overflow-visible scroll-smooth bg-transparent p-4 pb-28 font-serif text-muted-foreground">
        {FLAT_ORDER.map((name) => (
          <Fragment key={name}>{slots[name]}</Fragment>
        ))}
      </main>
    </GrainientBackground>
  );
}

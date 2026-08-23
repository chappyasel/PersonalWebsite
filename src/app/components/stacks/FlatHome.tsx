"use client";

// The semantic vertical home page — SEO baseline, reduced-motion, and
// WebGL-failure fallback. Renders the server-rendered section slots in the
// 3D world's canonical order.
import { Fragment, type ReactNode, useEffect, useRef } from "react";

import { captureOnce } from "~/lib/analytics";

import { GrainientBackground } from "~/components/ui/grainient-background";

import { type StacksSlots, UNITS, type UnitSlug } from "./data";

const FLAT_ORDER: ReadonlyArray<UnitSlug | "quotes"> = [
  ...UNITS.map((unit) => unit.slug),
  "quotes",
];

function TrackedFlatSection({
  active,
  section,
  children,
}: {
  active: boolean;
  section: UnitSlug;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const unit = UNITS.find((candidate) => candidate.slug === section)!;

  useEffect(() => {
    const element = ref.current;
    if (!active || !element || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        captureOnce(`homepage:section:${section}`, "homepage_section_arrived", {
          section,
          delivery_mode: "flat",
        });
        observer.disconnect();
      },
      {
        // Crossing the middle fifth of the viewport is a stable funnel arrival
        // for both short cards and sections taller than the viewport.
        rootMargin: "-40% 0px -40% 0px",
        threshold: 0,
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, section]);

  return (
    <div
      ref={ref}
      id={unit.urlSlug ?? section}
      data-homepage-section={section}
      className="w-full"
    >
      {children}
    </div>
  );
}

export default function FlatHome({
  slots,
  animated = true,
  journeyActive = false,
}: {
  slots: StacksSlots;
  animated?: boolean;
  journeyActive?: boolean;
}) {
  return (
    // `stacks-flat` is the hook the pre-paint boot script hides this behind
    // while the world loads. It stays in the DOM either way — it is the
    // crawlable copy of this page, and the fallback if the world never
    // arrives.
    <GrainientBackground className="stacks-flat" animated={animated}>
      <main className="relative m-auto flex max-w-screen-md flex-col items-center justify-center gap-20 overflow-visible scroll-smooth bg-transparent p-4 pb-28 font-serif text-muted-foreground">
        {FLAT_ORDER.map((name) =>
          name === "quotes" ? (
            <Fragment key={name}>{slots[name]}</Fragment>
          ) : (
            <TrackedFlatSection
              key={name}
              active={journeyActive}
              section={name}
            >
              {slots[name]}
            </TrackedFlatSection>
          ),
        )}
      </main>
    </GrainientBackground>
  );
}

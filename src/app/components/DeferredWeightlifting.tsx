"use client";

import {
  type ComponentType,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ActivityMosaicData,
  WeightliftingStatsData,
} from "~/server/queries/weightlifting";

export function DeferredWeightlifting({
  activity,
  stats,
}: {
  activity: ActivityMosaicData;
  stats: WeightliftingStatsData;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [Weightlifting, setWeightlifting] = useState<ComponentType<{
    activity: ActivityMosaicData;
    stats: WeightliftingStatsData;
  }> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport || Weightlifting) return;
    let cancelled = false;
    void import("./Weightlifting").then((module) => {
      if (!cancelled) setWeightlifting(() => module.default);
    });
    return () => {
      cancelled = true;
    };
  }, [nearViewport, Weightlifting]);

  return (
    <div ref={ref} className="min-h-[360px] w-full">
      {nearViewport && Weightlifting ? (
        <Weightlifting activity={activity} stats={stats} />
      ) : (
        <div
          className="h-[360px] w-full rounded-xl border border-foreground/[0.06] bg-muted/30"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

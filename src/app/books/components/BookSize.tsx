"use client";

import { useQueryState } from "nuqs";

const sizes = ["S", "M", "L"] as const;

export function BookSize() {
  const [sizeParam, setSize] = useQueryState("size");
  const size = sizeParam ?? "M";

  const cycleSize = () => {
    const currentIndex = sizes.indexOf(size as (typeof sizes)[number]);
    const nextIndex = (currentIndex + 1) % sizes.length;
    void setSize(sizes[nextIndex] as string);
  };

  return (
    <button
      onClick={cycleSize}
      aria-label={`Book size: ${size}. Click to cycle size.`}
      className="hidden rounded-md bg-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary/80 hover:text-foreground sm:block"
    >
      {size}
    </button>
  );
}

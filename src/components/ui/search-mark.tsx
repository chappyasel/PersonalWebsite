import type { ReactNode } from "react";

/**
 * A matched search term: the highlighter stroke. The Command palette and the
 * Books shelf both draw their matches with this, so the two searches keep
 * one look. The text keeps its own weight and colour.
 */
export function SearchMark({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded-[2px] bg-amber-500/25 text-inherit dark:bg-amber-300/25">
      {children}
    </mark>
  );
}

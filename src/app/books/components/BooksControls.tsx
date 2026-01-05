"use client";

import { BookSearch } from "./BookSearch";
import { BookSort } from "./BookSort";
import { FilterDrawer } from "./FilterDrawer";

export function BooksControls() {
  return (
    <div className="sticky top-4 z-10 flex flex-col gap-4 rounded-3xl bg-background/95 p-4 backdrop-blur-sm shadow-sm md:flex-row md:items-center md:justify-between">
      {/* Search - full width on mobile, flex-1 on desktop */}
      <div className="flex-1">
        <BookSearch />
      </div>

      {/* Filter (mobile only) + Sort */}
      <div className="flex gap-2">
        <FilterDrawer />
        <BookSort />
      </div>
    </div>
  );
}

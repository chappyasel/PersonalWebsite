"use client";

import { useEffect, useState } from "react";

import { cn } from "~/lib/util";

import { BookSearch } from "./BookSearch";
import { BookSort } from "./BookSort";
import { FilterDrawer } from "./FilterDrawer";

export function BooksControls() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={cn(
        "sticky top-4 z-20 -ml-2 flex w-[calc(100%+16px)] -translate-y-2 flex-col gap-2 rounded-2xl bg-background/80 p-2 backdrop-blur-md transition-all duration-300 sm:flex-row md:items-center md:justify-between",
        isScrolled &&
          "shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] hover:scale-[102%] hover:shadow-[0px_8px_25px_3px_rgba(0,0,0,0.15)] dark:bg-stone-900/60",
      )}
    >
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

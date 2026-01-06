"use client";

import { useEffect, useState } from "react";

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
      className={`sticky top-4 z-10 -ml-4 flex w-[calc(100%+32px)] -translate-y-2 flex-col gap-4 rounded-2xl bg-background/80 p-4 backdrop-blur-md transition-shadow duration-500 md:flex-row md:items-center md:justify-between ${isScrolled ? "shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)]" : ""}`}
    >
      {/* Search - full width on mobile, flex-1 on desktop */}
      <div className="flex-1">
        <BookSearch />
      </div>

      {/* Filter (mobile only) + Sort */}
      <div className="flex gap-4">
        <FilterDrawer />
        <BookSort />
      </div>
    </div>
  );
}

"use client";

import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState } from "react";

import { BookFilters } from "./components/BookFilters";
import { BookSize } from "./components/BookSize";
import { BooksControls } from "./components/BooksControls";
import { BooksGrid } from "./components/BooksGrid";
import { ThemeToggle } from "~/components/ui/theme-toggle";

export default function BooksPage() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-2xl font-bold text-foreground transition-opacity hover:opacity-80 md:text-4xl"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <span className="transition-all">
              {isHovered ? (
                <CaretLeftIcon
                  className="h-6 w-6 md:h-8 md:w-8"
                  weight="bold"
                />
              ) : (
                "📚"
              )}
            </span>
            <span>Chappy&apos;s Book Notes</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <BookSize />
          </div>
        </div>
      </div>

      {/* Desktop: Sidebar + Main */}
      <div className="flex gap-8 2xl:gap-16">
        {/* Desktop Filters Sidebar */}
        <aside className="hidden w-auto shrink-0 sm:block">
          <BookFilters />
        </aside>

        {/* Main Content */}
        <main className="flex flex-1 flex-col gap-6">
          <BooksControls />
          <BooksGrid />
        </main>
      </div>
    </div>
  );
}

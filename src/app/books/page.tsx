"use client";

import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BookFilters } from "./components/BookFilters";
import { BookSize } from "./components/BookSize";
import { BooksControls } from "./components/BooksControls";
import { BooksGrid } from "./components/BooksGrid";
import { useSubdomain } from "~/lib/books/subdomainContext";
import { ThemeToggle } from "~/components/ui/theme-toggle";

export default function BooksPage() {
  const [isHovered, setIsHovered] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const [stickyTop, setStickyTop] = useState(32);
  const { isSubdomain } = useSubdomain();

  useEffect(() => {
    const calculateStickyTop = () => {
      if (sidebarRef.current) {
        const sidebarHeight = sidebarRef.current.offsetHeight;
        const viewportHeight = window.innerHeight;
        const topOffset = 32;
        const bottomOffset = 32;

        if (sidebarHeight + topOffset + bottomOffset > viewportHeight) {
          setStickyTop(viewportHeight - sidebarHeight - bottomOffset);
        } else {
          setStickyTop(topOffset);
        }
      }
    };

    calculateStickyTop();
    window.addEventListener("resize", calculateStickyTop);

    // Watch for sidebar content changes (e.g., when tags load)
    const resizeObserver = new ResizeObserver(calculateStickyTop);
    if (sidebarRef.current) {
      resizeObserver.observe(sidebarRef.current);
    }

    return () => {
      window.removeEventListener("resize", calculateStickyTop);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          {!isSubdomain ? (
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
          ) : (
            <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground md:text-4xl">
              <span>📚</span>
              <span>Chappy&apos;s Book Notes</span>
            </h1>
          )}
          <div className="flex translate-x-3 items-center gap-0">
            <ThemeToggle />
            <BookSize />
          </div>
        </div>
      </div>

      {/* Desktop: Sidebar + Main */}
      <div className="flex gap-8 2xl:gap-16">
        {/* Desktop Filters Sidebar */}
        <aside
          ref={sidebarRef}
          className="hidden w-auto shrink-0 self-start sm:sticky sm:block"
          style={{ top: stickyTop }}
        >
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

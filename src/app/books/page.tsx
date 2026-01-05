import Link from "next/link";

import { BookFilters } from "./components/BookFilters";
import { BooksControls } from "./components/BooksControls";
import { BooksGrid } from "./components/BooksGrid";

export default function BooksPage() {
  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-title md:text-5xl">
            📚 Book Notes
          </h1>
          <Link
            href="https://chappyasel.com"
            className="text-sm text-body transition-colors hover:text-title"
          >
            ← Back to main site
          </Link>
        </div>
        <p className="text-body">
          My reading collection with notes and ratings
        </p>
      </div>

      {/* Desktop: Sidebar + Main */}
      <div className="flex gap-8">
        {/* Desktop Filters Sidebar */}
        <aside className="hidden w-64 shrink-0 lg:block">
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

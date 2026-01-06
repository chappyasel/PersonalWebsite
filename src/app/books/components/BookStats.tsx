"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { getTagColor } from "~/lib/books/tagColors";
import { api } from "~/trpc/react";

export function BookStats() {
  const { data: stats } = api.books.getStats.useQuery();
  const [isExpanded, setIsExpanded] = useState(true);

  // Memoize year to ensure consistent value during hydration
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  if (!stats) return null;
  const booksThisYear = stats.booksPerYear[currentYear] ?? 0;
  const avgRating = Math.round(stats.avgRating * 10) / 10;

  // Get top 3 categories
  const topCategories = Object.entries(stats.categoryBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile toggle */}
      <div className="flex items-center justify-between md:hidden">
        <h2 className="text-lg font-semibold text-foreground">
          Reading Stats
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Stats grid */}
      <motion.div
        initial={false}
        animate={{
          height: isExpanded ? "auto" : 0,
          opacity: isExpanded ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden md:!h-auto md:!opacity-100"
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {/* Total Books */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-2 rounded-2xl bg-muted/20 p-6 shadow-md"
          >
            <span className="text-4xl font-bold text-foreground">
              {stats.totalBooks}
            </span>
            <span className="text-sm text-muted-foreground">Total Books</span>
          </motion.div>

          {/* Books This Year */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col gap-2 rounded-2xl bg-muted/20 p-6 shadow-md"
          >
            <span className="text-4xl font-bold text-foreground">
              {booksThisYear}
            </span>
            <span className="text-sm text-muted-foreground">Books in {currentYear}</span>
          </motion.div>

          {/* Average Rating */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col gap-2 rounded-2xl bg-muted/20 p-6 shadow-md"
          >
            <div className="flex items-center gap-2">
              <span className="text-4xl font-bold text-foreground">
                {avgRating}
              </span>
              <span className="text-2xl">⭐</span>
            </div>
            <span className="text-sm text-muted-foreground">Average Rating</span>
          </motion.div>

          {/* Top Categories */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col gap-2 rounded-2xl bg-muted/20 p-6 shadow-md"
          >
            <div className="flex flex-col gap-2">
              {topCategories.map((category) => {
                const colors = getTagColor(category.name);
                return (
                  <div key={category.name} className="flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0.5 flex-1"
                      style={{
                        backgroundColor: colors.bg,
                        color: colors.fg,
                        borderColor: colors.border,
                      }}
                    >
                      {category.name}
                    </Badge>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {category.count}
                    </span>
                  </div>
                );
              })}
            </div>
            <span className="text-sm text-muted-foreground">Top Categories</span>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

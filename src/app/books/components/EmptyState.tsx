"use client";

import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";

import { Button } from "~/components/ui/button";

type EmptyStateProps = {
  type: "no-books" | "no-results";
  onClearFilters?: () => void;
};

export function EmptyState({ type, onClearFilters }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-[40vh] flex-col items-center justify-center gap-4"
    >
      <BookOpen className="h-16 w-16 text-body/40" />
      <h3 className="text-xl font-semibold text-title">
        {type === "no-books" ? "No books yet" : "No books match your filters"}
      </h3>
      <p className="text-sm text-body">
        {type === "no-books"
          ? "Start adding books to your library"
          : "Try adjusting your filters to see more results"}
      </p>
      {type === "no-results" && onClearFilters && (
        <Button onClick={onClearFilters} variant="outline" className="mt-2">
          Clear all filters
        </Button>
      )}
    </motion.div>
  );
}

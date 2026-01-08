"use client";

import { BookOpenIcon, XIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";

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
      className="flex min-h-[40vh] flex-col items-center justify-center gap-2"
    >
      <BookOpenIcon
        className="size-20 text-muted-foreground opacity-30"
        weight="duotone"
      />
      <h3 className="text-xl font-semibold text-foreground">
        {type === "no-books" ? "No books yet" : "No books match your filters"}
      </h3>
      <p className="-translate-y-1 text-sm text-muted-foreground">
        {type === "no-books"
          ? "Start adding books to your library"
          : "Try adjusting filters to see more results"}
      </p>
      {type === "no-results" && onClearFilters && (
        <Button
          onClick={onClearFilters}
          variant="outline"
          className="mt-2 gap-1.5"
        >
          <XIcon className="size-4" weight="bold" />
          Clear all filters
        </Button>
      )}
    </motion.div>
  );
}

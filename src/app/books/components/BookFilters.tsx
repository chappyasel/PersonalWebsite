"use client";

import { searchParamsParsers } from "../lib/searchParams";
import {
  HashIcon,
  ListIcon,
  NotebookIcon,
  SortAscendingIcon,
  StarIcon,
  TagIcon,
  TextAlignLeftIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useIsRestoring } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useQueryStates } from "nuqs";
import { useEffect, useState } from "react";

import { defaultTagOrder } from "~/lib/books/tagColors";
import { api } from "~/trpc/react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";

import { TagBadge } from "./TagBadge";

type TagSortMode = "default" | "count" | "alphabetical";

export function BookFilters() {
  const [filters, setFilters] = useQueryStates(searchParamsParsers);
  const [tagSortMode, setTagSortMode] = useState<TagSortMode>("default");
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const isRestoring = useIsRestoring();
  const { data: tags } = api.books.getTags.useQuery();
  const { data: stats } = api.books.getStats.useQuery();

  // Don't render tags section while cache is being restored
  const showTags = !isRestoring && tags && tags.length > 0;

  // Only enable animations after hydration to prevent mismatch
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Sort tags based on selected mode
  const sortedTags = (() => {
    if (!tags) return [];
    switch (tagSortMode) {
      case "default":
        // Use curated order, append any missing tags at the end
        return [
          ...defaultTagOrder.filter((t) => tags.includes(t)),
          ...tags.filter((t) => !defaultTagOrder.includes(t)).sort(),
        ];
      case "count":
        return [...tags].sort(
          (a, b) =>
            (stats?.categoryBreakdown[b] ?? 0) -
            (stats?.categoryBreakdown[a] ?? 0),
        );
      case "alphabetical":
        return [...tags].sort();
      default:
        return tags;
    }
  })();

  const handleClearAll = () => {
    void setFilters({
      tags: [],
      minRating: null,
      hasNotes: null,
      hasSummary: null,
    });
  };

  const handleTagToggle = (tag: string) => {
    const currentTags = filters.tags;
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];
    void setFilters({ tags: newTags });
  };

  const hasActiveFilters =
    filters.tags.length > 0 ||
    filters.minRating !== null ||
    filters.hasNotes !== null ||
    filters.hasSummary !== null;

  return (
    <div className="flex flex-col gap-5 rounded-3xl py-2">
      {/* Header */}
      <div className="flex items-end justify-between">
        <h3 className="text-lg font-bold text-foreground">Filters</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="flex h-7 items-center gap-1.5"
          >
            <XIcon className="!size-3" weight="bold" />
            Clear
          </Button>
        )}
      </div>

      <Separator />

      {/* Tags */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <TagIcon className="h-4 w-4" weight="bold" />
            Tags
          </label>
          <Select
            value={tagSortMode}
            onValueChange={(value) => setTagSortMode(value as TagSortMode)}
          >
            <SelectTrigger className="hover: h-7 w-fit border-0 px-2 text-foreground/70 shadow-none transition-colors duration-200 hover:bg-accent hover:text-accent-foreground focus:ring-0">
              {tagSortMode === "default" && (
                <ListIcon className="mr-0.5 h-4 w-4" />
              )}
              {tagSortMode === "count" && (
                <HashIcon className="mr-0.5 h-4 w-4" />
              )}
              {tagSortMode === "alphabetical" && (
                <SortAscendingIcon className="mr-0.5 h-4 w-4" />
              )}
            </SelectTrigger>
            <SelectContent className="w-auto">
              <SelectItem value="default" className="text-xs">
                <div className="flex items-center gap-1.5">
                  <ListIcon className="h-4 w-4" />
                  <span>Custom</span>
                </div>
              </SelectItem>
              <SelectItem value="count" className="text-xs">
                <div className="flex items-center gap-1.5">
                  <HashIcon className="h-4 w-4" />
                  <span>By Count</span>
                </div>
              </SelectItem>
              <SelectItem value="alphabetical" className="text-xs">
                <div className="flex items-center gap-1.5">
                  <SortAscendingIcon className="h-4 w-4" />
                  <span>A-Z</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          {showTags &&
            sortedTags.map((tag) => {
              const count = stats?.categoryBreakdown[tag] ?? 0;
              const content = (
                <>
                  <Checkbox
                    id={`tag-${tag}`}
                    checked={filters.tags.includes(tag)}
                    onCheckedChange={() => handleTagToggle(tag)}
                  />
                  <label
                    htmlFor={`tag-${tag}`}
                    className="flex flex-1 cursor-pointer items-center gap-1"
                  >
                    <TagBadge tag={tag} />
                    {count > 0 && (
                      <span className="text-[10px] text-foreground/70">
                        ({count})
                      </span>
                    )}
                  </label>
                </>
              );

              // Use regular div until hydrated to prevent mismatch
              if (!hasMounted) {
                return (
                  <div key={tag} className="flex items-center space-x-2">
                    {content}
                  </div>
                );
              }

              return (
                <motion.div
                  key={tag}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    layout: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 },
                    x: { duration: 0.2 },
                  }}
                  className="flex items-center space-x-2"
                >
                  {content}
                </motion.div>
              );
            })}
        </div>
      </div>

      <Separator />

      {/* Has Notes */}
      <div className="flex items-center justify-between pr-2">
        <label
          htmlFor="has-notes"
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
        >
          <NotebookIcon className="h-4 w-4" weight="bold" />
          Has Notes
        </label>
        <Switch
          id="has-notes"
          checked={filters.hasNotes ?? false}
          onCheckedChange={(checked) =>
            void setFilters({ hasNotes: checked ? true : null })
          }
        />
      </div>

      {/* Is Summarized */}
      <div className="flex items-center justify-between pr-2">
        <label
          htmlFor="is-summarized"
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
        >
          <TextAlignLeftIcon className="h-4 w-4" weight="bold" />
          Is Summarized
        </label>
        <Switch
          id="is-summarized"
          checked={filters.hasSummary ?? false}
          onCheckedChange={(checked) =>
            void setFilters({ hasSummary: checked ? true : null })
          }
        />
      </div>

      <Separator />

      {/* Rating */}
      <div className="flex flex-row gap-3">
        <div className="flex items-center justify-between">
          <label className="line-clamp-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <StarIcon className="h-4 w-4 shrink-0" weight="bold" />
            Min Rating
          </label>
        </div>
        <div
          className="flex items-center gap-[2px]"
          onMouseLeave={() => setHoveredRating(null)}
        >
          {Array.from({ length: 5 }).map((_, i) => {
            const rating = i + 1;
            const isFilled =
              filters.minRating !== null && rating <= filters.minRating;
            const isHovered = hoveredRating !== null && rating <= hoveredRating;
            const isHighlighted = isFilled || isHovered;
            return (
              <motion.button
                key={rating}
                type="button"
                onClick={() =>
                  void setFilters({
                    minRating: filters.minRating === rating ? null : rating,
                  })
                }
                onMouseEnter={() => setHoveredRating(rating)}
                className="cursor-pointer"
                aria-label={`Minimum rating ${rating} stars`}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <motion.div
                  animate={{
                    scale: isHighlighted ? 1.1 : 1,
                    rotate: isHighlighted ? [0, -10, 10, -10, 0] : 0,
                  }}
                  transition={{
                    scale: { type: "spring", stiffness: 300, damping: 20 },
                    rotate: isHighlighted
                      ? { duration: 0.5, ease: "easeInOut" }
                      : { duration: 0 },
                  }}
                >
                  <StarIcon
                    size={20}
                    weight={isHighlighted ? "fill" : "duotone"}
                    className={
                      isHighlighted
                        ? "text-yellow-400"
                        : "text-muted-foreground/30"
                    }
                  />
                </motion.div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

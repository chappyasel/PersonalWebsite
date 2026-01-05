"use client";

import { useState } from "react";
import { useQueryStates } from "nuqs";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";
import { defaultTagOrder, getTagColor } from "~/lib/books/tagColors";
import { api } from "~/trpc/react";

import { searchParamsParsers } from "../lib/searchParams";

type TagSortMode = "default" | "count" | "alphabetical";

export function BookFilters() {
  const [filters, setFilters] = useQueryStates(searchParamsParsers);
  const [tagSortMode, setTagSortMode] = useState<TagSortMode>("default");
  const { data: tags } = api.books.getTags.useQuery();
  const { data: stats } = api.books.getStats.useQuery();

  const years = stats?.booksPerYear
    ? Object.keys(stats.booksPerYear)
        .map(Number)
        .sort((a, b) => b - a)
    : [];

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
      year: null,
      hasNotes: null,
    });
  };

  const handleTagToggle = (tag: string) => {
    const currentTags = filters.tags;
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];
    void setFilters({ tags: newTags });
  };

  return (
    <div className="flex flex-col gap-6 rounded-3xl bg-cell/20 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-title">Filters</h3>
        <Button variant="ghost" size="sm" onClick={handleClearAll}>
          Clear all
        </Button>
      </div>

      <Separator />

      {/* Tags */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-title">Tags</label>
          <Select
            value={tagSortMode}
            onValueChange={(value) => setTagSortMode(value as TagSortMode)}
          >
            <SelectTrigger className="h-7 w-[100px] text-xs rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default" className="text-xs">
                Custom
              </SelectItem>
              <SelectItem value="count" className="text-xs">
                By Count
              </SelectItem>
              <SelectItem value="alphabetical" className="text-xs">
                A-Z
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          {sortedTags.map((tag) => {
            const colors = getTagColor(tag);
            const count = stats?.categoryBreakdown[tag] ?? 0;
            return (
              <div key={tag} className="flex items-center space-x-2">
                <Checkbox
                  id={`tag-${tag}`}
                  checked={filters.tags.includes(tag)}
                  onCheckedChange={() => handleTagToggle(tag)}
                />
                <label
                  htmlFor={`tag-${tag}`}
                  className="flex flex-1 cursor-pointer items-center gap-2"
                >
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                    style={{
                      backgroundColor: colors.bg,
                      color: colors.fg,
                      borderColor: colors.border,
                    }}
                  >
                    {tag}
                  </Badge>
                  <span className="text-xs text-title/60">({count})</span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Rating */}
      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-title">
          Rating
        </label>
        <div className="flex gap-2">
          <Button
            variant={!filters.minRating ? "default" : "outline"}
            size="sm"
            onClick={() => void setFilters({ minRating: null })}
            className="flex-1"
          >
            All
          </Button>
          <Button
            variant={filters.minRating === 4 ? "default" : "outline"}
            size="sm"
            onClick={() => void setFilters({ minRating: 4 })}
            className="flex-1"
          >
            4+ ⭐
          </Button>
          <Button
            variant={filters.minRating === 5 ? "default" : "outline"}
            size="sm"
            onClick={() => void setFilters({ minRating: 5 })}
            className="flex-1"
          >
            5 ⭐
          </Button>
        </div>
      </div>

      <Separator />

      {/* Year */}
      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-title">
          Year Finished
        </label>
        <Select
          value={filters.year?.toString() ?? "all"}
          onValueChange={(value) =>
            void setFilters({ year: value === "all" ? null : parseInt(value) })
          }
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="All years" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Has Notes */}
      <div className="flex items-center justify-between">
        <label htmlFor="has-notes" className="text-sm font-semibold text-title">
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
    </div>
  );
}

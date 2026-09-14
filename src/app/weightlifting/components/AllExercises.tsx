"use client";

import {
  EXERCISE_SORTS,
  type ExerciseSort,
  exerciseLastUsed,
  filterExerciseDirectory,
} from "../lib/exerciseDirectory";
import { useWlPath } from "../lib/paths";
import { categoryColor } from "../lib/utils";
import { CaretRightIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { api } from "~/trpc/react";

import SheetLink from "~/components/modal-sheet/SheetLink";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";

import { QueryErrorFallback } from "./QueryErrorFallback";

const SORT_LABELS: Record<ExerciseSort, string> = {
  recent: "Most recent",
  instances: "Most instances",
  name: "Name",
};

export function AllExercises() {
  const path = useWlPath();
  const { data, isLoading, isError, refetch } =
    api.weightlifting.getExerciseDirectory.useQuery();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<ExerciseSort>("recent");
  const [visible, setVisible] = useState(25);
  const categories = useMemo(
    () => [...new Set(data?.map((e) => e.category) ?? [])].sort(),
    [data],
  );
  const filtered = useMemo(
    () => filterExerciseDirectory(data ?? [], query, category, sort),
    [data, query, category, sort],
  );
  const reset = () => {
    setVisible(25);
  };

  if (isLoading)
    return (
      <Skeleton
        className="h-64 w-full rounded-lg"
        aria-label="Loading exercises"
      />
    );
  if (isError)
    return (
      <QueryErrorFallback label="exercises" onRetry={() => void refetch()} />
    );
  if (!data?.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No exercises logged yet.
      </p>
    );

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlassIcon
            aria-hidden
            className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
          />
          <Input
            aria-label="Search exercises"
            placeholder="Search exercises"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              reset();
            }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={category}
            onValueChange={(value) => {
              setCategory(value);
              reset();
            }}
          >
            <SelectTrigger
              aria-label="Exercise category"
              className="w-full sm:w-36"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColor(c) }}
                    />
                    {c}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(value) => {
              if (EXERCISE_SORTS.includes(value as ExerciseSort))
                setSort(value as ExerciseSort);
              reset();
            }}
          >
            <SelectTrigger
              aria-label="Sort exercises"
              className="w-full sm:w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXERCISE_SORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {SORT_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="mb-1 mt-3 text-xs text-muted-foreground" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "exercise" : "exercises"}
      </p>
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No exercises match your search.
        </p>
      ) : (
        <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
          {filtered.slice(0, visible).map((exercise) => (
            <SheetLink
              key={exercise.displayName}
              href={path(`/${exercise.slug}`)}
              className="flex items-center gap-3 rounded-md py-3 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 dark:hover:bg-neutral-800/60"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: categoryColor(exercise.category),
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {exercise.displayName}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {exercise.category}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right text-xs font-normal tabular-nums">
                <span className="block">
                  {exercise.instanceCount.toLocaleString("en-US")}{" "}
                  {exercise.instanceCount === 1 ? "instance" : "instances"}
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  Last {exerciseLastUsed(exercise.lastPerformed)}
                </span>
              </span>
              <CaretRightIcon
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
            </SheetLink>
          ))}
        </div>
      )}
      {visible < filtered.length && (
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => setVisible(visible + 25)}
        >
          Show more exercises
        </Button>
      )}
    </div>
  );
}

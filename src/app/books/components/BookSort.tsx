"use client";

import { useQueryState } from "nuqs";
import {
  Clock,
  ClockCounterClockwise,
  SortAscending,
  SortDescending,
  Star,
} from "@phosphor-icons/react/dist/ssr";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function BookSort() {
  const [sort, setSort] = useQueryState("sort");

  return (
    <Select value={sort ?? "finished-desc"} onValueChange={(value) => void setSort(value)}>
      <SelectTrigger className="w-[200px] rounded-xl">
        <SelectValue placeholder="Sort by..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="finished-desc">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Recently Finished</span>
          </div>
        </SelectItem>
        <SelectItem value="finished-asc">
          <div className="flex items-center gap-2">
            <ClockCounterClockwise className="h-4 w-4" />
            <span>Oldest First</span>
          </div>
        </SelectItem>
        <SelectItem value="title-asc">
          <div className="flex items-center gap-2">
            <SortAscending className="h-4 w-4" />
            <span>Title A-Z</span>
          </div>
        </SelectItem>
        <SelectItem value="title-desc">
          <div className="flex items-center gap-2">
            <SortDescending className="h-4 w-4" />
            <span>Title Z-A</span>
          </div>
        </SelectItem>
        <SelectItem value="rating-desc">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4" weight="fill" />
            <span>Highest Rated</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

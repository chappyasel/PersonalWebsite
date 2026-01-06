"use client";

import {
  ClockCounterClockwiseIcon,
  ClockIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  StarIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useQueryState } from "nuqs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "~/components/ui/select";

export function BookSort() {
  const [sort, setSort] = useQueryState("sort");
  const currentSort = sort ?? "finished-desc";

  const getSortIcon = (sortValue: string) => {
    switch (sortValue) {
      case "finished-desc":
        return <ClockIcon className="h-4 w-4" />;
      case "finished-asc":
        return <ClockCounterClockwiseIcon className="h-4 w-4" />;
      case "title-asc":
        return <SortAscendingIcon className="h-4 w-4" />;
      case "title-desc":
        return <SortDescendingIcon className="h-4 w-4" />;
      case "rating-desc":
        return <StarIcon className="h-4 w-4" />;
      default:
        return <ClockIcon className="h-4 w-4" />;
    }
  };

  return (
    <Select value={currentSort} onValueChange={(value) => void setSort(value)}>
      <SelectTrigger className="w-auto rounded-md bg-background/90">
        <div className="flex items-center pr-2">{getSortIcon(currentSort)}</div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="finished-desc">
          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4" />
            <span>Recent</span>
          </div>
        </SelectItem>
        <SelectItem value="finished-asc">
          <div className="flex items-center gap-2">
            <ClockCounterClockwiseIcon className="h-4 w-4" />
            <span>Oldest</span>
          </div>
        </SelectItem>
        <SelectItem value="title-asc">
          <div className="flex items-center gap-2">
            <SortAscendingIcon className="h-4 w-4" />
            <span>Title A-Z</span>
          </div>
        </SelectItem>
        <SelectItem value="title-desc">
          <div className="flex items-center gap-2">
            <SortDescendingIcon className="h-4 w-4" />
            <span>Title Z-A</span>
          </div>
        </SelectItem>
        <SelectItem value="rating-desc">
          <div className="flex items-center gap-2">
            <StarIcon className="h-4 w-4" />
            <span>Rating</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

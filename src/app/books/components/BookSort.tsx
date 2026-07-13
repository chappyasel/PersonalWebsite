"use client";

import { searchParamsParsers } from "../lib/searchParams";
import {
  DEFAULT_SORT_ORDER,
  type SortField,
  resolveSort,
} from "../lib/sort";
import {
  BookOpenTextIcon,
  CalendarIcon,
  ClockIcon,
  HeadphonesIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  StarIcon,
  TextAaIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useQueryStates } from "nuqs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "~/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

const SORT_OPTIONS: {
  field: SortField;
  label: string;
  icon: typeof ClockIcon;
}[] = [
  { field: "finished", label: "Read Date", icon: ClockIcon },
  { field: "title", label: "Title", icon: TextAaIcon },
  { field: "rating", label: "Rating", icon: StarIcon },
  { field: "publicationYear", label: "Published", icon: CalendarIcon },
  { field: "runtime", label: "Runtime", icon: HeadphonesIcon },
  { field: "pageCount", label: "Pages", icon: BookOpenTextIcon },
];

export function BookSort() {
  const [params, setParams] = useQueryStates({
    sort: searchParamsParsers.sort,
    order: searchParamsParsers.order,
  });
  const [field, order] = resolveSort(params.sort, params.order);

  const currentOption =
    SORT_OPTIONS.find((o) => o.field === field) ?? SORT_OPTIONS[0]!;
  const FieldIcon = currentOption.icon;

  const handleFieldChange = (value: string) => {
    const next = SORT_OPTIONS.find((o) => o.field === value);
    // Selecting a field applies its natural default direction
    if (next) void setParams({ sort: next.field, order: null });
  };

  const handleOrderToggle = () => {
    const nextOrder = order === "desc" ? "asc" : "desc";
    // Writing `sort` too migrates legacy combined values; omit `order` when
    // it matches the field default to keep URLs clean
    void setParams({
      sort: field,
      order: nextOrder === DEFAULT_SORT_ORDER[field] ? null : nextOrder,
    });
  };

  return (
    <div className="flex gap-2">
      <Select value={field} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-auto rounded-md bg-background/90">
          <div className="flex items-center pr-2">
            <FieldIcon className="h-4 w-4" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map(({ field: optionField, label, icon: Icon }) => (
            <SelectItem key={optionField} value={optionField}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleOrderToggle}
              aria-label={
                order === "desc" ? "Sort ascending" : "Sort descending"
              }
              className="flex h-9 items-center justify-center rounded-md border border-input bg-background/90 px-3 shadow-sm transition-all duration-200 ease-in-out hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {order === "desc" ? (
                <SortDescendingIcon className="h-4 w-4" />
              ) : (
                <SortAscendingIcon className="h-4 w-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{order === "desc" ? "Descending" : "Ascending"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

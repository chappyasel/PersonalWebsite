"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useQueryState } from "nuqs";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

export function BookSearch() {
  const [search, setSearch] = useQueryState("search");
  const [inputValue, setInputValue] = useState(search ?? "");

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      void setSearch(inputValue || null);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, setSearch]);

  // Sync input when URL changes (e.g., browser back/forward)
  useEffect(() => {
    setInputValue(search ?? "");
  }, [search]);

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-body/40" />
      <Input
        type="text"
        placeholder="Search books by title or author..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="rounded-2xl pl-10 pr-10 shadow-sm"
      />
      {inputValue && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setInputValue("")}
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

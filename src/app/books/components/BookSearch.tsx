"use client";

import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

export function BookSearch() {
  const [search, setSearch] = useQueryState("search");
  const [inputValue, setInputValue] = useState(search ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Focus search input when user starts typing anywhere on the page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is already typing in an input, textarea, or select
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable
      ) {
        return;
      }

      // Handle Backspace: focus and delete last character
      if (e.key === "Backspace") {
        e.preventDefault();
        inputRef.current?.focus();
        setInputValue((prev) => prev.slice(0, -1));
        return;
      }

      // Handle Cmd+A: focus and select all
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      // Ignore other modifier keys and special keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return; // Only single printable characters
      if (e.key === " ") return; // Space is used for modal toggle, not search

      // Prevent default behavior and focus search input
      e.preventDefault();
      inputRef.current?.focus();
      setInputValue((prev) => prev + e.key);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="relative flex-1">
      <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search books by title or author..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            inputRef.current?.blur();
          }
        }}
        className="rounded-md bg-background/90 pl-8 pr-8 shadow-sm"
      />
      {inputValue && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setInputValue("")}
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
        >
          <XIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

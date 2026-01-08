"use client";

import { SlidersHorizontalIcon } from "@phosphor-icons/react";

import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";

import { BookFilters } from "./BookFilters";

export function FilterDrawer() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="flex-1 bg-background/90 sm:hidden">
          <SlidersHorizontalIcon className="mr-1.5 h-4 w-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-auto overflow-y-auto">
        <SheetHeader className="sr-only">
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="py-6">
          <BookFilters />
        </div>
      </SheetContent>
    </Sheet>
  );
}

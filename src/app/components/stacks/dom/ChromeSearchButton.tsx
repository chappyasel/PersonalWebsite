"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useRef } from "react";

import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";

import { Button } from "~/components/ui/button";
import { Keycap } from "~/components/ui/keycap";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { openUniversalSearch } from "~/components/universal-search/UniversalSearchController";

export function ChromeSearchButton({
  mobile = false,
  active = false,
}: {
  mobile?: boolean;
  active?: boolean;
}) {
  const searchFocusFromPalette = useRef(false);
  return (
    <TooltipProvider delayDuration={260}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            style={mobile ? { fontSize: "inherit" } : undefined}
            aria-label="Search the site"
            aria-keyshortcuts="Meta+K Control+K"
            aria-haspopup="dialog"
            aria-expanded={mobile ? active : undefined}
            data-active={(mobile && active) || undefined}
            onClick={openUniversalSearch}
            onBlur={() => {
              searchFocusFromPalette.current = isUniversalSearchOpen();
            }}
            onFocus={(event) => {
              // Keep restored keyboard focus without reopening the hint.
              // A later hover or deliberate focus still opens it normally.
              if (searchFocusFromPalette.current) event.preventDefault();
              searchFocusFromPalette.current = false;
            }}
            className={
              mobile
                ? "stacks-on-background-text stacks-rail-row relative flex h-[3em] w-[2.75em] shrink-0 items-center justify-center rounded-xl bg-transparent pb-[0.25em] text-foreground hover:bg-transparent [&_svg]:size-[1.375em]"
                : "stacks-mobile-secondary-chrome stacks-on-background-text stacks-rail-row col-span-2 mt-1 hidden w-auto items-center gap-2.5 justify-self-start rounded-lg p-0 font-serif text-[1.05rem] font-normal tracking-wide text-foreground/75 transition-[color,transform,background-color] hover:bg-transparent hover:text-foreground active:scale-95 active:bg-transparent motion-reduce:transition-none min-[1200px]:flex [&_svg]:size-[22px]"
            }
          >
            <MagnifyingGlassIcon
              aria-hidden
              weight="bold"
              className="stacks-rail-icon"
            />
            {!mobile && <span className="stacks-rail-label">Search</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" sideOffset={8}>
          <span className="flex items-center gap-1.5">
            Search
            <Keycap width="fit">Cmd/Ctrl</Keycap>
            <Keycap>K</Keycap>
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

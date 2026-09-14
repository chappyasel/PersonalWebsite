"use client";

import { WavesIcon } from "@phosphor-icons/react";

import {
  desktopMotionPreference,
  useDesktopReducedMotion,
} from "~/lib/desktopMotionPreference";

import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export function MotionToggle() {
  const reduced = useDesktopReducedMotion();
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Reduce motion"
            aria-pressed={reduced}
            onClick={() => desktopMotionPreference.setReduced(!reduced)}
            data-motion-toggle=""
            className="stacks-on-background-text stacks-mobile-secondary-chrome hidden size-10 rounded-full text-muted-foreground hover:!bg-foreground/[0.09] hover:text-foreground active:!bg-foreground/[0.14] min-[1200px]:inline-flex [&_svg]:size-5 [@media(hover:none)]:!hidden [@media(pointer:coarse)]:!hidden"
          >
            <WavesIcon
              aria-hidden="true"
              weight={reduced ? "fill" : "regular"}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent align="start">
          <p>{reduced ? "Reduced motion on" : "Reduce motion"}</p>
          <p className="text-xs opacity-75">
            Less camera motion. No card tilt or HUD drift.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

"use client";

import { isEditableShortcutTarget } from "../input/editableShortcutTarget";
import { WavesIcon } from "@phosphor-icons/react";
import { useEffect } from "react";

import {
  desktopMotionPreference,
  useDesktopReducedMotion,
} from "~/lib/desktopMotionPreference";
import { roomOverlayBlocksInput } from "~/lib/overlays/coordinator";

import { Button } from "~/components/ui/button";
import { KeycapSequence } from "~/components/ui/keycap";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export function MotionToggle() {
  const reduced = useDesktopReducedMotion();

  useEffect(() => {
    const onMotionShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "m" ||
        !event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        event.isComposing ||
        event.defaultPrevented ||
        roomOverlayBlocksInput() ||
        document.documentElement.hasAttribute("data-field-notes-open") ||
        isEditableShortcutTarget(event.target)
      )
        return;
      event.preventDefault();
      desktopMotionPreference.setReduced(
        !desktopMotionPreference.getSnapshot(),
      );
    };
    window.addEventListener("keydown", onMotionShortcut);
    return () => window.removeEventListener("keydown", onMotionShortcut);
  }, []);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Reduce motion"
            aria-keyshortcuts="Shift+M"
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
          <p className="flex items-center gap-1.5">
            <span>{reduced ? "Reduced motion on" : "Reduce motion"}</span>
            <KeycapSequence keys={["Shift", "M"]} label="Shift M" />
          </p>
          <p className="text-xs opacity-75">
            Less camera motion. No card tilt or HUD drift.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

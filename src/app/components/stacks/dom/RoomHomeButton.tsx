import { useRoomNavigation } from "../input/RoomNavigation";
import { homeTapMotion } from "../scene/homeTapMotion";
import { useStacks } from "../store";
import { type ComponentProps } from "react";

import { Button } from "~/components/ui/button";

export function RoomHomeButton(props: ComponentProps<typeof Button>) {
  const go = useRoomNavigation();
  return (
    <Button
      variant="ghost"
      type="button"
      aria-label="Chappy Asel, return home"
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        const state = useStacks.getState();
        const alreadyHome = state.activeUnit === 0 && !state.golfFocused;
        if (event.defaultPrevented || !go(0)) return;
        if (alreadyHome) homeTapMotion.play();
        useStacks.getState().setSheetDismissed(false);
        // Desktop placards keep their reading position while off screen.
        // The mobile sheet resets its own scroll when it closes or changes unit.
        document
          .querySelectorAll<HTMLElement>(
            '[data-stacks-desktop-panel="about"] [data-stacks-scrollable]',
          )
          .forEach((scroller) => {
            scroller.scrollTop = 0;
          });
      }}
    >
      Chappy Asel
    </Button>
  );
}

export const roomHomeClassName =
  "room-wordmark-label stacks-mobile-secondary-chrome stacks-on-background-text h-auto whitespace-nowrap rounded-sm px-0 py-0 text-left font-serif text-base font-normal tracking-tight text-foreground hover:bg-transparent min-[1200px]:text-lg";

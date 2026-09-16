import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { ChromeShortcutList } from "./ChromeKeyboard";
import { ChromeSearchButton } from "./ChromeSearchButton";
import { RoomHomeButton, roomHomeClassName } from "./RoomHomeButton";

export default function ChromeKeyboardHelp({
  open,
  onOpenChange,
  tapFirst,
  fieldNotes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tapFirst: boolean;
  fieldNotes: React.ReactNode;
}) {
  return (
    <div>
      <div className="grid grid-cols-[auto_auto] items-center gap-x-0.5">
        {tapFirst ? (
          <RoomHomeButton className={roomHomeClassName} />
        ) : (
          <TooltipProvider delayDuration={260}>
            <Tooltip open={open} onOpenChange={onOpenChange}>
              <TooltipTrigger asChild>
                <RoomHomeButton className={roomHomeClassName} />
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="start"
                sideOffset={8}
                className="max-h-[var(--radix-tooltip-content-available-height)] overflow-y-auto"
              >
                <ChromeShortcutList />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {fieldNotes}
        <ChromeSearchButton />
      </div>
    </div>
  );
}

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { ChromeShortcutList } from "./ChromeKeyboard";
import { ChromeSearchButton } from "./ChromeSearchButton";

const labelClassName =
  "room-wordmark-label stacks-mobile-secondary-chrome stacks-on-background-text whitespace-nowrap rounded-sm font-serif text-base tracking-tight text-foreground min-[1200px]:text-lg";

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
          <span className={labelClassName}>Chappy Asel</span>
        ) : (
          <TooltipProvider delayDuration={260}>
            <Tooltip open={open} onOpenChange={onOpenChange}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Chappy Asel, keyboard shortcuts"
                  className={`${labelClassName} text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60`}
                >
                  Chappy Asel
                </button>
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

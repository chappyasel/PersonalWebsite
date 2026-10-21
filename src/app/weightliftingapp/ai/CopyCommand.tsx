"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { copyTextToClipboard } from "~/lib/clipboard";

import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/** A Terminal command with a copy button beside it. */
export default function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/40 py-1.5 pl-3 pr-1.5">
      <code className="min-w-0 flex-1 py-1.5 font-mono text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
        {command}
      </code>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={copied ? "Copied" : "Copy command"}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={async () => {
                if (await copyTextToClipboard(command)) setCopied(true);
              }}
            >
              {copied ? (
                <CheckIcon aria-hidden weight="bold" />
              ) : (
                <CopyIcon aria-hidden />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

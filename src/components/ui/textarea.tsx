import * as React from "react";

import { cn } from "~/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

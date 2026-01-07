import { getTagColor, getTagIcon } from "~/lib/books/tagColors";
import { cn } from "~/lib/utils";

import { Badge } from "~/components/ui/badge";

type TagBadgeProps = {
  tag: string;
  className?: string;
};

export function TagBadge({ tag, className }: TagBadgeProps) {
  const colors = getTagColor(tag);
  const IconComponent = getTagIcon(tag);

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-normal", className)}
      style={{
        backgroundColor: colors.bg,
        color: colors.fg,
        borderColor: colors.border,
      }}
    >
      <IconComponent className="h-3 w-3 -translate-x-px" weight="bold" />
      {tag}
    </Badge>
  );
}

import Link from "next/link";
import type { CSSProperties, MouseEvent } from "react";

import { getTagColor, getTagIcon } from "~/lib/books/tagColors";
import { cn } from "~/lib/utils";

import { Badge, badgeVariants } from "~/components/ui/badge";

type TagBadgeProps = {
  tag: string;
  className?: string;
  /** Renders the badge as a link, e.g. to the shelf narrowed to this tag. */
  href?: string;
  /** Runs before the link navigates; preventDefault to take it over. */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function TagBadge({ tag, className, href, onClick }: TagBadgeProps) {
  const colors = getTagColor(tag);
  const IconComponent = getTagIcon(tag);

  const content = (
    <>
      <IconComponent className="h-3 w-3 -translate-x-px" weight="bold" />
      {tag}
    </>
  );

  if (href) {
    // Colours ride on custom properties so a class can change the border on
    // hover; an inline border-color would outrank any hover rule.
    const style = {
      "--tag-bg": colors.bg,
      "--tag-fg": colors.fg,
      "--tag-border": colors.border,
      "--tag-border-hover": colors.borderHover,
    } as CSSProperties;
    return (
      <Link
        href={href}
        prefetch={false}
        onClick={onClick}
        className={cn(
          badgeVariants({ variant: "outline" }),
          "gap-1 font-normal",
          "border-[color:var(--tag-border)] bg-[color:var(--tag-bg)] text-[color:var(--tag-fg)]",
          // The pill keeps its colour and only firms up its outline, so a tag
          // reads as somewhere to go without turning into a button.
          "transition-[border-color,filter] hover:border-[color:var(--tag-border-hover)] hover:brightness-[0.97] dark:hover:brightness-[1.1]",
          className,
        )}
        style={style}
      >
        {content}
      </Link>
    );
  }

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
      {content}
    </Badge>
  );
}

import { Fragment } from "react";

/** Shared by book pages, cards, previews, and Satori share images. */
export function BookMetadataSeparator({
  gap = 8,
  color,
}: {
  gap?: number;
  color?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-book-metadata-separator=""
      style={{
        fontWeight: 400,
        opacity: 0.32,
        flexShrink: 0,
        marginLeft: gap,
        marginRight: gap,
        color,
      }}
    >
      •
    </span>
  );
}

export function BookMetadataText({ text }: { text: string }) {
  return text.split(/ [·•] /).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <BookMetadataSeparator />}
      {part}
    </Fragment>
  ));
}

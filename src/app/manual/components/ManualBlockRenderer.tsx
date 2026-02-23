import Image from "next/image";
import React from "react";

import type { BookLookup, ManualBlock } from "../types";
import ManualCallout from "./ManualCallout";
import ManualToggle from "./ManualToggle";
import RichTextRenderer from "./RichTextRenderer";

function ListItem({
  item,
  bookLookup,
}: {
  item: ManualBlock[];
  bookLookup?: BookLookup;
}) {
  const first = item[0];
  const rest = item.slice(1);

  return (
    <li className="leading-relaxed">
      {first?.type === "paragraph" ? (
        <span>
          <RichTextRenderer content={first.content} bookLookup={bookLookup} />
        </span>
      ) : first ? (
        <ManualBlockRenderer block={first} bookLookup={bookLookup} />
      ) : null}
      {rest.length > 0 && (
        <div className="mt-1 space-y-1">
          {rest.map((b, j) => (
            <ManualBlockRenderer key={j} block={b} bookLookup={bookLookup} />
          ))}
        </div>
      )}
    </li>
  );
}

export default function ManualBlockRenderer({
  block,
  bookLookup,
}: {
  block: ManualBlock;
  bookLookup?: BookLookup;
}) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="leading-relaxed">
          <RichTextRenderer content={block.content} bookLookup={bookLookup} />
        </p>
      );

    case "heading":
      if (block.level === 2) {
        return (
          <h2 className="mt-6 text-lg font-semibold text-foreground/80 first:mt-0">
            <RichTextRenderer content={block.content} bookLookup={bookLookup} />
          </h2>
        );
      }
      return (
        <h3 className="mt-4 text-base font-semibold text-foreground/70 first:mt-0">
          <RichTextRenderer content={block.content} bookLookup={bookLookup} />
        </h3>
      );

    case "callout":
      return (
        <ManualCallout
          icon={block.icon}
          color={block.color}
          content={block.content}
          bookLookup={bookLookup}
        />
      );

    case "toggle":
      return (
        <ManualToggle
          title={block.title}
          blocks={block.children}
          bookLookup={bookLookup}
        />
      );

    case "bulleted_list":
      return (
        <ul className="ml-4 list-disc space-y-1 marker:text-muted-foreground/40">
          {block.items.map((item, i) => (
            <ListItem key={i} item={item} bookLookup={bookLookup} />
          ))}
        </ul>
      );

    case "numbered_list":
      return (
        <ol className="ml-4 list-decimal space-y-1 marker:text-muted-foreground/40">
          {block.items.map((item, i) => (
            <ListItem key={i} item={item} bookLookup={bookLookup} />
          ))}
        </ol>
      );

    case "image":
      return (
        <div className="my-4 flex justify-center">
          <Image
            src={block.src}
            alt={block.alt}
            width={400}
            height={300}
            className="max-h-72 w-auto rounded-lg"
          />
        </div>
      );

    case "divider":
      return <hr className="my-6 border-muted-foreground/10" />;

    case "quote":
      return (
        <blockquote className="border-l-2 border-muted-foreground/20 pl-4 italic text-muted-foreground/80">
          <RichTextRenderer content={block.content} bookLookup={bookLookup} />
        </blockquote>
      );

    default:
      return null;
  }
}

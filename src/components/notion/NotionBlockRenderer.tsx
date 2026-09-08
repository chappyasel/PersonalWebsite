import Image from "next/image";
import Link from "next/link";
import React from "react";

import type { BookLookup, NotionBlock } from "~/components/notion/types";

import NotionCallout from "./NotionCallout";
import NotionToggle from "./NotionToggle";
import RichTextRenderer from "./RichTextRenderer";

function ListItem({
  item,
  bookLookup,
  relaxedLists,
}: {
  item: NotionBlock[];
  bookLookup?: BookLookup;
  relaxedLists: boolean;
}) {
  const first = item[0];
  const rest = item.slice(1);

  return (
    <li>
      {first?.type === "paragraph" ? (
        <span>
          <RichTextRenderer content={first.content} bookLookup={bookLookup} />
        </span>
      ) : first ? (
        <NotionBlockRenderer
          block={first}
          bookLookup={bookLookup}
          relaxedLists={relaxedLists}
        />
      ) : null}
      {rest.length > 0 && (
        <div className="dl-prose">
          {rest.map((b, j) => (
            <NotionBlockRenderer
              key={j}
              block={b}
              bookLookup={bookLookup}
              relaxedLists={relaxedLists}
            />
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * One Notion block as markup. Type sizes, heading margins, and the gaps
 * between blocks are not set here: every container of blocks carries
 * `dl-prose`, and daylight.css owns that rhythm in one place, so a heading
 * inside a dropdown is sized and spaced like one in a section body.
 */
export default function NotionBlockRenderer({
  block,
  bookLookup,
  relaxedLists = false,
}: {
  block: NotionBlock;
  bookLookup?: BookLookup;
  /** Give long-form lists a little more air without loosening every document. */
  relaxedLists?: boolean;
}) {
  switch (block.type) {
    case "paragraph":
      return (
        <p>
          <RichTextRenderer content={block.content} bookLookup={bookLookup} />
        </p>
      );

    case "heading":
      if (block.level === 2) {
        return (
          <h2>
            <RichTextRenderer content={block.content} bookLookup={bookLookup} />
          </h2>
        );
      }
      return (
        <h3>
          <RichTextRenderer content={block.content} bookLookup={bookLookup} />
        </h3>
      );

    case "callout":
      return (
        <NotionCallout
          icon={block.icon}
          color={block.color}
          content={block.content}
          bookLookup={bookLookup}
        />
      );

    case "toggle":
      return (
        <NotionToggle
          title={block.title}
          blocks={block.children}
          bookLookup={bookLookup}
          variant={block.variant}
        />
      );

    case "bulleted_list":
      return (
        <ul
          className="ml-4 list-disc marker:text-muted-foreground/40"
          data-relaxed={relaxedLists ? "" : undefined}
        >
          {block.items.map((item, i) => (
            <ListItem
              key={i}
              item={item}
              bookLookup={bookLookup}
              relaxedLists={relaxedLists}
            />
          ))}
        </ul>
      );

    case "numbered_list":
      return (
        <ol
          className="ml-4 list-decimal marker:text-muted-foreground/40"
          data-relaxed={relaxedLists ? "" : undefined}
        >
          {block.items.map((item, i) => (
            <ListItem
              key={i}
              item={item}
              bookLookup={bookLookup}
              relaxedLists={relaxedLists}
            />
          ))}
        </ol>
      );

    case "image":
      // The scene hangs its images as framed prints; the pages do the same —
      // mat, hairline frame, soft shadow (styles in daylight.css). Line art
      // the sync flagged as invertible flips to light-on-dark in dark mode,
      // hue rotated back so coloured lines keep their colours.
      return (
        <figure className="flex justify-center">
          <span className="dl-print">
            <Image
              src={block.src}
              alt={block.alt}
              width={400}
              height={300}
              className={`max-h-72 w-auto${block.invert ? "dark:hue-rotate-180 dark:invert" : ""}`}
            />
          </span>
        </figure>
      );

    case "divider":
      return <hr className="border-muted-foreground/10" />;

    case "quote":
      return (
        <blockquote className="whitespace-pre-line border-l-2 border-muted-foreground/20 pl-4 italic text-muted-foreground">
          <RichTextRenderer content={block.content} bookLookup={bookLookup} />
        </blockquote>
      );

    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-muted-foreground/10">
                {block.headers.map((header, i) => (
                  <th
                    key={i}
                    className="pb-2 pr-4 text-left font-semibold text-foreground last:pr-0"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-muted-foreground/5 last:border-0"
                >
                  {block.headers.map((header, j) => {
                    const cell = row[header];
                    return (
                      <td key={j} className="py-2 pr-4 last:pr-0">
                        {cell?.link ? (
                          <Link
                            href={cell.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-muted-foreground/15 underline-offset-2 transition-colors hover:decoration-muted-foreground/30"
                          >
                            {cell.text}
                          </Link>
                        ) : (
                          (cell?.text ?? "")
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return null;
  }
}

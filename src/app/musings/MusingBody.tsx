import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { musingEmbed } from "~/lib/musings/embeds";
import {
  type MusingBlock,
  type MusingText,
  safeMusingLink,
} from "~/lib/musings/types";

import { ZoomableImage } from "~/components/images/DocumentGallery";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";

import { MediaEmbed } from "./MediaEmbed";

function RichText({ content }: { content: MusingText[] }) {
  return content.map((run, i) => {
    let node: ReactNode = run.text;
    if (run.code) node = <code>{node}</code>;
    if (run.bold) node = <strong>{node}</strong>;
    if (run.italic) node = <em>{node}</em>;
    if (run.underline) node = <u>{node}</u>;
    if (run.strikethrough) node = <s>{node}</s>;
    const href = run.link && safeMusingLink(run.link);
    if (href) node = <Link href={href}>{node}</Link>;
    return <Fragment key={i}>{node}</Fragment>;
  });
}

// Medium exports its preview cards as a bold title, line break, italic
// description, and bare domain, all pointing at the same destination.
function importedLinkPreview(content: MusingText[]) {
  if (content.length !== 4) return null;
  const [title, separator, description, domain] = content;
  const href = title?.link && safeMusingLink(title.link);
  if (
    !href ||
    !/^https?:\/\//.test(href) ||
    !title?.bold ||
    separator?.text !== "\n" ||
    !description?.italic ||
    description.link !== href ||
    domain?.link !== href
  )
    return null;
  const host = new URL(href).hostname.replace(/^www\./, "");
  const displayedHost = domain.text
    .trim()
    .replace(/^www\./, "")
    .split("/")[0];
  if (displayedHost !== host) return null;
  return { href, title: title.text, description: description.text };
}

export function MusingBody({ blocks }: { blocks: MusingBlock[] }) {
  const elements: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (
      block.type === "bulleted_list_item" ||
      block.type === "numbered_list_item"
    ) {
      const items: ReactNode[] = [];
      const type = block.type;
      const start = i;
      while (i < blocks.length && blocks[i]!.type === type) {
        const item = blocks[i++] as Extract<
          MusingBlock,
          {
            type:
              | "paragraph"
              | "quote"
              | "bulleted_list_item"
              | "numbered_list_item";
          }
        >;
        items.push(
          <li key={i}>
            <RichText content={item.content} />
            {item.children?.length ? (
              <MusingBody blocks={item.children} />
            ) : null}
          </li>,
        );
      }
      i--;
      elements.push(
        type === "numbered_list_item" ? (
          <ol key={start}>{items}</ol>
        ) : (
          <ul key={start}>{items}</ul>
        ),
      );
      continue;
    }
    switch (block.type) {
      case "paragraph": {
        const preview =
          !block.children?.length && importedLinkPreview(block.content);
        if (preview) {
          elements.push(
            <div key={i} className="not-prose my-6" data-musing-link-preview>
              <p className="m-0 text-lg font-semibold leading-snug">
                <Link
                  href={preview.href}
                  className="underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                >
                  {preview.title}{" "}
                  <ArrowUpRightIcon
                    aria-hidden="true"
                    className="inline-block size-[1em] align-[-0.125em]"
                  />
                </Link>
              </p>
              <p className="mb-0 mt-1 text-sm leading-relaxed text-muted-foreground">
                {preview.description}
              </p>
            </div>,
          );
          break;
        }
        elements.push(
          <div key={i}>
            <p>
              <RichText content={block.content} />
            </p>
            {block.children?.length ? (
              <MusingBody blocks={block.children} />
            ) : null}
          </div>,
        );
        break;
      }
      case "quote":
        elements.push(
          <blockquote key={i}>
            <p>
              <RichText content={block.content} />
            </p>
            {block.children?.length ? (
              <MusingBody blocks={block.children} />
            ) : null}
          </blockquote>,
        );
        break;
      case "heading": {
        const Heading = block.level === 2 ? "h2" : "h3";
        elements.push(
          <Heading key={i} id={block.id} className="scroll-mt-8">
            <RichText content={block.content} />
          </Heading>,
        );
        break;
      }
      case "image": {
        const start = i;
        const images = [block];
        while (blocks[i + 1]?.type === "image") {
          images.push(blocks[++i] as Extract<MusingBlock, { type: "image" }>);
        }
        const grouped = images.length > 1;
        const sharedCaption =
          grouped && images.slice(0, -1).every((image) => !image.caption.length)
            ? images.at(-1)!.caption
            : [];
        elements.push(
          <div
            key={start}
            className="my-8"
            data-musing-gallery={grouped ? images.length : undefined}
          >
            <div
              className={
                grouped
                  ? `grid items-start gap-3 ${images.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`
                  : undefined
              }
            >
              {images.map((image, index) => (
                <figure key={index} className="!my-0 min-w-0">
                  <ZoomableImage
                    src={image.image.src}
                    width={image.image.width}
                    height={image.image.height}
                    alt={image.image.alt}
                    caption={(image.caption.length
                      ? image.caption
                      : sharedCaption
                    )
                      .map((run) => run.text)
                      .join("")}
                    className="w-full"
                  >
                    <Image
                      src={image.image.src}
                      alt={image.image.alt}
                      width={image.image.width}
                      height={image.image.height}
                      sizes={
                        grouped
                          ? "(max-width: 640px) 45vw, 240px"
                          : "(max-width: 768px) calc(100vw - 3rem), 720px"
                      }
                      className="h-auto w-full rounded-lg"
                    />
                  </ZoomableImage>
                  {!sharedCaption.length && image.caption.length ? (
                    <figcaption>
                      <RichText content={image.caption} />
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
            {sharedCaption.length ? (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                <RichText content={sharedCaption} />
              </p>
            ) : null}
          </div>,
        );
        break;
      }
      case "link": {
        const embed = musingEmbed(block.url);
        if (embed) {
          elements.push(
            <MediaEmbed
              key={i}
              embed={embed}
              caption={block.content.map((run) => run.text).join("")}
            />,
          );
          break;
        }
        const href = safeMusingLink(block.url);
        if (href)
          elements.push(
            <p key={i}>
              <Link href={href}>
                <RichText content={block.content} />{" "}
                <ArrowUpRightIcon
                  aria-hidden="true"
                  className="inline-block size-[1em] align-[-0.125em]"
                />
              </Link>
            </p>,
          );
        break;
      }
      case "code":
        elements.push(
          <pre key={i}>
            <code>{block.text}</code>
          </pre>,
        );
        break;
      case "divider":
        elements.push(<hr key={i} />);
        break;
      case "toggle":
        elements.push(
          <Accordion key={i} type="single" collapsible>
            <AccordionItem value="aside">
              <AccordionTrigger className="text-left text-base">
                <RichText content={block.content} />
              </AccordionTrigger>
              <AccordionContent>
                <MusingBody blocks={block.children} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>,
        );
        break;
    }
  }
  return <>{elements}</>;
}

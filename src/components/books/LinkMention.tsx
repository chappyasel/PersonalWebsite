"use client";

import { GithubLogoIcon, GlobeSimpleIcon } from "@phosphor-icons/react";
import { getImageProps } from "next/image";
import { type ReactNode, useState } from "react";

import { type LinkPreview, mentionText } from "~/lib/books/linkPreview";
import { cn } from "~/lib/utils";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

const ICON =
  "mr-1.5 inline-block size-[1em] shrink-0 rounded-[3px] align-[-0.125em]";

/** Keeps an icon visible on both grounds (IconTone). */
const TONE = {
  "dark-glyph": "dark:invert",
  "light-glyph": "invert dark:invert-0",
  "dark-tile": "dark:ring-1 dark:ring-white/20",
  "light-tile": "ring-1 ring-black/10 dark:ring-0",
  none: "",
} as const;

/** The same hairline as the notes' other links, and the same hover. */
const UNDERLINE =
  "underline decoration-muted-foreground/15 underline-offset-2 transition-colors [overflow-wrap:anywhere] group-hover/mention:decoration-muted-foreground/30";

/** A first word up to this long stays on the icon's line; a longer one (an
 * address with no spaces) may wrap anywhere instead of running off a phone. */
const GLUE_CHARS = 24;

/** The card is 18rem wide; its share image loads at twice that. */
const CARD_IMAGE = { width: 576, height: 302 };

function SiteIcon({
  preview,
  className,
}: {
  preview?: LinkPreview;
  className?: string;
}) {
  if (preview?.github) {
    return (
      <GithubLogoIcon
        weight="fill"
        aria-hidden
        className={cn(ICON, "text-foreground", className)}
      />
    );
  }
  if (preview?.icon) {
    return (
      // A data URI from the server, 32px for a 16px slot; nothing to
      // optimise and no third party to call.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={preview.icon}
        alt=""
        width={16}
        height={16}
        className={cn(ICON, TONE[preview.iconTone ?? "none"], className)}
      />
    );
  }
  return (
    <GlobeSimpleIcon
      aria-hidden
      className={cn(ICON, "text-muted-foreground", className)}
    />
  );
}

function splitFirstWord(text: string): [string, string] {
  const match = /^(\S+)(\s[\s\S]*)?$/.exec(text);
  return match ? [match[1]!, match[2] ?? ""] : [text, ""];
}

/** The share image through the site's own image optimizer, so a reader's
 * browser never calls the linked site. */
function cardImageProps(src: string) {
  return getImageProps({ src, alt: "", ...CARD_IMAGE }).props;
}

function PreviewCard({
  href,
  preview,
}: {
  href: string;
  preview: LinkPreview;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const host = new URL(href).hostname.replace(/^www\./, "");
  const { github } = preview;
  const image = !github && !imageFailed ? preview.image : null;
  return (
    <div className="flex flex-col">
      {image && (
        <div className="aspect-[1.91/1] w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...cardImageProps(image)}
            alt=""
            onError={() => setImageFailed(true)}
            className="size-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center gap-2.5">
          {github?.avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={github.avatar}
              alt=""
              width={32}
              height={32}
              className="size-8 shrink-0 rounded-md dark:ring-1 dark:ring-white/15"
            />
          )}
          <p className="line-clamp-2 font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
            {github
              ? `${github.owner}/${github.repo}${github.file ? `/${github.file}` : ""}`
              : preview.title}
          </p>
        </div>
        {preview.description && (
          <p className="line-clamp-3 text-muted-foreground">
            {preview.description}
          </p>
        )}
        <p className="mt-1 flex items-center text-[11px] leading-tight text-muted-foreground">
          <SiteIcon preview={preview} className="size-3" />
          {host}
        </p>
      </div>
    </div>
  );
}

/**
 * A web link the notes hold as a Notion link mention, or as a pasted
 * address, drawn the way Notion draws a mention: the site's icon, its name
 * in grey, then the title underlined. Hovering shows the page's card: its
 * share image, title, description and address. Tap-first devices skip the
 * card and follow the link.
 *
 * `words` are a link mention's words as Notion stored them, with their
 * formatting; they are its title, and without a preview they show as
 * written beside a globe. Words with formatting inside them (a bold word)
 * show as written, site name and all, rather than lose it. A pasted address has none, and shows the page's
 * own title, or its address tidied. `emphasis` keeps the italics the owner
 * gave the link.
 */
export default function LinkMention({
  href,
  preview,
  words,
  emphasis = false,
}: {
  href: string;
  preview?: LinkPreview;
  words?: { text: string; node: ReactNode; formatted: boolean };
  emphasis?: boolean;
}) {
  const { context, title, joined } = mentionText(href, preview, words?.text);
  const Words = emphasis ? "em" : "span";
  const [firstWord, rest] = splitFirstWord(title);
  const glue = firstWord.length <= GLUE_CHARS;
  // The share image starts loading on the way to the card, not after it
  // opens on an empty box.
  const warmImage = () => {
    if (preview?.image && !preview.github) {
      new window.Image().src = cardImageProps(preview.image).src;
    }
  };

  const anchor = (
    <a
      href={href}
      onPointerEnter={warmImage}
      onFocus={warmImage}
      className="group/mention text-foreground no-underline hover:text-foreground"
    >
      {!preview && words ? (
        <>
          <SiteIcon />
          <span className={UNDERLINE}>{words.node}</span>
        </>
      ) : (
        <Words>
          {context ? (
            <>
              <span className="whitespace-nowrap">
                <SiteIcon preview={preview} />
                <span
                  className={cn(
                    "text-muted-foreground/85",
                    !joined && "mr-1.5",
                  )}
                >
                  {context}
                </span>
              </span>
              <span className={UNDERLINE}>
                {words?.formatted ? words.node : title}
              </span>
            </>
          ) : words?.formatted ? (
            <>
              <SiteIcon preview={preview} />
              <span className={UNDERLINE}>{words.node}</span>
            </>
          ) : glue ? (
            <>
              <span className="whitespace-nowrap">
                <SiteIcon preview={preview} />
                <span className={UNDERLINE}>{firstWord}</span>
              </span>
              {rest && <span className={UNDERLINE}>{rest}</span>}
            </>
          ) : (
            <>
              <SiteIcon preview={preview} />
              <span className={UNDERLINE}>{title}</span>
            </>
          )}
        </Words>
      )}
    </a>
  );

  // A card earns its place with something the line does not show.
  if (!preview?.description && !preview?.image && !preview?.github) {
    return anchor;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{anchor}</TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={8}
          className="w-72 max-w-[calc(100vw-2rem)] rounded-xl p-0"
        >
          <PreviewCard href={href} preview={preview} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

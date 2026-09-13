import type { MusingEmbed } from "~/lib/musings/embeds";

import { TweetEmbed } from "./TweetEmbed";

export function MediaEmbed({
  embed,
  caption,
}: {
  embed: MusingEmbed;
  caption: string;
}) {
  if (embed.provider === "x")
    return <TweetEmbed id={embed.id} url={embed.url} />;
  return (
    <figure className="not-prose my-8" data-musing-embed="youtube">
      <iframe
        src={embed.src}
        // Iframes need a title to identify their embedded document to assistive technology.
        // eslint-disable-next-line no-restricted-syntax
        title={caption || "YouTube video"}
        className="aspect-video w-full rounded-lg border-0"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </figure>
  );
}

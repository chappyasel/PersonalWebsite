import { ClockIcon, PenNibIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import data from "public/data/blog-posts.json";
import React from "react";

import { musingReadingMinutes } from "~/lib/musings/readingTime";
import { getTimeAgo } from "~/lib/util";

import SheetLink from "~/components/modal-sheet/SheetLink";

import styles from "./CoverCard.module.css";
import TiltCard from "./TiltCard";

type BlogPost = {
  title: string;
  pubDate: string;
  link: string;
  thumbnail: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  description: string;
  searchText?: string;
  readingWordCount?: number;
};

const BLOG_POSTS: BlogPost[] = data.items;

export default async function BlogPosts() {
  return (
    <section
      className={`${styles.list} placard-card-stack flex w-full flex-wrap items-center justify-around gap-4`}
    >
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground md:gap-3 md:text-3xl">
        <PenNibIcon weight="duotone" className="size-7 shrink-0 md:size-8" />
        Musings
      </h1>
      {BLOG_POSTS.map((post, _) => (
        <BlogPostItem key={post.title} post={post} />
      ))}
    </section>
  );
}

function BlogPostItem({ post }: { post: BlogPost }) {
  const minutes = musingReadingMinutes(post);
  return (
    <TiltCard
      interactive
      className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
    >
      <SheetLink
        href={post.link}
        target={post.link.startsWith("/") ? undefined : "_blank"}
        className={`${styles.card} group relative flex w-full [transform-style:preserve-3d]`}
      >
        {/* Background layer — sits flat so backdrop-blur doesn't flatten 3D */}
        <div
          data-placard-background=""
          data-placard-surface=""
          className="absolute inset-0 rounded-[inherit] border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]"
        />
        <div
          data-placard-media="card-cover"
          className={`${styles.media} relative shrink-0 self-start`}
        >
          {post.thumbnail ? (
            <Image
              className="aspect-[2/1] h-auto w-full bg-muted object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              src={post.thumbnail}
              alt={post.title}
              width={post.thumbnailWidth}
              height={post.thumbnailHeight}
              sizes="(max-width: 640px) calc(100vw - 3rem), 576px"
            />
          ) : null}
        </div>

        <div
          className={`${styles.body} relative flex min-w-0 flex-1 flex-col justify-start`}
          style={{ transform: "translateZ(20px)" }}
        >
          <h3 className="text-lg font-semibold md:text-xl">{post.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm">{post.description}</p>
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-3 text-xs text-muted-foreground opacity-60">
            {minutes !== null && (
              <span className="flex items-center gap-1.5">
                <ClockIcon aria-hidden className="size-3" />
                {minutes} min read
              </span>
            )}
            <span className="ml-auto">{getTimeAgo(post.pubDate)}</span>
          </div>
        </div>
      </SheetLink>
    </TiltCard>
  );
}

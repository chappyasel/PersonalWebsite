import { PenNibIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import data from "public/data/blog-posts.json";
import React from "react";

import { getTimeAgo } from "~/lib/util";

import TiltCard from "./TiltCard";

type BlogPost = {
  title: string;
  pubDate: string;
  link: string;
  thumbnail: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  description: string;
};

const BLOG_POSTS: BlogPost[] = data.items;

export default async function BlogPosts() {
  return (
    <section className="flex w-full flex-wrap items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)] md:gap-3 md:text-3xl">
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
  return (
    <TiltCard className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000">
      <Link
        href={post.link}
        target="_blank"
        className="group relative flex w-full flex-col p-5 [transform-style:preserve-3d] sm:flex-row sm:p-6"
      >
        {/* Background layer — sits flat so backdrop-blur doesn't flatten 3D */}
        <div
          data-placard-background=""
          data-placard-surface=""
          className="absolute inset-0 rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]"
        />
        <div
          className="relative h-full sm:h-auto sm:basis-1/3"
          style={{ transform: "translateZ(30px)" }}
        >
          <Image
            className="h-auto w-full rounded-2xl bg-muted object-cover shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] sm:h-full"
            src={post.thumbnail}
            alt={post.title}
            width={post.thumbnailWidth}
            height={post.thumbnailHeight}
            sizes="(max-width: 640px) calc(100vw - 3rem), 240px"
          />
        </div>

        <div
          className="relative flex basis-2/3 flex-col justify-start pt-4 sm:pl-6 sm:pt-0"
          style={{ transform: "translateZ(20px)" }}
        >
          <h3 className="text-lg font-semibold md:text-xl">{post.title}</h3>
          <p className="text-xs font-semibold opacity-80">
            {getTimeAgo(post.pubDate)}
          </p>
          <p className="mt-1 line-clamp-4 text-sm">{post.description}</p>
        </div>
      </Link>
    </TiltCard>
  );
}

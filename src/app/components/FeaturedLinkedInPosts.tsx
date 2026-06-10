import {
  ArrowUpRightIcon,
  ChatCircleIcon,
  LinkedinLogoIcon,
  ThumbsUpIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import data from "public/data/featured-linkedin-posts.json";
import React from "react";

import { getTimeAgo } from "~/lib/util";

import TiltCard from "./TiltCard";

type FeaturedLinkedInPost = {
  title: string;
  date: string;
  url: string;
  pillar: string;
  reactions: number;
  comments: number;
  excerpt: string;
};

const POSTS: FeaturedLinkedInPost[] = data.items;

export default async function FeaturedLinkedInPosts() {
  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <div className="flex w-full items-end justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)] md:gap-3 md:text-3xl">
          <LinkedinLogoIcon
            weight="duotone"
            className="size-7 shrink-0 md:size-8"
          />
          LinkedIn Posts
        </h1>
        <Link
          href="https://www.linkedin.com/in/chappyasel/recent-activity/all/"
          target="_blank"
          className="hidden items-center gap-1.5 text-sm font-semibold text-muted-foreground/80 transition-colors duration-300 hover:text-foreground sm:flex"
        >
          See all
          <ArrowUpRightIcon weight="bold" className="size-4" />
        </Link>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {POSTS.map((post, index) => (
          <FeaturedLinkedInPostItem
            key={post.url}
            post={post}
            featured={index === 0}
          />
        ))}
      </div>
    </section>
  );
}

function FeaturedLinkedInPostItem({
  post,
  featured,
}: {
  post: FeaturedLinkedInPost;
  featured: boolean;
}) {
  return (
    <TiltCard
      className={`w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000 ${
        featured ? "sm:col-span-2" : ""
      }`}
      hoverScale={1.03}
    >
      <Link
        href={post.url}
        target="_blank"
        className={`group relative flex h-full w-full flex-col px-4 py-4 [transform-style:preserve-3d] sm:px-6 sm:py-5 ${
          featured ? "min-h-[220px]" : "min-h-[250px]"
        }`}
      >
        <div className="absolute inset-0 rounded-2xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-300 ease-in-out group-hover:shadow-[0px_4px_20px_0px_rgba(0,0,0,0.1)]" />

        <div
          className="relative flex h-full flex-col"
          style={{ transform: "translateZ(20px)" }}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground/80">
            <span className="rounded-full bg-foreground/[0.07] px-2.5 py-1">
              {post.pillar}
            </span>
            <span>{getTimeAgo(post.date)}</span>
          </div>

          <h3
            className={`mt-4 font-semibold leading-tight text-foreground ${
              featured ? "text-xl md:text-2xl" : "text-lg md:text-xl"
            }`}
          >
            {post.title}
          </h3>

          <p
            className={`mt-3 leading-snug ${
              featured ? "text-base md:text-lg" : "text-sm"
            }`}
          >
            &ldquo;{post.excerpt}&rdquo;
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-6 text-sm font-semibold text-muted-foreground/75">
            <span className="flex items-center gap-1.5">
              <ThumbsUpIcon weight="bold" className="size-4" />
              {post.reactions.toLocaleString()}
            </span>
            <span className="flex items-center gap-1.5">
              <ChatCircleIcon weight="bold" className="size-4" />
              {post.comments.toLocaleString()}
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-foreground opacity-70 transition-opacity duration-300 group-hover:opacity-100">
              Read
              <ArrowUpRightIcon weight="bold" className="size-4" />
            </span>
          </div>
        </div>
      </Link>
    </TiltCard>
  );
}

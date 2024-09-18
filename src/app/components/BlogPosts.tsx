import Image from "next/image";
import Link from "next/link";
import data from "public/data/blog-posts.json";
import React from "react";

import { getTimeAgo } from "~/lib/util";

type BlogPost = {
  title: string;
  pubDate: string;
  link: string;
  thumbnail: string;
  description: string;
};

const BLOG_POSTS: BlogPost[] = data.items;

export default async function BlogPosts() {
  return (
    <section className="flex w-full flex-wrap items-center justify-around gap-4">
      <h1 className="w-full text-5xl font-bold text-title [text-shadow:_0_0_20px_rgba(255,255,255,1)]">
        ✍️ Musings
      </h1>
      {BLOG_POSTS.map((post, _) => (
        <BlogPostItem key={post.title} post={post} />
      ))}
    </section>
  );
}

function BlogPostItem({ post }: { post: BlogPost }) {
  return (
    <Link
      href={post.link}
      target="_blank"
      className="group relative flex w-full flex-col overflow-hidden rounded-3xl p-4 shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] backdrop-blur-lg transition-all duration-300 ease-in-out hover:scale-[1.03] hover:shadow-[0px_5px_30px_0px_rgba(0,0,0,0.14)] sm:flex-row"
    >
      <div className="h-full sm:h-auto sm:basis-1/3">
        <Image
          className="size-full rounded-xl object-cover shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)]"
          src={post.thumbnail}
          alt={post.title}
          width={1000}
          height={1000}
        />
      </div>
      <div className="flex basis-2/3 flex-col justify-start pt-4 sm:pl-6 sm:pt-0">
        <h3 className="text-2xl font-bold">{post.title}</h3>
        <p className="text-sm font-semibold opacity-80">
          {getTimeAgo(post.pubDate)}
        </p>
        <p className="mt-1 line-clamp-4">{post.description}</p>
      </div>
    </Link>
  );
}

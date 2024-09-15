import { ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import data from "public/data/blog-posts.json";
import React from "react";

type BlogPost = {
  title: string;
  pubDate: string;
  link: string;
  thumbnail: string;
};

const BLOG_POSTS: BlogPost[] = data.items;

export default async function BlogPosts() {
  return (
    <section className="flex w-full flex-wrap items-center justify-around gap-4">
      <h1 className="w-full text-5xl font-bold">✍️ Blog Posts</h1>
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
      className="group relative h-[300px] w-full overflow-hidden rounded-3xl shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] backdrop-blur-lg transition-all duration-300 ease-in-out hover:scale-[1.03] hover:shadow-[0px_5px_30px_0px_rgba(0,0,0,0.14)] md:h-[40vw] md:max-h-[350px] md:min-h-[250px]"
    >
      {(post.thumbnail && (
        <Image
          className="size-full object-cover"
          src={post.thumbnail}
          alt={post.title}
          width={1000}
          height={1000}
        />
      )) ?? (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon className="size-28 text-gray-200" />
        </div>
      )}
      <div className="absolute right-3 top-3 max-w-[calc(100%-24px)] rounded-xl bg-cell/80 text-xl backdrop-blur-lg">
        <h3 className="px-[20px] py-[10px] font-bold">{post.title}</h3>
      </div>
    </Link>
  );
}

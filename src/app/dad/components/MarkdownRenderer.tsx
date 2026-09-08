/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

/* eslint-disable @next/next/no-img-element */

function rewriteImageSrc(src: string): string {
  // Rewrite relative image paths like ../images/1999-04-12-01.jpg
  const imageMatch = /(?:\.\.\/)*images\/(.+)/.exec(src);
  if (imageMatch?.[1]) {
    return `/api/dad-images/${imageMatch[1]}`;
  }
  return src;
}

function rewriteHref(href: string): string {
  // ../Journal/2018/2018-07-25.md -> /dad/journal/2018/2018-07-25
  const journalMatch = /(?:\.\.\/)*Journal\/(\d{4})\/(.+)\.md/.exec(href);
  if (journalMatch?.[1] && journalMatch[2]) {
    return `/dad/journal/${journalMatch[1]}/${journalMatch[2]}`;
  }

  // ../Insights/01-character-arc.md -> /dad/insights/01-character-arc
  const insightsMatch = /(?:\.\.\/)*Insights\/(.+)\.md/.exec(href);
  if (insightsMatch?.[1]) {
    return `/dad/insights/${insightsMatch[1]}`;
  }

  // Relative journal links: 1999/1999-01-11.md -> /dad/journal/1999/1999-01-11
  const relJournalMatch = /^(\d{4})\/(.+)\.md$/.exec(href);
  if (relJournalMatch?.[1] && relJournalMatch[2]) {
    return `/dad/journal/${relJournalMatch[1]}/${relJournalMatch[2]}`;
  }

  // Relative links like preface.md, epilogue.md within Journal context
  const relMdMatch = /^([a-z][\w-]*)\.md$/.exec(href);
  if (relMdMatch?.[1]) {
    return `/dad/journal/${relMdMatch[1]}`;
  }

  return href;
}

function makeId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

const components: Components = {
  img: ({ src, alt, ...props }) => {
    if (!src || typeof src !== "string") return null;
    return (
      <figure className="my-8">
        <img
          src={rewriteImageSrc(src)}
          alt={alt ?? ""}
          className="w-full rounded-sm shadow-sm ring-1 ring-muted-foreground/10"
          loading="lazy"
          {...props}
        />
        {alt && (
          <figcaption className="mt-2 text-center font-serif text-xs italic text-muted-foreground">
            {alt}
          </figcaption>
        )}
      </figure>
    );
  },
  a: ({ href, children, ...props }) => {
    if (!href) return <span {...props}>{children}</span>;
    const rewritten = rewriteHref(href);
    // Internal links use Next.js Link
    if (rewritten.startsWith("/")) {
      return (
        <Link href={rewritten} {...props}>
          {children}
        </Link>
      );
    }
    return (
      <a href={rewritten} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
  h1: ({ children, ...props }) => {
    const text = typeof children === "string" ? children : "";
    return (
      <h1 id={makeId(text)} {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ children, ...props }) => {
    const text = typeof children === "string" ? children : "";
    return (
      <h2 id={makeId(text)} {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ children, ...props }) => {
    const text = typeof children === "string" ? children : "";
    return (
      <h3 id={makeId(text)} {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ children, ...props }) => {
    const text = typeof children === "string" ? children : "";
    return (
      <h4 id={makeId(text)} {...props}>
        {children}
      </h4>
    );
  },
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-lg prose-neutral max-w-none leading-[1.9] text-foreground prose-headings:font-light prose-headings:italic prose-headings:tracking-wide prose-headings:text-foreground prose-a:text-foreground prose-a:underline prose-a:decoration-muted-foreground/15 hover:prose-a:decoration-muted-foreground/30 prose-blockquote:border-l-0 prose-blockquote:pl-0 prose-blockquote:text-center prose-blockquote:italic prose-blockquote:text-muted-foreground prose-strong:text-foreground prose-li:text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

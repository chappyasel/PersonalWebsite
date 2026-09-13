"use client";

import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { loadTwitterWidgets } from "~/lib/musings/twitterWidgets";

import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";

export function TweetEmbed({ id, url }: { id: string; url: string }) {
  const { resolvedTheme } = useTheme();
  const root = useRef<HTMLElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !resolvedTheme || !container.current) return;
    let active = true;
    // Give each render its own node. A late widget from a previous theme or
    // route cannot insert itself into the current render's container.
    const target = document.createElement("div");
    container.current.appendChild(target);
    setStatus("loading");
    const timeout = setTimeout(() => {
      if (active) setStatus("failed");
    }, 20000);
    void loadTwitterWidgets()
      .then((api) =>
        active
          ? api.widgets.createTweet(id, target, {
              theme,
              align: "center",
              dnt: true,
            })
          : undefined,
      )
      .then((element) => {
        if (active) {
          clearTimeout(timeout);
          setStatus(element ? "ready" : "failed");
        }
      })
      .catch(() => {
        if (active) {
          clearTimeout(timeout);
          setStatus("failed");
        }
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      target.remove();
    };
  }, [near, id, theme, resolvedTheme, attempt]);

  return (
    <figure
      ref={root}
      className="not-prose my-8"
      data-musing-embed="x"
      data-tweet-id={id}
    >
      <div
        className="relative mx-auto max-w-[550px]"
        aria-busy={status === "loading"}
      >
        {status === "loading" ? (
          <Skeleton
            className="absolute inset-x-0 top-0 h-56 motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : null}
        <div
          ref={container}
          className={status === "loading" ? "relative min-h-56" : "relative"}
          // X styles its dark theme itself, but its document uses a light
          // color scheme. Match that scheme so the iframe canvas stays transparent.
          style={{ colorScheme: "light" }}
        />
        {status === "failed" ? (
          <div className="rounded-lg border border-border px-5 py-4 text-sm text-muted-foreground">
            <p>This post couldn&apos;t load.</p>
            <Button
              variant="link"
              size="sm"
              className="mt-1 px-0"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Try again
            </Button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-4 underline underline-offset-4"
            >
              View post on X{" "}
              <ArrowUpRightIcon
                aria-hidden="true"
                className="inline-block size-[1em] align-[-0.125em]"
              />
            </a>
          </div>
        ) : null}
      </div>
    </figure>
  );
}

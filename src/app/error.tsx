"use client";

import Link from "next/link";
import { useEffect } from "react";

import "~/styles/daylight.css";

/**
 * The catch-all for any route without its own error screen. Segments that
 * want a scoped recovery (staying inside their own chrome, retrying one
 * dataset) still define their own; this one exists so no route can fall
 * through to Next's unstyled built-in page.
 *
 * Deliberately NOT the full DaylightSky: this file is a client component in
 * the root segment, so every byte it imports lands in every page's client
 * bundle — including the boot-critical homepage, whose route budget is a
 * hard gate. The sky here is the pure-CSS layers (gradient, stars, clouds,
 * satellite) plus the pre-generated horizon SVG files, which cost the
 * bundle nothing.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled page error:", error);
  }, [error]);

  return (
    <main className="daylight-root font-serif">
      <div className="dl-screen">
        <div className="dl-sky" aria-hidden>
          <div className="dl-stars" />
          <div className="dl-stars-b" />
          <div className="dl-shooting-star" />
          <div className="dl-satellite" />
          <div className="dl-clouds" />
          <div className="dl-sky-fade" />
          <div className="dl-skyline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/horizon-light.svg"
              alt=""
              className="block w-full dark:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/horizon-dark.svg"
              alt=""
              className="hidden w-full dark:block"
            />
          </div>
          <div className="dl-ground-blend" />
        </div>
        <h1 className="text-3xl font-bold text-[hsl(var(--dl-sky-ink))]">
          Something went wrong
        </h1>
        <p className="mt-3 max-w-md text-lg">
          This page failed to load. It is usually temporary.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={reset}
            className="rounded-lg border border-[hsl(var(--dl-sky-ink)/0.45)] px-4 py-2 text-[hsl(var(--dl-sky-ink))] transition-colors hover:bg-[hsl(var(--dl-sky-ink)/0.12)]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="font-sans text-sm text-[hsl(var(--dl-sky-ink)/0.85)] underline underline-offset-4 transition-colors hover:text-[hsl(var(--dl-sky-ink))]"
          >
            Back to home
          </Link>
        </div>
        {error.digest && (
          <p className="mt-5 font-sans text-xs text-[hsl(var(--dl-sky-ink)/0.7)]">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}

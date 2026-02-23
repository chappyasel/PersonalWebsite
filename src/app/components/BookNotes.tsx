"use client";

import { BooksIcon } from "@phosphor-icons/react";
import Link from "next/link";

import BookCarousel from "./BookCarousel";
import TiltCard from "./TiltCard";

export default function BookNotes() {
  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 md:gap-3 text-2xl md:text-3xl font-semibold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)]">
        <BooksIcon weight="duotone" className="size-7 md:size-8 shrink-0" />
        Book Notes
      </h1>
      <TiltCard
        className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
        hoverScale={1.05}
      >
        <Link
          className="block h-[450px] w-full overflow-hidden rounded-xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_12px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-300 ease-in-out hover:shadow-[0px_4px_15px_0px_rgba(0,0,0,0.1)]"
          href={
            process.env.NODE_ENV === "production"
              ? "https://books.chappyasel.com"
              : "http://books.localhost:3000"
          }
        >
          <BookCarousel />
        </Link>
      </TiltCard>
    </section>
  );
}

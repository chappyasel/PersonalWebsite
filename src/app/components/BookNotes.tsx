import Link from "next/link";

import BookCarousel from "./BookCarousel";

export default function BookNotes() {
  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="w-full text-5xl font-bold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)]">
        📚 Book Notes
      </h1>
      <Link
        className="h-[450px] w-full rounded-2xl bg-muted/20 shadow-[0px_5px_15px_2px_rgba(0,0,0,0.1)] backdrop-blur-lg transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-[0px_5px_20px_0px_rgba(0,0,0,0.14)] intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
        href="/books"
      >
        <BookCarousel />
      </Link>
    </section>
  );
}

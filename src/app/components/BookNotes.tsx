import Link from "next/link";

import BookCarousel from "./BookCarousel";

export default function BookNotes() {
  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="w-full text-5xl font-bold">📚 Book Notes</h1>
      <Link
        className="h-[300px] w-full rounded-2xl bg-cell/20 shadow-[0px_5px_15px_2px_rgba(0,0,0,0.1)] backdrop-blur-lg transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-[0px_5px_20px_0px_rgba(0,0,0,0.14)]"
        href="https://books.chappyasel.com"
        target="_blank"
      >
        <BookCarousel />
      </Link>
    </section>
  );
}

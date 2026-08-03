import React from "react";

import { computeHomepageBookStats } from "~/lib/books/homepage";
import { getDefaultBooks } from "~/server/queries/books";
import {
  getCachedActivityMosaic,
  getCachedWeightliftingStats,
} from "~/server/queries/weightlifting";

import AboutMe from "./components/About";
import BlogPosts from "./components/BlogPosts";
import BookNotes from "./components/BookNotes";
import DailyRoutine from "./components/DailyRoutine";
import PersonalManual from "./components/PersonalManual";
import Projects from "./components/Projects";
import Quotes from "./components/Quotes";
import Talks from "./components/Talks";
import { DeferredWeightlifting } from "./components/DeferredWeightlifting";
import { GrainientBackground } from "~/components/ui/grainient-background";

export const revalidate = 86400;

export default async function HomePage() {
  const [allBooks, activity, liftingStats] = await Promise.all([
    getDefaultBooks(),
    getCachedActivityMosaic(12),
    getCachedWeightliftingStats(),
  ]);
  const bookStats = computeHomepageBookStats(allBooks);
  const bookCovers = allBooks.slice(0, 60).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
  }));

  return (
    <GrainientBackground>
      <main className="relative m-auto flex max-w-screen-md flex-col items-center justify-center gap-20 overflow-visible scroll-smooth bg-transparent p-4 pb-28 font-serif text-muted-foreground">
        <AboutMe />
        <BookNotes books={bookCovers} stats={bookStats} />
        <DeferredWeightlifting activity={activity} stats={liftingStats} />
        <PersonalManual />
        <DailyRoutine />
        <Talks />
        <BlogPosts />
        <Projects />
        <Quotes />
      </main>
    </GrainientBackground>
  );
}

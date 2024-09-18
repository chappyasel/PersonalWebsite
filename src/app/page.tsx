import React from "react";

import AboutMe from "./components/About";
import BlogPosts from "./components/BlogPosts";
import BookNotes from "./components/BookNotes";
import GameOfLife from "./components/GameOfLife";
import Projects from "./components/Projects";
import Quotes from "./components/Quotes";

export default async function HomePage() {
  return (
    <>
      <GameOfLife />
      <main className="relative m-auto flex max-w-screen-md flex-col items-center justify-center gap-20 overflow-visible scroll-smooth bg-transparent p-4 pb-28 font-medium text-body">
        <AboutMe />
        <BookNotes />
        <BlogPosts />
        <Projects />
        <Quotes />
      </main>
    </>
  );
}

import React from "react";

import { GrainientBackground } from "~/components/ui/grainient-background";

import AboutMe from "./components/About";
import BlogPosts from "./components/BlogPosts";
import BookNotes from "./components/BookNotes";
import PersonalManual from "./components/PersonalManual";
import Projects from "./components/Projects";
import Quotes from "./components/Quotes";

export default async function HomePage() {
  return (
    <GrainientBackground>
      <main className="relative m-auto flex max-w-screen-md flex-col items-center justify-center gap-20 overflow-visible scroll-smooth bg-transparent p-4 pb-28 font-serif text-muted-foreground">
        <AboutMe />
        <PersonalManual />
        <BookNotes />
        <BlogPosts />
        <Projects />
        <Quotes />
      </main>
    </GrainientBackground>
  );
}

import React from "react";

import AboutMe from "./components/About";
import BlogPosts from "./components/BlogPosts";
import BookNotes from "./components/BookNotes";
import DailyRoutine from "./components/DailyRoutine";
import FeaturedLinkedInPosts from "./components/FeaturedLinkedInPosts";
import PersonalManual from "./components/PersonalManual";
import Projects from "./components/Projects";
import Quotes from "./components/Quotes";
import Weightlifting from "./components/Weightlifting";
import { GrainientBackground } from "~/components/ui/grainient-background";

export default async function HomePage() {
  return (
    <GrainientBackground>
      <main className="relative m-auto flex max-w-screen-md flex-col items-center justify-center gap-20 overflow-visible scroll-smooth bg-transparent p-4 pb-28 font-serif text-muted-foreground">
        <AboutMe />
        <BookNotes />
        <Weightlifting />
        <PersonalManual />
        <DailyRoutine />
        <FeaturedLinkedInPosts />
        <BlogPosts />
        <Projects />
        <Quotes />
      </main>
    </GrainientBackground>
  );
}

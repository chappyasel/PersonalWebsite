import Link from "next/link";
import React from "react";

import AboutMe from "./components/About";
import GameOfLife from "./components/GameOfLife";
import Projects from "./components/Projects";
import ResumeLinks from "./components/Resume";

export default async function HomePage() {
  return (
    <>
      <GameOfLife />
      <main className="relative m-auto flex max-w-screen-md flex-col items-center justify-center gap-20 overflow-visible scroll-smooth bg-transparent p-4 py-28 text-body">
        <AboutMe />
        <Link
          className="m-auto w-full rounded-2xl bg-cell/20 shadow-[0px_5px_15px_2px_rgba(0,0,0,0.2)] backdrop-blur-lg transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-[0px_5px_20px_0px_rgba(0,0,0,0.14)]"
          href="https://books.chappyasel.com"
          target="_blank"
        >
          <h3 className="p-4 text-center text-xl font-bold text-body">
            Book Notes! 📚
          </h3>
        </Link>
        <Projects />
        <ResumeLinks />
      </main>
    </>
  );
}

import React from "react";

import GameOfLife from "./components/GameOfLife";
import AboutMe from "./components/About";
import ContactInfo from "./components/Contact";
import Projects from "./components/Projects";
import ResumeLinks from "./components/Resume";
import Link from "next/link";

export default async function HomePage() {
  return (
    <>
      <GameOfLife />
      <main className="relative scroll-smooth p-4 py-28 m-auto flex max-w-screen-md flex-col items-center justify-center overflow-visible bg-transparent text-body gap-20">
        <AboutMe />
        <Link
          className="m-auto w-full rounded-2xl bg-cell/20 backdrop-blur-lg shadow-[0px_5px_15px_2px_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-[0px_5px_20px_0px_rgba(0,0,0,0.14)]"
          href="https://books.chappyasel.com"
          target="_blank"
        >
          <h3 className="p-4 text-center text-xl font-bold text-body">
            Book Notes! 📚
          </h3>
        </Link>
        <Projects />
        <ResumeLinks />
        <ContactInfo />
      </main>
    </>
  );
}

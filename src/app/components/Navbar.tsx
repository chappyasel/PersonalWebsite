"use client";

import { type Section } from "../util/sections";
import React, { useCallback, useEffect, useState } from "react";

const BAR_HEIGHT = 80;

export interface Props {
  title: string;
  sections: Section[];
}

export default function Navbar({ title, sections }: Props) {
  const [prevPos, setPrevPos] = useState(0);
  const [visible, setVisible] = useState(true);

  const handleScroll = useCallback(() => {
    const currPos = window.scrollY;
    setVisible(currPos < BAR_HEIGHT || prevPos > currPos);
    setPrevPos(currPos);
  }, [prevPos]);

  useEffect(() => {
    const onScroll = () => handleScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [handleScroll, prevPos]);

  useEffect(() => {
    console.log(visible);
  }, [visible]);

  return (
    <nav
      className={`fixed w-full px-10 py-3 h-[${BAR_HEIGHT}px] ease-0 z-10 bg-nav/80 text-navText shadow-[0px_5px_10px_2px_rgba(0,0,0,0.1)] backdrop-blur-xl transition-all duration-500`}
      style={{ top: visible ? "0" : `-${BAR_HEIGHT}px` }}
    >
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between">
        <p className="flex-2 hidden text-[min(3vw,35px)] font-bold md:block">
          {title}
        </p>
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="hover:text-navHoverColor flex-1 p-2.5 text-center text-[min(max(2.4vw,15px),22px)] font-semibold no-underline transition-all duration-200 ease-in-out"
          >
            {section.title}
          </a>
        ))}
      </div>
    </nav>
  );
}

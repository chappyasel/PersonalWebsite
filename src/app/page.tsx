import React from "react";

import Background from "./components/Background";
import Navbar from "./components/Navbar";
import Section from "./components/Section";

import { SECTIONS } from "./util/sections";

export default async function HomePage() {
  return (
    <>
      <Background />
      <div className="relative scroll-smooth pb-[100px] pt-[80px]">
        <Navbar title="Chappy Asel" sections={SECTIONS} />
        {SECTIONS.map((section) => (
          <Section key={section.id} {...section} />
        ))}
      </div>
    </>
  );
}

import { type Section } from "../util/sections";
import React from "react";

export default function SectionView(section: Section) {
  return (
    <div
      id={section.id}
      className="m-auto flex max-w-[2000px] flex-col items-center justify-center overflow-visible bg-transparent px-[100px] py-[100px] text-body md:px-[50px] md:py-[50px]"
    >
      <h1 className="mb-5 text-center text-[min(max(6vw,35px),60px)] font-bold text-title">
        {section.title}
      </h1>
      {section.contents}
    </div>
  );
}

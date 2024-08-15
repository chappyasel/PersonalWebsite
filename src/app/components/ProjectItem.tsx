"use client";

import { type Project } from "../util/data";
import Image from "next/image";
import React from "react";

export interface Props {
  project: Project;
}

export default function ProjectItem({ project }: Props) {
  return (
    <div
      className="group relative m-2.5 h-[300px] w-[47%] cursor-pointer overflow-hidden rounded-[20px] shadow-[0px_5px_20px_2px_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out hover:scale-[1.03] hover:shadow-[0px_5px_30px_0px_rgba(0,0,0,0.14)] md:h-[40vw] md:max-h-[350px] md:min-h-[250px] md:w-[90%]"
      onClick={(_) => window.open(project.link, "_blank")}
    >
      <Image
        src={`/images/projects/${project.image ?? "default.jpg"}`}
        alt={project.name}
        layout="fill"
        objectFit="cover"
        className="rounded-[20px]"
      />
      <div className="absolute right-[10px] top-[10px] rounded-[15px] bg-cell/80 text-xl backdrop-blur-lg">
        <h3 className="px-[20px] py-[10px] font-bold">{project.name}</h3>
      </div>
    </div>
  );
}

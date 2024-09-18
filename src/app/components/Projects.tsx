import { ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import data from "public/data/projects.json";
import React from "react";

type Project = {
  name: string;
  link: string;
  image?: string;
  languages: string[];
  description: string;
};

const PROJECTS: Project[] = data.projects;

export default async function Projects() {
  return (
    <section className="flex w-full flex-wrap items-center justify-around gap-4">
      <h1 className="w-full text-5xl font-bold text-title [text-shadow:_0_0_20px_rgba(255,255,255,1)]">
        👨‍💻 Projects
      </h1>
      {PROJECTS.map((project, _) => (
        <ProjectItem key={project.name} project={project} />
      ))}
    </section>
  );
}

function ProjectItem({ project }: { project: Project }) {
  return (
    <Link
      href={project.link}
      target="_blank"
      className="group relative flex w-full flex-col overflow-hidden rounded-3xl p-4 shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] backdrop-blur-lg transition-all duration-300 ease-in-out hover:scale-[1.03] hover:shadow-[0px_5px_30px_0px_rgba(0,0,0,0.14)] sm:flex-row"
    >
      <div className="h-full sm:h-auto sm:basis-1/3">
        {project.image ? (
          <Image
            className="size-full rounded-xl object-cover shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)]"
            src={`/images/projects/${project.image}`}
            alt={project.name}
            width={1000}
            height={1000}
          />
        ) : (
          <div className="flex size-full items-center justify-center rounded-xl bg-background/20 shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)]">
            <ImageIcon className="size-28 text-body opacity-20" />
          </div>
        )}
      </div>
      <div className="flex basis-2/3 flex-col justify-start pt-4 sm:pl-6 sm:pt-0">
        <h3 className="text-2xl font-bold">{project.name}</h3>
        <p className="mt-1 line-clamp-4">{project.description}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {project.languages.map((language) => (
            <span
              key={language}
              className="rounded-full border-2 border-body px-2 py-[1px] text-sm font-semibold"
            >
              {language}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

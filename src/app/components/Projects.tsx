import { CodeIcon, ImageIcon } from "@phosphor-icons/react/dist/ssr";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import data from "public/data/projects.json";
import fantasyImage from "public/images/projects/fantasy.jpg";
import homeworkImage from "public/images/projects/homework.jpg";
import liarsDiceImage from "public/images/projects/liars-dice.png";
import rotoworldImage from "public/images/projects/rotoworld-ml.jpg";
import webExperimentsImage from "public/images/projects/web-exp.jpg";
import weightliftingMlImage from "public/images/projects/weightlifting-ml.jpg";
import weightliftingImage from "public/images/projects/weightlifting.jpg";
import React from "react";

import TiltCard from "./TiltCard";

type Project = {
  name: string;
  link: string;
  image?: string;
  languages: string[];
  description: string;
};

const PROJECTS: Project[] = data.projects;
const PROJECT_IMAGES: Record<string, StaticImageData> = {
  "fantasy.jpg": fantasyImage,
  "homework.jpg": homeworkImage,
  "liars-dice.png": liarsDiceImage,
  "rotoworld-ml.jpg": rotoworldImage,
  "web-exp.jpg": webExperimentsImage,
  "weightlifting-ml.jpg": weightliftingMlImage,
  "weightlifting.jpg": weightliftingImage,
};

export default async function Projects() {
  return (
    <section className="flex w-full flex-wrap items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)] md:gap-3 md:text-3xl">
        <CodeIcon weight="regular" className="size-7 shrink-0 md:size-8" />
        Projects
      </h1>
      {PROJECTS.map((project, _) => (
        <ProjectItem key={project.name} project={project} />
      ))}
    </section>
  );
}

function ProjectItem({ project }: { project: Project }) {
  const image = project.image ? PROJECT_IMAGES[project.image] : undefined;

  return (
    <TiltCard className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000">
      <Link
        href={project.link}
        target="_blank"
        className="group relative flex w-full flex-col p-5 [transform-style:preserve-3d] sm:flex-row sm:p-6"
      >
        {/* Background layer — sits flat so backdrop-blur doesn't flatten 3D */}
        <div className="absolute inset-0 rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]" />
        <div
          className="relative h-full sm:h-auto sm:basis-1/3"
          style={{ transform: "translateZ(30px)" }}
        >
          {image ? (
            <Image
              className="h-auto w-full rounded-2xl object-cover object-top shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] sm:h-full"
              src={image}
              alt={project.name}
              sizes="(max-width: 640px) calc(100vw - 3rem), 240px"
              placeholder="blur"
            />
          ) : (
            <div className="flex size-full items-center justify-center rounded-2xl bg-background/20 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)]">
              <ImageIcon
                className="size-28 text-muted-foreground opacity-20"
                weight="duotone"
              />
            </div>
          )}
        </div>
        <div
          className="relative flex basis-2/3 flex-col justify-start pt-4 sm:pl-6 sm:pt-0"
          style={{ transform: "translateZ(20px)" }}
        >
          <h3 className="text-lg font-semibold md:text-xl">{project.name}</h3>
          <p className="mt-1 line-clamp-4 text-sm">{project.description}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {project.languages.map((language) => (
              <span
                key={language}
                className="rounded-full border border-foreground/[0.06] bg-muted/40 px-2.5 py-0.5 text-sm font-semibold backdrop-blur-lg"
              >
                {language}
              </span>
            ))}
          </div>
        </div>
      </Link>
    </TiltCard>
  );
}

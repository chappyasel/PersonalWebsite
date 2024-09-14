import { ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React from "react";

type Project = {
  name: string;
  link: string;
  image?: string;
  languages: string[];
};

const PROJECTS: Project[] = [
  {
    name: "Weightlifting App",
    link: "https://apps.apple.com/us/app/id1266077653",
    image: "weightlifting.jpg",
    languages: ["Objective C"],
  },
  {
    name: "Homework App",
    link: "https://apps.apple.com/us/app/id1097438761",
    image: "homework.jpg",
    languages: ["Objective C"],
  },
  {
    name: "Web Experiments",
    link: "https://github.com/chappyasel/WebExperiments_Backend",
    image: "web-exp.jpg",
    languages: ["HTML", "CSS", "JavaScript", "Node.js"],
  },
  {
    name: "Fantasy Basketball",
    link: "https://github.com/chappyasel/FantasyBasketball_iOS",
    image: "fantasy.jpg",
    languages: ["Objective C"],
  },
  {
    name: "Weightlifting App ML",
    link: "https://github.com/chappyasel/WeightliftingAppML_Python",
    image: "weightlifting-ml.jpg",
    languages: ["Python"],
  },
  {
    name: "Rotoworld ML",
    link: "https://github.com/chappyasel/RotoworldML_Python",
    image: "rotoworld-ml.jpg",
    languages: ["Python"],
  },
  {
    name: "Liar's Dice",
    link: "/liarsdice",
    languages: ["TypeScript"],
  },
];

export default async function Projects() {
  return (
    <section className="flex w-full flex-wrap items-center justify-around gap-4">
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
      className="group relative h-[300px] w-full overflow-hidden rounded-3xl shadow-[0px_5px_20px_2px_rgba(0,0,0,0.2)] backdrop-blur-lg transition-all duration-300 ease-in-out hover:scale-[1.03] hover:shadow-[0px_5px_30px_0px_rgba(0,0,0,0.14)] md:h-[40vw] md:max-h-[350px] md:min-h-[250px]"
    >
      {(project.image && (
        <Image
          src={`/images/projects/${project.image}`}
          alt={project.name}
          layout="fill"
          objectFit="cover"
        />
      )) ?? (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon className="size-28 text-gray-200" />
        </div>
      )}
      <div className="absolute right-3 top-3 rounded-xl bg-cell/20 text-xl backdrop-blur-lg">
        <h3 className="px-[20px] py-[10px] font-bold">{project.name}</h3>
      </div>
    </Link>
  );
}

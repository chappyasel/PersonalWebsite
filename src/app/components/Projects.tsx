import { DATA } from "../util/data";
import React from "react";

import ProjectItem from "./ProjectItem";

export default async function ProjectsView() {
  return (
    <section className="flex w-4/5 flex-wrap items-center justify-around">
      {DATA.projects.list.map((project, _) => (
        <ProjectItem key={project.name} project={project} />
      ))}
    </section>
  );
}

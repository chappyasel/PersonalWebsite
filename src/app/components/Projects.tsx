import {
  ArrowUpRightIcon,
  CodeIcon,
  GithubLogoIcon,
} from "@phosphor-icons/react/dist/ssr";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import data from "public/data/projects.json";
import liarsDiceTile from "public/images/projects/liars-dice-tile.webp";
import metaKbTile from "public/images/projects/meta-kb-tile.webp";
import thisWebsiteTile from "public/images/projects/this-website-tile.webp";
import homeworkIcon from "public/images/stacks/v8/512/projects-homework-icon.webp";
import weightliftingIcon from "public/images/stacks/v8/512/projects-weightlifting-icon.webp";
import React from "react";

import {
  type GitHubPlacard,
  type GitHubPlacardRepo,
  buildGitHubPlacard,
} from "~/lib/github/placard";
import { type GitHubActivity } from "~/lib/github/types";
import { getTimeAgo } from "~/lib/util";

import GitHubActivityCard from "./GitHubActivityCard";
import TiltCard from "./TiltCard";

type Project = {
  name: string;
  link?: string;
  image: string;
  /** One quiet line under the title: platform, where it lives, when. */
  meta: string;
  /** owner/name of the GitHub repository this card already covers. */
  repo?: string;
  languages: string[];
  description: string;
};

const PROJECTS: Project[] = data.projects;

/**
 * Every project gets the same square tile, app icon or not, so the five
 * cards line up as one list. The three non-app tiles are 512px crops cut
 * for this square (scripts in the commit that added them); static imports
 * give Next the sizes and blur placeholders.
 */
const PROJECT_TILES: Record<string, StaticImageData> = {
  "/images/stacks/v8/512/projects-weightlifting-icon.webp": weightliftingIcon,
  "/images/stacks/v8/512/projects-homework-icon.webp": homeworkIcon,
  "/images/projects/meta-kb-tile.webp": metaKbTile,
  "/images/projects/this-website-tile.webp": thisWebsiteTile,
  "/images/projects/liars-dice-tile.webp": liarsDiceTile,
};

const FEATURED_REPOS = PROJECTS.flatMap((project) =>
  project.repo ? [project.repo] : [],
);

export default function Projects({
  github,
}: {
  /** Null when neither the live fetch nor the snapshot could be read. */
  github: GitHubActivity | null;
}) {
  const placard = github
    ? buildGitHubPlacard(github, { featuredRepos: FEATURED_REPOS })
    : null;
  return (
    <section className="flex w-full flex-wrap items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground md:gap-3 md:text-3xl">
        <CodeIcon weight="regular" className="size-7 shrink-0 md:size-8" />
        Projects
      </h1>
      {placard ? <GitHubActivityCard placard={placard} /> : null}
      {PROJECTS.map((project) => (
        <ProjectItem key={project.name} project={project} />
      ))}
      {placard && placard.active.length + placard.more.length > 0 ? (
        <RepositoriesCard placard={placard} />
      ) : null}
    </section>
  );
}

const CARD_SURFACE =
  "absolute inset-0 rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]";

function count(value: number) {
  return value.toLocaleString("en-US");
}

function ProjectItem({ project }: { project: Project }) {
  const tile = PROJECT_TILES[project.image];
  const content = (
    <>
      {/* Background layer — sits flat so backdrop-blur doesn't flatten 3D */}
      <div
        data-placard-background=""
        data-placard-surface=""
        className={CARD_SURFACE}
      />
      {tile ? (
        <div
          className="relative size-24 shrink-0 sm:size-28"
          style={{ transform: "translateZ(30px)" }}
        >
          <Image
            className="size-full rounded-[22%] object-cover shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)]"
            src={tile}
            alt={project.name}
            sizes="112px"
            placeholder="blur"
          />
        </div>
      ) : null}
      <div
        className="relative flex min-w-0 flex-1 flex-col justify-start pt-4 sm:pl-6 sm:pt-0"
        style={{ transform: "translateZ(20px)" }}
      >
        <h3 className="text-lg font-semibold md:text-xl">{project.name}</h3>
        <p className="text-xs font-semibold text-muted-foreground">
          {project.meta}
        </p>
        <p className="mt-1 text-sm">{project.description}</p>
      </div>
    </>
  );

  return (
    <TiltCard
      interactive={Boolean(project.link)}
      className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
    >
      {project.link ? (
        <Link
          href={project.link}
          target="_blank"
          className="group relative flex w-full flex-col p-5 [transform-style:preserve-3d] sm:flex-row sm:p-6"
        >
          {content}
        </Link>
      ) : (
        <div
          className="relative flex w-full flex-col p-5 [transform-style:preserve-3d] sm:flex-row sm:p-6"
          data-project-unavailable=""
        >
          {content}
        </div>
      )}
    </TiltCard>
  );
}

function RepoRow({
  repo,
  detail,
}: {
  repo: GitHubPlacardRepo;
  detail: string;
}) {
  return (
    <li>
      <Link
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="-mx-2 block rounded-xl px-2 py-2 transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {repo.organization ? (
              <span className="font-normal text-muted-foreground">
                {repo.organization}/
              </span>
            ) : null}
            {repo.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {detail}
          </span>
        </div>
        {repo.description ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {repo.description}
          </p>
        ) : null}
      </Link>
    </li>
  );
}

function RepoGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="mt-1.5 divide-y divide-foreground/10">{children}</ul>
    </div>
  );
}

/**
 * The individual repositories, after the projects: where this year's commits
 * went (own and organization repos alike), then the older public repos by
 * last push. The old cards were screenshots of these repositories' file
 * listings; a line with the repository's own description is more honest
 * about what they are.
 */
function RepositoriesCard({ placard }: { placard: GitHubPlacard }) {
  return (
    <TiltCard className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000">
      <div className="group relative flex w-full flex-col p-5 [transform-style:preserve-3d] sm:p-6">
        <div
          data-placard-background=""
          data-placard-surface=""
          className={CARD_SURFACE}
        />
        <div
          className="relative flex flex-col"
          style={{ transform: "translateZ(20px)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-lg font-semibold md:text-xl">
              <GithubLogoIcon weight="fill" className="size-5 shrink-0" />
              Repositories
            </h3>
            <Link
              href={placard.repositoriesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
            >
              All {count(placard.publicRepoCount)} public repos
              <ArrowUpRightIcon weight="bold" className="size-3.5" />
            </Link>
          </div>
          {placard.active.length > 0 ? (
            <RepoGroup title="Where this year&apos;s commits went">
              {placard.active.map((repo) => (
                <RepoRow
                  key={repo.nameWithOwner}
                  repo={repo}
                  detail={[`${count(repo.commits ?? 0)} commits`, repo.language]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </RepoGroup>
          ) : null}
          {placard.more.length > 0 ? (
            <RepoGroup title="Earlier">
              {placard.more.map((repo) => (
                <RepoRow
                  key={repo.nameWithOwner}
                  repo={repo}
                  detail={[repo.language, getTimeAgo(repo.pushedAt)]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </RepoGroup>
          ) : null}
        </div>
      </div>
    </TiltCard>
  );
}

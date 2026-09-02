import {
  ArrowUpRightIcon,
  CodeIcon,
  GitForkIcon,
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
import { cn, getTimeAgo } from "~/lib/util";

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

export default function Projects({
  github,
}: {
  /** Null when neither the live fetch nor the snapshot could be read. */
  github: GitHubActivity | null;
}) {
  const placard = github ? buildGitHubPlacard(github) : null;
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
      {placard && placard.repos.length > 0 ? (
        <RepositoriesCard placard={placard} />
      ) : null}
    </section>
  );
}

const CARD_SURFACE =
  "absolute inset-0 rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]";

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

/**
 * One repository the way GitHub draws a pinned one: name, description, the
 * language with its swatch, and when it last moved where GitHub would put
 * the star and fork counts. A repository with no description shows its
 * latest commit headline instead, so nothing is a blank tile. A fork gets
 * the fork glyph GitHub gives it, since its description is the upstream's.
 */
function RepoTile({ repo }: { repo: GitHubPlacardRepo }) {
  const blurb = repo.description ?? repo.lastCommit?.headline ?? null;
  return (
    <li className="min-w-0">
      <Link
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-full flex-col gap-1.5 rounded-2xl border border-foreground/10 p-3 transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
          {repo.isFork ? (
            <GitForkIcon
              role="img"
              aria-label="Fork"
              weight="bold"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          ) : null}
          <span className="truncate">
            {repo.organization ? (
              <span className="font-normal text-muted-foreground">
                {repo.organization}/
              </span>
            ) : null}
            {repo.name}
          </span>
        </span>
        {blurb ? (
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {blurb}
          </p>
        ) : null}
        <span className="mt-auto flex items-center justify-between gap-3 pt-1 text-xs text-muted-foreground">
          {repo.language ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  !repo.languageColor && "bg-foreground/30",
                )}
                style={
                  repo.languageColor
                    ? { backgroundColor: repo.languageColor }
                    : undefined
                }
              />
              <span className="truncate">{repo.language}</span>
            </span>
          ) : (
            <span />
          )}
          <span className="shrink-0">Updated {getTimeAgo(repo.pushedAt)}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Every repository, after the projects, as two columns of tiles in GitHub's
 * pinned style: all of his public ones plus the organization ones he
 * committed to this year, newest push first (see `buildGitHubPlacard`).
 * The old cards were screenshots of file listings from 2017.
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
              <GithubLogoIcon weight="duotone" className="size-5 shrink-0" />
              Public repos
            </h3>
            <Link
              href={placard.repositoriesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
            >
              github.com/{placard.login}
              <ArrowUpRightIcon weight="bold" className="size-3.5" />
            </Link>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {placard.repos.map((repo) => (
              <RepoTile key={repo.nameWithOwner} repo={repo} />
            ))}
          </ul>
        </div>
      </div>
    </TiltCard>
  );
}

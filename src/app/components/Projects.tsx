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
import { getTimeAgo } from "~/lib/util";

import { Card, CardContent } from "~/components/ui/card";

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
const REPO_DESCRIPTIONS: Record<string, string> = data.repoDescriptions;

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
    <section className="placard-card-stack flex w-full flex-wrap items-center justify-around gap-4">
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
          data-placard-media-highlight=""
          className="relative size-24 shrink-0 rounded-[22%] sm:size-28"
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
        className={`relative flex min-w-0 flex-1 flex-col justify-start ${tile ? "pl-[var(--homepage-card-padding)]" : ""}`}
        style={{ transform: "translateZ(20px)" }}
      >
        <h3 className="homepage-card-title font-semibold">{project.name}</h3>
        <p className="homepage-card-meta font-semibold text-muted-foreground">
          {project.meta}
        </p>
        <p className="mt-1 line-clamp-4 homepage-card-body">{project.description}</p>
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
          className="homepage-card-content group relative flex w-full flex-row [transform-style:preserve-3d]"
        >
          {content}
        </Link>
      ) : (
        <div
          className="homepage-card-content relative flex w-full flex-row [transform-style:preserve-3d]"
          data-project-unavailable=""
        >
          {content}
        </div>
      )}
    </TiltCard>
  );
}

/** Full-width rows keep repository names and summaries readable. */
function RepoItem({ repo }: { repo: GitHubPlacardRepo }) {
  const blurb = REPO_DESCRIPTIONS[repo.nameWithOwner] ?? repo.description;
  return (
    <li className="min-w-0">
      <Link
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group/repo pointer-events-auto -mx-2 flex min-w-0 flex-col gap-1 rounded-xl p-2 transition-colors duration-200 hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
      >
        <span className="flex min-w-0 items-start gap-2 homepage-card-body font-semibold text-foreground">
          {repo.isFork ? (
            <GitForkIcon
              role="img"
              aria-label="Fork"
              weight="bold"
              className="mt-1 size-4 shrink-0 text-muted-foreground"
            />
          ) : null}
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            {repo.organization ? (
              <span className="font-normal text-muted-foreground">
                {repo.organization}/
              </span>
            ) : null}
            {repo.name}
          </span>
          <ArrowUpRightIcon
            aria-hidden
            weight="bold"
            className="mt-1 size-4 shrink-0 text-muted-foreground transition-colors group-hover/repo:text-foreground"
          />
        </span>
        {blurb ? (
          <p className="homepage-card-body [overflow-wrap:anywhere]">{blurb}</p>
        ) : null}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 homepage-card-meta text-muted-foreground opacity-60">
          {repo.language ? (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full bg-foreground/30"
                style={
                  repo.languageColor
                    ? { backgroundColor: repo.languageColor }
                    : undefined
                }
              />
              {repo.language}
            </span>
          ) : null}
          <span className="ml-auto text-right">
            Updated {getTimeAgo(repo.pushedAt)}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** The ten most recently updated repositories, newest first. */
function RepositoriesCard({ placard }: { placard: GitHubPlacard }) {
  return (
    <TiltCard interactive className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000">
      <Card className="homepage-card-content group relative flex w-full flex-col rounded-3xl border-0 bg-transparent text-foreground shadow-none [transform-style:preserve-3d]">
        <div
          data-placard-background=""
          data-placard-surface=""
          className={CARD_SURFACE}
        />
        <Link
          href={placard.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open Chappy's GitHub profile"
          className="absolute inset-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
        />
        <CardContent
          // Empty space falls through to the profile link; repository rows
          // restore pointer events so each remains an independent link.
          className="pointer-events-none relative flex min-w-0 flex-col p-0"
          style={{ transform: "translateZ(20px)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 homepage-card-title font-semibold">
              <GithubLogoIcon
                aria-hidden
                weight="regular"
                className="size-5 shrink-0"
              />
              Recent Public Repos
            </h3>
          </div>
          <ul className="mt-2 divide-y divide-foreground/[0.06]">
            {placard.repos.slice(0, 10).map((repo) => (
              <RepoItem key={repo.nameWithOwner} repo={repo} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </TiltCard>
  );
}

import type { Icon } from "@phosphor-icons/react";
import {
  ArrowUpRightIcon,
  CodeIcon,
  GithubLogoIcon,
} from "@phosphor-icons/react/dist/ssr";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import data from "public/data/projects.json";
import liarsDiceImage from "public/images/projects/liars-dice.png";
import metaKbImage from "public/images/projects/meta-kb.webp";
import homeSceneImage from "public/images/stacks/home-og-scene.jpg";
import homeworkIcon from "public/images/stacks/v8/512/projects-homework-icon.webp";
import weightliftingIcon from "public/images/stacks/v8/512/projects-weightlifting-icon.webp";
import React from "react";

import {
  type GitHubPlacard,
  type GitHubPlacardRepo,
  buildGitHubPlacard,
} from "~/lib/github/placard";
import {
  type GitHubActivity,
  type GitHubContributionDay,
} from "~/lib/github/types";
import { getTimeAgo } from "~/lib/util";

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
 * Static imports so Next can size the images and build blur placeholders.
 * An `icon` is the app's own artwork on a square tile; a `wide` image is a
 * capture that fills the card's media column. The mobile sheet forces
 * `data-placard-media` to 16:9, so icons deliberately do not carry it.
 */
const PROJECT_IMAGES: Record<
  string,
  { src: StaticImageData; kind: "icon" | "wide" }
> = {
  "/images/stacks/v8/512/projects-weightlifting-icon.webp": {
    src: weightliftingIcon,
    kind: "icon",
  },
  "/images/stacks/v8/512/projects-homework-icon.webp": {
    src: homeworkIcon,
    kind: "icon",
  },
  "/images/projects/meta-kb.webp": { src: metaKbImage, kind: "wide" },
  "/images/stacks/home-og-scene.jpg": { src: homeSceneImage, kind: "wide" },
  "/images/projects/liars-dice.png": { src: liarsDiceImage, kind: "wide" },
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
      {placard && placard.more.length > 0 ? (
        <MoreOnGitHubCard placard={placard} />
      ) : null}
    </section>
  );
}

const CARD_SURFACE =
  "absolute inset-0 rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Sep 2026" from a YYYY-MM-DD string, read by parts so no time zone can
 * move the label onto a neighbouring month. */
function monthYear(date: string) {
  const [year, month] = date.split("-");
  return `${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

function count(value: number) {
  return value.toLocaleString("en-US");
}

/**
 * GitHub's own five shading steps, drawn in the placard's ink rather than
 * GitHub green: the card is a museum label about him, not an embed. One
 * rect per day, so the SVG is a few hundred nodes and no JavaScript.
 */
const LEVEL_OPACITY = [0.08, 0.3, 0.52, 0.76, 1] as const;
const CELL = 10;
const GAP = 3;

function ContributionMosaic({
  weeks,
  label,
}: {
  weeks: (GitHubContributionDay | null)[][];
  label: string;
}) {
  const step = CELL + GAP;
  const width = weeks.length * step - GAP;
  const height = 7 * step - GAP;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full text-foreground"
      role="img"
      aria-label={label}
    >
      {weeks.map((week, column) =>
        week.map((day, row) =>
          day ? (
            <rect
              key={day.date}
              x={column * step}
              y={row * step}
              width={CELL}
              height={CELL}
              rx={2}
              fill="currentColor"
              opacity={LEVEL_OPACITY[day.level]}
            />
          ) : null,
        ),
      )}
    </svg>
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
        className="group/repo -mx-2 block rounded-xl px-2 py-2 transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
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

function CardHeading({
  icon: Icon,
  children,
  href,
  linkLabel,
}: {
  icon: Icon;
  children: React.ReactNode;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-lg font-semibold md:text-xl">
        <Icon weight="fill" className="size-5 shrink-0" />
        {children}
      </h3>
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
      >
        {linkLabel}
        <ArrowUpRightIcon weight="bold" className="size-3.5" />
      </Link>
    </div>
  );
}

/**
 * The live half of the section. The repositories tab on GitHub is mostly
 * student work from 2015 to 2018 and says nothing about the last year, most
 * of which happened in private repositories. The calendar and the active
 * list are what the tab cannot show.
 */
function GitHubActivityCard({ placard }: { placard: GitHubPlacard }) {
  const { contributions } = placard;
  const facts = [
    contributions.restricted > 0
      ? `${count(contributions.restricted)} in private repositories`
      : null,
    `${count(contributions.activeDays)} active days`,
    `${count(placard.publicRepoCount)} public repos`,
  ].filter((fact): fact is string => fact !== null);

  return (
    <TiltCard
      className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
    >
      <div className="group relative flex w-full flex-col p-5 [transform-style:preserve-3d] sm:p-6">
        <div data-placard-background="" data-placard-surface="" className={CARD_SURFACE} />
        <div
          className="relative flex flex-col"
          style={{ transform: "translateZ(20px)" }}
        >
          <CardHeading
            icon={GithubLogoIcon}
            href={placard.profileUrl}
            linkLabel={`@${placard.login}`}
          >
            GitHub
          </CardHeading>

          <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
            <strong className="text-3xl font-semibold leading-none tabular-nums text-foreground md:text-4xl">
              {count(contributions.total)}
            </strong>
            <span className="text-sm text-muted-foreground">
              contributions in the last year
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {facts.join(" · ")}
          </p>

          <div className="mt-4">
            <ContributionMosaic
              weeks={contributions.weeks}
              label={`${count(contributions.total)} GitHub contributions between ${monthYear(contributions.from)} and ${monthYear(contributions.to)}, on ${count(contributions.activeDays)} days`}
            />
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>{monthYear(contributions.from)}</span>
              <span>{monthYear(contributions.to)}</span>
            </div>
          </div>

          {placard.active.length > 0 ? (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Where this year&apos;s commits went
              </p>
              <ul className="mt-1.5 divide-y divide-foreground/10">
                {placard.active.map((repo) => (
                  <RepoRow
                    key={repo.nameWithOwner}
                    repo={repo}
                    detail={[
                      `${count(repo.commits ?? 0)} commits`,
                      repo.language,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </TiltCard>
  );
}

/**
 * The rest of the public account, one line each, newest push first. The
 * old cards were screenshots of these repositories' file listings; a line
 * with the repository's own description is more honest about what they are.
 */
function MoreOnGitHubCard({ placard }: { placard: GitHubPlacard }) {
  return (
    <TiltCard
      className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
    >
      <div className="group relative flex w-full flex-col p-5 [transform-style:preserve-3d] sm:p-6">
        <div data-placard-background="" data-placard-surface="" className={CARD_SURFACE} />
        <div
          className="relative flex flex-col"
          style={{ transform: "translateZ(20px)" }}
        >
          <CardHeading
            icon={GithubLogoIcon}
            href={placard.repositoriesUrl}
            linkLabel={`All ${count(placard.publicRepoCount)} public repos`}
          >
            More on GitHub
          </CardHeading>
          <ul className="mt-3 divide-y divide-foreground/10">
            {placard.more.map((repo) => (
              <RepoRow
                key={repo.nameWithOwner}
                repo={repo}
                detail={[repo.language, getTimeAgo(repo.pushedAt)]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </ul>
        </div>
      </div>
    </TiltCard>
  );
}

function ProjectItem({ project }: { project: Project }) {
  const image = PROJECT_IMAGES[project.image];
  const content = (
    <>
      {/* Background layer — sits flat so backdrop-blur doesn't flatten 3D */}
      <div data-placard-background="" data-placard-surface="" className={CARD_SURFACE} />
      {image?.kind === "icon" ? (
        <div
          className="relative size-24 shrink-0 sm:size-28"
          style={{ transform: "translateZ(30px)" }}
        >
          <Image
            className="size-full rounded-[22%] object-cover shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)]"
            src={image.src}
            alt={`${project.name} icon`}
            sizes="112px"
            placeholder="blur"
          />
        </div>
      ) : image ? (
        <div
          data-placard-media=""
          className="relative h-full sm:h-auto sm:basis-1/3"
          style={{ transform: "translateZ(30px)" }}
        >
          <Image
            className="h-auto w-full rounded-2xl object-cover object-top shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] sm:h-full"
            src={image.src}
            alt={project.name}
            sizes="(max-width: 640px) calc(100vw - 3rem), 240px"
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

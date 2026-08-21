import { ArrowUpRightIcon, ClockIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export type Talk = {
  videoId: string;
  title: string;
  venue: string;
  date: string;
  duration: string;
  url: string;
  thumbnail: string;
  excerpt: string;
  featured?: boolean;
};

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

/**
 * Formats an ISO date as "Jun 2026" by reading the string parts directly.
 * Avoids `new Date()` so the server and client can't disagree across time zones.
 */
function formatMonthYear(iso: string) {
  const [year, month] = iso.split("-");
  return `${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

export default function TalkListItem({ talk }: { talk: Talk }) {
  return (
    <li>
      <Link
        href={talk.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group grid gap-2 py-5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6 sm:py-6"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span>{talk.venue}</span>
            <span aria-hidden>·</span>
            <span>{formatMonthYear(talk.date)}</span>
          </div>

          <h3 className="mt-2 text-lg font-semibold leading-tight text-foreground md:text-xl">
            {talk.title}
          </h3>

          <p className="mt-2 text-sm leading-snug">{talk.excerpt}</p>
        </div>

        <div className="flex items-center gap-4 self-start pt-1 text-sm font-semibold text-muted-foreground sm:justify-self-end">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <ClockIcon weight="bold" className="size-4" />
            {talk.duration}
          </span>
          <ArrowUpRightIcon
            aria-hidden
            weight="bold"
            className="size-4 text-foreground opacity-60 transition-[opacity,transform] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
          />
        </div>
      </Link>
    </li>
  );
}

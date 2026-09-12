import type { Icon } from "@phosphor-icons/react";
import {
  BarbellIcon,
  BooksIcon,
  ChartLineIcon,
  CodeIcon,
  GearIcon,
  GolfIcon,
  GraphIcon,
  KeyboardIcon,
  MicrophoneStageIcon,
  NotePencilIcon,
  PenNibIcon,
  ShieldCheckIcon,
  TableIcon,
  UserIcon,
} from "@phosphor-icons/react/dist/ssr";
import { type Metadata } from "next";
import Link from "next/link";

import { SITE_PAGES } from "~/lib/site/pages";
import { ROOM_SECTION_PATHNAMES } from "~/lib/site/roomRoutes";

// Every page and exploration on the site in one list, for the owner and the
// friends he sends here. Nothing links to it and crawlers are told to skip
// it. It is /site-index, not /index: Vercel's router maps /index onto / and
// serves the homepage there. Locked and unlisted pages are listed with a note. Rows follow the
// Universal Search palette: one 28px icon slot, then one text column. Pages
// wear the tile their browser tab wears; room stops and loose items wear a
// glyph.

export const metadata: Metadata = {
  title: "Chappy's Site Index",
  description: "Every page on chappyasel.com.",
  robots: { index: false, follow: false },
};

type Entry = {
  name: string;
  href?: string;
  what: string;
  /** Access or status, in plain words. */
  note?: string;
  /** The page's tab icon route, or a glyph. */
  icon: { tile: string } | { glyph: Icon };
};

const tile = (path: string) => ({ tile: `${path}/tab-icon` });
const glyph = (icon: Icon) => ({ glyph: icon });

const ROOM: Entry[] = [
  {
    name: "Home",
    href: "/",
    what: "The 3D room. Opens on About.",
    icon: { tile: "/icon" },
  },
  {
    name: "About",
    href: ROOM_SECTION_PATHNAMES.about,
    what: "Bio and contact. The same stop as the homepage.",
    icon: glyph(UserIcon),
  },
  {
    name: "Book Notes shelf",
    href: "/#books",
    what: "The reading shelf in the room.",
    icon: glyph(BooksIcon),
  },
  {
    name: "Weightlifting shelf",
    href: "/#weightlifting",
    what: "Training stats and records in the room.",
    icon: glyph(BarbellIcon),
  },
  {
    name: "Golf",
    href: "/golf",
    what: "A four-ball green between Books and Weightlifting.",
    note: "Unlisted.",
    icon: glyph(GolfIcon),
  },
  {
    name: "Personal Systems shelf",
    href: "/#systems",
    what: "The manual, routine, and systems documents in the room.",
    icon: glyph(GearIcon),
  },
  {
    name: "Projects",
    href: ROOM_SECTION_PATHNAMES.projects,
    what: "Apps, open source, and GitHub activity.",
    icon: glyph(CodeIcon),
  },
  {
    name: "Musings",
    href: ROOM_SECTION_PATHNAMES.musings,
    what: "Blog posts.",
    icon: glyph(PenNibIcon),
  },
  {
    name: "Featured Talks",
    href: ROOM_SECTION_PATHNAMES.talks,
    what: "Talks and podcast appearances.",
    icon: glyph(MicrophoneStageIcon),
  },
];

const PAGES: Entry[] = [
  {
    name: SITE_PAGES.books.label,
    href: SITE_PAGES.books.path,
    what: `${SITE_PAGES.books.description}. Every book has its own page. Also at ${SITE_PAGES.books.host}.`,
    icon: tile(SITE_PAGES.books.path),
  },
  {
    name: SITE_PAGES.weightlifting.label,
    href: SITE_PAGES.weightlifting.path,
    what: `${SITE_PAGES.weightlifting.description}. Every exercise and every training day has its own page. Also at ${SITE_PAGES.weightlifting.host}.`,
    icon: tile(SITE_PAGES.weightlifting.path),
  },
  {
    name: SITE_PAGES.manual.label,
    href: SITE_PAGES.manual.path,
    what: `${SITE_PAGES.manual.description} Also at ${SITE_PAGES.manual.host}.`,
    icon: tile(SITE_PAGES.manual.path),
  },
  {
    name: SITE_PAGES.routine.label,
    href: SITE_PAGES.routine.path,
    what: `${SITE_PAGES.routine.description} Also at ${SITE_PAGES.routine.host}.`,
    icon: tile(SITE_PAGES.routine.path),
  },
  {
    name: SITE_PAGES.systems.label,
    href: SITE_PAGES.systems.path,
    what: SITE_PAGES.systems.description,
    icon: tile(SITE_PAGES.systems.path),
  },
  {
    name: "Weight Log",
    href: "/weight-log",
    what: "Bodyweight history, training phases, and DEXA scans in an interactive chart.",
    note: "Unlisted.",
    icon: glyph(ChartLineIcon),
  },
  {
    name: "Liar's Dice",
    href: "/liarsdice",
    what: "Probability calculator for Liar's Dice.",
    icon: tile("/liarsdice"),
  },
];

const LOCKED: Entry[] = [
  {
    name: "Dad's Journal",
    href: "/dad",
    what: "Dad's journal, 1999 to 2024, with a life story and essays.",
    note: "Password protected.",
    icon: tile("/dad"),
  },
  {
    name: "YouTube Watch History",
    href: "/youtube",
    what: "Watch history analysis.",
    note: "Password protected.",
    icon: tile("/youtube"),
  },
];

const FILES: Entry[] = [
  {
    name: "Weightlifting App privacy policy",
    href: "/weightliftingapp/privacy",
    what: "The iOS app's privacy policy. A page nothing on the site links to.",
    icon: glyph(ShieldCheckIcon),
  },
  {
    name: "meta-kb knowledge graph",
    href: "/meta-kb-graph.html",
    what: "D3 graph of the meta-kb repo. A static HTML file.",
    note: "Unlisted.",
    icon: glyph(GraphIcon),
  },
];

const OWNER: Entry[] = [
  {
    name: "Caption editor",
    what: "/admin/captions. Edits the object notes in the room. 404 outside a development build.",
    icon: glyph(NotePencilIcon),
  },
  {
    name: "YouTube calibration",
    what: "/youtube/calibrate. Behind the same password. 404 outside a development build.",
    icon: glyph(TableIcon),
  },
  {
    name: "Owner keys",
    what: "R starts free roam, the backtick opens the scene console, and a click selects a prop for the gizmo. These work on the live site; the ? sheet lists them only in a development build, and layout drafts save to disk only there.",
    icon: glyph(KeyboardIcon),
  },
];

function Slot({ icon, name }: { icon: Entry["icon"]; name: string }) {
  if ("tile" in icon) {
    // The icon routes are SVG or PNG tiles with their own rounded corners,
    // recoloured for the colour scheme by the route, so next/image has
    // nothing to add.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon.tile}
        alt=""
        width={28}
        height={28}
        className="size-7 shrink-0 rounded-md"
        draggable={false}
      />
    );
  }
  const Glyph = icon.glyph;
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center text-foreground"
    >
      <Glyph size={22} weight="duotone" aria-label={name} />
    </span>
  );
}

function Rows({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </h2>
      <ul className="flex flex-col">
        {entries.map((entry) => {
          const body = (
            <>
              <Slot icon={entry.icon} name={entry.name} />
              <span className="min-w-0 flex-1">
                <span className="block text-foreground">{entry.name}</span>
                <span className="block text-sm leading-snug text-muted-foreground">
                  {entry.what}
                  {entry.note ? (
                    <>
                      {" "}
                      <span className="text-foreground/70">{entry.note}</span>
                    </>
                  ) : null}
                </span>
              </span>
            </>
          );
          const rowClass =
            "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors";
          return (
            <li key={entry.name}>
              {entry.href ? (
                entry.href.endsWith(".html") ? (
                  <a
                    href={entry.href}
                    className={`${rowClass} hover:bg-muted/60`}
                  >
                    {body}
                  </a>
                ) : (
                  <Link
                    href={entry.href}
                    prefetch={false}
                    className={`${rowClass} hover:bg-muted/60`}
                  >
                    {body}
                  </Link>
                )
              ) : (
                <div className={rowClass}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function SiteIndexPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 px-3 py-16 font-serif text-foreground sm:px-6 sm:py-24">
      <h1 className="px-3 text-3xl font-semibold">Chappy&apos;s Site Index</h1>
      <Rows title="The room" entries={ROOM} />
      <Rows title="Pages" entries={PAGES} />
      <Rows title="Password protected" entries={LOCKED} />
      <Rows title="Odds and ends" entries={FILES} />
      <Rows title="Owner tools" entries={OWNER} />
    </main>
  );
}

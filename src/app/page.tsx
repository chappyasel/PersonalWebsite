import { type Viewport } from "next";
import blogData from "public/data/blog-posts.json";
import projectsData from "public/data/projects.json";
import speakingData from "public/data/speaking.json";
import React from "react";

import { readingBookEdgeColors } from "~/lib/books/coverEdgeColor.server";
import { computeHomepageBookStats } from "~/lib/books/homepage";
import { getDefaultBooks } from "~/server/queries/books";
import {
  getCachedActivityMosaic,
  getCachedWeightliftingStats,
} from "~/server/queries/weightlifting";

import AboutMe, { AboutIntro } from "./components/About";
import BlogPosts from "./components/BlogPosts";
import BookNotes from "./components/BookNotes";
import ContactButtons from "./components/ContactButtons";
import DailyRoutine from "./components/DailyRoutine";
import { DeferredWeightlifting } from "./components/DeferredWeightlifting";
import PersonalManual from "./components/PersonalManual";
import Projects from "./components/Projects";
import Quotes from "./components/Quotes";
import Talks from "./components/Talks";
import StacksHome from "./components/stacks/StacksHome";
import { type StacksData } from "./components/stacks/data";
import {
  WARM_GRACE_MAX_MS,
  WARM_GRACE_MIN_MS,
  WARM_GRACE_SLACK,
  WARM_KEY,
  WARM_TTL_MS,
} from "./components/stacks/loading";

export const revalidate = 86400;

// The immersive homepage intentionally paints beneath iOS Safari's browser
// chrome and accounts for the safe areas in its own fixed UI. Keep this local
// to the route: the document-style subpages should retain the platform's
// normal inset viewport.
export const viewport: Viewport = {
  colorScheme: "light dark",
  viewportFit: "cover",
};

// The three projects that get framed screenshots in the 3D Projects unit.
// liars-dice replaced fantasy in v4 — the fantasy image is a GitHub file
// listing, illegible at frame scale (audit §3-Projects).
const SCENE_PROJECT_IMAGES = [
  "homework.jpg",
  "weightlifting.jpg",
  "liars-dice.png",
];

// Scene-only still overrides for the Talks frames (JSON data untouched):
// frame 2's source thumbnail is a photo of a projected slide — a document,
// not a moment (audit §2.4). The Consensus pro shot replaces it on the
// shelf; the placard/modal keep the talk's own thumbnail.
const SCENE_TALK_STILLS: Record<number, string> = {
  1: "/images/stacks/talk-consensus.jpg",
};

// Probes exactly what StacksHome's own effect probes, so the two can never
// disagree about whether the world is viable. Save-Data is honoured here and
// nowhere else: a visitor who has asked their browser to conserve should get
// the document, not a megabyte of room. Costs about a millisecond, and the
// answer is cached for the tab so repeat navigations skip the context
// creation entirely.
//
// Second decision, second store. The viability probe is per-tab because it
// answers "can this browser run it". The WARM record is per-profile because
// it answers "is the chunk already on this disk" — and the HTTP cache that
// makes a reload fast is shared across tabs. Warm only changes how the wait
// is PRESENTED (see globals.css); it never overrides reduced-motion or
// Save-Data, both of which are settled before it is read.
//
// The timeout is the safety net for the case this whole mechanism creates: if
// the JS bundle never boots, the flat page is hidden behind a loading screen
// that nothing will ever retire. Twenty seconds and the document comes back —
// from either phase.
const WORLD_BOOT_SCRIPT = `
try {
  var el = document.documentElement;
  if (window.__stacksWorldBootTimer) {
    clearTimeout(window.__stacksWorldBootTimer);
    window.__stacksWorldBootTimer = 0;
  }
  var bootToken = (window.__stacksWorldBootToken || 0) + 1;
  window.__stacksWorldBootToken = bootToken;

  // Cache only the stable capability probe. Motion preference and Save-Data
  // are live visitor choices and must be evaluated on every document load.
  var ok = sessionStorage.getItem("stacks-webgl-v1");
  if (ok === null) {
    ok = "0";
    var c = document.createElement("canvas");
    if (c.getContext("webgl2") || c.getContext("webgl")) ok = "1";
    sessionStorage.setItem("stacks-webgl-v1", ok);
  }
  var motionOK = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dataOK = !(navigator.connection && navigator.connection.saveData);
  if (ok === "1" && motionOK && dataOK) {
    var warm = null;
    try {
      var rec = JSON.parse(localStorage.getItem(${JSON.stringify(WARM_KEY)}) || "null");
      var age = rec ? Date.now() - rec.t : Infinity;
      if (age >= 0 && age < ${WARM_TTL_MS}) warm = rec.d;
    } catch (_) {}
    if (warm !== null) {
      el.style.setProperty("--stacks-warm-grace", Math.min(${WARM_GRACE_MAX_MS},
        Math.max(${WARM_GRACE_MIN_MS}, (warm || 0) * ${WARM_GRACE_SLACK})) + "ms");
    }
    el.dataset.world = warm === null ? "pending" : "warm";
    window.__stacksWorldBootTimer = setTimeout(function () {
      if (window.__stacksWorldBootToken !== bootToken) return;
      window.__stacksWorldBootTimer = 0;
      var w = el.dataset.world;
      if (w === "pending" || w === "warm") delete el.dataset.world;
    }, 20000);
  } else {
    delete el.dataset.world;
  }
} catch (_) {}
`;

export default async function HomePage() {
  const [allBooks, activity, liftingStats] = await Promise.all([
    getDefaultBooks(),
    getCachedActivityMosaic(12),
    getCachedWeightliftingStats(),
  ]);
  const bookStats = computeHomepageBookStats(allBooks);
  const bookCovers = allBooks.slice(0, 60).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
  }));
  // The About shelf is a small, live reading stack. Unfinished rows share a
  // synthetic finish date in the library query, so sort current reads by their
  // real started date here, then backfill from recent covered books so a quiet
  // reading spell does not leave an unexplained hole in the scene.
  const currentReads = allBooks
    .filter((book) => book.started && !book.finished && book.coverUrl)
    .sort((a, b) => (b.started ?? "").localeCompare(a.started ?? ""))
    .slice(0, 1);
  const currentReadIds = new Set(currentReads.map((book) => book.id));
  const readingBooks = [
    ...currentReads,
    ...allBooks.filter((book) => book.coverUrl && !currentReadIds.has(book.id)),
  ].slice(0, 1);

  // Chappy's "Featured?" ticks, in the collection's own finished-desc order.
  // A featured book with no cover would render as a blank slab, so it is held
  // to the same bar as any other shelf cover.
  const featuredBooks = allBooks.filter(
    (book) => book.isFeatured && book.coverUrl,
  );
  // Perimeter sampling is server-side and time-boxed, so the client never
  // reads image pixels (or inherits remote-cover CORS hazards). Both the
  // current book and every featured book receive their own physical board
  // color; a stable id color is only the cold-fetch fallback.
  const [readingBookColors, featuredBookColors] = await Promise.all([
    readingBookEdgeColors(readingBooks),
    readingBookEdgeColors(featuredBooks),
  ]);
  // Featured books lead `shelfBooks` so they are guaranteed a slot in the 16
  // the scene knows about: `onOpenBook` resolves clicks out of this array and
  // `Scene` warms only these covers. Without the union, a featured cover could
  // fall past the cut and become an unclickable, late-decoding slab.
  const featuredIds = new Set(featuredBooks.map((book) => book.id));
  const readingIds = new Set(readingBooks.map((book) => book.id));
  const shelfBooks = [
    ...featuredBooks,
    ...readingBooks.filter((book) => !featuredIds.has(book.id)),
    ...allBooks.filter(
      (book) =>
        book.coverUrl && !featuredIds.has(book.id) && !readingIds.has(book.id),
    ),
  ].slice(0, 16);

  const data: StacksData = {
    covers: bookCovers,
    shelfBooks,
    featuredBooks,
    featuredBookColors,
    readingBooks,
    readingBookColors,
    bookStats,
    talks: speakingData.talks.map((talk, i) => ({
      videoId: talk.videoId,
      title: talk.title,
      venue: talk.venue,
      url: talk.url,
      still: SCENE_TALK_STILLS[i] ?? talk.thumbnail,
    })),
    projects: SCENE_PROJECT_IMAGES.flatMap((image) => {
      const project = projectsData.projects.find((p) => p.image === image);
      return project
        ? [
            {
              name: project.name,
              link: project.link,
              image: `/images/projects/${image}`,
            },
          ]
        : [];
    }),
    // Six, because NotebookLean stands six spines on the Musings shelf and
    // maps a click key to each. At three, half the row was blank slabs that
    // fell through to a generic "open the blog" link — the one unit whose
    // whole subject is his writing was showing none of it.
    blogPosts: blogData.items.slice(0, 6).map((post) => ({
      title: post.title,
      link: post.link,
      pubDate: post.pubDate,
    })),
  };

  const slots = {
    about: <AboutMe />,
    aboutIntro: <AboutIntro />,
    contact: <ContactButtons />,
    books: <BookNotes books={bookCovers} stats={bookStats} />,
    training: (
      <DeferredWeightlifting activity={activity} stats={liftingStats} />
    ),
    manual: <PersonalManual />,
    routine: <DailyRoutine />,
    talks: <Talks />,
    blog: <BlogPosts />,
    projects: <Projects />,
    quotes: <Quotes />,
  };

  return (
    <>
      {/* Runs during HTML parse, ahead of the flat document below it, so the
          decision is made BEFORE the first paint. React can't do this: it
          renders flat on the server and on the first client render (on
          purpose — anything else is a hydration mismatch), so by the time an
          effect could switch modes the vertical homepage is already on
          screen and being read. The attribute is all this script owns; CSS in
          globals.css does the rest, and React takes the attribute over from
          `pending` the moment it is alive. */}
      <script dangerouslySetInnerHTML={{ __html: WORLD_BOOT_SCRIPT }} />
      <StacksHome data={data} slots={slots} />
    </>
  );
}

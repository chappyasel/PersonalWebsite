import { type Metadata, type Viewport } from "next";
import blogData from "public/data/blog-posts.json";
import projectsData from "public/data/projects.json";
import speakingData from "public/data/speaking.json";
import React from "react";

import { readingBookEdgeColors } from "~/lib/books/coverEdgeColor.server";
import { buildHomepageBookPlacard } from "~/lib/books/homepagePlacard";
import { getDefaultBooks } from "~/server/queries/books";
import {
  getCachedActivityMosaic,
  getCachedWeightliftingPlacard,
} from "~/server/queries/weightlifting";

import AboutMe, { AboutIntro } from "./components/About";
import BlogPosts from "./components/BlogPosts";
import BookNotes from "./components/BookNotes";
import ContactButtons from "./components/ContactButtons";
import PersonalSystems from "./components/PersonalSystems";
import Projects from "./components/Projects";
import Quotes from "./components/Quotes";
import Talks from "./components/Talks";
import Weightlifting from "./components/Weightlifting";
import StacksHome from "./components/stacks/StacksHome";
import { type StacksData } from "./components/stacks/data";
import BootScreen from "./components/stacks/dom/BootScreen";
import { WARM_KEY, WARM_TTL_MS } from "./components/stacks/loading";
import { WEBGL_CAPABILITY_KEY } from "./components/stacks/webglProbe";

import { homepageMetadata } from "./homeMetadata";

export const revalidate = 86400;
export const metadata: Metadata = homepageMetadata;

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
  "weightlifting.jpg",
  "liars-dice.png",
  "homework.jpg",
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
// makes a reload fast is shared across tabs. Warm only shortens the final
// handoff into the cached room; it never hides the boot vignette or overrides
// reduced-motion / Save-Data, both of which are settled before it is read.
//
// The timeout is the safety net for the case this whole mechanism creates: if
// the JS bundle never boots, the flat page is hidden behind a loading screen
// that nothing will ever retire. Twenty seconds and the document comes back —
// from either phase.
const WORLD_BOOT_SCRIPT = `
try {
  var el = document.documentElement;
  // The automated OG renderer asks for the same live scene with its DOM
  // controls removed. Set this during parsing so not even the first paint can
  // leak homepage chrome into the capture.
  if (new URLSearchParams(location.search).has("og-capture")) {
    el.dataset.ogCapture = "";
  }
  if (window.__stacksWorldBootTimer) {
    clearTimeout(window.__stacksWorldBootTimer);
    window.__stacksWorldBootTimer = 0;
  }
  var bootToken = (window.__stacksWorldBootToken || 0) + 1;
  window.__stacksWorldBootToken = bootToken;

  // Cache only the stable capability probe. Motion preference and Save-Data
  // are live visitor choices and must be evaluated on every document load.
  var ok = sessionStorage.getItem(${JSON.stringify(WEBGL_CAPABILITY_KEY)});
  if (ok === null) {
    ok = "0";
    var c = document.createElement("canvas");
    if (c.getContext("webgl2") || c.getContext("webgl")) ok = "1";
    sessionStorage.setItem(${JSON.stringify(WEBGL_CAPABILITY_KEY)}, ok);
  }
  var motionOK = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dataOK = !(navigator.connection && navigator.connection.saveData);
  if (ok === "1" && motionOK && dataOK) {
    var warm = false;
    try {
      var rec = JSON.parse(localStorage.getItem(${JSON.stringify(WARM_KEY)}) || "null");
      var age = rec ? Date.now() - rec.t : Infinity;
      if (age >= 0 && age < ${WARM_TTL_MS}) warm = true;
    } catch (_) {}
    el.dataset.world = warm ? "warm" : "pending";
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

export default function HomePage() {
  return (
    <>
      {/* This synchronous shell is flushed before the data-backed homepage
          suspends, so the capability decision and the bookcase both exist on
          the first eligible paint instead of leaving the layout background
          alone while books and training data resolve. */}
      <script dangerouslySetInnerHTML={{ __html: WORLD_BOOT_SCRIPT }} />
      <BootScreen />
      <React.Suspense fallback={null}>
        <HomePageContent />
      </React.Suspense>
    </>
  );
}

async function HomePageContent() {
  const [allBooks, activity, liftingPlacard] = await Promise.all([
    getDefaultBooks(),
    getCachedActivityMosaic(12),
    getCachedWeightliftingPlacard(),
  ]);
  const bookPlacard = buildHomepageBookPlacard(allBooks);
  const bookStats = bookPlacard.stats;
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
    .slice(0, 3);
  const currentReadIds = new Set(currentReads.map((book) => book.id));
  const readingBooks = [
    ...currentReads,
    ...allBooks.filter((book) => book.coverUrl && !currentReadIds.has(book.id)),
  ].slice(0, 3);

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
    bookPlacard,
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
    training: <Weightlifting activity={activity} data={liftingPlacard} />,
    systems: <PersonalSystems />,
    talks: <Talks />,
    blog: <BlogPosts />,
    projects: <Projects />,
    quotes: <Quotes />,
  };

  return <StacksHome data={data} slots={slots} />;
}

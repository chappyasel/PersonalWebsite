import blogData from "public/data/blog-posts.json";
import projectsData from "public/data/projects.json";
import speakingData from "public/data/speaking.json";
import React from "react";

import { computeHomepageBookStats } from "~/lib/books/homepage";
import { getDefaultBooks } from "~/server/queries/books";
import {
  getCachedActivityMosaic,
  getCachedWeightliftingStats,
} from "~/server/queries/weightlifting";

import AboutMe, { AboutIntro } from "./components/About";
import ContactButtons from "./components/ContactButtons";
import BlogPosts from "./components/BlogPosts";
import BookNotes from "./components/BookNotes";
import DailyRoutine from "./components/DailyRoutine";
import { DeferredWeightlifting } from "./components/DeferredWeightlifting";
import PersonalManual from "./components/PersonalManual";
import Projects from "./components/Projects";
import Quotes from "./components/Quotes";
import Talks from "./components/Talks";
import { type StacksData } from "./components/stacks/data";
import StacksHome from "./components/stacks/StacksHome";

export const revalidate = 86400;

// The three projects that get framed screenshots in the 3D Projects unit.
// liars-dice replaced fantasy in v4 — the fantasy image is a GitHub file
// listing, illegible at frame scale (audit §3-Projects).
const SCENE_PROJECT_IMAGES = ["homework.jpg", "weightlifting.jpg", "liars-dice.png"];

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
// The timeout is the safety net for the case this whole mechanism creates: if
// the JS bundle never boots, the flat page is hidden behind a loading screen
// that nothing will ever retire. Twenty seconds and the document comes back.
const WORLD_BOOT_SCRIPT = `
try {
  var ok = sessionStorage.getItem("stacks-world");
  if (ok === null) {
    ok = "0";
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches &&
        !(navigator.connection && navigator.connection.saveData)) {
      var c = document.createElement("canvas");
      if (c.getContext("webgl2") || c.getContext("webgl")) ok = "1";
    }
    sessionStorage.setItem("stacks-world", ok);
  }
  if (ok === "1") {
    document.documentElement.dataset.world = "pending";
    setTimeout(function () {
      if (document.documentElement.dataset.world === "pending")
        delete document.documentElement.dataset.world;
    }, 20000);
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
  const readingBook = allBooks.find((book) => book.started && !book.finished);

  const data: StacksData = {
    covers: bookCovers,
    shelfBooks: allBooks.filter((book) => book.coverUrl).slice(0, 16),
    bookStats,
    reading: readingBook
      ? { title: readingBook.title, coverUrl: readingBook.coverUrl }
      : null,
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
        ? [{ name: project.name, link: project.link, image: `/images/projects/${image}` }]
        : [];
    }),
    blogPosts: blogData.items.slice(0, 3).map((post) => ({
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
    training: <DeferredWeightlifting activity={activity} stats={liftingStats} />,
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

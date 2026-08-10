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

  return <StacksHome data={data} slots={slots} />;
}

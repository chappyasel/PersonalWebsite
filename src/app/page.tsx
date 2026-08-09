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
const SCENE_PROJECT_IMAGES = ["homework.jpg", "weightlifting.jpg", "fantasy.jpg"];

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
  const lastLiftDay = activity.days.at(-1);

  const data: StacksData = {
    covers: bookCovers,
    shelfBooks: allBooks.filter((book) => book.coverUrl).slice(0, 16),
    bookStats,
    reading: readingBook
      ? { title: readingBook.title, coverUrl: readingBook.coverUrl }
      : null,
    lastLift: lastLiftDay
      ? { date: lastLiftDay.date, volume: lastLiftDay.volume }
      : null,
    totalWorkouts: liftingStats.totalWorkouts,
    totalVolume: liftingStats.totalVolume,
    talks: speakingData.talks.map((talk) => ({
      videoId: talk.videoId,
      title: talk.title,
      venue: talk.venue,
      url: talk.url,
      still: talk.thumbnail,
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

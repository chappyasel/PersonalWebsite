import AboutMe from "../About";
import BlogPosts from "../BlogPosts";
import BookNotes from "../BookNotes";
import PersonalSystems from "../PersonalSystems";
import Projects from "../Projects";
import Talks from "../Talks";
import Weightlifting from "../Weightlifting";
import type { UnitSlug } from "../stacks/data";
import type { ReactNode } from "react";
import "server-only";

import { buildHomepageBookPlacard } from "~/lib/books/homepagePlacard";
import type { SitePageCards } from "~/lib/site/pageCardData";
import { getDefaultBooks } from "~/server/queries/books";
import { orEmpty } from "~/server/queries/degrade";
import { getGitHubActivity } from "~/server/queries/github";
import {
  EMPTY_WEIGHTLIFTING_PLACARD,
  emptyActivityMosaic,
  getCachedActivityMosaic,
  getCachedWeightliftingPlacard,
} from "~/server/queries/weightlifting";

export type PrototypeBooks = Readonly<
  Awaited<ReturnType<typeof getDefaultBooks>>
>;

export type PrototypeContent = {
  slots: Record<UnitSlug, ReactNode>;
  cards: SitePageCards;
};

/** Server-page helper for the development-only illustrated room prototype. */
export async function getPrototypeContent(
  allBooks?: PrototypeBooks,
): Promise<PrototypeContent> {
  const [loadedBooks, activity, liftingPlacard, github] = await Promise.all([
    allBooks ?? orEmpty("illustrated-room:books", getDefaultBooks, []),
    orEmpty(
      "illustrated-room:activity",
      () => getCachedActivityMosaic(12),
      emptyActivityMosaic(12),
    ),
    orEmpty(
      "illustrated-room:lifting",
      getCachedWeightliftingPlacard,
      EMPTY_WEIGHTLIFTING_PLACARD,
    ),
    orEmpty("illustrated-room:github", getGitHubActivity, null),
  ]);

  // Preserve HomePage's filtering, ordering, cover links and statistics.
  const books = loadedBooks.filter((book) => !book.abandoned);
  const bookPlacard = buildHomepageBookPlacard(books);
  const bookCovers = books.slice(0, 60).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
  }));

  return {
    slots: {
      about: <AboutMe />,
      books: <BookNotes books={bookCovers} stats={bookPlacard.stats} />,
      training: <Weightlifting activity={activity} data={liftingPlacard} />,
      systems: <PersonalSystems />,
      projects: <Projects github={github} />,
      blog: <BlogPosts />,
      talks: <Talks />,
    },
    cards: {
      books: { stats: bookPlacard.stats, yearly: bookPlacard.yearly },
      weightlifting: null,
    },
  };
}

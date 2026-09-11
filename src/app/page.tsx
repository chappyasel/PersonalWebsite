import { type Metadata, type Viewport } from "next";
import blogData from "public/data/blog-posts.json";
import speakingData from "public/data/speaking.json";
import React from "react";

import { readingBookEdgeColors } from "~/lib/books/coverEdgeColor.server";
import { buildHomepageBookPlacard } from "~/lib/books/homepagePlacard";
import { getDefaultBooks } from "~/server/queries/books";
import { orEmpty } from "~/server/queries/degrade";
import { getGitHubActivity } from "~/server/queries/github";
import {
  EMPTY_WEIGHTLIFTING_PLACARD,
  emptyActivityMosaic,
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
import BooksBootPrototype from "./components/route-transition-prototype/BooksBootPrototype";
import StacksHome from "./components/stacks/StacksHome";
import { worldBootPrepaintScript } from "./components/stacks/boot/worldBootPrepaint";
import { type StacksData } from "./components/stacks/data";
import BootScreen, {
  BootReadingBooksBridge,
} from "./components/stacks/dom/BootScreen";
import { proxiedBookCover } from "./components/stacks/scene/bookCoverTexture";
import { featuredBookThickness } from "./components/stacks/scene/units/featuredBookGeometry";
import { SitePageCardsProvider } from "~/components/site/SitePageCards";

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

// Scene-only still overrides for the Talks frames (JSON data untouched):
// frame 2's source thumbnail is a photo of a projected slide — a document,
// not a moment (audit §2.4). The Consensus pro shot replaces it on the
// shelf; the placard/modal keep the talk's own thumbnail.
const SCENE_TALK_STILLS: Record<number, string> = {
  1: "/images/stacks/talk-consensus.jpg",
};

type HomepageBooks = Awaited<ReturnType<typeof getDefaultBooks>>;
type HomepageReadingBooks = ReturnType<typeof selectHomepageReadingBooks>;
type HomepageReadingColors = Awaited<ReturnType<typeof readingBookEdgeColors>>;

/** Unfinished rows share a synthetic finish date in the library query. Sort
 * current reads by their real start date, then backfill from recent covered
 * books so the loading and live shelves always receive the same trio. */
function selectHomepageReadingBooks(allBooks: HomepageBooks) {
  const currentReads = allBooks
    .filter((book) => book.started && !book.finished && book.coverUrl)
    .sort((a, b) => (b.started ?? "").localeCompare(a.started ?? ""))
    .slice(0, 3);
  const currentReadIds = new Set(currentReads.map((book) => book.id));
  return [
    ...currentReads,
    ...allBooks.filter((book) => book.coverUrl && !currentReadIds.has(book.id)),
  ].slice(0, 3);
}

function toBootReadingBooks(readingBooks: HomepageReadingBooks) {
  return readingBooks.map(({ id, coverUrl, pageCount, audioLengthMin }) => ({
    id,
    coverSrc: coverUrl ? proxiedBookCover(coverUrl, 256) : null,
    thickness: 1.1 * featuredBookThickness(pageCount, audioLengthMin),
  }));
}

export default async function HomePage() {
  // Abandoned books are hidden by default site-wide: no homepage surface
  // (boot trio, shelf, cover wall, placard) should ever show one.
  const allBooks = (await orEmpty("home:books", getDefaultBooks, [])).filter(
    (book) => !book.abandoned,
  );
  const readingBooks = selectHomepageReadingBooks(allBooks);
  // Sampling is server-side and time-boxed, avoiding remote-cover CORS work in
  // the client while giving the first SVG the same jacket colors as WebGL.
  const readingBookColors = await readingBookEdgeColors(readingBooks);
  const bootReadingBooks = toBootReadingBooks(readingBooks);
  return (
    <>
      {/* Book identity is part of the vignette, not late decoration. Resolve
          the cached book selection before this shell so its first SVG already
          contains the real jackets; the heavier activity data still streams. */}
      <script dangerouslySetInnerHTML={{ __html: worldBootPrepaintScript() }} />
      {process.env.NODE_ENV !== "production" ? (
        <BooksBootPrototype
          featuredBooks={allBooks
            .filter((book) => book.isFeatured && book.coverUrl)
            .map(
              ({ id, title, author, coverUrl, pageCount, audioLengthMin }) => ({
                id,
                title,
                author,
                coverUrl,
                pageCount,
                audioLengthMin,
              }),
            )}
          spineBooks={allBooks
            .filter(
              (book) => book.finished && !(book.isFeatured && book.coverUrl),
            )
            .slice(0, 64)
            .map(
              ({ id, title, author, coverUrl, pageCount, audioLengthMin }) => ({
                id,
                title,
                author,
                coverUrl,
                pageCount,
                audioLengthMin,
              }),
            )}
        />
      ) : null}
      <BootScreen
        readingBooks={bootReadingBooks}
        readingBookColors={readingBookColors}
      />
      <React.Suspense fallback={null}>
        <HomePageContent
          allBooks={allBooks}
          readingBooks={readingBooks}
          readingBookColors={readingBookColors}
        />
      </React.Suspense>
    </>
  );
}

/**
 * Everything the homepage reads from the database is decoration: covers on a
 * shelf, counts on a placard. A dead query should cost the scene those, not
 * the whole document. Each loader degrades on its own so one failure cannot
 * take the other two down with it, and the world still boots.
 */
async function HomePageContent({
  allBooks,
  readingBooks,
  readingBookColors,
}: {
  allBooks: HomepageBooks;
  readingBooks: HomepageReadingBooks;
  readingBookColors: HomepageReadingColors;
}) {
  // Chappy's "Featured?" ticks, in the collection's own finished-desc order.
  // A featured book without a cover cannot occupy a cover-out shelf slot.
  const featuredBooks = allBooks.filter(
    (book) => book.isFeatured && book.coverUrl,
  );
  const featuredIds = new Set(featuredBooks.map((book) => book.id));
  const packedBooks = allBooks
    .filter((book) => book.finished && !featuredIds.has(book.id))
    .slice(0, 64);
  const [
    activity,
    liftingPlacard,
    featuredBookColors,
    spineBookColors,
    github,
  ] = await Promise.all([
    orEmpty(
      "home:activity",
      () => getCachedActivityMosaic(12),
      emptyActivityMosaic(12),
    ),
    orEmpty(
      "home:lifting",
      getCachedWeightliftingPlacard,
      EMPTY_WEIGHTLIFTING_PLACARD,
    ),
    readingBookEdgeColors(featuredBooks),
    readingBookEdgeColors(packedBooks),
    // Live when GITHUB_TOKEN is set, the committed snapshot otherwise; the
    // Projects placard drops its GitHub cards if neither can be read.
    orEmpty("home:github", getGitHubActivity, null),
  ]);
  const bookPlacard = buildHomepageBookPlacard(allBooks);
  const bookStats = bookPlacard.stats;
  const bookCovers = allBooks.slice(0, 60).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
  }));
  // Featured books lead `shelfBooks` so they are guaranteed a slot in the 16
  // the scene knows about: `onOpenBook` resolves clicks out of this array and
  // `Scene` warms only these covers. Without the union, a featured cover could
  // fall past the cut and become an unclickable, late-decoding slab.
  const readingIds = new Set(readingBooks.map((book) => book.id));
  const shelfBooks = [
    ...featuredBooks,
    ...readingBooks.filter((book) => !featuredIds.has(book.id)),
    ...allBooks.filter(
      (book) =>
        book.coverUrl && !featuredIds.has(book.id) && !readingIds.has(book.id),
    ),
  ].slice(0, 16);

  // The packed rows are the rest of the library, physically: real finished
  // reads (newest first), minus the featured books already standing cover-out
  // in front of them. Slim on purpose — a spine renders no cover, so this
  // must not grow the image-warming set or ship full Book serializations.
  // 64 comfortably overfills the two rows' measured spine capacity (~48).
  const spineBooks = packedBooks.map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    pageCount: book.pageCount,
    audioLengthMin: book.audioLengthMin,
    edgeColor: spineBookColors[book.id]?.edge ?? null,
  }));

  const data: StacksData = {
    covers: bookCovers,
    shelfBooks,
    spineBooks,
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
    // The Projects unit stopped framing placard screenshots when it got its
    // Project Icons (docs/projects-shelf-spec.md); the scene only ever used
    // this list to warm those textures, so there is nothing left to warm.
    projects: [],
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
    projects: <Projects github={github} />,
    quotes: <Quotes />,
  };

  return (
    <>
      <BootReadingBooksBridge
        readingBooks={toBootReadingBooks(readingBooks)}
        readingBookColors={readingBookColors}
      />
      {/* The book modal's breadcrumb hovers the library's stats card, the
          same figures the Book Notes placard shows; no second query. */}
      <SitePageCardsProvider
        cards={{
          books: { stats: bookPlacard.stats, yearly: bookPlacard.yearly },
          weightlifting: null,
        }}
      >
        <StacksHome data={data} slots={slots} />
      </SitePageCardsProvider>
    </>
  );
}

import { and, desc, isNotNull, isNull } from "drizzle-orm";
import "server-only";

import blog from "~~/data/blog-posts.json";
import { getRootOrigin } from "~/lib/site/origin";
import { db } from "~/server/db";
import { books } from "~/server/db/schema";
import { orEmpty } from "~/server/queries/degrade";
import { getCachedLatestWorkout } from "~/server/queries/latestWorkout";

const BOOKS_ORIGIN = "https://books.chappyasel.com";

export type AppWidgetBook = {
  title: string;
  author: string;
  coverUrl: string | null;
  coverColor: string | null;
  started: string;
  url: string;
};

export type AppWidgetWorkout = {
  name: string;
  date: string;
  setCount: number;
  volume: number;
  url: string;
};

export type AppWidgetMusing = {
  title: string;
  date: string;
  url: string;
};

/**
 * What the iOS app's Home Screen widgets show. One small public payload, so a
 * widget refresh costs one request. Each part degrades to empty on its own,
 * since a widget can stand without any one of them.
 */
export type AppWidgetData = {
  reading: AppWidgetBook[];
  latestWorkout: AppWidgetWorkout | null;
  latestMusing: AppWidgetMusing | null;
};

async function getReading(): Promise<AppWidgetBook[]> {
  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      coverColor: books.coverColor,
      started: books.started,
    })
    .from(books)
    .where(
      and(
        isNotNull(books.started),
        isNull(books.finished),
        isNull(books.abandoned),
      ),
    )
    .orderBy(desc(books.started))
    .limit(3);
  return rows.map((row) => ({
    title: row.title,
    author: row.author,
    coverUrl: row.coverUrl,
    coverColor: row.coverColor,
    started: row.started!.toISOString(),
    url: `${BOOKS_ORIGIN}/${row.id}`,
  }));
}

async function getWorkout(): Promise<AppWidgetWorkout | null> {
  const workout = await getCachedLatestWorkout();
  if (!workout) return null;
  return {
    name: workout.name,
    date: workout.date,
    setCount: workout.setCount,
    volume: workout.volume,
    url: `${getRootOrigin()}/weightlifting`,
  };
}

export function latestMusing(
  items: { title: string; pubDate: string; link: string }[],
  origin: string,
): AppWidgetMusing | null {
  const sorted = items
    .map((item) => ({ item, time: Date.parse(item.pubDate.replace(" ", "T")) }))
    .filter(({ time }) => Number.isFinite(time))
    .sort((a, b) => b.time - a.time);
  const top = sorted[0];
  if (!top) return null;
  const { item, time } = top;
  return {
    title: item.title,
    date: new Date(time).toISOString(),
    url: item.link.startsWith("/") ? `${origin}${item.link}` : item.link,
  };
}

export async function getAppWidget(): Promise<AppWidgetData> {
  const [reading, workout] = await Promise.all([
    orEmpty("app-widget-reading", getReading, []),
    orEmpty("app-widget-workout", getWorkout, null),
  ]);
  return {
    reading,
    latestWorkout: workout,
    latestMusing: latestMusing(blog.items, getRootOrigin()),
  };
}

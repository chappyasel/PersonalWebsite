import { type MetadataRoute } from "next";

import { db } from "~/server/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const books = await db.query.books.findMany({
    columns: {
      id: true,
      lastEditedTime: true,
    },
  });

  const bookEntries: MetadataRoute.Sitemap = books.map((book) => ({
    url: `https://books.chappyasel.com/${book.id}`,
    lastModified: book.lastEditedTime,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [
    {
      url: "https://books.chappyasel.com",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...bookEntries,
  ];
}

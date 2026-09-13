import systemsData from "../../public/data/systems.json";
import { type MetadataRoute } from "next";

import { musings } from "~/lib/musings/content";
import { musingUrl } from "~/lib/musings/types";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://www.chappyasel.com/musings",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...musings.map((article) => ({
      url: musingUrl(article.slug),
      lastModified: new Date(article.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: "https://www.chappyasel.com/",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://books.chappyasel.com",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: "https://manual.chappyasel.com",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://routine.chappyasel.com",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://www.chappyasel.com/systems",
      lastModified: new Date(systemsData.lastUpdated),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}

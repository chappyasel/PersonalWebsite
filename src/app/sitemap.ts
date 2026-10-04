import manualData from "../../public/data/manual.json";
import routineData from "../../public/data/routine.json";
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
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://www.chappyasel.com/manual",
      lastModified: new Date(manualData.lastUpdated),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://www.chappyasel.com/routine",
      lastModified: new Date(routineData.lastUpdated),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...["projects", "talks"].map((path) => ({
      url: `https://www.chappyasel.com/${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    {
      url: "https://www.chappyasel.com/systems",
      lastModified: new Date(systemsData.lastUpdated),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}

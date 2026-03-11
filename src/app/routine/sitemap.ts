import { type MetadataRoute } from "next";

import rawData from "../../../public/data/routine.json";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(
    (rawData as { lastUpdated: string }).lastUpdated,
  );

  return [
    {
      url: "https://routine.chappyasel.com",
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}

import rawData from "../../../public/data/manual.json";
import { type MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(
    (rawData as { lastUpdated: string }).lastUpdated,
  );

  return [
    {
      url: "https://www.chappyasel.com/manual",
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}

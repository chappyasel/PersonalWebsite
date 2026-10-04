import { type MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://weightlifting.chappyasel.com/",
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}

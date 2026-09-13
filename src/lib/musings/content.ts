import rawArticles from "../../../content/musings/articles.json";

import type { MusingArticle } from "./types";

export const musings = rawArticles as MusingArticle[];
export const getMusing = (slug: string) =>
  musings.find((article) => article.slug === slug);

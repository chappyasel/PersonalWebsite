import type { HomepageBookPlacard } from "~/lib/books/types";
import type { WeightliftingPlacardData } from "~/server/queries/weightlifting";

/**
 * The slice of each placard that its stats card draws: the headline figures
 * and one count per year. Everything else on the homepage placards (current
 * books, subjects, lift records) stays there.
 */
export type BookStatsCardData = Pick<HomepageBookPlacard, "stats" | "yearly">;
export type WorkoutStatsCardData = Pick<
  WeightliftingPlacardData,
  "stats" | "yearly"
>;

/** What a page hands its hover cards. Null means the source was away when
 * the page rendered; the card falls back to the page's description. */
export type SitePageCards = {
  books: BookStatsCardData | null;
  weightlifting: WorkoutStatsCardData | null;
};

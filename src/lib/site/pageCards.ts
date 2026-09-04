import { buildHomepageBookPlacard } from "~/lib/books/homepagePlacard";
import type { SitePageCards } from "~/lib/site/pageCardData";
import { getDefaultBooks } from "~/server/queries/books";
import { orEmpty } from "~/server/queries/degrade";
import { getCachedWeightliftingPlacard } from "~/server/queries/weightlifting";

/**
 * The same figures the homepage placards show, for the hover cards on links
 * to Weightlifting and Book Notes. Both sources are the cached loaders the
 * homepage uses, so the numbers cannot disagree with it. Either side being
 * away degrades that one card to the page's description; `scope` names the
 * caller in the degrade log.
 */
export async function loadSitePageCards(scope: string): Promise<SitePageCards> {
  const [books, weightlifting] = await Promise.all([
    orEmpty(
      `${scope}:book-card`,
      async () => {
        const placard = buildHomepageBookPlacard(await getDefaultBooks());
        return { stats: placard.stats, yearly: placard.yearly };
      },
      null,
    ),
    orEmpty(
      `${scope}:workout-card`,
      async () => {
        const placard = await getCachedWeightliftingPlacard();
        return { stats: placard.stats, yearly: placard.yearly };
      },
      null,
    ),
  ]);
  return { books, weightlifting };
}

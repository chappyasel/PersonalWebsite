"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { SitePageCards } from "~/lib/site/pageCardData";

const SitePageCardsContext = createContext<SitePageCards | null>(null);

/**
 * Hands a page's stats-card data to every SiteLink beneath it without
 * threading a prop through the Notion renderers. The page (a server
 * component) loads the data and wraps its tree; the links (client
 * components) read it here. Outside a provider a link shows its page's
 * description instead.
 */
export function SitePageCardsProvider({
  cards,
  children,
}: {
  cards: SitePageCards;
  children: ReactNode;
}) {
  return (
    <SitePageCardsContext.Provider value={cards}>
      {children}
    </SitePageCardsContext.Provider>
  );
}

export function useSitePageCards(): SitePageCards | null {
  return useContext(SitePageCardsContext);
}

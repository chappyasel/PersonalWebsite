import { PenNibIcon, RssIcon } from "@phosphor-icons/react/dist/ssr";

import DaylightHeroMeta from "~/components/daylight/HeroMeta";
import SkyHero from "~/components/daylight/SkyHero";

export default function MusingsHero() {
  return (
    <SkyHero>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <PenNibIcon size={28} weight="duotone" className="shrink-0" />
          <h1 className="dl-hero-title">Musings</h1>
        </div>
        <DaylightHeroMeta backHref="/">
          <a
            href="/musings/feed.xml"
            className="flex items-center gap-1.5 transition-colors hover:text-[hsl(var(--dl-sky-ink))]"
          >
            <RssIcon size={12} aria-hidden /> RSS feed
          </a>
        </DaylightHeroMeta>
      </div>
    </SkyHero>
  );
}

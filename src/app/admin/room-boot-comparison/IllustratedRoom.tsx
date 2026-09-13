"use client";

import { UNITS, type UnitSlug } from "../../components/stacks/data";
import { BootScreenArtwork } from "../../components/stacks/dom/BootScreen";
import type { BootReadingBooksSnapshot } from "../../components/stacks/dom/bootReadingBooks";
import { PALETTES } from "../../components/stacks/theme";
import { useTheme } from "next-themes";
import Link from "next/link";
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
} from "react";

import type { SitePageCards } from "~/lib/site/pageCardData";

import { SitePageCardsProvider } from "~/components/site/SitePageCards";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";

import "./comparison.css";
import type { CaptureCase, Summary, Unit } from "./data";
import "./illustrated.css";

type Shelf = Unit | "about";
type Content = Promise<{
  slots: Record<UnitSlug, ReactNode>;
  cards: SitePageCards;
}>;
function ShelfContent({ content, slug }: { content: Content; slug: UnitSlug }) {
  const { slots, cards } = use(content);
  return (
    <SitePageCardsProvider cards={cards}>{slots[slug]}</SitePageCardsProvider>
  );
}
async function decodeArtwork(svg: string) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  await Promise.all(
    [...doc.querySelectorAll("image")].map(async (element) => {
      const image = new Image();
      image.src = element.getAttribute("href") ?? "";
      await image.decode();
    }),
  );
}
const ART_UNITS: Record<UnitSlug, Shelf> = {
  about: "about",
  books: "books",
  training: "weightlifting",
  systems: "systems",
  projects: "projects",
  blog: "musings",
  talks: "talks",
};

/** A usable illustrated room on the existing preview route; no WebGL dependency. */
export function IllustratedRoom({
  summary,
  reading,
  content,
  initialUnit,
  initialCase,
  initialSvg,
}: {
  summary: Summary;
  reading: BootReadingBooksSnapshot;
  content: Content;
  initialUnit: Shelf;
  initialCase: CaptureCase;
  initialSvg: string | null;
}) {
  const [unit, setUnit] = useState<Shelf>(initialUnit);
  const { resolvedTheme, setTheme } = useTheme();
  const appliedInitialTheme = useRef(false);
  const dark = resolvedTheme
    ? resolvedTheme === "dark"
    : initialCase.startsWith("dark");
  const [phone, setPhone] = useState(initialCase.endsWith("phone"));
  const [art, setArt] = useState({
    key: initialSvg ? `${initialUnit}:${initialCase}` : "",
    svg: initialSvg,
  });
  const [open, setOpen] = useState(false);
  const [artError, setArtError] = useState(false);
  const capture: CaptureCase = `${dark ? "dark" : "light"}-${phone ? "phone" : "desktop"}`;
  const current = UNITS.find((entry) => ART_UNITS[entry.slug] === unit)!;
  const artKey = `${unit}:${capture}`;
  const currentArt = art.key === artKey ? art.svg : null;

  useEffect(() => {
    const resize = () => setPhone(window.innerWidth < 600);
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (appliedInitialTheme.current) return;
    appliedInitialTheme.current = true;
    const requested = new URLSearchParams(window.location.search).get("theme");
    if (requested === "light" || requested === "dark") setTheme(requested);
  }, [setTheme]);
  useEffect(() => {
    if (!resolvedTheme) return;
    const url = new URL(window.location.href);
    url.searchParams.set("theme", resolvedTheme);
    window.history.replaceState(null, "", url);
  }, [resolvedTheme]);
  useEffect(() => {
    if (!currentArt) return;
    let disposed = false;
    void decodeArtwork(currentArt).catch(() => {
      if (!disposed) setArtError(true);
    });
    return () => {
      disposed = true;
    };
  }, [currentArt]);

  useEffect(() => {
    setArtError(false);
    if (unit === "about" || art.key === artKey) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      unit,
      case: capture,
      file: "artwork.svg",
    });
    void fetch(`/admin/room-boot-comparison/asset?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Artwork unavailable");
        const svg = await response.text();
        await decodeArtwork(svg);
        if (!controller.signal.aborted) setArt({ key: artKey, svg });
      })
      .catch(() => {
        if (!controller.signal.aborted) setArtError(true);
      });
    return () => controller.abort();
  }, [art.key, artKey, capture, unit]);

  useEffect(() => {
    const restore = () => {
      const requested = new URLSearchParams(window.location.search).get("unit");
      if (requested && Object.values(ART_UNITS).includes(requested as Shelf))
        setUnit(requested as Shelf);
      setOpen(false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  function select(next: Shelf) {
    setUnit(next);
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("unit", next);
    window.history.pushState(null, "", url);
  }

  function followSection(event: MouseEvent) {
    const anchor = (event.target as Element).closest("a[href]");
    if (
      !anchor ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    const rawHref = anchor.getAttribute("href")!;
    if (!rawHref.startsWith("#")) return;
    const href = new URL(rawHref, window.location.href);
    if (href.origin !== window.location.origin || !href.hash) return;
    const target = UNITS.find((entry) =>
      [entry.slug, entry.urlSlug].includes(href.hash.slice(1)),
    );
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    select(ART_UNITS[target.slug]);
  }

  const palette = dark ? PALETTES.dark : PALETTES.light;
  const style = {
    "--background": dark ? "24 10% 6%" : "60 9% 98%",
    "--foreground": dark ? "24 6% 83%" : "25 7% 24%",
    "--room-drawing-width": `${unit === "about" ? 560 : summary[unit][capture].drawingWidth}px`,
    ...Object.fromEntries(
      ["light", "dark"].flatMap((theme) =>
        Object.entries({
          sky: palette.skyHorizon,
          haze: palette.skyShadow,
          meadow: palette.meadowTipA,
          glow: palette.skyEmber,
          wood: palette.wood,
        }).map(([key, value]) => [`--stacks-boot-${key}-${theme}`, value]),
      ),
    ),
  } as CSSProperties;

  return (
    <main
      className={`room-preview illustrated-room ${dark ? "dark" : ""}`}
      style={style}
      data-unit={unit}
      data-case={capture}
      data-room-mode="illustrated"
    >
      <nav className="illustrated-nav" aria-label="Explore the shelves">
        {UNITS.map((entry) => (
          <Button
            key={entry.slug}
            size="sm"
            variant={ART_UNITS[entry.slug] === unit ? "default" : "ghost"}
            aria-current={ART_UNITS[entry.slug] === unit ? "page" : undefined}
            onClick={() => select(ART_UNITS[entry.slug])}
          >
            {entry.railLabel ??
              (entry.slug === "books" ? "Books" : entry.label)}
          </Button>
        ))}
      </nav>
      <div className="room-viewport" aria-label={`${current.label} shelf`}>
        {unit === "about" ? (
          <div className="room-reference">
            <BootScreenArtwork
              readingBooks={reading.books}
              readingBookColors={reading.colors}
            />
          </div>
        ) : (
          <div className="stacks-boot">
            <div className="room-threshold">
              {currentArt && !artError ? (
                <div
                  className="room-drawing"
                  dangerouslySetInnerHTML={{ __html: currentArt }}
                />
              ) : (
                <p className="room-pending" role="status">
                  {artError
                    ? "The illustration is unavailable. You can still explore below."
                    : "Opening the shelf…"}
                </p>
              )}
              <p className="stacks-boot-wordmark">Chappy Asel</p>
            </div>
          </div>
        )}
      </div>
      <div className="illustrated-actions">
        <p className="illustrated-section-label" aria-live="polite">
          {current.label}
        </p>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="lg">
              Explore {current.label}
            </Button>
          </SheetTrigger>
          <SheetContent
            side={phone ? "bottom" : "right"}
            className={`illustrated-content ${phone ? "h-[90dvh] rounded-t-3xl" : "w-[min(740px,90vw)] sm:max-w-[740px]"}`}
            onClickCapture={followSection}
          >
            <SheetTitle className="sr-only">{current.label}</SheetTitle>
            <SheetDescription className="sr-only">
              Read and explore {current.label.toLowerCase()}.
            </SheetDescription>
            <div
              id={current.urlSlug ?? current.slug}
              className="illustrated-content-body"
            >
              <Suspense
                fallback={
                  <p role="status">Opening {current.label.toLowerCase()}…</p>
                }
              >
                <ShelfContent content={content} slug={current.slug} />
              </Suspense>
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <div className="illustrated-tools" aria-label="Prototype controls">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setTheme(dark ? "light" : "dark")}
        >
          {dark ? "Light" : "Dark"}
        </Button>
        <span>Illustrated room · Prototype</span>
        <Button size="sm" variant="ghost" asChild>
          <Link href="/admin/room-boot-comparison">Artwork preview</Link>
        </Button>
      </div>
    </main>
  );
}

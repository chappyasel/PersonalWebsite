"use client";

// Compare page transitions, including the Books shelf's 3D/2D/library handoff.
// Enabled locally; production never mounts this comparison.
import { projectSceneInteractionRect } from "../stacks/scene/interactionRegistry";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Button } from "~/components/ui/button";

import {
  BooksShelfPrototype,
  type BooksShelfPrototypeHandle,
} from "./BooksShelfPrototype";
import { PROTOTYPE_NAVIGATION_EVENT, prototypeDestination } from "./navigation";
import {
  type OriginRect,
  originZoomGeometry,
  playOriginPanel,
} from "./originZoom";
import "./prototype.css";
import { playShutters } from "./shutters";
import {
  VARIANTS,
  setPrototypeEnabled,
  useRouteTransitionPrototype,
} from "./store";

const LABELS = {
  origin: "Zoom from source",
  shutters: "A · Signature shutters",
  swipe: "B · Screen swipe",
  cards: "C · Perspective cards",
  bookshelf: "D · Books shelf",
};
const DESTINATIONS = [
  ["/", "Home"],
  ["/books", "Books"],
  ["/weightlifting", "Workouts"],
] as const;
const section = (path: string) => path.split("/")[1] ?? "";

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

// Full-site portals stay on the main local origin for the handoff. Document
// sheet launchers and expand controls keep their existing modal transitions.
function localDestination(link: HTMLElement): URL | null {
  if (link.dataset.routeTransition === "preserve") return null;
  const href = link.getAttribute("href") ?? link.dataset.placardHref;
  if (!href || link.hasAttribute("download")) return null;
  const original = new URL(href, location.href);
  const url = prototypeDestination(href, location.href);
  if (!url) return null;
  const target = link.getAttribute("target") ?? link.dataset.placardTarget;
  // Only the known local portal mapping overrides a link's authored new-tab
  // target. Ordinary same-origin new-tab links remain ordinary new-tab links.
  if (target && target !== "_self" && original.href === url.href) return null;
  return url;
}

export default function RouteTransitionPrototype() {
  const router = useRouter();
  const pathname = usePathname();
  const variant = useRouteTransitionPrototype((state) => state.variant);
  const [phase, setPhase] = useState("idle");
  const [target, setTarget] = useState("");
  const [slow, setSlow] = useState(false);
  const [supported, setSupported] = useState(false);
  const [notice, setNotice] = useState("");
  const curtains = useRef<HTMLDivElement>(null);
  const originPanel = useRef<HTMLDivElement>(null);
  const pending = useRef<{ path: string; resolve: () => void } | null>(null);
  const active = useRef<AbortController | null>(null);
  const nativeTransition = useRef<ViewTransition | null>(null);
  const booksShelf = useRef<BooksShelfPrototypeHandle>(null);
  const busy = phase !== "idle";

  useEffect(() => {
    setSupported(typeof document.startViewTransition === "function");
    for (const [path] of DESTINATIONS) router.prefetch(path);
    return () => {
      active.current?.abort();
      pending.current?.resolve();
      nativeTransition.current?.skipTransition();
      useRouteTransitionPrototype.setState({ deferSceneStartup: false });
      document.documentElement.style.removeProperty("--route-origin-zoom");
      document.documentElement.style.removeProperty("--route-origin-clip");
      delete document.documentElement.dataset.routePrototype;
      delete document.documentElement.dataset.routeDirection;
      document.documentElement.style.removeProperty(
        "--route-prototype-duration",
      );
    };
  }, [router]);

  useLayoutEffect(() => {
    if (pending.current?.path === pathname) {
      pending.current.resolve();
      pending.current = null;
    }
  }, [pathname]);

  async function navigate(url: URL, origin?: OriginRect | null) {
    if (active.current || section(url.pathname) === section(pathname)) return;
    const controller = new AbortController();
    const { signal } = controller;
    active.current = controller;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = slow ? 2 : 1;
    setTarget(url.pathname === "/" ? "Home" : section(url.pathname));
    setPhase("preparing");
    setNotice("");
    if (variant === "bookshelf" && url.pathname === "/") {
      url.hash = "books";
      url.searchParams.delete("transitionPrototype");
      url.searchParams.set("variant", "bookshelf");
    }

    if (
      (variant === "shutters" || variant === "origin") &&
      url.pathname === "/" &&
      !url.hash
    ) {
      const returnShelf: Record<string, string> = {
        books: "books",
        weightlifting: "training",
        manual: "systems",
        routine: "systems",
        systems: "systems",
      };
      const shelf = returnShelf[section(pathname)];
      if (shelf) url.hash = shelf;
    }
    let navigationIssued = false;
    let sceneStartupBackstop: ReturnType<typeof setTimeout> | undefined;
    const commit = async () => {
      if (signal.aborted || navigationIssued) return;
      const committed = new Promise<void>((resolve) => {
        pending.current = { path: url.pathname, resolve };
      });
      navigationIssued = true;
      router.push(url.pathname + url.search + url.hash);
      // Next's router.push returns void. Wait for the destination layout commit.
      await Promise.race([committed, pause(10_000, signal)]);
      pending.current = null;
      // Native view transitions suppress rendering until this callback resolves.
      // Waiting for requestAnimationFrame here deadlocks capture until the
      // browser times out and skips the animation. The layout commit is enough.
    };

    try {
      if (reduced) {
        setNotice("Reduced motion: animation disabled");
        await commit();
      } else if (
        variant === "bookshelf" &&
        booksShelf.current &&
        (url.pathname === "/books" || url.pathname === "/")
      ) {
        await booksShelf.current.transition(
          url.pathname === "/",
          commit,
          signal,
          speed,
          setPhase,
        );
      } else if (variant === "origin" && !supported) {
        const geometry = originZoomGeometry(origin, innerWidth, innerHeight);
        setNotice("Snapshot API unavailable: expanding from the source box");
        flushSync(() => setPhase("expanding source"));
        if (originPanel.current)
          await playOriginPanel(
            originPanel.current,
            geometry.panel,
            commit,
            signal,
            speed,
          );
        else await commit();
      } else if (variant === "shutters" || !supported) {
        if (variant !== "shutters")
          setNotice("Snapshot API unavailable: playing A instead");
        // Mount before measuring/animating. No frame callback is required to
        // start a shutter pass, so background-frame throttling cannot stall it.
        flushSync(() => setPhase("closing"));
        await playShutters({
          panels: Array.from(
            curtains.current?.querySelectorAll<HTMLElement>("[data-panel]") ??
              [],
          ),
          commit,
          signal,
          speed,
          onPhase: setPhase,
        });
      } else {
        const root = document.documentElement;
        if (variant === "origin" && url.pathname === "/") {
          useRouteTransitionPrototype.setState({ deferSceneStartup: true });
          // A skipped or stalled capture must never strand the room's boot.
          sceneStartupBackstop = setTimeout(() => {
            useRouteTransitionPrototype.setState({ deferSceneStartup: false });
          }, 3000 * speed);
        }
        root.dataset.routePrototype = variant;
        if (variant === "origin") {
          const geometry = originZoomGeometry(origin, innerWidth, innerHeight);
          root.style.setProperty("--route-origin-zoom", geometry.zoom);
          root.style.setProperty("--route-origin-clip", geometry.clip);
        }
        root.dataset.routeDirection = url.pathname === "/" ? "back" : "forward";
        root.style.setProperty(
          "--route-prototype-duration",
          `${(variant === "origin" ? 620 : 900) * speed}ms`,
        );
        setPhase("capturing");
        let navigation: Promise<void> | undefined;
        const transition = document.startViewTransition(() => {
          navigation = commit();
          return navigation;
        });
        nativeTransition.current = transition;
        // A cold dev compilation can outlast the browser's capture deadline.
        // Next still navigates if the browser chooses to skip the animation.
        void transition.ready.then(
          () => {
            if (!signal.aborted) setPhase("animating");
          },
          (error: unknown) => {
            if (!signal.aborted)
              setNotice(
                `Animation skipped: ${error instanceof Error ? error.name : String(error)}`,
              );
          },
        );
        await transition.finished.catch(() => undefined);
        await navigation;
      }
    } catch (error) {
      // Cancellation or skipped browser capture must not strand the page.
      if (!signal.aborted) {
        setNotice(
          `Animation interrupted: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (!navigationIssued) await commit();
      }
    } finally {
      clearTimeout(sceneStartupBackstop);
      useRouteTransitionPrototype.setState({ deferSceneStartup: false });
      active.current = null;
      nativeTransition.current = null;
      document.documentElement.style.removeProperty("--route-origin-zoom");
      document.documentElement.style.removeProperty("--route-origin-clip");
      delete document.documentElement.dataset.routePrototype;
      delete document.documentElement.dataset.routeDirection;
      document.documentElement.style.removeProperty(
        "--route-prototype-duration",
      );
      setPhase("idle");
    }
  }

  useEffect(() => {
    const follow = (link: HTMLElement, event: Event) => {
      const url = localDestination(link);
      if (!url || section(url.pathname) === section(pathname)) return;
      event.preventDefault();
      event.stopPropagation();
      void navigate(url, link.getBoundingClientRect());
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              "a[href], [data-placard-href], button, input, select, textarea",
            )
          : null;
      if (!link?.matches("a[href], [data-placard-href]")) return;
      follow(link, event);
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== "Enter" ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof HTMLElement) ||
        !event.target.matches("[data-placard-href]")
      )
        return;
      follow(event.target, event);
    };
    const requested = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as unknown;
      const request = typeof detail === "string" ? { href: detail } : detail;
      if (
        !request ||
        typeof request !== "object" ||
        !("href" in request) ||
        typeof request.href !== "string"
      )
        return;
      const url = prototypeDestination(request.href, location.href);
      if (!url || section(url.pathname) === section(pathname)) return;
      const origin =
        variant === "origin" &&
        "sourceId" in request &&
        typeof request.sourceId === "string"
          ? projectSceneInteractionRect(request.sourceId)
          : null;
      event.preventDefault();
      void navigate(url, origin);
    };
    window.addEventListener(PROTOTYPE_NAVIGATION_EVENT, requested);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener(PROTOTYPE_NAVIGATION_EVENT, requested);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", keydown, true);
    };
  });

  function cycle(direction: number) {
    if (busy) return;
    const next =
      VARIANTS[
        (VARIANTS.indexOf(variant) + direction + VARIANTS.length) %
          VARIANTS.length
      ]!;
    useRouteTransitionPrototype.setState({ variant: next });
    const url = new URL(location.href);
    url.searchParams.delete("transitionPrototype");
    if (next === "origin") url.searchParams.delete("variant");
    else url.searchParams.set("variant", next);
    router.replace(url.pathname + url.search + url.hash, { scroll: false });
  }

  const showCurtains = ["closing", "covered", "opening"].includes(phase);
  return (
    <>
      {variant === "bookshelf" ? (
        <BooksShelfPrototype ref={booksShelf} />
      ) : null}
      {phase === "expanding source" ? (
        <div
          ref={originPanel}
          className="route-prototype-origin-panel"
          aria-hidden="true"
        />
      ) : null}
      {showCurtains ? (
        <div
          ref={curtains}
          className="route-prototype-curtains"
          data-phase={phase}
          aria-hidden="true"
        >
          <div data-panel="left" />
          <div data-panel="right" />
          <p className="route-prototype-destination">Opening {target}</p>
        </div>
      ) : null}
      <div
        className="route-prototype-bar"
        role="region"
        aria-label="Route transition prototype"
        onKeyDown={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest(
              "input, textarea, select, [contenteditable=true], [role=switch]",
            )
          )
            return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            event.stopPropagation();
            cycle(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        <div className="flex items-center justify-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={busy}
            onClick={() => cycle(-1)}
            aria-label="Previous transition"
          >
            ←
          </Button>
          <span className="min-w-40 text-center text-sm">
            {LABELS[variant]}
          </span>
          <Button
            size="icon"
            variant="ghost"
            disabled={busy}
            onClick={() => cycle(1)}
            aria-label="Next transition"
          >
            →
          </Button>
          <Button
            size="sm"
            variant={slow ? "secondary" : "ghost"}
            disabled={busy}
            aria-pressed={slow}
            onClick={() => setSlow(!slow)}
          >
            0.5×
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              const url = new URL(location.href);
              url.searchParams.delete("transitionPrototype");
              url.searchParams.delete("variant");
              history.replaceState(null, "", url);
              setPrototypeEnabled(false);
            }}
            aria-label="Turn off transition prototype"
          >
            ×
          </Button>
        </div>
        <div className="flex items-center justify-center gap-2">
          {variant === "bookshelf" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || pathname !== "/"}
              onClick={async () => {
                const controller = new AbortController();
                active.current = controller;
                setNotice("");
                setPhase("preparing shelf");
                try {
                  const reduced = matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches;
                  await booksShelf.current?.preview(
                    controller.signal,
                    reduced ? 0 : slow ? 2 : 1,
                    setPhase,
                  );
                } catch (error) {
                  setNotice(
                    error instanceof Error ? error.message : String(error),
                  );
                } finally {
                  active.current = null;
                  setPhase("idle");
                }
              }}
            >
              2D / 3D
            </Button>
          ) : null}
          {DESTINATIONS.map(([path, label]) => (
            <Button
              key={path}
              size="sm"
              variant="outline"
              disabled={
                busy ||
                section(pathname) === section(path) ||
                (variant === "bookshelf" && path === "/weightlifting")
              }
              onClick={(event) =>
                navigate(
                  new URL(path, location.origin),
                  event.currentTarget.getBoundingClientRect(),
                )
              }
            >
              {variant === "bookshelf" && path === "/" ? "Books shelf" : label}
            </Button>
          ))}
        </div>
        <p
          role="status"
          className="mt-2 text-center text-xs text-muted-foreground"
        >
          Prototype · {phase}
          {busy ? ` → ${target}` : ` · ${pathname}`}{" "}
          {!supported && (variant === "swipe" || variant === "cards")
            ? "· Shutter fallback"
            : ""}
          {notice ? <span className="mt-1 block">{notice}</span> : null}
        </p>
      </div>
    </>
  );
}

"use client";

// Compare page transitions, including the Books shelf's 3D/2D/library handoff.
// Source zoom is the default. Earlier experiments remain available by URL.
import { roomResidency } from "../stacks/room/roomResidency";
import { projectSceneInteractionRect } from "../stacks/scene/interactionRegistry";
import { usePathname, useRouter } from "next/navigation";
import {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { isRoomPathname } from "~/lib/site/roomRoutes";

import { type BooksShelfPrototypeHandle } from "./BooksShelfPrototype";
import { installHistoryTransition } from "./historyTransition";
import {
  PROTOTYPE_NAVIGATION_EVENT,
  isMusingPageChange,
  isMusingReadingPath,
  prototypeDestination,
} from "./navigation";
import {
  type OriginRect,
  originReturnGeometry,
  originZoomGeometry,
  playOriginPanel,
} from "./originZoom";
import "./prototype.css";
import {
  PageScrollMemory,
  type RoomJourney,
  measureRoomSource,
  preserveRoomJourneyOnReplace,
  readRoomJourney,
  rememberRoomSource,
  roomDirection,
  writeRoomJourney,
} from "./roomJourney";
import { playShutters } from "./shutters";
import { useRouteTransitionPrototype } from "./store";

const BooksShelfPrototype = lazy(() =>
  import("./BooksShelfPrototype").then((module) => ({
    default: module.BooksShelfPrototype,
  })),
);

const DESTINATIONS = [
  ["/", "Home"],
  ["/books", "Books"],
  ["/weightlifting", "Workouts"],
] as const;
// Every room pathname is one section, the room, so travel between its
// stops never reads as a route change.
const section = (path: string) =>
  isRoomPathname(path) ? "" : (path.split("/")[1] ?? "");
const isRoom = (url: URL) => isRoomPathname(url.pathname);
const sameTransitionPage = (from: string, to: string) =>
  section(from) === section(to) && !isMusingPageChange(from, to);

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

function clearTransitionPresentation() {
  useRouteTransitionPrototype.setState({ deferSceneStartup: false });
  document.documentElement.style.removeProperty("--route-origin-zoom");
  document.documentElement.style.removeProperty("--route-origin-clip");
  delete document.documentElement.dataset.routePrototype;
  delete document.documentElement.dataset.routeDirection;
  delete document.documentElement.dataset.routeReturn;
  document.documentElement.style.removeProperty("--route-return-transform");
  document.documentElement.style.removeProperty("--route-return-clip");
  document.documentElement.style.removeProperty("--route-prototype-duration");
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
  const variant = useRouteTransitionPrototype((state) =>
    process.env.NODE_ENV === "production" ? "origin" : state.variant,
  );
  const reverseRoom = useRouteTransitionPrototype((state) => state.reverseRoom);
  const currentJourney = useRef<RoomJourney | null>(null);
  const [pageScrolls] = useState(() => new PageScrollMemory());
  const historyNavigate = useRef<
    (url: URL, state: unknown, restore: () => void) => Promise<void>
  >(async () => undefined);
  const historyAccepts = useRef<(url: URL) => boolean>(() => false);
  const [phase, setPhase] = useState("idle");
  const [target, setTarget] = useState("");
  const [supported, setSupported] = useState(false);
  const curtains = useRef<HTMLDivElement>(null);
  const originPanel = useRef<HTMLDivElement>(null);
  const pending = useRef<{ path: string; resolve: () => void } | null>(null);
  const active = useRef<AbortController | null>(null);
  const nativeTransition = useRef<ViewTransition | null>(null);
  const booksShelf = useRef<BooksShelfPrototypeHandle>(null);

  useEffect(() => {
    if (reverseRoom) return preserveRoomJourneyOnReplace();
  }, [reverseRoom]);

  useEffect(() => {
    setSupported(typeof document.startViewTransition === "function");
    if (!isMusingReadingPath(location.pathname)) {
      for (const [path] of DESTINATIONS) router.prefetch(path);
    }
    return () => {
      active.current?.abort();
      pending.current?.resolve();
      nativeTransition.current?.skipTransition();
      clearTransitionPresentation();
    };
  }, [router]);

  useEffect(
    () =>
      installHistoryTransition({
        accepts: (url) => historyAccepts.current(url),
        transition: (url, state, restore) =>
          historyNavigate.current(url, state, restore),
        cancel: () => {
          active.current?.abort();
          nativeTransition.current?.skipTransition();
          pending.current?.resolve();
          pending.current = null;
          active.current = null;
          nativeTransition.current = null;
          clearTransitionPresentation();
          setPhase("idle");
        },
      }),
    [],
  );

  useLayoutEffect(() => {
    currentJourney.current = readRoomJourney(history.state);
    if (pending.current?.path === pathname) {
      pending.current.resolve();
      pending.current = null;
    }
  }, [pathname]);

  historyAccepts.current = (url) =>
    variant === "origin" &&
    // An intercepted sheet owns its history entry even after expansion.
    // Its own exit (or native Back) must not trigger a second page capture.
    !document.querySelector("[data-presented-sheet]") &&
    ((reverseRoom && roomDirection(pathname, url.pathname) !== null) ||
      isMusingPageChange(pathname, url.pathname));
  historyNavigate.current = (url, state, restore) =>
    navigate(url, null, undefined, {
      restore,
      journey:
        roomDirection(pathname, url.pathname) === "return"
          ? currentJourney.current
          : readRoomJourney(state),
    });

  async function navigate(
    url: URL,
    origin?: OriginRect | null,
    source?: HTMLElement | string,
    traversal?: { restore: () => void; journey: RoomJourney | null },
  ) {
    if (active.current || sameTransitionPage(pathname, url.pathname)) return;
    const controller = new AbortController();
    const { signal } = controller;
    active.current = controller;
    const direction =
      variant === "origin" && reverseRoom
        ? roomDirection(pathname, url.pathname)
        : null;
    const room = roomResidency.getSnapshot();
    const warmReturn = direction === "return" && roomResidency.hasReadyRoom();
    const journey =
      direction === "enter" && !traversal
        ? rememberRoomSource(source, room.generation)
        : (traversal?.journey ?? readRoomJourney(history.state));
    if (direction && journey && !traversal) writeRoomJourney(journey);
    if (direction === "return")
      pageScrolls.save(currentJourney.current ?? journey, scrollX, scrollY);
    if (direction === "enter" && traversal)
      origin = measureRoomSource(
        journey,
        room.generation,
        projectSceneInteractionRect,
      );
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = 1;
    setTarget(isRoom(url) ? "Home" : section(url.pathname));
    setPhase("preparing");
    if (variant === "bookshelf" && isRoom(url)) {
      url.hash = "books";
      url.searchParams.delete("transitionPrototype");
      url.searchParams.set("variant", "bookshelf");
    }

    if (
      (variant === "shutters" || variant === "origin") &&
      isRoom(url) &&
      !url.hash &&
      !traversal
    ) {
      const returnShelf: Record<string, string> = {
        books: "books",
        weightlifting: "training",
        manual: "systems",
        routine: "systems",
        systems: "systems",
        musings: "musings",
      };
      const remembered = roomResidency.getSnapshot().returnHash;
      const shelf = returnShelf[section(pathname)];
      if (remembered !== null) url.hash = remembered;
      else if (shelf) url.hash = shelf;
    }
    let navigationIssued = false;
    let sceneStartupBackstop: ReturnType<typeof setTimeout> | undefined;
    const commit = async () => {
      if (signal.aborted || navigationIssued) return;
      const committed = new Promise<void>((resolve) => {
        pending.current = { path: url.pathname, resolve };
      });
      navigationIssued = true;
      if (traversal) traversal.restore();
      else router.push(url.pathname + url.search + url.hash);
      // Next's router.push returns void. Wait for the destination layout commit.
      await Promise.race([committed, pause(10_000, signal)]);
      if (signal.aborted) return;
      pending.current = null;
      if (direction && journey) {
        writeRoomJourney(journey);
        currentJourney.current = journey;
      }
      if (direction === "enter" && traversal) {
        const position = pageScrolls.get(journey);
        if (position) window.scrollTo({ ...position, behavior: "instant" });
      }
      if (direction === "return") {
        // React has resumed the resident room and resized its camera in layout
        // effects. Measure now, never from a stale screenshot or parked layout.
        const destination = warmReturn
          ? measureRoomSource(
              journey,
              roomResidency.getSnapshot().generation,
              projectSceneInteractionRect,
            )
          : null;
        document.documentElement.dataset.routeReturn = destination
          ? "source"
          : "soft";
        const geometry = originReturnGeometry(
          destination,
          innerWidth,
          innerHeight,
        );
        document.documentElement.style.setProperty(
          "--route-return-transform",
          geometry.transform,
        );
        document.documentElement.style.setProperty(
          "--route-return-clip",
          geometry.clip,
        );
      }
      // Native view transitions suppress rendering until this callback resolves.
      // Waiting for requestAnimationFrame here deadlocks capture until the
      // browser times out and skips the animation. The layout commit is enough.
    };

    try {
      if (reduced) {
        await commit();
      } else if (
        variant === "bookshelf" &&
        booksShelf.current &&
        (url.pathname === "/books" || isRoom(url))
      ) {
        await booksShelf.current.transition(
          isRoom(url),
          commit,
          signal,
          speed,
          setPhase,
        );
      } else if (variant === "origin" && !supported && direction === "return") {
        // No snapshot API: use a short pullback of the covering panel.
        flushSync(() => setPhase("expanding source"));
        if (originPanel.current)
          await playOriginPanel(
            originPanel.current,
            "none",
            commit,
            signal,
            speed,
            true,
          );
        else await commit();
      } else if (variant === "origin" && !supported) {
        const geometry = originZoomGeometry(origin, innerWidth, innerHeight);
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
        if (
          variant === "origin" &&
          isRoom(url) &&
          !roomResidency.hasReadyRoom()
        ) {
          useRouteTransitionPrototype.setState({ deferSceneStartup: true });
          // A skipped or stalled capture must never strand the room's boot.
          sceneStartupBackstop = setTimeout(() => {
            useRouteTransitionPrototype.setState({ deferSceneStartup: false });
          }, 3000 * speed);
        }
        root.dataset.routePrototype = variant;
        if (direction === "return") root.dataset.routeReturn = "soft";
        if (variant === "origin") {
          const geometry = originZoomGeometry(origin, innerWidth, innerHeight);
          root.style.setProperty("--route-origin-zoom", geometry.zoom);
          root.style.setProperty("--route-origin-clip", geometry.clip);
        }
        root.dataset.routeDirection = isRoom(url) ? "back" : "forward";
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
          () => undefined,
        );
        await transition.finished.catch(() => undefined);
        await navigation;
      }
    } catch {
      // Cancellation or skipped browser capture must not strand the page.
      if (!signal.aborted) {
        if (!navigationIssued) await commit();
      }
    } finally {
      clearTimeout(sceneStartupBackstop);
      // A newer browser traversal may already own the effect and its CSS.
      if (active.current !== controller) return;
      active.current = null;
      nativeTransition.current = null;
      clearTransitionPresentation();
      setPhase("idle");
    }
  }

  useEffect(() => {
    const follow = (link: HTMLElement, event: Event) => {
      const url = localDestination(link);
      if (!url || sameTransitionPage(pathname, url.pathname)) return;
      event.preventDefault();
      event.stopPropagation();
      void navigate(url, link.getBoundingClientRect(), link);
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
      if (!url || sameTransitionPage(pathname, url.pathname)) return;
      const origin =
        variant === "origin" &&
        "sourceId" in request &&
        typeof request.sourceId === "string"
          ? projectSceneInteractionRect(request.sourceId)
          : null;
      event.preventDefault();
      void navigate(
        url,
        origin,
        "sourceId" in request && typeof request.sourceId === "string"
          ? request.sourceId
          : undefined,
      );
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

  const showCurtains = ["closing", "covered", "opening"].includes(phase);
  return (
    <>
      {variant === "bookshelf" ? (
        <Suspense fallback={null}>
          <BooksShelfPrototype ref={booksShelf} />
        </Suspense>
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
    </>
  );
}

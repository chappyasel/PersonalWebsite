"use client";

import {
  type BookInteractionRow,
  readBookShelfRows,
} from "../stacks/scene/bookInteractions";
import {
  layoutBooksFeaturedRows,
  layoutBooksPackedRows,
} from "../stacks/scene/units/UnitBooks";
import { featuredBookThickness } from "../stacks/scene/units/featuredBookGeometry";
import { unitPose } from "../stacks/scene/worldLayout";
import { useStacks } from "../stacks/store";
import { PALETTES } from "../stacks/theme";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PerspectiveCamera, Vector3 } from "three";

import {
  fallbackCoverEdgeColor,
  readingBookMaterialColors,
} from "~/lib/books/coverEdgeColor";

import { BooksShelfSvg } from "./BooksShelfSvg";
import "./booksBoot.css";
import { type BooksShelfDrawing, drawBooksShelf } from "./booksShelfDrawing";
import { useRouteTransitionPrototype } from "./store";

type BootBook = {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  pageCount: number | null;
  audioLengthMin: number | null;
};

// The server never receives URL fragments. Both drawings arrive in the initial
// HTML and this tiny script chooses before either shelf can paint.
const selectBooksBootScript = `
try {
  var p = new URLSearchParams(location.search);
  if (location.pathname === "/" && location.hash === "#books" &&
      p.get("variant") === "bookshelf") {
    document.documentElement.setAttribute("data-books-boot", "");
  } else {
    document.documentElement.removeAttribute("data-books-boot");
  }
} catch (_) {}
`;

// Measure the case itself, so late cover colors and book inventory cannot
// change the framing. Both drawings project these same structural corners.
function caseBounds(drawing: BooksShelfDrawing) {
  const points = drawing.layers
    .filter((layer) => /^(plank|support|foot)-/.test(layer.key))
    .flatMap((layer) => layer.polygons.flatMap((polygon) => polygon.points));
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  return {
    left,
    top,
    width: Math.max(...points.map((point) => point.x)) - left,
    height: Math.max(...points.map((point) => point.y)) - top,
  };
}

export default function BooksBootPrototype({
  featuredBooks,
  spineBooks,
}: {
  featuredBooks: BootBook[];
  spineBooks: BootBook[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const [live, setLive] = useState<{
    drawing: BooksShelfDrawing;
    transform: string;
  } | null>(null);
  const shelves = useMemo(
    () =>
      [false, true].map((dark) => {
        const palette = PALETTES[dark ? "dark" : "light"];
        const color = (id: string) =>
          readingBookMaterialColors(
            fallbackCoverEdgeColor(id),
            palette.pages,
            dark,
          ).cover;
        const [topFeatured, lowerFeatured] = layoutBooksFeaturedRows(
          featuredBooks
            .filter((book) => book.coverUrl)
            .map((book) => ({
              url: book.coverUrl!,
              key: book.id,
              label: book.title,
              author: book.author,
              color: color(book.id),
              thickness: featuredBookThickness(
                book.pageCount,
                book.audioLengthMin,
              ),
            })),
        );
        const [topRow, lowerRow] = layoutBooksPackedRows(
          spineBooks.map((book) => ({ ...book, color: color(book.id) })),
          palette,
          topFeatured,
          lowerFeatured,
        );
        // Pure camera mathematics, no canvas or renderer. A centred start pose
        // works before viewport measurement and uses the existing bookcase yaw.
        const camera = new PerspectiveCamera(33, 1, 0.1, 100);
        const [x, , z] = unitPose(1).position;
        camera.position.set(x, 0.16, z + 4.9);
        camera.lookAt(x, -0.23, z);
        camera.updateMatrixWorld(true);
        const rows: BookInteractionRow[] = [
          { shelf: "top", role: "featured", salt: 16, items: topFeatured },
          {
            shelf: "lower",
            role: "featured",
            salt: 41,
            items: lowerFeatured,
          },
          { shelf: "top", role: "packed", salt: 15, items: topRow },
          { shelf: "lower", role: "packed", salt: 40, items: lowerRow },
        ];
        const drawing = drawBooksShelf(
          rows,
          (px, py, pz) => {
            const point = new Vector3(px, py, pz).project(camera);
            return {
              x: (point.x + 1) * 400,
              y: (1 - point.y) * 400,
              depth: point.z,
            };
          },
          { width: 800, height: 800, dark },
        );
        return { rows, drawing };
      }),
    [featuredBooks, spineBooks],
  );

  useEffect(() => {
    const element = root.current!;
    let frame = 0;
    let ceiling = 0;
    let started = false;
    let observer: MutationObserver | null = null;
    const stop = () => {
      observer?.disconnect();
      observer = null;
      cancelAnimationFrame(frame);
      window.clearTimeout(ceiling);
      animation.current?.cancel();
      animation.current = null;
      element.dataset.booksBootPhase = "done";
      element.style.visibility = "hidden";
      setLive(null);
    };
    const capture = () => {
      const state = useStacks.getState();
      const project = window.__stacks?.project;
      const rows = readBookShelfRows();
      if (
        state.activeUnit !== 1 ||
        state.settledUnit !== 1 ||
        !project ||
        !rows
      ) {
        frame = requestAnimationFrame(capture);
        return;
      }
      const dark = document.documentElement.classList.contains("dark");
      const source = shelves[dark ? 1 : 0]!;
      const svg = element.querySelector<SVGSVGElement>(
        dark ? ".books-boot-dark" : ".books-boot-light",
      )!;
      const rect = svg.getBoundingClientRect();
      try {
        // The camera changes during the zoom, not the illustration's palette.
        // Live rows carry sampled jacket colors, often black, which made the
        // colored boards disappear into the cover art at the capture swap.
        const drawing = drawBooksShelf(source.rows, project);
        const from = caseBounds(source.drawing);
        const to = caseBounds(drawing);
        const sx = (from.width * rect.width) / source.drawing.width / to.width;
        const sy =
          (from.height * rect.height) / source.drawing.height / to.height;
        const x =
          rect.left +
          (from.left * rect.width) / source.drawing.width -
          to.left * sx;
        const y =
          rect.top +
          (from.top * rect.height) / source.drawing.height -
          to.top * sy;
        if (![sx, sy, x, y].every(Number.isFinite) || sx <= 0 || sy <= 0) {
          stop();
          return;
        }
        element.dataset.booksBootPhase = "aligning";
        setLive({
          drawing,
          transform: `matrix(${sx}, 0, 0, ${sy}, ${x}, ${y})`,
        });
      } catch {
        // A missing development projector must never keep a painted room hidden.
        stop();
      }
    };
    const observeWorld = () => {
      const phase = document.documentElement.dataset.world;
      if (phase === "ready") {
        observer?.disconnect();
        // Match the production vignette's bounded cosmetic delay. The world
        // keeps its own readiness policy; a failed animation cannot hold it.
        ceiling = window.setTimeout(stop, 1200);
        capture();
      } else if (phase !== "pending" && phase !== "warm") {
        stop();
      }
    };
    const sync = () => {
      const { enabled, variant } = useRouteTransitionPrototype.getState();
      const selected =
        enabled &&
        variant === "bookshelf" &&
        location.pathname === "/" &&
        location.hash === "#books";
      document.documentElement.toggleAttribute("data-books-boot", selected);
      if (!selected) {
        stop();
        return;
      }
      if (started) return;
      started = true;
      const phase = document.documentElement.dataset.world;
      if (
        (phase !== "pending" && phase !== "warm") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        element.dataset.booksBootPhase = "done";
        return;
      }
      element.dataset.booksBootPhase = "waiting";
      element.style.removeProperty("visibility");
      observer = new MutationObserver(observeWorld);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-world"],
      });
    };
    // Preserve the pre-paint choice until the root debug gate has hydrated.
    if (useRouteTransitionPrototype.getState().enabled) sync();
    const unsubscribe = useRouteTransitionPrototype.subscribe(sync);
    window.addEventListener("hashchange", sync);
    // Resizing invalidates a captured camera pose. Reveal the responsive room
    // instead of finishing toward an obsolete rectangle.
    window.addEventListener("resize", stop);
    return () => {
      stop();
      unsubscribe();
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("resize", stop);
      document.documentElement.removeAttribute("data-books-boot");
    };
  }, [shelves]);

  useLayoutEffect(() => {
    if (!live) return;
    const element = root.current!;
    const artwork = element.querySelector<HTMLElement>(".books-boot-live")!;
    if (!artwork.animate) {
      element.dataset.booksBootPhase = "done";
      return;
    }
    const zoom = artwork.animate(
      [{ transform: live.transform }, { transform: "none" }],
      { duration: 760, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
    );
    animation.current = zoom;
    let cancelled = false;
    void zoom.finished.then(
      () => {
        if (!cancelled) element.dataset.booksBootPhase = "done";
      },
      () => {
        if (!cancelled) element.dataset.booksBootPhase = "done";
      },
    );
    return () => {
      cancelled = true;
      zoom.cancel();
    };
  }, [live]);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: selectBooksBootScript }} />
      <div className="books-boot-prototype" ref={root}>
        {live ? (
          <div
            className="books-boot-live"
            style={{ transform: live.transform }}
          >
            <BooksShelfSvg drawing={live.drawing} />
          </div>
        ) : null}
        <div className="books-boot-prototype-stage">
          <BooksShelfSvg
            drawing={shelves[0]!.drawing}
            className="books-boot-light"
          />
          <BooksShelfSvg
            drawing={shelves[1]!.drawing}
            className="books-boot-dark"
          />
          <p>Book Notes</p>
        </div>
        <p className="books-boot-prototype-wait" role="status">
          Opening the Books shelf
        </p>
      </div>
    </>
  );
}

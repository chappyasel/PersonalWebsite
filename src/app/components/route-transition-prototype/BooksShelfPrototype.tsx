"use client";

import { readBookShelfRows } from "../stacks/scene/bookInteractions";
import { useStacks } from "../stacks/store";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { BooksShelfSvg } from "./BooksShelfSvg";
import { type BooksShelfDrawing, drawBooksShelf } from "./booksShelfDrawing";

export type BooksShelfPrototypeHandle = {
  preview: (
    signal: AbortSignal,
    speed: number,
    onPhase: (phase: string) => void,
  ) => Promise<void>;
  transition: (
    toHome: boolean,
    commit: () => Promise<void>,
    signal: AbortSignal,
    speed: number,
    onPhase: (phase: string) => void,
  ) => Promise<void>;
};
const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
type Rect = { x: number; y: number; width: number; height: number };

function visibleLibraryCovers() {
  const covers = new Map<string, Rect>();
  document.querySelectorAll<HTMLElement>("[data-book-id]").forEach((card) => {
    const image = card.querySelector("img");
    const rect = image?.getBoundingClientRect();
    if (
      rect &&
      rect.width > 0 &&
      rect.bottom > 0 &&
      rect.top < innerHeight &&
      rect.right > 0 &&
      rect.left < innerWidth
    ) {
      if (covers.has(card.dataset.bookId!)) return;
      covers.set(card.dataset.bookId!, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    }
  });
  return covers;
}

async function captureShelf(
  signal: AbortSignal,
  onPhase: (phase: string) => void,
) {
  onPhase("finding Books shelf");
  let deadline = performance.now() + 15_000;
  while (!signal.aborted && performance.now() < deadline) {
    if (
      useStacks.getState().jumpTo &&
      readBookShelfRows() &&
      document.documentElement.dataset.world === "ready"
    )
      break;
    await delay(80);
  }
  if (signal.aborted) return null;
  const state = useStacks.getState();
  if (
    !state.jumpTo ||
    !readBookShelfRows() ||
    document.documentElement.dataset.world !== "ready"
  ) {
    throw new Error(
      "Open Home and let the 3D room load before trying the Books shelf",
    );
  }
  if (state.activeUnit !== 1) state.jumpTo(1);
  state.setHovered(null);
  onPhase("settling Books shelf");
  deadline = performance.now() + 1800;
  // Allow arrival, hover, and camera easing to settle before taking the flat pose.
  await delay(240);
  while (
    !signal.aborted &&
    performance.now() < deadline &&
    useStacks.getState().settledUnit !== 1
  )
    await delay(40);
  if (signal.aborted) return null;
  await nextFrame();
  const project = window.__stacks?.project;
  const rows = readBookShelfRows();
  if (!project || !rows)
    throw new Error("The Books shelf projection is not ready");
  return drawBooksShelf(rows, project);
}

export const BooksShelfPrototype = forwardRef<BooksShelfPrototypeHandle>(
  function BooksShelfPrototype(_, ref) {
    const [drawing, setDrawing] = useState<BooksShelfDrawing | null>(null);
    const [visible, setVisible] = useState(false);
    const [caption, setCaption] = useState("");
    const root = useRef<HTMLDivElement>(null);
    const cached = useRef<BooksShelfDrawing | null>(null);
    const held = useRef(false);
    const animations = useRef<Animation[]>([]);

    function clear() {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
      held.current = false;
      setVisible(false);
    }
    useEffect(
      () => () => {
        animations.current.forEach((animation) => animation.cancel());
      },
      [],
    );

    function animate(
      element: Element | null,
      keyframes: Keyframe[],
      duration: number,
      signal: AbortSignal,
    ) {
      if (!element || signal.aborted) return Promise.resolve();
      const animation = element.animate(keyframes, {
        duration,
        easing: "cubic-bezier(.22,1,.36,1)",
        fill: "forwards",
      });
      animations.current.push(animation);
      const cancel = () => animation.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      return animation.finished
        .catch(() => undefined)
        .finally(() => signal.removeEventListener("abort", cancel));
    }
    function mount(next: BooksShelfDrawing | null, text: string) {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
      flushSync(() => {
        setDrawing(next);
        setVisible(true);
        setCaption(text);
      });
    }
    async function flatten(
      next: BooksShelfDrawing,
      speed: number,
      signal: AbortSignal,
    ) {
      cached.current = next;
      mount(next, "Book Notes · 2D shelf");
      const artwork = root.current?.querySelector("svg") ?? null;
      const paper = root.current?.querySelector("[data-shelf-paper]") ?? null;
      // Covers are already aligned with the live camera. Their flat faces
      // replace shading in place while the surrounding room becomes paper.
      await Promise.all([
        animate(paper, [{ opacity: 0 }, { opacity: 1 }], 540 * speed, signal),
        animate(artwork, [{ opacity: 0 }, { opacity: 1 }], 540 * speed, signal),
      ]);
    }
    function coverFlight(
      rects: Map<string, Rect>,
      reverse: boolean,
      speed: number,
      signal: AbortSignal,
    ) {
      const covers =
        root.current?.querySelectorAll<SVGGElement>("[data-shelf-cover]") ?? [];
      let matched = 0;
      const flights = Array.from(covers).map((cover, index) => {
        const to = rects.get(cover.dataset.shelfCover!);
        const from = cover.getBoundingClientRect();
        let displaced: Keyframe;
        if (to && from.width > 0 && from.height > 0) {
          matched++;
          const dx = to.x + to.width / 2 - from.x - from.width / 2;
          const dy = to.y + to.height / 2 - from.y - from.height / 2;
          displaced = {
            transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width}, ${to.height / from.height})`,
            opacity: 0,
          };
        } else {
          // Offscreen/filtered books have no honest destination rectangle.
          displaced = {
            transform: `translateY(${reverse ? 50 : -60 - index * 8}px) scale(.92)`,
            opacity: 0,
          };
        }
        const home = { transform: "translate(0, 0) scale(1)", opacity: 1 };
        return animate(
          cover,
          reverse
            ? [displaced, home]
            : [
                home,
                { ...displaced, opacity: to ? 1 : 0, offset: 0.8 },
                displaced,
              ],
          820 * speed,
          signal,
        );
      });
      setCaption(
        `${matched} cover${matched === 1 ? "" : "s"} matched to the visible library`,
      );
      return Promise.all(flights);
    }

    useImperativeHandle(ref, () => ({
      async preview(signal, speed, onPhase) {
        if (held.current) {
          await animate(
            root.current,
            [{ opacity: 1 }, { opacity: 0 }],
            360 * speed,
            signal,
          );
          clear();
          return;
        }
        try {
          const next = await captureShelf(signal, onPhase);
          if (!next || signal.aborted) return;
          onPhase("flattening shelf");
          await flatten(next, speed, signal);
          held.current = true;
        } catch (error) {
          clear();
          throw error;
        }
      },
      async transition(toHome, commit, signal, speed, onPhase) {
        try {
          if (!toHome) {
            if (!held.current) {
              const next = await captureShelf(signal, onPhase);
              if (!next || signal.aborted) return;
              onPhase("flattening shelf");
              await flatten(next, speed, signal);
            }
            held.current = false;
            onPhase("opening Book Notes");
            setCaption("Opening Book Notes");
            await commit();
            await nextFrame();
            // This development chunk can compile after the route commits.
            // Hold the flat shelf until its matching cards have mounted.
            const deadline = performance.now() + 6000;
            while (
              !signal.aborted &&
              performance.now() < deadline &&
              !document.querySelector("[data-books-shelf-preview] img")
            )
              await delay(60);
            await nextFrame();
            if (signal.aborted) return;
            onPhase("shelf → library");
            const flights = coverFlight(
              visibleLibraryCovers(),
              false,
              speed,
              signal,
            );
            const background =
              root.current?.querySelectorAll("[data-shelf-background]") ?? [];
            await Promise.all([
              flights,
              ...Array.from(background).map((node) =>
                animate(
                  node,
                  [{ opacity: 1 }, { opacity: 0 }],
                  580 * speed,
                  signal,
                ),
              ),
              animate(
                root.current?.querySelector("[data-shelf-paper]") ?? null,
                [{ opacity: 1 }, { opacity: 0 }],
                740 * speed,
                signal,
              ),
            ]);
          } else {
            const rects = visibleLibraryCovers();
            mount(cached.current, "Returning to the Books shelf");
            onPhase("library → shelf");
            await Promise.all([
              animate(
                root.current?.querySelector("[data-shelf-paper]") ?? null,
                [{ opacity: 0 }, { opacity: 1 }],
                480 * speed,
                signal,
              ),
              animate(
                root.current?.querySelector("svg") ?? null,
                [{ opacity: 0 }, { opacity: 1 }],
                480 * speed,
                signal,
              ),
            ]);
            await commit();
            const next = await captureShelf(signal, onPhase);
            if (!next || signal.aborted) return;
            cached.current = next;
            mount(next, "Book Notes · 2D shelf");
            onPhase("assembling shelf");
            await coverFlight(rects, true, speed, signal);
            await delay(220 * speed);
            if (signal.aborted) return;
            onPhase("2D → 3D");
            await animate(
              root.current,
              [{ opacity: 1 }, { opacity: 0 }],
              650 * speed,
              signal,
            );
          }
        } finally {
          clear();
        }
      },
    }));

    if (!visible) return null;
    return (
      <div className="books-shelf-prototype" ref={root} aria-hidden="true">
        <div className="books-shelf-prototype-paper" data-shelf-paper="" />
        {drawing ? (
          <BooksShelfSvg
            drawing={drawing}
            className="books-shelf-prototype-drawing"
          />
        ) : null}
        <div className="books-shelf-prototype-caption">
          <p>{caption}</p>
          {drawing ? (
            <small>{drawing.bookCount} volumes · live shelf layout · SVG</small>
          ) : null}
        </div>
      </div>
    );
  },
);

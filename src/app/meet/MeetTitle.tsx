"use client";

import Image from "next/image";
import portrait from "public/images/about/profile.jpg";
import { useLayoutEffect, useRef, useState } from "react";

import { ENTER_MS, INTRO } from "./intro";
import styles from "./meet.module.css";

/** About how wide a bold title runs per letter, in ems, a little over, so
 * the server's first guess never wraps. Measured once in the browser. */
const EM_PER_LETTER = 0.56;

/** The title at the middle of the screen, this much larger, at most. */
const CENTRE_SCALE = 1.45;
/** A touch over the spring's end, as the grid's blocks arrive. */
const SPRINGY = "cubic-bezier(0.3, 1.25, 0.5, 1)";
/** The glide up: slow away, slow in. */
const GLIDE = "cubic-bezier(0.65, 0, 0.2, 1)";

/**
 * The long entrance's title: the photo pops in at the middle of the screen
 * and the title fades up beside it, larger, then the two glide to their
 * place together. Only the two move: the facts under the title wait until
 * it lands (.facts). Returns its undoing, should the page unmount.
 */
function playIntro(
  row: HTMLElement,
  photo: HTMLElement,
  title: HTMLElement,
): () => void {
  const text = document.createRange();
  text.selectNodeContents(title);
  const words = text.getBoundingClientRect();
  const face = photo.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  // The photo and the words together, centred on the screen, scaled about
  // the row's own centre (its transform-origin).
  const left = Math.min(face.left, words.left);
  const right = Math.max(face.right, words.right);
  const top = Math.min(face.top, words.top);
  const bottom = Math.max(face.bottom, words.bottom);
  const scale = Math.min(
    CENTRE_SCALE,
    (window.innerWidth * 0.84) / (right - left),
  );
  const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const middle = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const target = { x: window.innerWidth / 2, y: window.innerHeight * 0.44 };
  const dx = target.x - centre.x - scale * (middle.x - centre.x);
  const dy = target.y - centre.y - scale * (middle.y - centre.y);
  const away = `translate(${dx}px, ${dy}px) scale(${scale})`;
  // On a computer the photo is placed against the head, over the grid's
  // rail. A transform on the row makes the row its frame, which dropped
  // the photo onto the words, so while the row glides the photo is pinned
  // to the same spot measured from the row, and let go in the same step
  // as the glide ends. Its translate still centres it on that spot. At
  // rest it's centred on the title and the facts under it; with the facts
  // not in yet, it's centred on the title, and eases down as it glides.
  const pinned = getComputedStyle(photo).position === "absolute";
  const settle: Animation[] = [];
  if (pinned) {
    const rest = `${face.top + face.height / 2 - box.top}px`;
    const level = `${(words.top + words.bottom) / 2 - box.top}px`;
    photo.style.left = `${face.left - box.left}px`;
    photo.style.top = rest;
    settle.push(
      photo.animate(
        [
          { top: level },
          { top: level, offset: INTRO.rise / INTRO.landed, easing: GLIDE },
          { top: rest },
        ],
        { duration: INTRO.landed },
      ),
    );
  }
  const unpin = () => {
    photo.style.left = "";
    photo.style.top = "";
  };
  const glide = row.animate(
    [
      { transform: away },
      { transform: away, offset: INTRO.rise / INTRO.landed, easing: GLIDE },
      { transform: "none" },
    ],
    { duration: INTRO.landed, fill: "forwards" },
  );
  glide.onfinish = () => {
    unpin();
    glide.cancel();
  };
  const appear = [
    ...settle,
    photo.animate([{ transform: "scale(0.6)" }, { transform: "none" }], {
      duration: 760,
      easing: SPRINGY,
      fill: "backwards",
    }),
    photo.animate(
      [
        { opacity: 0, filter: "blur(6px)" },
        { opacity: 1, filter: "blur(0px)" },
      ],
      { duration: 520, easing: "ease-out", fill: "backwards" },
    ),
    title.animate(
      [
        { opacity: 0, transform: "translateY(10px)", filter: "blur(8px)" },
        { opacity: 1, transform: "none", filter: "blur(0px)" },
      ],
      {
        duration: 860,
        delay: 160,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "backwards",
      },
    ),
  ];
  return () => {
    glide.cancel();
    unpin();
    for (const animation of appear) animation.cancel();
  };
}

/**
 * The page's title on one line, Chappy's photo before it on a phone. Both
 * shrink together to fit the width they have (.titleRow), so a long title
 * or a narrow screen never wraps it or cuts it off. The fit needs the
 * title's width in ems: a guess from its length for the first paint, then
 * the browser's own measure.
 *
 * Hydrated, it starts the page's entrance, the long one or the short one
 * as the page's script chose (intro.ts).
 */
export function MeetTitle({ title }: { title: string }) {
  const row = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [ems, setEms] = useState(title.length * EM_PER_LETTER);

  useLayoutEffect(() => {
    const element = heading.current;
    if (!element) return;
    const text = document.createRange();
    text.selectNodeContents(element);
    const size = parseFloat(getComputedStyle(element).fontSize);
    const width = text.getBoundingClientRect().width;
    if (size > 0 && width > 0) setEms(width / size);
  }, [title]);

  // In the same frame as the page's first hydrated paint, so the parts
  // waiting at their first frame start from there. The Days are measured
  // by then (MeetBooking's useWidth, also a layout effect).
  useLayoutEffect(() => {
    const root = row.current?.closest<HTMLElement>(".meet-root");
    if (!root) return;
    const long =
      root.hasAttribute("data-intro") &&
      !!row.current &&
      !!photo.current &&
      !!heading.current &&
      typeof row.current.animate === "function";
    if (long) {
      root.style.setProperty("--intro", `${INTRO.rest}ms`);
      root.style.setProperty("--intro-landed", `${INTRO.landed}ms`);
    } else root.removeAttribute("data-intro");
    root.setAttribute("data-entering", "");
    const undo = long
      ? playIntro(row.current!, photo.current!, heading.current!)
      : null;
    const timer = setTimeout(
      () => {
        root.removeAttribute("data-entering");
        root.removeAttribute("data-intro");
        root.style.removeProperty("--intro");
        root.style.removeProperty("--intro-landed");
      },
      long ? INTRO.done : ENTER_MS,
    );
    return () => {
      clearTimeout(timer);
      undo?.();
    };
  }, []);

  return (
    <div
      ref={row}
      className={styles.titleRow}
      style={{ ["--title-em" as string]: ems.toFixed(3) }}
    >
      <Image
        ref={photo}
        src={portrait}
        alt=""
        width={88}
        height={88}
        preload
        data-enter
        style={{ ["--enter" as string]: 0 }}
        className={styles.portrait}
      />
      <h1
        ref={heading}
        data-enter
        style={{ ["--enter" as string]: 0 }}
        className={styles.title}
      >
        {title}
      </h1>
    </div>
  );
}

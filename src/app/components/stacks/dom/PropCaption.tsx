"use client";

// What sits under a prop brought up to the camera (scene/PropApproach): the
// Projects Mac, the About globe, the Homework, Weightlifting and Apple
// tiles. Two things can be there. A caption, from the same object notes the
// photo inspector reads (content/stacks/objects.md, fetched lazily on first
// need) and shown only when the note is written for visitors. And a button,
// from the approach controller's own `link`: a tile that used to be a Portal
// keeps its destination here, since up close the tap is spoken for. Either
// may be absent; a tile with a link and an internal note shows the button
// alone (owner call, 2026-09-11: "I don't want there to be a description for
// it, but I just want the link to it as a button").
//
// The caption sits just under the prop, not at the foot of the page: the
// wrapper publishes where the near pose puts the prop's foot on screen
// (`controller.frame.bottom`) and the panel follows it each frame with a
// little padding. A long caption scrolls within the space left below the
// prop. The button keeps the foot of the page on its own, so it never moves
// with the prop. Everything stays mounted through the exit so the fade has
// something to fade, and the note is only requested once a prop is up.
import { useObjectNote } from "../objectNotes";
import {
  nearPropApproach,
  subscribePropApproaches,
} from "../scene/propApproachState";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Gap between the prop's foot and the panel, in CSS pixels. Covers the
 * tile's backward lean and the pointer follow, which the published foot
 * leaves out. */
const PROP_CAPTION_GAP = 28;
/** The panel keeps at least this off the bottom of the viewport. */
const PROP_CAPTION_EDGE = 20;
/** With a button at the foot of the page, the panel stops above it. */
const PROP_CAPTION_BUTTON_CLEARANCE = 72;

const SHOW_TRANSITION =
  "opacity 320ms cubic-bezier(0.16, 1, 0.3, 1) 120ms, translate 420ms cubic-bezier(0.16, 1, 0.3, 1) 120ms";
const HIDE_TRANSITION =
  "opacity 160ms ease-in, translate 200ms cubic-bezier(0.4, 0, 1, 1)";

const nearId = () => nearPropApproach()?.id ?? null;
const noNearId = () => null;

export default function PropCaption() {
  const near = useSyncExternalStore(subscribePropApproaches, nearId, noNearId);
  const [shown, setShown] = useState<{
    id: string;
    link: { href: string; label: string } | null;
  } | null>(null);
  useEffect(() => {
    const controller = nearPropApproach();
    if (near && controller) setShown({ id: near, link: controller.link });
  }, [near]);
  const note = useObjectNote(shown?.id ?? null);
  const caption =
    note?.visitor === true && note.status === "written" && note.body !== ""
      ? note
      : null;
  const link = shown?.link ?? null;
  const visible = near !== null && (caption !== null || link !== null);
  const wrapper = useRef<HTMLDivElement>(null);
  // Follow the prop's foot while a prop is up. A frame loop rather than
  // state: the wrapper writes the foot every frame and nothing else in the
  // DOM cares, and it also tracks a resize for free.
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    const place = () => {
      frame = requestAnimationFrame(place);
      const el = wrapper.current;
      const controller = nearPropApproach();
      if (!el || !controller) return;
      const top = Math.round(controller.frame.bottom + PROP_CAPTION_GAP);
      const clearance = link
        ? PROP_CAPTION_BUTTON_CLEARANCE
        : PROP_CAPTION_EDGE;
      el.style.top = `${top}px`;
      // The wrapper is a single-line flex row, so this cap clamps the line
      // and the stretched panel inside it, which then scrolls.
      el.style.maxHeight = `calc(100dvh - ${top}px - max(${clearance}px, env(safe-area-inset-bottom)))`;
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [visible, caption, link]);
  if (!caption && !link) return null;

  const anchorClass = `${visible ? "pointer-events-auto" : "pointer-events-none"} inline-flex items-center gap-1`;
  const otherLinks = caption
    ? caption.links.filter((l) => l.href !== link?.href)
    : [];
  const motionStyle = {
    opacity: visible ? 1 : 0,
    translate: visible ? "0 0" : "0 10px",
    transition: visible ? SHOW_TRANSITION : HIDE_TRANSITION,
  };
  return (
    <>
      {caption && (
        <div
          ref={wrapper}
          data-prop-caption
          data-prop-caption-visible={visible ? "" : undefined}
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center px-4"
          style={motionStyle}
        >
          <section
            aria-hidden={!visible}
            // Stays mounted through the fade, so while hidden its links must
            // take no clicks: an invisible anchor over the room would open a
            // page (Codex review, 2026-09-11).
            inert={!visible}
            // The world's wheel and drag bridges leave scroll containers
            // marked this way alone, so a long caption scrolls instead of
            // travelling the room.
            data-stacks-scrollable
            className="field-notes-glass-tooltip pointer-events-auto w-full max-w-[440px] overflow-y-auto overscroll-contain rounded-xl border px-4 py-3 text-center backdrop-blur-xl backdrop-saturate-150"
          >
            <p className="text-[13px] leading-relaxed opacity-80 sm:text-sm">
              {caption.body}
            </p>
            {otherLinks.length > 0 && (
              <p className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12px] leading-[1.3]">
                {otherLinks.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    tabIndex={visible ? 0 : -1}
                    className={`${anchorClass} decoration-current/40 underline underline-offset-2 hover:decoration-current`}
                  >
                    {l.label}
                    <ArrowSquareOutIcon aria-hidden size={12} weight="bold" />
                  </a>
                ))}
              </p>
            )}
          </section>
        </div>
      )}
      {link && (
        <div
          data-prop-caption
          data-prop-caption-visible={visible ? "" : undefined}
          className="pointer-events-none fixed inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-30 flex justify-center px-4"
          style={motionStyle}
        >
          <a
            aria-hidden={!visible}
            inert={!visible}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            tabIndex={visible ? 0 : -1}
            className={`${anchorClass} field-notes-glass-tooltip rounded-full border px-4 py-2 font-serif text-[15px] leading-none backdrop-blur-xl backdrop-saturate-150 transition-transform hover:scale-[1.03]`}
          >
            {link.label}
            <ArrowSquareOutIcon aria-hidden size={14} weight="bold" />
          </a>
        </div>
      )}
    </>
  );
}

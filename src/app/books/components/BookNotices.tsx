"use client";

import {
  BookOpenIcon,
  BookmarkSimpleIcon,
  CaretRightIcon,
  FileTextIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useId, useState } from "react";

import { cn } from "~/lib/util";

/**
 * Shared shell so every book notice reads as the same kind of object. The
 * narrow layout (below md, where the metadata stacks under the cover) keeps
 * the margins at 12px: the rows above it sit 12px apart, and 24px each side
 * left the callout floating on its own.
 */
function BookNotice({
  icon,
  children,
  className,
}: {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "my-3 rounded-lg border border-border bg-muted/60 px-4 py-3.5 text-sm md:my-6",
        className,
      )}
    >
      <p className="flex items-start gap-2.5 text-foreground">
        <span className="mt-[0.15em] shrink-0 text-muted-foreground">
          {icon}
        </span>
        <span>{children}</span>
      </p>
    </aside>
  );
}

/**
 * Shown on books whose Notion "Automated?" box is checked: the summary and key
 * takeaways on the page came out of an AI pass over Chappy's handwritten notes
 * and have not been reviewed by him yet.
 *
 * Callers must also require `hasSummary` — "Automated?" only records that a
 * book is in the AI pipeline, so on its own it can be true before any summary
 * exists, and this copy claims one is present.
 */
export function AutomatedNotice() {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();
  const prefersReducedMotion = useReducedMotion();

  return (
    <aside className="my-3 rounded-lg border border-border bg-muted/60 px-4 py-3.5 text-sm md:my-6">
      <p className="flex items-start gap-2.5 text-foreground">
        <SparkleIcon
          size={18}
          weight="thin"
          className="mt-[0.15em] shrink-0 text-muted-foreground"
        />
        <span>
          <strong className="font-semibold">
            The summary and key takeaways below are auto-generated.
          </strong>{" "}
          I ran an AI pass based strictly on my handwritten notes for this book.
          I haven&apos;t done my own pass over them yet.
        </span>
      </p>

      <button
        type="button"
        aria-controls={contentId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="mt-2 flex items-center gap-1.5 rounded-sm pl-[26px] text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <CaretRightIcon
          size={12}
          weight="regular"
          className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
        />
        <span>How I read and take notes</span>
      </button>

      <motion.div
        id={contentId}
        aria-hidden={!isOpen}
        inert={!isOpen}
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
        }
        className="overflow-hidden"
      >
        <div className="space-y-3 pl-[26px] pt-3 text-muted-foreground">
          <p>
            I read a book once and take handwritten notes as I go, then leave
            them alone. Weeks or months later I come back and write the key
            points and summary from those notes.
          </p>
          <p>
            The delay is on purpose. Having to rebuild a book out of my own
            notes does far more for my recall than a second read-through would.
          </p>
          <p>
            This one has only gotten as far as the AI pass. I&apos;ll come back
            and redo the takeaways and summary myself soon!
          </p>
        </div>
      </motion.div>
    </aside>
  );
}

/**
 * Shown while a book is started but not finished. Takes precedence over
 * AutomatedNotice: whatever is on the page is mid-flight either way, and the
 * summary does not get written until the book is done.
 */
export function ReadingNowNotice() {
  return (
    <BookNotice icon={<BookOpenIcon size={18} weight="thin" />}>
      <strong className="font-semibold">Still reading this one!</strong>{" "}
      Whatever notes are here are partial. The key points and summary come after
      I finish!
    </BookNotice>
  );
}

/**
 * Shown on books with an Abandoned date: the notes stop at the drop point
 * and no key points or summary are coming.
 */
export function AbandonedNotice({ percent }: { percent: number | null }) {
  return (
    <BookNotice icon={<BookmarkSimpleIcon size={18} weight="thin" />}>
      <strong className="font-semibold">
        {percent != null
          ? `I abandoned this one ${percent}% in.`
          : "I abandoned this one partway through."}
      </strong>{" "}
      Whatever notes are here stop where I did. No key points or summary for
      this one.
    </BookNotice>
  );
}

export function NoNotesState({
  status,
}: {
  status: "reading" | "abandoned" | "read";
}) {
  const Icon =
    status === "reading"
      ? BookOpenIcon
      : status === "abandoned"
        ? BookmarkSimpleIcon
        : FileTextIcon;

  return (
    <section
      data-book-notes-state="empty"
      aria-label="Book notes status"
      className="my-6 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/25 px-6 py-12 text-center"
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground shadow-sm">
        <Icon size={24} weight="duotone" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        No notes for this one
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {status === "reading"
          ? "I'm reading this one without taking notes!"
          : status === "abandoned"
            ? "I put this one down without taking notes!"
            : "I read this one without taking notes!"}
      </p>
    </section>
  );
}

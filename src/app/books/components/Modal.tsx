"use client";

import { useModalActions, useModalState } from "../contexts/BookPreviewContext";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname, useSearchParams } from "next/navigation";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  getBookShareUrl,
  getBooksPath,
  getBooksTagQuery,
} from "~/lib/books/paths";
import { copyTextToClipboard } from "~/lib/clipboard";
import {
  type ModalOrigin,
  originEntrance,
  originExit,
  takeModalOrigin,
} from "~/lib/originFlight";
import { closeOverlayChrome, openOverlayChrome } from "~/lib/overlayChrome";
import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";
import { api } from "~/trpc/react";

import {
  SheetCloseControl,
  SheetControlCluster,
  SheetExpandControl,
} from "~/components/modal-sheet/SheetControls";

import { BookDetailContent } from "./BookDetailContent";
import { BookDetailLoadingSkeleton } from "./BookDetailLoadingSkeleton";
import { type ModalPresentation, fullBookPageHref } from "./ModalHost";
import { bookIdFromPathname, isBookModalHistoryState } from "./modalHistory";
import { shouldUseModalEnterShortcut } from "./modalKeyboard";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableChildren(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    const style = getComputedStyle(element);
    return (
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  });
}

export function Modal({ presentation }: { presentation?: ModalPresentation }) {
  const { selectedBook, selectedBookId, isModalOpen } = useModalState();
  const { closeModal, openModalById } = useModalActions();
  const pathname = usePathname();
  // The card that opened this modal pushed the shelf's own query along with
  // the book path, so these are the shelf's size, sort and filters.
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState(false);
  // Expanded = the shell has grown to the viewport and stays there — a
  // purely presentational takeover, like the modal-sheet expand. The ref
  // mirrors the state for the long-lived keydown listener, whose closure
  // would otherwise hold a stale value.
  const [expanded, setExpanded] = useState(false);
  const [originExitRunning, setOriginExitRunning] = useState(false);
  const expandedRef = useRef(false);
  const isClosingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  // A 3D cover/spine click records a small rect at the pointer (a mesh has
  // no DOM box); the shell flies from and back to it, the same origin pop
  // the daylight sheet does. Absent on the standalone books site, where the
  // cover's layoutId morph already owns the entrance.
  const stacksOriginRef = useRef<ModalOrigin | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();
  const fromStacks = presentation?.source === "stacks";
  const onCloseStart = presentation?.onCloseStart;

  const bookId = selectedBookId ?? "";

  // Fetch full book data (with notes)
  const {
    data: fullBook,
    isLoading: isLoadingFull,
    error,
  } = api.books.getById.useQuery(
    { bookId },
    {
      enabled: !!bookId && isModalOpen,
      staleTime: Infinity,
    },
  );

  // Use preview data immediately, fall back to fetched data
  const fetchedBook = fullBook?.id === bookId ? fullBook : undefined;
  const book = selectedBook?.id === bookId ? selectedBook : fetchedBook;
  const isLoadingNotes = isLoadingFull && !fetchedBook;
  const fullHeight = !book || book.hasNotes;

  // The 3D world's chrome stands down for as long as this modal owns the
  // screen (see lib/overlayChrome and the recede rules in StacksHome), and
  // comes back the moment a close begins, so it is already returning while
  // the shell flies home to its cover. Idempotent, because a close can also
  // arrive as a history pop that never runs through `handleClose`.
  const overlayHeldRef = useRef(false);
  const releaseOverlayChrome = () => {
    if (!overlayHeldRef.current) return;
    overlayHeldRef.current = false;
    closeOverlayChrome();
  };
  useEffect(() => {
    if (!isModalOpen) return;
    overlayHeldRef.current = true;
    openOverlayChrome();
    return releaseOverlayChrome;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  const handleClose = () => {
    // Prevent double-close during exit animation (ref updates synchronously)
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    onCloseStart?.();
    releaseOverlayChrome();
    // Blur active element to prevent focus ring on book card
    (document.activeElement as HTMLElement)?.blur();
    // Stacks origin pop, reversed: the shell flies back to the clicked
    // cover's rect before the modal state tears down.
    const origin = stacksOriginRef.current;
    const shell = shellRef.current;
    if (origin && shell) {
      stacksOriginRef.current = null;
      setOriginExitRunning(true);
      const flying = originExit(shell, origin, backdropRef.current, () => {
        closeModal();
        window.history.back();
      });
      if (flying) return;
      setOriginExitRunning(false);
    }
    closeModal();
    // Navigate back to remove the bookId from URL
    window.history.back();
  };

  // Reset isClosing and any prior takeover when modal reopens
  useEffect(() => {
    if (isModalOpen) {
      isClosingRef.current = false;
      expandedRef.current = false;
      setExpanded(false);
      setOriginExitRunning(false);
    }
  }, [isModalOpen]);

  // Browser back/forward. The pop has already moved history, so unlike the
  // X this close must not call history.back() again — but it plays the same
  // origin exit flight when one is owed. Forward onto an entry that names a
  // book reopens it, so the URL and the page never disagree.
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const id = bookIdFromPathname(window.location.pathname, fromStacks);
      if (id) {
        if (!isModalOpen && isBookModalHistoryState(event.state)) {
          openModalById(id);
        }
        return;
      }
      if (!isModalOpen || isClosingRef.current) return;
      isClosingRef.current = true;
      onCloseStart?.();
      (document.activeElement as HTMLElement)?.blur();
      const origin = stacksOriginRef.current;
      const shell = shellRef.current;
      if (origin && shell) {
        stacksOriginRef.current = null;
        setOriginExitRunning(true);
        if (originExit(shell, origin, backdropRef.current, closeModal)) return;
        setOriginExitRunning(false);
      }
      closeModal();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isModalOpen, fromStacks, closeModal, onCloseStart, openModalById]);

  // A soft navigation while the modal is open (Universal Search on the books
  // site, say) replaces the page underneath; the modal must not linger over
  // it. Native pushState syncs into usePathname, so the open modal normally
  // sees its own book's path — the ref records that sighting, and only a
  // pathname that stops matching after it closes the modal. If the sync
  // never happens, nothing here ever fires.
  const sawOwnPathRef = useRef(false);
  useEffect(() => {
    if (!isModalOpen) {
      sawOwnPathRef.current = false;
      return;
    }
    if (bookIdFromPathname(pathname, fromStacks) === bookId) {
      sawOwnPathRef.current = true;
      return;
    }
    if (!sawOwnPathRef.current || isClosingRef.current) return;
    isClosingRef.current = true;
    onCloseStart?.();
    closeModal();
  }, [pathname, isModalOpen, bookId, fromStacks, closeModal, onCloseStart]);

  const expandHref = fullBookPageHref(bookId, presentation);

  // A tag leads to the shelf narrowed to that tag. Over the 3D homepage that
  // is a real cross-host link; on Books it is the grid already sitting under
  // this modal, reached without leaving the page (handleTagSelect).
  const tagHref = (tag: string) =>
    fromStacks && presentation
      ? `${presentation.booksHref}/?${getBooksTagQuery(tag)}`
      : getBooksPath(getBooksTagQuery(tag, searchParams.toString()));

  // The modal sits on a history entry of its own, above the shelf's. Closing
  // through the X pops that entry; a tag instead REWRITES it into the
  // narrowed shelf, so the grid underneath re-filters in place and Back still
  // returns to the shelf as it was. Never history.back() here: after the
  // rewrite there is no modal entry left to pop, and a pop would leave the
  // site. Modified clicks fall through to the plain link.
  const handleTagSelect = (
    tag: string,
    event: ReactMouseEvent<HTMLAnchorElement>,
  ) => {
    if (fromStacks) return;
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    if (isClosingRef.current) return;
    event.preventDefault();
    isClosingRef.current = true;
    releaseOverlayChrome();
    (document.activeElement as HTMLElement)?.blur();
    window.history.replaceState(null, "", tagHref(tag));
    closeModal();
  };

  // The iOS-pop expand, ported from the modal sheet: the shell's real box
  // flies out to the viewport with content reflowing live, then simply
  // stays — the modal already renders the book's full content, so there is
  // nothing to navigate to. Back/Esc/X still pop to the launcher (the grid,
  // or the 3D world), and the share button already hands out the canonical
  // books-site URL. Modified clicks and reduced motion fall through to the
  // plain <a> — the real cross-host page. Returns false when the caller
  // should hard-navigate instead.
  const beginExpand = () => {
    if (reduceMotion) return false;
    if (isClosingRef.current || expandedRef.current) return false;
    const shell = shellRef.current;
    if (!shell) return false;
    isClosingRef.current = true;
    expandedRef.current = true;
    const rect = shell.getBoundingClientRect();
    Object.assign(shell.style, {
      position: "fixed",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      maxWidth: "none",
      maxHeight: "none",
      margin: "0",
    });
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 420,
      easing: "ease",
      fill: "forwards",
    });
    // The shell has no paint of its own — the rounded corners live on its
    // two child layers (background + content), so they unround themselves.
    for (const layer of shell.querySelectorAll<HTMLElement>(":scope > div")) {
      layer.animate([{ borderRadius: "1rem" }, { borderRadius: "0rem" }], {
        duration: 420,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      });
    }
    const flight = shell.animate(
      [
        {
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        },
        { top: "0px", left: "0px", width: "100vw", height: "100dvh" },
      ],
      { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    setExpanded(true);
    flight.onfinish = () => {
      Object.assign(shell.style, {
        top: "0px",
        left: "0px",
        width: "100vw",
        height: "100dvh",
      });
      isClosingRef.current = false;
    };
    return true;
  };

  const handleExpand = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    if (reduceMotion) return;
    event.preventDefault();
    beginExpand();
  };

  // Stacks origin pop: overlay a WAAPI flight from the clicked cover's rect
  // on top of the shell transition (WAAPI owns transform/opacity while it
  // runs, and both land on identity, so the two never fight). Before paint,
  // so the shell never flashes at rest first.
  useLayoutEffect(() => {
    if (!isModalOpen || !fromStacks) return;
    const origin = takeModalOrigin();
    if (!origin) return;
    stacksOriginRef.current = origin;
    const shell = shellRef.current;
    if (shell) originEntrance(shell, origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, fromStacks]);

  // Canvas books have no DOM cover to receive focus, while books opened on
  // the dedicated site do. In either case the dialog itself becomes the
  // keyboard boundary immediately and gives focus back to a real trigger when
  // one exists. The content's own buttons remain the next Tab stops.
  useEffect(() => {
    if (!isModalOpen) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => shellRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [isModalOpen]);

  // `aria-modal` describes a boundary; it does not create one. Keep both
  // sequential and programmatic focus inside the dialog while it is open.
  // The full-viewport backdrop already blocks pointer interaction, so this
  // local trap works identically on the standalone Books site and over the
  // Stacks world without making assumptions about either page's DOM root.
  useEffect(() => {
    if (!isModalOpen) return;

    const photoViewerOpen = () =>
      document.querySelector(".PhotoView-Portal") !== null;
    const containFocus = (event: FocusEvent) => {
      if (isUniversalSearchOpen()) return;
      const shell = shellRef.current;
      if (!shell || photoViewerOpen()) return;
      if (event.target instanceof Node && shell.contains(event.target)) return;
      shell.focus({ preventScroll: true });
    };
    const trapTab = (event: KeyboardEvent) => {
      if (isUniversalSearchOpen()) return;
      if (event.key !== "Tab" || photoViewerOpen()) return;
      const shell = shellRef.current;
      if (!shell) return;
      const focusable = focusableChildren(shell);
      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;

      if (!first || !last) {
        event.preventDefault();
        shell.focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && (active === shell || active === first)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("focusin", containFocus);
    window.addEventListener("keydown", trapTab);
    return () => {
      document.removeEventListener("focusin", containFocus);
      window.removeEventListener("keydown", trapTab);
    };
  }, [isModalOpen]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isModalOpen]);

  // Handle keyboard shortcuts (ESC to close, Enter for full page)
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isUniversalSearchOpen()) return;
      // Check if photo viewer is open (react-photo-view adds this class to body)
      const photoViewOpen = document.querySelector(".PhotoView-Portal");

      if (e.key === "Escape" && !photoViewOpen) {
        handleClose();
      } else if (shouldUseModalEnterShortcut(e) && !photoViewOpen && bookId) {
        // Full page view: the animated takeover when motion is allowed,
        // otherwise the real page — expandHref, not getBookPath, which on
        // the homepage host pointed at a route that only exists on the
        // books subdomain.
        e.preventDefault();
        if (!beginExpand()) window.location.href = expandHref;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, bookId]);

  // Dismissing on a backdrop click is anchored to where the press STARTED —
  // same rule as the sheet (components/modal-sheet/ModalSheet). A click is
  // routed to the nearest common ancestor of press and release, so anything
  // inside the modal that unmounts under the pointer, or a text selection
  // that drifts off the card, would otherwise reach these handlers and take
  // the modal down.
  const dismissArmedRef = useRef(false);
  const armDismiss = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target;
    dismissArmedRef.current = !(
      target instanceof Node && shellRef.current?.contains(target)
    );
  };
  const dismissIfArmed = (event: ReactMouseEvent<HTMLDivElement>) => {
    const armed = dismissArmedRef.current;
    dismissArmedRef.current = false;
    const target = event.target;
    if (!armed) return;
    if (target instanceof Node && shellRef.current?.contains(target)) return;
    handleClose();
  };

  // Handle share button click
  const handleShare = async () => {
    if (!bookId) return;
    const shareUrl = getBookShareUrl(bookId);
    const didCopy = await copyTextToClipboard(shareUrl);
    if (!didCopy) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // A recorded 3D-origin flight has already animated both layers completely
  // to zero before modal state is released. Framer's ordinary exit must be
  // instantaneous in that case: its internal motion values still say 1, so
  // replaying the fallback fade would make the invisible layers flash back.
  const originOwnsExit = fromStacks && originExitRunning;

  return (
    <AnimatePresence>
      {isModalOpen && bookId && (
        <>
          {/* Backdrop */}
          <motion.div
            ref={backdropRef}
            className={`fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm dark:bg-black/60 ${expanded ? "pointer-events-none" : ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration:
                reduceMotion || originOwnsExit ? 0 : fromStacks ? 0.28 : 0.2,
            }}
            onPointerDown={armDismiss}
            onClick={dismissIfArmed}
          />

          {/* Modal */}
          <div
            className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
            onPointerDown={armDismiss}
            onClick={dismissIfArmed}
          >
            <div className="flex h-[100dvh] min-h-[320px] items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
              <motion.div
                ref={shellRef}
                role="dialog"
                aria-modal="true"
                aria-label={
                  book?.title ? `${book.title} details` : "Book details"
                }
                tabIndex={-1}
                data-book-modal-shell={fromStacks ? "stacks" : undefined}
                className={`relative w-full max-w-4xl outline-none ${fullHeight ? "h-full" : ""}`}
                onClick={(e) => e.stopPropagation()}
                initial={
                  fromStacks && !reduceMotion
                    ? { opacity: 0, scale: 0.965, y: 14 }
                    : { opacity: 1, scale: 1, y: 0 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={
                  originOwnsExit
                    ? { opacity: 0, scale: 1, y: 0 }
                    : fromStacks && !reduceMotion
                      ? { opacity: 0, scale: 0.982, y: 8 }
                      : { opacity: 0 }
                }
                transition={
                  reduceMotion || originOwnsExit
                    ? { duration: 0 }
                    : fromStacks
                      ? { duration: 0.34, ease: [0.16, 1, 0.3, 1] }
                      : { duration: 0.2 }
                }
              >
                {/* Books can morph from their DOM cover via layoutId. A 3D
                    mesh has no DOM box to hand off from, so the homepage uses
                    the deliberate shell transition above instead of asking
                    Framer to morph from a source that does not exist. */}
                <motion.div
                  layoutId={fromStacks ? undefined : `book-cover-${bookId}`}
                  className={`absolute inset-0 rounded-2xl bg-background shadow-[0px_10px_50px_10px_rgba(0,0,0,0.1)] dark:bg-muted ${expanded ? "h-full max-h-none" : fullHeight ? "h-full" : "max-h-[85dvh]"}`}
                  transition={{
                    layout: { type: "spring", stiffness: 300, damping: 30 },
                  }}
                />
                {/* Actual content - fades in on top */}
                <motion.div
                  className={`relative overflow-hidden rounded-2xl bg-background dark:bg-muted ${expanded ? "h-full max-h-none" : fullHeight ? "h-full" : "max-h-[85dvh]"}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.15,
                    delay: reduceMotion ? 0 : 0.1,
                  }}
                >
                  {/* Content */}
                  {error ? (
                    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
                      <p className="text-center text-muted-foreground">
                        Failed to load book details
                      </p>
                      <button
                        onClick={handleClose}
                        className="bg-title hover:bg-body rounded-lg px-6 py-2 text-background transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  ) : book ? (
                    <BookDetailContent
                      book={book}
                      fullBook={fetchedBook}
                      isLoadingNotes={isLoadingNotes}
                      contentRef={contentRef}
                      onShare={handleShare}
                      copied={copied}
                      bookId={bookId}
                      isModal={true}
                      onClose={handleClose}
                      onExpand={handleExpand}
                      expanded={expanded}
                      modalBreadcrumbHref={
                        fromStacks ? presentation.booksHref : undefined
                      }
                      modalBookHref={
                        fromStacks
                          ? `${presentation.booksHref}/${bookId}`
                          : undefined
                      }
                      modalBookCount={
                        fromStacks ? presentation.bookCount : undefined
                      }
                      tagHref={tagHref}
                      onTagSelect={handleTagSelect}
                    />
                  ) : (
                    <div className="relative h-full">
                      <SheetControlCluster className="absolute right-6 top-6 z-10 xs:right-14">
                        {!expanded && (
                          <SheetExpandControl
                            href={expandHref}
                            onClick={handleExpand}
                          />
                        )}
                        <SheetCloseControl onClick={handleClose} />
                      </SheetControlCluster>
                      <BookDetailLoadingSkeleton />
                    </div>
                  )}
                </motion.div>
              </motion.div>
            </div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

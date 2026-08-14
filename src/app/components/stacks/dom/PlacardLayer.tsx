"use client";

// Museum placards — the dense DOM content for each unit, screen-fixed as a
// sibling of the canvas (never <Html transform>). Desktop: one framed panel
// per unit docked right, crossfaded by activeUnit. Mobile: a bottom sheet
// with three detents — peek (the default, filling the floor void under the
// bookcase), expanded (full height), and dismissed (a chip, the world with
// nothing on it). Desktop panels mount on first visit and then stay resident,
// so scroll/media state survives a return without front-loading unopened
// sections; mobile renders the current section in one physical sheet.
import { DeferredBookCarousel } from "../../DeferredBookCarousel";
import { type StacksData, type StacksSlots, UNITS } from "../data";
import { PHOTO_SOURCES } from "../photoSources";
import {
  STACKS_DESKTOP_QUERY,
  STACKS_MOBILE_QUERY,
  cameraForAspect,
} from "../scene/worldLayout";
import {
  closeStacksPanel,
  openStacksPanel,
  panelCoverageRef,
  useStacks,
} from "../store";
import {
  BookOpenIcon,
  BookOpenTextIcon,
  BooksIcon,
  CalendarBlankIcon,
  CaretUpIcon,
  ClockIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import licenses from "~~/models/LICENSES.json";

import { devSubdomainUrl } from "~/lib/util";

import {
  mobileSheetCameraCoverage,
  mobileSheetGeometry,
  mobileSheetMaterialOverscan,
  mobileSheetRestY,
  mobileSheetRubberBandY,
} from "./mobileSheetGeometry";

/** Which edges of a scroll container have content past them. Mirrors the
 * AIC platform's pattern of only fading an edge that actually continues, so
 * a short placard gets no phantom fade. */
function useScrollEdges(
  ref: React.RefObject<HTMLDivElement | null>,
  /** Re-attach when the scroller comes into existence. The mobile sheet is
   * inside an AnimatePresence, so its scroller is absent on the first render
   * of the component that owns this hook — and with only the (stable) ref in
   * the dep list the effect ran once against null and never again, so the
   * mobile fades never appeared at all. */
  attached = true,
) {
  const [edges, setEdges] = useState({ top: false, bottom: false });
  useEffect(() => {
    const el = ref.current;
    if (!el || !attached) return;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const top = scrollTop > 4;
      const bottom = scrollTop + clientHeight < scrollHeight - 4;
      setEdges((prev) =>
        prev.top === top && prev.bottom === bottom ? prev : { top, bottom },
      );
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    // Mobile swaps section bodies and several cards populate asynchronously,
    // so the children present at mount are not necessarily the children that
    // decide whether this thing scrolls. Without the subtree watch the fade
    // can miss exactly the long placards that need it.
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [ref, attached]);
  return edges;
}

/** How far mobile sheet content dissolves at each scroll edge. */
const FADE_PX = 34;

/** Desktop placard. The containing panel is gone — a blurred panel holding
 * blurred cards was a box on a box (owner at browse) — so each content
 * block keeps its own single blurred surface and the headers sit directly
 * on the scene. Losing the container is also what buys the extra width.
 *
 * Desktop deliberately leaves the scroller unmasked. A mask creates a
 * backdrop root and prevents the cards inside it from sampling the scene;
 * keeping each card's glass on the card also lets native scrolling move its
 * content and surface in the same composited layer. */
function Panel({
  active,
  mounted,
  label,
  children,
}: {
  active: boolean;
  mounted: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div
      aria-hidden={!active}
      // aria-hidden alone is a trap: the six inactive placards stay in the
      // tab order, so keyboard focus walks into content that is invisible
      // AND announced as hidden. `inert` is what actually removes a subtree
      // from focus and the a11y tree. It matters more now that the About
      // placard carries permanently sr-only photo-source links.
      inert={!active}
      // Fade-out-then-in: the entering placard waits for the leaving one —
      // simultaneous crossfade rendered as text-over-text mush (audit §2.5).
      // Full viewport height lets long sections scroll while the vertical
      // padding keeps native card surfaces clear of the viewport edges.
      className={`absolute inset-y-0 right-0 w-full ${
        active ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        ref={scrollRef}
        data-stacks-scrollable
        tabIndex={active ? 0 : -1}
        aria-label={`${label} section content`}
        // aria-hidden is duplicated from the wrapper on purpose: the input
        // bridge and the scroll-isolation gate both look up the ACTIVE
        // scroller by this attribute pair.
        aria-hidden={!active}
        // Absolute padding, not the 12vh this used to be. Viewport-relative
        // padding on a scroller is dead scroll range that grows with the
        // window: at 952px tall, 12vh was 114px at each end — 24% of a
        // viewport height of empty scrolling, and 30% on Projects, which
        // also carries a heading above its first card. It never showed at
        // 1440x900 because it is height-relative, not width-relative.
        //
        // 64px was still too much. Padding lands in scrollHeight, so it is
        // scroll range containing nothing: measured 128px of empty travel on
        // EVERY scrollable unit, which is 31% of the total range on Systems
        // at a 683px-tall window. Forty pixels keeps the first and last cards
        // comfortably inset while halving that dead range.
        //
        // Native desktop overscroll is safe now that each card's material and
        // content live in the same composited surface: they rubber-band as one
        // instead of exposing lag between a scroller and a mirrored backing.
        // Scroll chaining is already handled a layer up — ScrollBridges' wheel
        // listener bails on targets inside [data-stacks-scrollable].
        className="stacks-scroll placard-scroll relative h-full overflow-y-auto px-8 py-10"
      >
        {/* Short placards stay optically centred; letting a two-line card sit
            pinned to the top would make every short unit look top-heavy. */}
        <div className="flex min-h-full flex-col justify-center">
          {mounted ? children : null}
        </div>
      </div>
    </div>
  );
}

/** Section-swap cadence shared by the desktop dock and mobile sheet. */
const SWAP_OUT_MS = 120;
const SWAP_IN_MS = 220;
/** A section change follows the horizontal room: forward content arrives
 * from the right and previous content from the left. Twelve pixels is enough
 * to make direction legible without making a reading panel feel like a
 * carousel. */
const SWAP_DISTANCE_PX = 12;

/** Framer's reduced-motion snapshot is correct at mount, but a browser or OS
 * preference can change while the page is open. Mirror the media query so an
 * already-mounted world also stops immediately (the world is not mounted at
 * all when reduced motion is present at boot). */
function useStacksReducedMotion() {
  const framerReduced = useReducedMotion();
  const [mediaReduced, setMediaReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMediaReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return Boolean(framerReduced) || mediaReduced;
}

/** The desktop document changes in the same direction as the horizontal
 * room. Once visited, a document stays mounted: scrollTop, decoded media,
 * and focus registration survive a trip away and back. An
 * inactive document rests twelve pixels on the side of the active
 * one where it lives in the room; changing activeUnit naturally sends the
 * outgoing panel the opposite way while drawing the incoming one from its
 * travel direction. */
function DesktopPanel({
  activeUnit,
  modalOpen,
  bodies,
}: {
  activeUnit: number;
  modalOpen: boolean;
  bodies: Record<(typeof UNITS)[number]["slug"], React.ReactNode>;
}) {
  const reduceMotion = useStacksReducedMotion();
  // First activation mounts a document; every later visit reuses it. This
  // retains scroll and decoded media without loading all unopened sections
  // during the WebGL boot.
  const visitedRef = useRef(new Set<number>([activeUnit]));
  visitedRef.current.add(activeUnit);
  const previousRef = useRef(activeUnit);
  const direction: 1 | -1 =
    activeUnit === previousRef.current || activeUnit > previousRef.current
      ? 1
      : -1;
  useEffect(() => {
    previousRef.current = activeUnit;
  }, [activeUnit]);

  return (
    <>
      {UNITS.map((unit, index) => {
        const active = index === activeUnit && !modalOpen;
        const side = index < activeUnit ? -1 : index > activeUnit ? 1 : 0;
        const duration = active ? SWAP_IN_MS : SWAP_OUT_MS;
        const delay = active ? SWAP_OUT_MS : 0;
        return (
          <div
            key={unit.slug}
            data-stacks-desktop-panel={unit.slug}
            data-stacks-active={active || undefined}
            data-swap-direction={direction > 0 ? "next" : "previous"}
            className="absolute inset-0"
            style={{
              opacity: active ? 1 : 0,
              transform: `translateX(${reduceMotion || active ? 0 : side * SWAP_DISTANCE_PX}px)`,
              transitionProperty: "opacity, transform",
              transitionDuration: reduceMotion ? "0ms" : `${duration}ms`,
              transitionDelay: reduceMotion ? "0ms" : `${delay}ms`,
              transitionTimingFunction: active
                ? "cubic-bezier(0.16, 1, 0.3, 1)"
                : "ease-out",
            }}
          >
            <Panel
              active={active}
              mounted={visitedRef.current.has(index)}
              label={unit.label}
            >
              {bodies[unit.slug]}
            </Panel>
          </div>
        );
      })}
    </>
  );
}

/** One surface for a content block, matching the card the shared sections
 * draw for themselves. About and Books build their bodies here rather than
 * reusing a site section, so they'd otherwise be the only placards with no
 * surface at all.
 *
 * The surface lives on this same element as its content. That is important:
 * native scrolling can never move the copy independently from its glass. */
function PlacardCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-placard-surface=""
      className="rounded-3xl border border-foreground/[0.06] bg-muted/40 p-5 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-[24px] min-[1200px]:p-6"
    >
      {children}
    </div>
  );
}

function StatBlock({
  value,
  label,
  icon,
  mobile = true,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
  mobile?: boolean;
}) {
  return (
    <div
      className={`${mobile ? "flex" : "hidden sm:flex"} flex-col items-center gap-0.5`}
    >
      <span className="text-2xl font-semibold text-foreground sm:text-3xl">
        {value}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm [&>svg]:size-3.5 sm:[&>svg]:size-4">
        {icon}
        {label}
      </span>
    </div>
  );
}

/** The CC-BY authors owed a credit, read out of the roster the model
 * pipeline generates rather than typed here — scripts/stacks-models.mjs
 * writes public/models/LICENSES.json, and a prop the owner picks tomorrow
 * brings its author with it.
 *
 * Intl.ListFormat rather than join(", ") so the sentence stays a sentence at
 * every length: one name, two names joined by "and", and the serial comma
 * beyond that. It is deterministic for a fixed locale and list, so the
 * server and client render the same string. */
const AUTHOR_LIST = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
}).format(licenses.attributionRequired);

/** The full library. Production is the real subdomain; in dev it follows
 * whatever host the site is being served from. */
function booksHref() {
  return process.env.NODE_ENV === "production"
    ? "https://books.chappyasel.com"
    : devSubdomainUrl("books");
}

/** Library placard — the numbers, then the marquee of covers carried over
 * from the previous home page. The card is a door: the whole surface is one
 * link to the library, so there is nothing left to instruct the reader about
 * and the two lines of instructions that used to sit here are gone.
 *
 * The carousel comes in through DeferredBookCarousel, which keeps
 * BookCarousel (framer springs, Radix tooltips, next/image per cover) in its
 * own dynamic chunk — this placard is in the main bundle. */
function BooksPlacard({ data }: { data: StacksData }) {
  const { bookStats, covers } = data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-around gap-1">
        <StatBlock
          value={bookStats.total.toString()}
          label="Books"
          icon={<BookOpenIcon className="size-3.5" weight="bold" />}
        />
        <StatBlock
          value={bookStats.perYear?.toFixed(1) ?? "—"}
          label="Per Year"
          icon={<CalendarBlankIcon className="size-3.5" weight="bold" />}
          mobile={false}
        />
        <StatBlock
          value={bookStats.avgDays ? `${bookStats.avgDays.toFixed(1)}d` : "—"}
          label="Avg Read"
          icon={<ClockIcon className="size-3.5" weight="bold" />}
        />
        <StatBlock
          value={bookStats.pagesPerDay?.toFixed(1) ?? "—"}
          label="Pages / Day"
          icon={<BookOpenTextIcon className="size-3.5" weight="bold" />}
          mobile={false}
        />
      </div>
      {/* Negative insets so the marquee runs to the card's edges and its
          side mask fades against the frame rather than inside a gutter. */}
      <div className="-mx-5 -mb-1 overflow-hidden min-[1200px]:-mx-6">
        <DeferredBookCarousel books={covers} />
      </div>
    </div>
  );
}

/* ── Where the room stops, and therefore where the sheet starts ──────────
 *
 * Portrait frames the room badly. The camera is built around a landscape
 * unit, so on a 390x844 phone the bookcase finishes about two thirds of the
 * way down and the rest is bare floor — the owner's "it's hard to see the
 * bottom part", which is really "there is nothing down there". That void is
 * what the peek sheet fills, so the peek height is not a taste number. It is
 * the void, measured.
 *
 * The projection below is exact rather than eyeballed. CameraRig parks the
 * camera at (unitX, pose.y, pose.z) and aims it at (unitX, LOOK.y, LOOK.z),
 * so camera and target share a vertical plane and the angle between the view
 * axis and the ray to any point on that plane is simply the difference of two
 * pitches. A perspective camera then maps an angle theta off its axis to
 * tan(theta) / tan(halfFov) of a half-viewport.
 *
 * `pose` comes from cameraForAspect, which is the same function the rig uses,
 * so this follows the camera instead of assuming portrait — a landscape phone
 * (still under the md breakpoint, so still on the sheet) gets the wide pose's
 * much smaller void and lands on the floor clamp below.
 */

/** The resting look target. CameraRig damps look.y toward -0.08 with the
 * pointer centred, and its z is fixed. */
const LOOK = { y: -0.08, z: -0.2 };
/** Where the bookcase stops. Its straps run down to the ground plane at
 * y -1.115 and stand on a plinth foot there, and the strap group sits at
 * z -0.32 (scene/primitives.tsx, the Shelf frame). The NEAR depth is the one
 * to measure against: the odd units are pushed back to z -0.55, which only
 * lifts their feet higher up the frame, so clearing the near ones clears
 * every unit rather than most of them. */
const FOOT = { y: -1.115, z: -0.32 };
/** A sheet shorter than this is not worth showing — it would hold a title and
 * a clipped line. Below it the sheet covers a little shelf instead, which is
 * the better trade. */
const PEEK_MIN_PX = 160;
/** And it never takes more than this much of the screen whatever the
 * arithmetic says, because the room is the point of the page. */
const PEEK_MAX_FRACTION = 0.45;
/** Header geometry is fixed across all detents; see mobileSheetGeometry. */
/** Near-viewport documents snap to the viewport cap instead of leaving an
 * accidental sliver above the sheet. Short documents remain content-sized. */
const SHEET_MAX_SNAP_PX = 44;
const SHEET_HEIGHT_EPSILON_PX = 0.5;

/** Height of the empty floor below the bookcase, in px — the peek height. */
function peekHeightFor(width: number, height: number): number {
  const pose = cameraForAspect(width / height);
  const pitch = Math.atan2(pose.y - LOOK.y, pose.z - LOOK.z);
  const toFoot = Math.atan2(pose.y - FOOT.y, pose.z - FOOT.z);
  const halfFov = ((pose.fov / 2) * Math.PI) / 180;
  // Fraction of the viewport height, from the top, where the feet land:
  // 68.4% at 390x844 with the phone lens, or about 577px before the camera's
  // slow vertical bob (±0.03). Keeping this projection on the shared pose is
  // what lets a framing tune shrink the peek instead of cropping the shelf.
  const foot = 0.5 + (Math.tan(toFoot - pitch) / Math.tan(halfFov)) * 0.5;
  return Math.round(
    Math.min(
      Math.max(height * (1 - foot), PEEK_MIN_PX),
      height * PEEK_MAX_FRACTION,
    ),
  );
}

/** Viewport height and the peek height derived from it, re-measured on
 * resize and orientation change. Measured rather than declared in `dvh`
 * because the sheet has to agree with the CANVAS, and the canvas takes its
 * height from the same `fixed inset-0` box this reads. */
function useSheetMetrics() {
  const [metrics, setMetrics] = useState<{
    vw: number;
    vh: number;
    peek: number;
  } | null>(null);
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Width matters as much as height: cameraForAspect switches poses at
      // 0.75, and the two poses put the bookcase's feet in very different
      // places.
      setMetrics((prev) =>
        prev?.vw === vw && prev.vh === vh
          ? prev
          : { vw, vh, peek: peekHeightFor(vw, vh) },
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return metrics;
}

/** How far a touch has to travel before it is a drag rather than a tap. */
const DRAG_ARM_PX = 6;
/** Travel that commits the sheet to the next detent in that direction. */
const DRAG_STEP_PX = 72;
/** px/ms that commits regardless of distance. 0.6 is 600 px/s, about the
 * slowest thing that still reads as a flick rather than a placement. */
const FLING = 0.6;
/** The harder fling that skips a detent — expanded straight out to the chip.
 * Measured before assuming: an unhurried 180px pull down the sheet runs at
 * ~1.8 px/ms, so the first cut's 1.6 sent an ordinary collapse all the way to
 * dismissed. A skip has to be an obvious throw, and it also has to travel far
 * enough to mean it, hence the distance floor as well. */
const FLING_SKIP = 2.6;
const FLING_SKIP_MIN_PX = 120;
/** Minimum gap between velocity samples, and the pause after which the last
 * one is stale. */
const VELOCITY_SAMPLE_MS = 6;
const VELOCITY_STALE_MS = 100;
const SHEET_SPRING = {
  type: "spring" as const,
  stiffness: 420,
  damping: 42,
  mass: 0.9,
};
/** Backstop only. The swap normally lands when the exit animation reports
 * itself finished, because a TIMER cannot know when that is: measured on the
 * real page, a unit change costs a 149ms main-thread stall (the arriving
 * placard mounting), and React does not even render the fade until it is
 * over — so a 170ms timer fired with the content still at opacity 0.80, a
 * hard cut with a dip in it. Waiting for the animation instead gets a clean
 * 0.04 in both the warm and the cold case. This exists so a tab that never
 * paints (backgrounded, no rAF, no completion callback) cannot strand the
 * placard invisible. */

/** Mobile bottom sheet with three detents.
 *
 *   PEEK       resting default. The sheet sits in the floor void under the
 *              bookcase, showing the unit title and the first slice of its
 *              placard, and the room above it stays fully live.
 *   EXPANDED   full height, scrollable.
 *   DISMISSED  off-screen, leaving the chip — the way to get the sheet
 *              entirely out of the room.
 *
 * Only EXPANDED is a store state. Peek and dismissed both map to the store's
 * `panelState: "closed"`, and that is deliberate rather than a shortcut:
 * `panelBusy()` freezes travel and every input bridge, and peek must not
 * freeze anything. The sheet is resting in space the room was not using, so
 * swiping the world above it still travels. `dismissed` is therefore shared
 * React state owned by PlacardLayer rather than store state: all resident
 * sections keep the same viewing detent, while the store keeps meaning
 * exactly what it meant before — "the panel owns the viewport".
 *
 * The sheet is always mounted and its content frame is content-height up to a
 * viewport-safe cap; the three detents are three values of a translateY. The
 * material shell extends farther below the viewport, but never participates
 * in measurement. That is what lets one continuous drag run from expanded to
 * dismissed without reflowing the text on every gesture frame.
 *
 * WHICH GESTURE WINS. Three vertical drags compete on a phone:
 *
 *   1. ScrollBridges re-maps a vertical swipe into lateral world travel. It
 *      listens on drei's scroll container, which is NOT an ancestor of this
 *      sheet, so a touch that starts on the sheet never reaches it — the two
 *      are separated by geometry, not by a guard. Above the sheet the swipe
 *      travels; on the sheet it does not. That is also why peek has to leave
 *      panelState alone: the freeze is what would break travel above.
 *   2. The inner scroller. In PEEK it is `overflow: hidden`, so there is
 *      nothing in the sheet that could want a vertical drag and the sheet
 *      takes all of them: up expands, down dismisses. In EXPANDED the
 *      scroller wins, with one exception.
 *   3. That exception is the pull-down, which is the gesture this file
 *      already had: a downward drag that BEGINS with the content at
 *      scrollTop 0. It used to dismiss; it now collapses to peek, and only a
 *      long pull or a hard fling carries through to dismissed. Arming on
 *      scrollTop at touchstart rather than during the move is what keeps it
 *      from stealing the tail of a flick that scrolled up to the top.
 *
 * Close paths: the chevron, the X, a downward drag, and browser back — the
 * ones that leave EXPANDED all funnel through history.back() → popstate →
 * "closing", so the pushed history entry is always consumed. */
function MobileUnitPanel({
  body,
  unitIndex,
  active,
  secretActive,
  dismissed,
  setDismissed,
}: {
  body: React.ReactNode;
  unitIndex: number;
  active: boolean;
  secretActive: boolean;
  dismissed: boolean;
  setDismissed: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const activeUnit = useStacks((s) => s.activeUnit);
  const modalOpen = useStacks((s) => s.modalOpen);
  const panelState = useStacks((s) => s.panelState);
  const unit = UNITS[unitIndex]!;
  const side = unitIndex < activeUnit ? -1 : unitIndex > activeUnit ? 1 : 0;
  const sheetGeometry = mobileSheetGeometry(panelState);
  const expanded = sheetGeometry.expanded;
  const metrics = useSheetMetrics();
  const reduceMotion = useStacksReducedMotion();
  const sheetHeaderPx = sheetGeometry.headerPx;

  // Each unit owns a resident sheet. The previous shared sheet swapped its
  // body first, learned the new scrollHeight on a later ResizeObserver frame,
  // then corrected translateY on a third frame. That race produced the large
  // one-frame jumps captured by the mobile stress trace. Resident sheets keep
  // their own body, measurement, scroll position and title; section travel
  // only crossfades/translates complete already-measured cards, as desktop
  // does. Nothing inside a sheet changes identity during the transition.
  const shownSlug = unit.slug;

  const scrollRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentFrameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Mobile keeps one translucent material surface to make text readable over
  // the rendered room. Inner cards retain their contrasting fills but not a
  // second backdrop blur, and the sheet owns the scroll-edge dissolve.
  const edges = useScrollEdges(scrollRef, expanded && active);

  // One scroller serves seven placards and all three detents, so its
  // scrollTop outlives both the document in it and the pose it was set in.
  // Reset it whenever what is being read changes identity:
  //
  //  • A UNIT change swaps the body for a different document, where the old
  //    offset points at nothing in particular. It also clamps silently —
  //    travelling from Musings (3310px of content) to Systems (1078px) left
  //    the reader 295px down a placard they never opened.
  //  • Leaving EXPANDED, because showing the title and the opening lines is
  //    the whole job of peek. Collapsing at scrollTop 485 put the middle of a
  //    paragraph in the peek window with no heading above it.
  //
  // The cost is that re-expanding starts at the top rather than where you
  // left off, and that is the deliberate half of the trade: peek is a window
  // onto this same scroller, so it cannot both hold your place and be a
  // preview of the opening. Peek being readable at a glance wins — it is the
  // state the visitor is in by default.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [expanded, shownSlug]);

  // The sheet is only as tall as the document it contains, capped below the
  // safe-area top. A short placard therefore reads as a deliberate card
  // instead of a nearly empty full-screen layer. Height changes while PEEKED
  // are paired with an immediate y correction in a layout effect below, so
  // the visible title window remains fixed even as the off-screen body swaps.
  const vh = metrics?.vh ?? 0;
  const peek = metrics?.peek ?? 0;
  const materialOverscan = mobileSheetMaterialOverscan(vh);
  const [naturalHeight, setNaturalHeight] = useState(0);
  useLayoutEffect(() => {
    const content = contentRef.current;
    const scroll = scrollRef.current;
    if (!content || !scroll) return;
    const measure = () => {
      const style = getComputedStyle(scroll);
      const padding =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom);
      const next = Math.ceil(sheetHeaderPx + content.scrollHeight + padding);
      setNaturalHeight((previous) =>
        Math.abs(previous - next) < SHEET_HEIGHT_EPSILON_PX ? previous : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    for (const child of Array.from(content.children)) ro.observe(child);
    const mo = new MutationObserver(measure);
    mo.observe(content, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [shownSlug, metrics, sheetHeaderPx]);
  const contentHeight = Math.max(peek, naturalHeight || peek);
  const requestedHeight =
    vh && contentHeight >= vh - SHEET_MAX_SNAP_PX ? vh : contentHeight;
  // The content frame may be shorter than requestedHeight because max-height
  // clears the dynamic viewport and its safe area. The material shell is
  // deliberately taller, so drag detents and camera coverage measure this
  // inner frame rather than the shell.
  const [sheetHeight, setSheetHeight] = useState(0);
  useEffect(() => {
    const frame = contentFrameRef.current;
    if (!frame) return;
    const measure = () => {
      const next = frame.getBoundingClientRect().height;
      setSheetHeight((previous) =>
        Math.abs(previous - next) < SHEET_HEIGHT_EPSILON_PX ? previous : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [requestedHeight]);
  const renderedHeight = sheetHeight || requestedHeight;
  // Starts off the bottom of the screen, so the sheet's first move is to rise
  // into peek with the room rather than to drop out of a full-screen pose it
  // was never in.
  const y = useMotionValue(
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  // A dismissed sheet still has to stay mounted: its content is the source
  // for the animated chip label, and reopening should return to the same
  // physical sheet rather than construct a new one at the bottom edge. Keep
  // a separate opacity channel so a late content-height measurement cannot
  // expose that parked sheet for one frame. About and Talks are tall enough
  // to make that stale-height frame cover the viewport; the shorter units
  // happened to hide the bug below the fold.
  const sheetOpacity = useMotionValue(1);
  const [sheetParked, setSheetParked] = useState(false);
  const sheetParkedRef = useRef(false);
  const parkSheet = useCallback((parked: boolean) => {
    sheetParkedRef.current = parked;
    setSheetParked(parked);

    const panel = panelRef.current;
    panel?.toggleAttribute("data-sheet-parked", parked);
    panel?.classList.toggle("invisible", parked);
    panel?.classList.toggle("visible", !parked);

    // Every resident reacts to the shared detent, but only the active one may
    // paint glass. Re-showing all seven here stacks seven translucent fills
    // into an opaque white slab and can expose a tall inactive shell above a
    // short active sheet.
    const material = materialRef.current;
    const materialHidden = parked || !active;
    material?.toggleAttribute("data-sheet-parked", parked);
    material?.classList.toggle("invisible", materialHidden);
    material?.classList.toggle("visible", !materialHidden);
  }, [active]);
  // A book modal takes the viewport, so the sheet gets out of its way rather
  // than sitting behind it at z-40. The hidden reading room does the same:
  // its reveal is a whole-bay scene change, and leaving the Book Notes sheet
  // over it made the finished room look like background decoration. Unlike a
  // user dismissal, this temporary hide does not leave a chip behind; closing
  // the case restores the exact sheet detent the visitor had before.
  const hidden = dismissed || modalOpen || secretActive;
  const interactive = active && !hidden;
  // The collapsed chip is resident for the same reason as the sheet. Framer's
  // declarative entrance briefly reapplied its `initial` opacity on the render
  // where the sheet became parked (measured as 1 → 0 → 1 on one frame). A
  // stable pair of motion values has exactly one writer and therefore cannot
  // replay merely because some neighboring state committed.
  const chipOpacity = useMotionValue(0);
  const chipY = useMotionValue(12);
  const chipVisibility = useMotionValue<"visible" | "hidden">("hidden");
  // Exactly one resident may own the chip: the active one. The DISMISSED
  // detent itself is shared above the residents, because it is a viewing
  // preference: section travel changes the chip's content, not its pose.
  const chipActive = active && hidden && !modalOpen && !secretActive;
  useEffect(() => {
    // A section change is not a chip dismissal. The outgoing resident must
    // relinquish the single mobile chip slot synchronously, otherwise its
    // 120ms exit can paint over the incoming resident sheet. The active
    // resident still gets the full fade/slide choreography below when the
    // visitor explicitly dismisses or restores it.
    if (!active) {
      chipOpacity.stop();
      chipY.stop();
      chipOpacity.set(0);
      chipY.set(8);
      chipVisibility.set("hidden");
      return;
    }
    if (chipActive) {
      chipVisibility.set("visible");
      chipOpacity.set(0);
      chipY.set(12);
      const fade = animate(chipOpacity, 1, {
        duration: reduceMotion ? 0 : 0.18,
        delay: reduceMotion ? 0 : 0.12,
        ease: "easeOut",
      });
      const travel = animate(chipY, 0, {
        duration: reduceMotion ? 0 : 0.22,
        delay: reduceMotion ? 0 : 0.12,
        ease: [0.16, 1, 0.3, 1],
      });
      return () => {
        fade.stop();
        travel.stop();
      };
    }
    const fade = animate(chipOpacity, 0, {
      duration: reduceMotion ? 0 : 0.12,
      ease: "easeOut",
      onComplete: () => chipVisibility.set("hidden"),
    });
    const travel = animate(chipY, 8, {
      duration: reduceMotion ? 0 : 0.12,
      ease: "easeOut",
    });
    return () => {
      fade.stop();
      travel.stop();
    };
  }, [active, chipActive, chipOpacity, chipVisibility, chipY, reduceMotion]);
  const pose =
    expanded && !modalOpen && !secretActive
      ? "expanded"
      : hidden
        ? "hidden"
        : "peek";
  const restY = mobileSheetRestY(pose, renderedHeight, peek);
  const restRef = useRef(restY);
  restRef.current = restY;
  const settle = useCallback(() => {
    animate(y, restRef.current, SHEET_SPRING);
  }, [y]);
  const poseRef = useRef<typeof pose | null>(null);
  useEffect(() => {
    // Before the viewport is measured every detent is zero, which is the
    // expanded pose — animating to it would flash a full-screen sheet.
    if (!metrics) return;
    const changedPose = poseRef.current !== pose;
    poseRef.current = pose;
    if (changedPose) {
      parkSheet(false);
      if (pose === "hidden") {
        const travel = animate(y, restRef.current, SHEET_SPRING);
        if (modalOpen) {
          // The modal owns the whole viewport. There is no sheet-to-chip
          // handoff to show, so retire the sheet immediately behind it.
          sheetOpacity.set(0);
          parkSheet(true);
          return () => travel.stop();
        }
        // Fade only after the downward travel is legible. The chip begins its
        // own entrance at the same beat, so the two read as one handoff rather
        // than a full sheet blinking into an unrelated control.
        const fade = animate(sheetOpacity, 0, {
          duration: reduceMotion ? 0 : 0.18,
          delay: reduceMotion ? 0 : 0.08,
          ease: "easeOut",
          onComplete: () => {
            parkSheet(true);
            // Content can resize while this is travelling. Once the sheet is
            // invisible, adopt the latest endpoint atomically so no later
            // measurement can expose a stale sliver.
            y.stop();
            y.set(restRef.current);
          },
        });
        return () => {
          travel.stop();
          fade.stop();
        };
      }
      sheetOpacity.set(1);
      settle();
      return;
    }
  }, [
    metrics,
    modalOpen,
    parkSheet,
    pose,
    reduceMotion,
    secretActive,
    settle,
    sheetOpacity,
    y,
  ]);
  // A content swap may change the off-screen shell height. Correct its y in a
  // layout effect, before paint, so the constant-height peek window and its
  // grabber never jump. Only real detent changes deserve an animated spring.
  // While a dismissal is travelling, leave its endpoint alone; once parked,
  // snap the invisible box to the latest height.
  const heightPoseRef = useRef<typeof pose | null>(null);
  useLayoutEffect(() => {
    const changedPose = heightPoseRef.current !== pose;
    heightPoseRef.current = pose;
    if (changedPose) return;
    if (!metrics || pose === "expanded") return;
    if (pose === "hidden" && !sheetParkedRef.current) return;
    y.stop();
    y.set(restY);
  }, [metrics, pose, restY, y]);

  // The sheet stays MOUNTED at every width — the 1200px utility is a display
  // rule, not a conditional render — so anything this component publishes about
  // the screen has to be gated on the mobile layout actually being the one
  // in force. Without this the desktop scene would be recentred around a
  // sheet that is `display: none`, since CameraRig treats any non-zero
  // coverage as authoritative and drops its own fallback.
  const [narrow, setNarrow] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(STACKS_MOBILE_QUERY);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // How much of the viewport the sheet is covering, for CameraRig's frustum
  // offset: the room is centred in what the sheet has LEFT, not in the
  // canvas. Published off the motion value's change stream rather than off
  // React state, because the detents are only three of the values a drag
  // passes through and the whole point is that the scene tracks the finger.
  // `panelCoverageRef` is a plain mutable ref, so this is a number write per
  // frame and no render. Clamped at the top because the drag deliberately
  // overshoots above full height (the resisted branch in the gesture).
  useEffect(() => {
    if (!active) return;
    const publish = (value: number) => {
      panelCoverageRef.current =
        narrow && vh
          ? mobileSheetCameraCoverage(renderedHeight, value, peek, vh)
          : 0;
    };
    publish(y.get());
    const unsubscribe = y.on("change", publish);
    return () => {
      unsubscribe();
      panelCoverageRef.current = 0;
    };
  }, [active, y, vh, narrow, peek, renderedHeight]);

  // Opening from anywhere lands on expanded, so a unit tapped in the room
  // while the sheet was dismissed comes back to peek when it closes rather
  // than vanishing again.
  useEffect(() => {
    if (active && expanded) setDismissed(false);
  }, [active, expanded, setDismissed]);

  // Any press in the exposed room collapses an expanded sheet. The section
  // rail is excluded because its own click handler collapses AND completes
  // the requested navigation; pre-closing here would make that handler see a
  // transitional state and lose the destination.
  useEffect(() => {
    if (!active || !expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-stacks-mobile-panel]")) return;
      if (target.closest(".stacks-unit-rail-mobile")) return;
      closeStacksPanel();
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
  }, [active, expanded]);

  // "opening" and "closing" are the intervals where the sheet is between
  // detents, and they used to be resolved by framer — onLayoutAnimationComplete
  // promoted "opening", AnimatePresence's onExitComplete settled "closing".
  // Neither fires now: the sheet no longer morphs out of the chip and no
  // longer unmounts to collapse. So the transitional states are resolved on
  // the clock instead, at roughly the spring's settling time. Doing it here
  // rather than off the animation's finished promise keeps it deterministic —
  // a promise that a resize or a second gesture interrupts would strand
  // panelState mid-transition, and travel is frozen the whole time it is.
  useEffect(() => {
    if (panelState !== "opening" && panelState !== "closing") return;
    const settled = panelState === "opening" ? "open" : "closed";
    const timeout = setTimeout(() => {
      const s = useStacks.getState();
      if (s.panelState === panelState) s.setPanelState(settled);
    }, 280);
    return () => clearTimeout(timeout);
  }, [panelState]);

  // Widening past the md breakpoint with the panel up strands the frozen
  // travel state — fold the panel immediately.
  useEffect(() => {
    const mq = window.matchMedia(STACKS_DESKTOP_QUERY);
    const onChange = () => {
      if (mq.matches && useStacks.getState().panelState !== "closed") {
        useStacks.getState().setPanelState("closed");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Each of these can refuse — openStacksPanel bails while a modal is up or
  // while a previous close is still unwinding, closeStacksPanel bails unless
  // the sheet is actually expanded. A refusal leaves `restY` where it was, so
  // nothing would re-run the settle effect and a half-finished drag would be
  // left stranded mid-screen. Spring it back by hand in exactly that case.
  const expand = useCallback(() => {
    setDismissed(false);
    const before = useStacks.getState().panelState;
    openStacksPanel();
    if (useStacks.getState().panelState === before) settle();
  }, [setDismissed, settle]);
  const collapse = useCallback(() => {
    setDismissed(false);
    closeStacksPanel();
    if (useStacks.getState().panelState === "closed") settle();
  }, [setDismissed, settle]);
  const dismiss = useCallback(() => {
    setDismissed(true);
    closeStacksPanel(); // no-op unless we are leaving expanded
  }, [setDismissed]);
  const restoreFromChip = useCallback(() => {
    // Restore visibility while the sheet is still parked entirely below the
    // viewport. The following state change springs it into peek; doing these
    // in the opposite order creates a one-frame invisible response to tap.
    parkSheet(false);
    sheetOpacity.set(1);
    setDismissed(false);
  }, [parkSheet, setDismissed, sheetOpacity]);

  // ONE title per sheet, and it is the unit's own name.
  //
  // The header prints `unit.label`, and the body's first heading is hidden
  // only when it says the same thing. This used to HOIST that heading into
  // the header instead, because the labels and the sections disagreed —
  // "Training" over a body that said "Weightlifting" — but the labels now
  // come from the sections' own markup, so there is nothing left to reconcile
  // and hoisting only does damage: Systems is a container of three sections
  // (Personal Operating Manual, Core Daily Routine, quotes), so hoisting its
  // FIRST heading titled the whole sheet after a third of its contents AND
  // hid that sub-section's name, leaving the rail and the sheet disagreeing —
  // the exact complaint the labels were changed to fix.
  //
  // Matching rather than hoisting degrades correctly: a body whose heading
  // matches loses the duplicate, a body with no heading (About) keeps the
  // label, and a container keeps its own name with every sub-heading intact.
  //
  // Marking the node and hiding it from CSS leaves the body's own markup
  // alone, which matters because these headings come from the shared site
  // sections that the desktop dock still renders in full.
  const title = unit.label;
  const ShownIcon = unit.icon;
  const bodyRepeatsTitle =
    shownSlug === "books" ||
    shownSlug === "training" ||
    shownSlug === "talks" ||
    shownSlug === "projects" ||
    shownSlug === "blog";
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const apply = () => {
      // This copy lives inside a draggable sheet, so an image is content, not
      // a separate native drag source. Set the HTML behavior as well as the
      // WebKit CSS below; dynamically populated carousels are covered by the
      // same subtree observer.
      for (const draggable of el.querySelectorAll("img, a"))
        draggable.setAttribute("draggable", "false");
      const first = el.querySelector(".placard-section-heading, h1, h2");
      const dup = !!first && norm(first.textContent ?? "") === norm(title);
      for (const h of el.querySelectorAll(".placard-section-heading, h1, h2")) {
        const duplicate = dup && h === first;
        h.toggleAttribute("data-dup-title", duplicate);
        // Systems is a container whose Manual/Routine headings must remain
        // visible below the sheet's h2. Their shared flat-page components
        // correctly author h1, so override only this mobile copy's a11y level
        // rather than weakening the document-page outline.
        if (h.tagName === "H1" && !duplicate) {
          h.setAttribute("role", "heading");
          h.setAttribute("aria-level", "3");
          h.setAttribute("data-sheet-subheading", "");
        } else if (h.hasAttribute("data-sheet-subheading")) {
          h.removeAttribute("role");
          h.removeAttribute("aria-level");
          h.removeAttribute("data-sheet-subheading");
        }
      }
    };
    apply();
    // A section swap can commit before its shared body has populated.
    // Attributes are deliberately NOT watched: this writes one, and watching
    // them would feed the observer its own output.
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [shownSlug, title]);

  // Only fade the peek window's bottom edge if the placard actually
  // continues past it — the same rule the scroll edges follow, and the
  // reason a two-line placard would get no phantom dissolve.
  const [peekOverflows, setPeekOverflows] = useState(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !peek) return;
    // Two elements in here are the full height of the scroller no matter what
    // is in them, and measuring either gives a number that can never be less
    // than the viewport it is being compared against:
    //   • the SCROLLER, because scrollHeight is floored at client height;
    //   • the BODY wrapper, because `min-h-full` is what centres a short
    //     placard when the sheet is expanded.
    // Both have been that bug already. So descend past the wrapper and
    // measure the real content, falling back to the scroller's own children
    // if the wrapper is not there.
    const contentOf = () => {
      const body = el.querySelector(".placard-body") ?? el;
      const kids = Array.from(body.children);
      if (!kids.length) return 0;
      // The content's own EXTENT, top to bottom — deliberately not measured
      // from the scroller's origin. Once the sheet is expanded the wrapper
      // centres a short placard, which would fold half the leading whitespace
      // into a from-the-origin measurement and flip this answer purely
      // because the sheet opened.
      let top = Infinity;
      let bottom = -Infinity;
      for (const k of kids) {
        const r = k.getBoundingClientRect();
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      }
      return bottom - top;
    };
    const update = () =>
      setPeekOverflows(contentOf() > peek - sheetHeaderPx + 4);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const body = el.querySelector(".placard-body") ?? el;
    for (const child of Array.from(body.children)) ro.observe(child);
    // A section swap and async card media can both change the real extent.
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [peek, shownSlug, sheetHeaderPx]);

  // The drag. Hand-rolled and non-passive rather than framer's drag: framer
  // sets touch-action:none on the element it drags, which kills the inner
  // scroll outright.
  //
  // It listens for BOTH touch and mouse, and the mouse half is the fix for
  // "the sheet has a drag but doesn't seem to work". Measured before
  // changing anything (scratchpad placard/drag.js, real CDP input rather
  // than synthesised events): a touch drag on the grabber, on the header and
  // on the body all already tracked the finger exactly 1:1 (-300px of pull
  // moved the sheet -300.00px) and snapped to expanded. A MOUSE drag on the
  // same grabber moved it 0px, because nothing here listened for one. The
  // sheet renders below the md breakpoint, which is a narrow desktop window
  // as well as a phone, and that is where a pointer with no touch lands.
  //
  // Pointer Events would cover both in one path, but they cannot: stopping
  // the browser's own scrolling under a pointer drag needs touch-action:
  // none, which is exactly the thing that would kill the inner scroller.
  // Touch events can preventDefault per move instead, so the touch half
  // keeps them and the mouse half is added alongside.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !metrics) return;
    let startY = 0;
    let lastY = 0;
    // Velocity is sampled on its own clock rather than per move. Two touchmoves
    // can land in the same millisecond — a coalesced burst, or anything
    // dispatching them synchronously — and dividing by a sub-millisecond dt
    // turns a 24px step into hundreds of px/ms, which read as a throw and sent
    // an ordinary collapse straight out to the chip.
    let sampleY = 0;
    let sampleT = 0;
    let velocity = 0; // px/ms, positive downward
    let base = 0;
    let owned: boolean | null = null; // null until the drag arms
    // Whether the gesture STARTED over the scroller. Read at arm time instead
    // of the live target: the pointer can cross out of the scroller inside the
    // 6px before the drag arms, and asking where it is now rather than where
    // it began hands an expanded-sheet gesture down the wrong branch.
    let startInScroller = false;

    /** Set the frame the gesture is measured against. */
    const begin = (clientY: number, ts: number, target: EventTarget | null) => {
      y.stop();
      startY = lastY = sampleY = clientY;
      sampleT = ts;
      velocity = 0;
      owned = null;
      base = y.get();
      // Resolved once, at the start: whether the scroller is at its top is a
      // property of the gesture's origin, not of the frame it is asked in.
      startInScroller =
        target instanceof Element &&
        !!target.closest("[data-stacks-scrollable]");
    };
    /** Track the pointer 1:1. Returns whether the sheet took the gesture, so
     * the caller can suppress whatever the platform would otherwise do with
     * it — a native scroll on touch, a text selection on the mouse. */
    const move = (clientY: number, ts: number) => {
      const dy = clientY - startY;
      if (owned === null) {
        if (Math.abs(dy) < DRAG_ARM_PX) return false;
        // Peek has no scroller to compete with. Expanded content always stays
        // native—even a downward pull from scrollTop 0—so iOS/macOS can render
        // their normal elastic overscroll. The grabber and header remain sheet
        // drag handles because gestures beginning there are outside scroller.
        owned = !expanded || !startInScroller;
      }
      if (!owned) return false;
      // 6ms is under one frame at 120Hz, so a real touch stream still samples
      // on every move while a same-tick burst samples on none of them.
      if (ts - sampleT >= VELOCITY_SAMPLE_MS) {
        velocity = (clientY - sampleY) / (ts - sampleT);
        sampleY = clientY;
        sampleT = ts;
      }
      lastY = clientY;
      const next = base + dy;
      // Above full height there is nothing left to reveal, so resist and
      // clamp to the exact range covered by the material overscan.
      y.set(mobileSheetRubberBandY(next, metrics.vh));
      return true;
    };
    /** Snap to whichever detent the throw asked for. */
    const end = (ts: number) => {
      if (!owned) {
        owned = null;
        return false;
      }
      owned = null;
      // A finger that came to rest before lifting placed the sheet, it did not
      // throw it — so the velocity from before the pause must not carry.
      if (ts - sampleT > VELOCITY_STALE_MS) velocity = 0;
      const dy = lastY - startY;
      const committed =
        Math.abs(dy) > DRAG_STEP_PX || Math.abs(velocity) > FLING;
      if (!committed) {
        settle(); // stayed put; spring back to where it was
        return true;
      }
      if (dy < 0) {
        // Nothing above peek to go to, either because the sheet is already
        // full height or because the placard already fits in the peek window.
        if (expanded || !peekOverflows) settle();
        else expand();
        return true;
      }
      // Downward. From expanded a long pull or a hard throw skips peek and
      // goes straight out, which is what a flick off a full sheet means.
      const skip =
        dy > metrics.vh * 0.45 ||
        (velocity > FLING_SKIP && dy > FLING_SKIP_MIN_PX);
      if (expanded && !skip) collapse();
      else dismiss();
      return true;
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      begin(t.clientY, e.timeStamp || performance.now(), e.target);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (move(t.clientY, e.timeStamp || performance.now())) {
        e.preventDefault();
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      end(e.timeStamp || performance.now());
    };
    /** A cancelled touch is not a completed gesture, and routing it through
     * `end` made it one: an incoming call, a system edge-swipe or the browser
     * taking the stream over would run the commit logic and expand, collapse
     * or dismiss the sheet on the visitor's behalf. Cancellation means put it
     * back. */
    const onTouchCancel = () => {
      if (owned) settle();
      owned = null;
    };

    // ── The mouse half ────────────────────────────────────────────────
    // Same gesture, different plumbing. The move and up listeners go on the
    // window rather than the panel so a drag that leaves the sheet — which
    // is most of them, since the sheet is what is being moved out from under
    // the cursor — keeps tracking.
    let mouseDown = false;
    let dragged = false;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      mouseDown = true;
      dragged = false;
      begin(e.clientY, e.timeStamp || performance.now(), e.target);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDown) return;
      if (!move(e.clientY, e.timeStamp || performance.now())) return;
      // preventDefault does not stop a selection that has already started, so
      // clear it and turn selection off for the rest of the drag.
      if (!dragged) {
        dragged = true;
        panel.style.userSelect = "none";
        window.getSelection()?.removeAllRanges();
      }
      e.preventDefault();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!mouseDown) return;
      mouseDown = false;
      panel.style.userSelect = "";
      end(e.timeStamp || performance.now());
    };
    // A drag that started on a link or a card must not also open it. The
    // click lands after mouseup, so swallow exactly the one that follows a
    // gesture the sheet took.
    const onClickCapture = (e: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      e.preventDefault();
      e.stopPropagation();
    };

    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchmove", onTouchMove, { passive: false });
    panel.addEventListener("touchend", onTouchEnd, { passive: true });
    panel.addEventListener("touchcancel", onTouchCancel, { passive: true });
    panel.addEventListener("mousedown", onMouseDown);
    panel.addEventListener("click", onClickCapture, { capture: true });
    window.addEventListener("mousemove", onMouseMove, { passive: false });
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchmove", onTouchMove);
      panel.removeEventListener("touchend", onTouchEnd);
      panel.removeEventListener("touchcancel", onTouchCancel);
      panel.removeEventListener("mousedown", onMouseDown);
      panel.removeEventListener("click", onClickCapture, { capture: true });
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      panel.style.userSelect = "";
    };
  }, [metrics, expanded, peekOverflows, y, settle, expand, collapse, dismiss]);

  // Only the scrolled-away TOP edge dissolves. A bottom mask laid a white
  // gradient over full-bleed talk thumbnails and looked like part of the
  // media itself. The scroller's physical bottom is already clipped by the
  // sheet, so it needs no second visual boundary.
  const sheetMask = edges.top
    ? `linear-gradient(to bottom, transparent 0, black ${FADE_PX}px)`
    : undefined;

  // One frame of nothing rather than one frame of a full-screen sheet: the
  // detents are derived from a measured viewport, and before that measurement
  // every one of them is zero.
  if (!metrics) return null;

  return (
    <div className="min-[1200px]:hidden">
      <AnimatePresence>
        {active && expanded && (
          <motion.div
            key="dim"
            className="pointer-events-none fixed inset-0 z-30 bg-background/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>
      {/* The glass is a sibling of the fading content, never its child. An
          opacity below one on any ancestor makes a backdrop root; when the
          material lived inside the crossfade below, browsers could not sample
          the room until that opacity reached exactly one, so the blur popped
          in on the final frame. The resident material switches immediately
          between identical aligned surfaces while only their contents fade. */}
      <motion.div
        ref={materialRef}
        aria-hidden
        data-stacks-sheet-material=""
        data-stacks-panel-unit={shownSlug}
        style={{
          y,
          bottom: -materialOverscan,
          height: requestedHeight + materialOverscan,
          maxHeight: `calc(100dvh - env(safe-area-inset-top, 0px) - 1.25rem + ${materialOverscan}px)`,
        }}
        className={`stacks-sheet pointer-events-none fixed left-0 right-0 z-40 mx-auto w-[calc(100%-2.5rem)] max-w-[700px] rounded-t-3xl border-x border-t border-foreground/[0.07] shadow-[0px_-4px_18px_rgba(0,0,0,0.055)] ${
          active && !sheetParked ? "visible" : "invisible"
        }`}
      />
      {/* Section opacity belongs to content alone. This layer intentionally
          contains no backdrop-filter, so its crossfade cannot interrupt the
          continuously rendered glass above. */}
      <motion.div
        aria-hidden={!active}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: reduceMotion ? 0 : active ? 0.22 : 0.12 }}
        className="pointer-events-none fixed inset-0 z-[41]"
      >
        <motion.div
          ref={panelRef}
          data-stacks-mobile-panel=""
          data-stacks-panel={active ? "" : undefined}
          data-stacks-panel-unit={shownSlug}
          data-sheet={expanded ? "expanded" : hidden ? "dismissed" : "peek"}
          data-swap-direction={side < 0 ? "previous" : "next"}
          onDragStart={(event) => {
            // Safari makes images and anchors native drag sources. In a bottom
            // sheet that gesture competes with the sheet itself and leaves a
            // ghost card under the finger. Taps remain links; only native drag
            // behavior is suppressed.
            if ((event.target as Element).closest("img, a"))
              event.preventDefault();
          }}
          // No `transition` prop here on purpose. `y` is a MotionValue driven
          // imperatively by `animate(y, …, SHEET_SPRING)` in the gesture code,
          // and there is no declarative `animate` prop for a transition to
          // govern — one used to sit here and controlled nothing, which reads
          // like the spring lives here when it does not.
          style={{
            y,
            opacity: sheetOpacity,
            bottom: -materialOverscan,
            height: requestedHeight + materialOverscan,
            maxHeight: `calc(100dvh - env(safe-area-inset-top, 0px) - 1.25rem + ${materialOverscan}px)`,
          }}
          animate={{ x: reduceMotion || active ? 0 : side * SWAP_DISTANCE_PX }}
          transition={{ duration: reduceMotion ? 0 : active ? 0.22 : 0.12 }}
          // Never unmounted, only translated — see the header comment. Off the
          // bottom it must also be out of the tab order and out of the way of
          // taps on the room, which `inert` and pointer-events do between them.
          inert={!interactive}
          aria-hidden={!interactive}
          // Inset from both edges and capped, so the room runs down either side
          // of the sheet instead of being guillotined by it — and so the top
          // corners can stay rounded at every detent. They used to square off
          // at full height, which was right when the sheet went edge to edge
          // (two rounded corners at the very top of the screen framed slivers
          // of a room the sheet had just replaced) and is wrong now that it
          // never does. `left/right-0 + mx-auto` rather than a translate,
          // because the transform is already carrying the drag.
          //
          // The frosting is the sibling above. This layer owns interaction,
          // content geometry and the section crossfade, but no backdrop.
          className={`fixed left-0 right-0 z-40 mx-auto w-[calc(100%-2.5rem)] max-w-[700px] rounded-t-3xl ${
            interactive ? "pointer-events-auto" : "pointer-events-none"
          } ${sheetParked ? "invisible" : "visible"}`}
        >
          <div
            ref={contentFrameRef}
            className="flex min-h-0 w-full flex-col"
            style={{
              height: requestedHeight,
              maxHeight:
                "calc(100dvh - env(safe-area-inset-top, 0px) - 1.25rem)",
            }}
          >
            {/* The grabber is the whole discoverability story for the drag, and
            it is why the sheet does not need a caption explaining itself.
            There is no chevron beside it any more: a button that duplicated
            the gesture earned its space only while the gesture was in doubt. */}
            <button
              type="button"
              aria-label={
                expanded ? "Collapse section panel" : "Expand section panel"
              }
              onClick={expanded ? collapse : expand}
              className="stacks-sheet-grabber relative z-10 flex h-6 w-full items-start justify-center rounded-t-3xl pt-4 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/45"
            >
              <span
                aria-hidden
                className="h-1 w-10 rounded-full bg-foreground/25"
              />
            </button>
            <div className="relative z-10 flex h-10 items-center justify-between pl-5 pr-1">
              {/* Hoisted out of the body — see the effect above. It fades with
              the body it names, so a section change never shows one
              placard's title over another's content. */}
              <button
                type="button"
                aria-label={`${expanded ? "Collapse" : "Expand"} ${title} section panel`}
                onClick={expanded ? collapse : expand}
                data-stacks-swap-part="header"
                className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/45"
              >
                <ShownIcon
                  aria-hidden
                  weight="bold"
                  className="size-[1.375rem] shrink-0"
                />
                <h2 className="truncate font-serif text-xl font-semibold text-foreground">
                  {title}
                </h2>
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={dismiss}
                className="-my-0.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground focus-visible:ring-2 focus-visible:ring-foreground/45"
              >
                <XIcon className="size-5" weight="bold" />
              </button>
            </div>
            {/* The mobile sheet keeps its masked-scroller dissolve. The sheet
            behind is the one blurred surface; cards above it use translucent
            fills rather than trying to sample an already-filtered backdrop. */}
            <div className="relative min-h-0 flex-1">
              <div
                ref={scrollRef}
                tabIndex={interactive ? 0 : -1}
                aria-label={`${title} section content`}
                // Only tagged while it can actually scroll. The attribute is what
                // ScrollBridges' wheel handler bails on, and leaving it on an
                // `overflow: hidden` element would deaden a third of the screen
                // to the wheel on a narrow desktop window for no reason.
                data-stacks-scrollable={expanded ? "" : undefined}
                // Native overscroll is intentional. Expanded content owns its
                // full touch stream, including a downward pull at scrollTop 0;
                // sheet dragging remains available from the header/grabber.
                className={`stacks-scroll placard-scroll h-full px-5 pb-6 pt-3 font-serif text-muted-foreground ${
                  expanded ? "overflow-y-auto" : "overflow-hidden"
                }`}
                style={
                  expanded && sheetMask
                    ? { maskImage: sheetMask, WebkitMaskImage: sheetMask }
                    : undefined
                }
              >
                {/* Short placards sit centred once the sheet is at full height,
                which is the same thing the desktop dock does and for the same
                reason. Book Notes is 236px of content: pinned to the top of an
                844px sheet it left five sixths of the screen empty and read as
                a panel that had failed to load. Centred it reads as a short
                section, which is what it is.

                Only while EXPANDED. Peek must stay top-aligned — showing the
                title and the opening lines is its entire job — and on a tall
                placard `justify-center` is a no-op either way, since the
                content already exceeds the container. */}
                <div
                  ref={contentRef}
                  data-stacks-swap-part="body"
                  data-duplicate-section-title={
                    bodyRepeatsTitle ? "" : undefined
                  }
                  className="placard-body flex flex-col justify-start"
                >
                  {body}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
      <motion.button
        type="button"
        data-stacks-chip={active && chipActive ? "" : undefined}
        data-swap-direction={side < 0 ? "previous" : "next"}
        onClick={restoreFromChip}
        inert={!active || !chipActive}
        aria-hidden={!active || !chipActive}
        style={{
          opacity: chipOpacity,
          y: chipY,
          visibility: chipVisibility,
        }}
        className={`fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex h-11 w-fit max-w-[80vw] items-center gap-2 rounded-full border border-foreground/[0.06] bg-background/55 px-4 font-serif text-sm text-foreground shadow-[0px_3px_16px_rgba(0,0,0,0.07)] backdrop-blur-xl focus-visible:ring-2 focus-visible:ring-foreground/50 ${
          active && chipActive ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <span
          data-stacks-swap-part="chip"
          className="flex min-w-0 items-center gap-2"
        >
          <ShownIcon aria-hidden weight="bold" className="size-4 shrink-0" />
          <span className="truncate">{title}</span>
        </span>
        <CaretUpIcon className="size-3.5 shrink-0" weight="bold" />
      </motion.button>
    </div>
  );
}

export default function PlacardLayer({
  data,
  slots,
}: {
  data: StacksData;
  slots: StacksSlots;
}) {
  const activeUnit = useStacks((s) => s.activeUnit);
  const modalOpen = useStacks((s) => s.modalOpen);
  // Resident cards own content, measurement and scroll position. Their
  // three-position sheet pose remains one global preference, so dismissing
  // Book Notes and travelling to Weightlifting yields a Weightlifting chip,
  // never a new sheet plus the stale Book Notes chip.
  const [mobileDismissed, setMobileDismissed] = useState(false);
  // The unstable secret-room renderer is disabled; no hidden scene state may
  // suppress the ordinary placards or mobile sheet.
  const secretActive = false;

  const bodies: Record<(typeof UNITS)[number]["slug"], React.ReactNode> = {
    about: (
      <PlacardCard>
        <div className="flex items-start justify-between">
          <div className="text-sm leading-6">{slots.aboutIntro}</div>
        </div>
        <div className="flex flex-col items-center gap-2 pt-4">
          {slots.contact}
        </div>
        {/* Known photo-source links are mirrored into the DOM because canvas
            raycast targets have no focus order or accessible name. */}
        {PHOTO_SOURCES.length > 0 && (
          <nav aria-label="Photo sources" className="sr-only">
            <ul>
              {PHOTO_SOURCES.map((p) => (
                <li key={p.href}>
                  <a href={p.href} target="_blank" rel="noopener noreferrer">
                    {p.label} — source post
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {/* CC-BY attribution for the props. It stays off the glass, because
            the visible line was clutter in a room that has no other
            captions, but it is real text now rather than an HTML comment
            inside a hidden div. A comment is not content: it is not read by
            assistive tech, not surfaced by find-in-page, and not indexed, so
            the attribution was in the file without being anywhere a person
            could reach it. Same sr-only treatment as the photo sources
            directly above, and for the same reason.

            The roster link is the part the licence actually leans on. CC-BY
            4.0 lets the conditions be met by pointing at a resource holding
            the required information, and public/models/LICENSES.json ships
            and is served, so this is a real anchor rather than a path
            written out in prose.

            The names come from that same generated file, so a prop the
            owner picks tomorrow credits its author without anyone
            remembering to edit this line. */}
        <p className="sr-only">
          {`3D props include CC-BY work by ${AUTHOR_LIST}. `}
          <a href="/models/LICENSES.json">
            The full roster of models and their licences is published at
            /models/LICENSES.json
          </a>
          .
        </p>
      </PlacardCard>
    ),
    books: (
      // Heading above the card, which is what every other unit does — the
      // shared sections all render their h1 on the scene and the card below
      // it, and Books was the only one wearing its title inside the frame.
      //
      // The card itself is the link, so its authored shadow and focus state
      // stay attached to the same native surface as the content. Nothing
      // inside is focusable — the cover marquee is aria-hidden presentation and its
      // tooltips hang off plain divs — so there is no interactive control
      // for the anchor to swallow.
      // The HEADING is linked too, not just the card. He asked for two
      // things that only look contradictory: the title outside the card like
      // every other section, and "clicking anywhere on the book notes section"
      // going to the library. Wrapping the card alone satisfies the first and
      // quietly fails the second — the title stays dead, which is exactly the
      // part of "anywhere" a person aims at. The h2 remains the semantic
      // section heading; the anchor is its interactive text, not its replacement.
      <div className="flex flex-col gap-3">
        <h2 className="placard-section-heading w-fit text-xl font-semibold text-foreground">
          <Link
            href={booksHref()}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Browse the whole library at books.chappyasel.com"
            className="flex items-center gap-2 rounded-lg focus-visible:ring-2 focus-visible:ring-foreground/45"
          >
            <BooksIcon weight="duotone" className="size-6 shrink-0" />
            Book Notes
          </Link>
        </h2>
        <Link
          href={booksHref()}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Browse the whole library at books.chappyasel.com"
          className="rounded-3xl"
        >
          <PlacardCard>
            <BooksPlacard data={data} />
          </PlacardCard>
        </Link>
      </div>
    ),
    training: <div className="placard-sections">{slots.training}</div>,
    talks: <div className="placard-sections">{slots.talks}</div>,
    projects: <div className="placard-sections">{slots.projects}</div>,
    blog: <div className="placard-sections">{slots.blog}</div>,
    systems: (
      <div className="placard-sections flex flex-col gap-8">
        {slots.manual}
        {slots.routine}
        {/* .stacks-quotes rewrites desktop quotes white-on-dark-halo — see
            the style block. Mobile keeps the component's original dark-on-
            sheet treatment, and the flat page remains untouched. */}
        <div className="stacks-quotes">{slots.quotes}</div>
      </div>
    ),
  };

  return (
    <div className="font-serif text-muted-foreground">
      <style>{`
        /* No scrollbar gutter: with the panel gone the track would draw a
           grey rule straight down the scene. Mobile has a sheet-edge fade;
           desktop uses the generous viewport-edge padding as its affordance. */
        .stacks-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .stacks-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
        /* Desktop cards keep their authored fill, border, shadow, and
           backdrop-filter on the content element itself. Native scrolling
           therefore composites each card as one inseparable surface. */
        @media (min-width: 1200px) {
          /* Restore the material strength of the former desktop plates on the
             native surfaces. The explicit marker excludes nested language
             pills, so only the card-sized glass receives the wide scene blur. */
          [data-stacks-desktop-panel] [data-placard-surface] {
            background-color: hsl(var(--background) / 0.70) !important;
            backdrop-filter: blur(80px) saturate(0.35) brightness(1.45) !important;
            -webkit-backdrop-filter: blur(80px) saturate(0.35) brightness(1.45) !important;
          }
          .dark [data-stacks-desktop-panel] [data-placard-surface] {
            background-color: hsl(var(--background) / 0.50) !important;
            backdrop-filter: blur(80px) saturate(0.35) brightness(0.8) !important;
            -webkit-backdrop-filter: blur(80px) saturate(0.35) brightness(0.8) !important;
          }
        }
        /* ── The sheet ────────────────────────────────────────────────
           Mobile's one blurred surface sits above a pastoral horizon with a
           lot of cream and yellow; saturating that backdrop made the surface
           read as tinted glass.
           A nearly desaturated sample retains the scene's light and shadow
           without inheriting its hue; the sheet's own neutral white/black
           fill keeps the global warm reading palette from reintroducing a
           cast here. Once neutral,
           the fill can also be thinner without turning the sheet yellow
           again. Light sits at saturate 0.15 / brightness 1.28 / 0.54
           white fill. Round-2 history: 1.18 read grey, 1.32 was still
           "muted / not white enough" on the owner's phone, and at 0.35
           saturate a full-lawn backdrop still left a mint cast (~Δ18
           green over neutral). Round 3: even 0.15 + 0.40 still read
           "muddied" against the owner's reference (the near-opaque warm
           sheet of the room era) — over an all-grass backdrop the
           legibility lever is FILL, not brightness, so the fill came up
           to 0.68 and brightness back down to 1.28 to keep the ghost of
           the lawn without clipping. Once the cards gained their own clean
           white fill, the sheet could come back down to 0.54: enough to
           neutralise the darker grass without flattening the card/sheet
           hierarchy into one white slab. It is the one surface whose
           backdrop is entirely grass.

           The sheet is the ONLY glass on mobile (the cards inside it have
           their own backdrop-filter stripped, since one blur cannot sample
           another), so it carries all of the legibility work by itself.

           It can hold a backdrop-filter at all only because nothing above
           it in the tree makes a backdrop root: the drag lives in this
           element's OWN transform, and an element's own transform does not
           cut it off from the backdrop behind its parent. */
        .stacks-sheet {
          --sheet-fill: rgb(255 255 255 / 0.54);
          background-color: var(--sheet-fill);
          backdrop-filter: blur(58px) saturate(0.15) brightness(1.28);
          -webkit-backdrop-filter: blur(58px) saturate(0.15) brightness(1.28);
        }
        @media (prefers-reduced-motion: reduce) {
          [data-stacks-desktop-panel] {
            transform: none !important;
            transition: none !important;
          }
          [data-stacks-desktop-panel][data-stacks-active] {
            opacity: 1 !important;
          }
          [data-stacks-desktop-panel]:not([data-stacks-active]) {
            opacity: 0 !important;
          }
          [data-stacks-swap-part] {
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
          }
        }
        .dark .stacks-sheet {
          --sheet-fill: rgb(0 0 0 / 0.08);
          backdrop-filter: blur(58px) saturate(0.35) brightness(0.9);
          -webkit-backdrop-filter: blur(58px) saturate(0.35) brightness(0.9);
        }
        /* On desktop the closing quotes float raw over the meadow with no
           glass behind them, and the round-2 glow treatment still lost to
           the lawn in light mode ("I really can't read it"). Over grass the
           only stable read is subtitle-style: white text with a dark halo,
           one treatment for both themes. The breakpoint and desktop-panel
           scope are both intentional: mobile keeps the original dark copy
           on its pale sheet, and Quotes.tsx also renders on the flat page,
           where white would vanish into the background. */
        @media (min-width: 1200px) {
          [data-stacks-desktop-panel] .stacks-quotes section {
            color: rgb(255 255 255 / 0.94);
            text-shadow: 0 1px 3px rgb(0 0 0 / 0.55), 0 0 14px rgb(0 0 0 / 0.4);
          }
          [data-stacks-desktop-panel] .stacks-quotes section footer {
            color: rgb(255 255 255 / 0.72);
          }
        }
        /* ── Type ─────────────────────────────────────────────────────
           One number scales the whole reading column. The panel's width is
           a clamp of the viewport (see --pw on the dock), and --ps is
           derived from --pw rather than from the viewport again, so the
           column and the type in it cannot scale apart, and neither of them
           steps: the placard used to jump 432 → 496px at the xl breakpoint
           and take its type across unchanged, which is the visible pop
           while resizing.

           14.0px at 1280 (the width the scene is composed against), 13.1px
           at the narrowest dock and 16.0px at the widest. Mobile keeps a
           flat 0.875rem, which is exactly what the sheet renders today. */
        .placard-scroll { --ps: 0.875rem; }
        @media (min-width: 1200px) {
          .placard-scroll { --ps: calc(0.4375rem + var(--pw, 31rem) * 0.0141); }
        }
        /* Every rem-sized Tailwind step in here becomes a multiple of --ps.
           The multipliers ARE Tailwind's own ratios against its 14px step,
           so at --ps: 0.875rem this map is a no-op — mobile renders exactly
           what it rendered before. Line heights go unitless for the same
           reason they have to: a fixed rem leading under a scaled font
           closes up as the column widens. */
        .placard-scroll .text-xs { font-size: calc(var(--ps) * 0.857); line-height: 1.333; }
        .placard-scroll .text-sm { font-size: var(--ps); line-height: 1.429; }
        .placard-scroll .text-base { font-size: calc(var(--ps) * 1.143); line-height: 1.5; }
        .placard-scroll .text-lg { font-size: calc(var(--ps) * 1.286); line-height: 1.556; }
        .placard-scroll .text-xl { font-size: calc(var(--ps) * 1.429); line-height: 1.4; }
        .placard-scroll .text-2xl { font-size: calc(var(--ps) * 1.714); line-height: 1.333; }
        .placard-sections section { margin-top: 0; }
        .placard-sections .mt-20 { margin-top: 0; }
        /* Four timeline markers cannot borrow the viewport's sm breakpoint:
           this reading column is narrow even on a 1440px screen. A stable
           2x2 grid keeps every label paired with its time and eliminates the
           orphan divider the flex-wrap version could leave on row two. */
        .placard-scroll [data-routine-timeline] {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        /* The placard's own scale for the shared sections: display sizes
           chosen for a full-width section overflow a reading column. Held
           above the map by specificity, deliberately. */
        @media (min-width: 1200px) {
          .placard-scroll .placard-sections h1,
          .placard-scroll .placard-section-heading {
            color: hsl(var(--foreground)) !important;
            font-size: calc(var(--ps) * 1.786) !important;
            line-height: 1.25;
          }
          .placard-scroll .placard-sections h1 svg,
          .placard-scroll .placard-section-heading svg {
            width: calc(var(--ps) * 1.786) !important;
            height: calc(var(--ps) * 1.786) !important;
          }
          /* Like the fixed chrome, desktop section titles sit on the scene,
             not on their cards. In light mode they need the quote's stable
             white-on-dark-halo treatment. Mobile is deliberately excluded:
             those same titles live on the pale sheet and stay dark. */
          html:not(.dark) [data-stacks-desktop-panel] .placard-sections h1,
          html:not(.dark) [data-stacks-desktop-panel] .placard-section-heading {
            color: rgb(255 255 255 / 0.94) !important;
            text-shadow: 0 1px 3px rgb(0 0 0 / 0.55), 0 0 14px rgb(0 0 0 / 0.4) !important;
          }
          html:not(.dark) [data-stacks-desktop-panel] .placard-sections h1 svg,
          html:not(.dark) [data-stacks-desktop-panel] .placard-section-heading svg {
            filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.55)) drop-shadow(0 0 7px rgb(0 0 0 / 0.4));
          }
        }
        .placard-scroll .placard-sections .text-2xl,
        .placard-scroll .placard-sections .sm\\:text-3xl,
        .placard-scroll .placard-sections .md\\:text-3xl { font-size: calc(var(--ps) * 1.286); line-height: 1.333; }
        .placard-scroll .placard-sections .text-lg { font-size: calc(var(--ps) * 1.143); line-height: 1.4; }
        /* Three talks, three cards the same shape, stacked. sm:grid-cols-2
           is a VIEWPORT breakpoint on a section that owns the full page
           width elsewhere; in a reading column it made two ~200px cards sit
           under a hero and read as an afterthought. And sm:col-span-2 in
           a one-column grid does not mean "full width" — it opens an
           implicit second column — so the hero's span has to go with it.
           Talks is the only section on the page using either class. */
        .placard-scroll .sm\\:grid-cols-2 { grid-template-columns: minmax(0, 1fr); }
        .placard-scroll .sm\\:col-span-2 { grid-column: auto; }
        /* Same width is not yet the same card: the hero also carried a
           display tier of its own (title 20px over 18, excerpt 16 over 14),
           which in a column this narrow reads as one card shouting. Every
           card title in the placard gets one size, and the hero's excerpt
           comes back to body size with the rest.

           1.143 rather than 1.286, and the difference is not taste. The
           non-hero titles carry text-lg, which the map above matches at
           (0,3,0) — HIGHER than this rule's (0,2,1) — so a bigger value here
           moved the hero UP and left its peers where they were, inverting
           the mismatch instead of closing it. Measured at 1440: 18.65px
           against 16.57px, when the whole point was one number. Matching the
           size the other cards already resolve to closes it with one value
           and no specificity games, and it leaves Projects and Musings
           untouched. */
        .placard-scroll .placard-sections h3 { font-size: calc(var(--ps) * 1.143); line-height: 1.4; }
        .placard-scroll .sm\\:col-span-2 .text-base { font-size: var(--ps); line-height: 1.429; }
        /* Mobile's sheet is the single backdrop-sampling surface. Its cards
           keep a stronger translucent fill for separation, but do not stack
           another expensive blur on top of the sheet. Desktop is deliberately
           excluded: there each card owns and moves with its native glass. */
        @media (width < 1200px) {
          /* The shared cards were authored for a full-width page and their
             20px inset looks pinched inside the sheet. Give image and copy the
             same 24px breathing room on every side, at every phone width. */
          .placard-scroll a.p-5 { padding: 1.5rem !important; }
          /* WebKit otherwise starts a native ghost-image drag before the
             sheet can claim the vertical gesture. The dragstart guard on the
             panel is the behavioral backstop; this prevents the gesture from
             being offered in the first place. */
          [data-stacks-mobile-panel] img,
          [data-stacks-mobile-panel] a {
            -webkit-user-drag: none;
          }
          [data-stacks-mobile-panel] img { user-select: none; }
          .placard-scroll [class*="backdrop-blur"] {
            border-radius: 1.25rem !important;
          }
          .placard-scroll [class*="backdrop-blur"] {
            background-color: hsl(var(--muted) / 0.20) !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          /* In light mode the sheet is deliberately translucent enough to
             show the meadow. Give cards a separate clean-white layer so
             they remain unmistakably above it instead of dissolving into
             the same grass-tinted material. Dark mode keeps the quieter
             theme-token fill above. */
          html:not(.dark) .placard-scroll [class*="backdrop-blur"] {
            background-color: rgb(255 255 255 / 0.56) !important;
          }
          /* Mirror that separation in dark mode: the sheet itself remains a
             light-touch veil over the meadow, while cards become the darker,
             more opaque reading surfaces in front of it. */
          .dark .placard-scroll [class*="backdrop-blur"] {
            background-color: rgb(0 0 0 / 0.42) !important;
          }
          /* sm: padding belongs to the shared full-page layout. The sheet is
             still a narrow reading column at 640–1199px, so keep every card
             on the same 20px inset as About and Books. */
          .placard-scroll .sm\\:p-6 { padding: 1.25rem !important; }
          .placard-scroll .sm\\:px-6 {
            padding-left: 1.25rem !important;
            padding-right: 1.25rem !important;
          }
          .placard-scroll .sm\\:pb-6,
          .placard-scroll .sm\\:pb-4 { padding-bottom: 1.25rem !important; }
          /* The sheet runs to the physical bottom of the screen, so the last
             line of a fully expanded placard would otherwise sit under the
             home indicator. Only the sheet's scroller — the desktop dock has
             no edge to clear. */
          [data-stacks-mobile-panel] .placard-scroll {
            padding-bottom: max(1.5rem, calc(env(safe-area-inset-bottom) + 0.75rem));
          }
          /* A body heading that only repeats the sheet's own title. Marked
             from JS by text match — see the effect in MobileUnitPanel. */
          [data-stacks-mobile-panel] [data-dup-title] { display: none; }
          /* Shared full-page sections author their own h1. Four mobile cards
             have exactly the same title hoisted into the resident sheet
             header; mark those bodies structurally so the duplicate cannot
             flash while an async section hydrates before the observer runs. */
          [data-stacks-mobile-panel] [data-duplicate-section-title] .placard-sections h1:first-of-type {
            display: none;
          }
          /* Book Notes authors its title as a direct h2 above its linked
             card rather than inside the placard-sections wrapper. The same structural
             repeat marker covers that variant without depending on an
             observer racing the first paint. */
          [data-stacks-mobile-panel] [data-duplicate-section-title] > :first-child > h2:first-child {
            display: none;
          }
          /* A subsection title belongs below the sheet title in the type
             hierarchy. Shared page sections use display sizes outside the
             sheet; mobile normalises them without touching desktop. */
          [data-stacks-mobile-panel] .placard-sections h1,
          [data-stacks-mobile-panel] .placard-section-heading {
            color: hsl(var(--foreground)) !important;
            font-size: 1rem !important;
            line-height: 1.35 !important;
            text-shadow: none !important;
          }
          [data-stacks-mobile-panel] .placard-sections h1 svg,
          [data-stacks-mobile-panel] .placard-section-heading svg {
            width: 1.125rem !important;
            height: 1.125rem !important;
          }
        }
        /* Kill the page-level scroll reveal inside the resident placards.
           Those bodies spend most of their life invisible/inert, so a
           viewport observer does not represent their actual activation and
           can leave them permanently in the reveal state. Worse,
           motion-blur-in-sm settles on
           filter: blur(0) grayscale(0), which is NOT filter: none, and that
           made every wrapper a permanent backdrop root — the real reason
           half the cards never blurred. Kill the animation itself rather
           than chasing the properties it leaves behind; targeting the motion
           class also covers touch, where the old perspective-based selector
           matched nothing at all. */
        .placard-scroll [class*="intersect:motion-"] {
          animation: none !important;
          filter: none !important;
          opacity: 1 !important;
        }
        /* Resident sections are revealed by panel activation, not the flat
           page's viewport animation, so clear its resting transform too. */
        .placard-scroll [class*="intersect:motion-"] {
          transform: none !important;
        }
      `}</style>
      {/* Desktop: resident right dock, crossfaded by activeUnit. Wider now
          that no container has to look comfortable at that width — the
          scene keeps the left, the reading column takes the right.
          `--pw` and the width it drives are one expression on purpose; the
          type below is derived from the same value, so the column and its
          contents cannot scale apart. */}
      <div
        className={`absolute bottom-0 top-0 z-20 hidden transition-opacity duration-200 min-[1200px]:block ${
          modalOpen || secretActive ? "pointer-events-none opacity-0" : ""
        }`}
        style={
          {
            pointerEvents: "none",
            "--pw": "clamp(27rem, 22.5vw + 13rem, 40rem)",
            width: "var(--pw)",
            // The gutter is a clamp for the same reason the width is: it
            // was right-5 stepping to lg:right-8, so the whole column
            // jumped 12px sideways at 1024 while you were resizing.
            right: "clamp(1.25rem, 0.6rem + 1.1vw, 2rem)",
          } as React.CSSProperties
        }
      >
        <DesktopPanel
          activeUnit={activeUnit}
          modalOpen={modalOpen || secretActive}
          bodies={bodies}
        />
      </div>
      {/* Mobile mirrors desktop's resident-panel ownership: every section
          keeps its own measured sheet, and complete cards crossfade/translate
          rather than swapping content inside one size-changing shell. */}
      {UNITS.map((unit, index) => (
        <MobileUnitPanel
          key={unit.slug}
          body={bodies[unit.slug]}
          unitIndex={index}
          active={index === activeUnit}
          secretActive={secretActive}
          dismissed={mobileDismissed}
          setDismissed={setMobileDismissed}
        />
      ))}
    </div>
  );
}

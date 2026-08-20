"use client";

// Photo props beyond the instant print. The shelves are getting a lot more
// photographs (owner: "significantly more pictures ... like 3-5 per
// section"), and seven identical polaroids in a row is a contact sheet, not
// a room. These give the placement pass three silhouettes to alternate:
// something framed and upright, something lying flat, something small and
// propped. Contact convention is the scene's: local y = 0 is the shelf
// wood, so a leaning prop sits at y = (height/2)·cos(lean).
//
// One shared caveat: LitImage's texture cache is keyed by URL and each
// instance mutates repeat/offset, so a given photo may appear EXACTLY ONCE
// in the scene. Reuse needs a clone first.
//
// PhotoMount lives here too — every print in the room, whatever its
// silhouette and whichever file it was declared in, hangs from it.
import { INERT_HOVER } from "../store";
import { type Palette } from "../theme";
import { RoundedBox } from "./RoundedBox";
import React from "react";

import LitImage from "./LitImage";
import PropLink, { HoverProp } from "./links";

const FRAME_BORDER = 0.024;

// ---------------------------------------------------------------------------
// Where each photograph leads
// ---------------------------------------------------------------------------

/**
 * Every print in the room, and the post it came from.
 *
 * ONE table rather than an `href` scattered across seven unit files, because
 * the question "which of these is still missing a link" is one the owner has
 * to be able to answer at a glance — and because the placements move (props
 * are respaced most rounds) while the provenance of a photograph never does.
 *
 * `null` is a REAL value here and means "we do not have the post URL yet". It
 * is not a placeholder to be filled with something plausible: these are the
 * owner's own posts, and a link to the wrong one is worse than no link at all.
 * A null print still hovers, still nods, and simply opens nothing.
 *
 * The key is PhotoMount's `id`, which is the photo's file stem (or its path,
 * for the corkboard pins whose placement already has one to hand). Adding a
 * photograph without adding it here is a dev-time warning, not a silent
 * omission — see PhotoMount.
 */
export const PHOTO_LINKS: Record<string, string | null> = {
  // --- About -------------------------------------------------------------
  // Not a post: his face, and the one destination that needs no research.
  // Same URL the site's own contact buttons and /manual already use.
  portrait: "https://www.linkedin.com/in/chappyasel/",
  "about-profile-full-v8": "https://www.instagram.com/chappyasel/",
  "about-family-v8": null,
  "about-collective-group-v8": null,
  "about-speaking-candid-v8": null,
  "about-delicate-arch-v8": null,
  "about-brothers": null,
  "about-holidays": null,
  "beach-sunset": null,
  bros: null,
  "postcard-budapest": null,
  "postcard-arches": null,
  // --- Books -------------------------------------------------------------
  "books-noise": "https://x.com/i/status/1835742939928240302",
  "books-quiet": null,
  "books-goldenhour": null,
  // --- Training ----------------------------------------------------------
  "training-squat": null,
  "training-mud": null,
  "gym-mirror": null,
  "golf-flag": null,
  "training-golf-group-v8": null,
  "training-golf-flag-v8": null,
  "training-trophy-side-v8": "https://www.instagram.com/boyswithgains/",
  "training-trophy-front-v8": "https://www.instagram.com/boyswithgains/",
  "training-stage-kneeling-v8": "https://www.instagram.com/boyswithgains/",
  "training-stage-side-v8": "https://www.instagram.com/boyswithgains/",
  "training-gym-pose-v8": "https://www.instagram.com/boyswithgains/",
  "training-deadlift-v8": "https://www.instagram.com/boyswithgains/",
  "training-bench-v8": "https://www.instagram.com/boyswithgains/",
  // --- Talks -------------------------------------------------------------
  // Legacy keys remain for archive compatibility; the current five v8
  // photographs use their actual file identities and have no recoverable
  // source-post URL, so none inherits the retired mic/summit destination.
  "talk-mic": "https://x.com/i/status/1798370655718744491",
  // Replaced `talk-summit` when the Talks shelf stopped showing the same
  // photograph three times (C5). Both keys are listed: a retired one costs a
  // lookup miss and nothing else, and if it comes back it comes back linked.
  "talk-consensus-alt": null,
  "talk-summit": null,
  "talk-stanford": null,
  "talk-fireside-wide": null,
  "talk-consensus-phone-v8": null,
  "talk-panel-v8": null,
  "talk-ann-interview-v8": null,
  "talk-demo-night-v8": null,
  "talk-dc-policy-v8": null,
  // --- Projects ----------------------------------------------------------
  // Likewise, the personal couch and WWDC images are not the retired cabin or
  // whiteboard photographs. Their nulls are deliberate rather than guessed.
  "projects-whiteboard": "https://x.com/i/status/1778892048747417620",
  "projects-cabin": null,
  "projects-couch": null,
  "projects-coding-couch-v8": null,
  "projects-wwdc-v8": null,
  // --- Musings -----------------------------------------------------------
  "musings-walk": null,
  // The four prints pinned to the corkboard, keyed by path because that is
  // what their placement loop has.
  "/images/stacks/pin-dunes.jpg": null,
  "/images/stacks/pin-trail.jpg": null,
  "/images/stacks/pin-creek.jpg": null,
  "/images/stacks/musings-shore.jpg": null,
  // --- Systems -----------------------------------------------------------
  "systems-ridge": null,
  "systems-redwoods": null,
  "systems-sunrise": null,
  "systems-working-session-v8": null,
  "systems-supplements-v8": null,
  "systems-home-office-v8": null,
  "systems-sf-dusk-v8": null,
  "systems-lake-v8": null,
  "systems-lighthouse-v8": null,
};

/** The ids the table knows about — a photograph outside this set has never
 * been considered, which is a different thing from one considered and found
 * to have no post. */
export type PhotoId = keyof typeof PHOTO_LINKS;

/** A print rises about a centimetre and comes a little way toward you —
 * enough to catch the lamp, small enough that crossing a shelf of them
 * doesn't set the room twitching. */
const PHOTO_LIFT: [number, number, number] = [0, 0.012, 0.016];
/** ~3° off each axis of the placement tilt: the frame squares up to you
 * without ever looking like it snapped to a grid. */
const PHOTO_SETTLE = 0.05;
const PHOTO_GROW = 1.02;

export function photoDoorLabel(href: string) {
  if (href.includes("linkedin.com")) return "Open LinkedIn";
  if (href.includes("instagram.com")) return "Open Instagram";
  if (href.includes("x.com")) return "View on X";
  return "View photo source";
}

/** Every photograph in the room mounts through here. It owns the print's
 * placement, because the hover can only ease a tilt it holds itself, and it
 * gates on the active unit so prints two units away don't take the cursor.
 *
 * The destination comes from PHOTO_LINKS by `id`, so a photograph becomes
 * clickable the moment its post URL is known and no placement has to be
 * touched. `href` stays as a per-call-site override for anything the table
 * cannot know. */
export function PhotoMount({
  unitIndex,
  id,
  position,
  rotation,
  lift = PHOTO_LIFT,
  href,
  children,
}: {
  unitIndex: number;
  /** The photo's file stem, or its path where the placement already has one
   * to hand. Either is unique by construction: LitImage's URL-keyed cache
   * already forbids hanging the same print twice. */
  id: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  lift?: [number, number, number];
  /** Override for the table above. Almost nothing needs it. */
  href?: string;
  children: React.ReactNode;
}) {
  const listed = Object.prototype.hasOwnProperty.call(PHOTO_LINKS, id);
  const link = href ?? PHOTO_LINKS[id] ?? null;
  if (process.env.NODE_ENV === "development" && !listed && href === undefined) {
    // A new print that nobody has decided a destination for. Silence here
    // would mean it quietly ships inert, which is how the room ended up with
    // four linked photographs and twenty-five unlinked ones in the first
    // place. Warn once per mount, name the id so it can be pasted straight
    // into PHOTO_LINKS.
    console.warn(
      `[stacks] photo "${id}" is not in PHOTO_LINKS — add it with a post URL, or null if there isn't one.`,
    );
  }
  const pose = {
    unitIndex,
    base: position,
    lift,
    rest: rotation,
    settle: PHOTO_SETTLE,
    grow: PHOTO_GROW,
  };
  return link === null ? (
    <HoverProp {...pose} hoverKey={`${INERT_HOVER}${id}`}>
      {children}
    </HoverProp>
  ) : (
    <PropLink
      {...pose}
      hoverKey={`link:photo:${id}`}
      href={link}
      label={photoDoorLabel(link)}
    >
      {children}
    </PropLink>
  );
}

/** Total height of a DeskFrame — callers need it for the contact math. */
export function deskFrameHeight(height: number) {
  return height + FRAME_BORDER * 2;
}

/** A small standing frame: the grown-up sibling of the polaroid, for the
 * pictures that deserve to be framed rather than propped. Landscape by
 * default; pass a taller `height` for a portrait one. */
export function DeskFrame({
  src,
  palette,
  textured = true,
  width = 0.3,
  height = 0.22,
  zoom = 1,
  focus,
}: {
  src: string;
  palette: Palette;
  textured?: boolean;
  width?: number;
  height?: number;
  zoom?: number;
  focus?: [number, number];
}) {
  const w = width + FRAME_BORDER * 2;
  const h = height + FRAME_BORDER * 2;
  return (
    <group>
      <RoundedBox
        castShadow
        args={[w, h, 0.016]}
        radius={0.005}
        smoothness={3}
        position={[0, 0, -0.009]}
      >
        <meshStandardMaterial color={palette.frame} roughness={0.6} />
      </RoundedBox>
      {/* Mat, so the photo never runs to the frame's inner edge. */}
      <mesh position={[0, 0, -0.0008]}>
        <planeGeometry args={[width + 0.012, height + 0.012]} />
        <meshStandardMaterial color={palette.pages} roughness={0.9} />
      </mesh>
      {textured && (
        <React.Suspense fallback={null}>
          <LitImage
            url={src}
            role="feature"
            width={width}
            height={height}
            roughness={0.55}
            zoom={zoom}
            focus={focus}
            position={[0, 0, 0.001]}
          />
        </React.Suspense>
      )}
    </group>
  );
}

/** A print lying face-up on the shelf, as if just set down. Every other
 * photo prop stands, so one flat one per shelf breaks the picket-fence
 * read and fills horizontal space that standing props can't. Position it
 * at the shelf surface (y = 0) and rotate about Y only. */
export function FlatPrint({
  src,
  palette,
  textured = true,
  width = 0.26,
  height = 0.19,
}: {
  src: string;
  palette: Palette;
  textured?: boolean;
  width?: number;
  height?: number;
}) {
  const border = 0.014;
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <RoundedBox
        castShadow
        args={[width + border * 2, height + border * 2, 0.005]}
        radius={0.002}
        smoothness={2}
        position={[0, 0, 0.0025]}
      >
        <meshStandardMaterial color={palette.paper} roughness={0.88} />
      </RoundedBox>
      {textured && (
        <React.Suspense fallback={null}>
          <LitImage
            url={src}
            role="support"
            width={width}
            height={height}
            roughness={0.6}
            position={[0, 0, 0.0055]}
          />
        </React.Suspense>
      )}
    </group>
  );
}

"use client";

// One compact Field Notes album. Desktop shows two-page spreads; mobile shows
// one page at a time. Both use 3x4 stamp pages, with stamps easing down together
// on unusually narrow mobile screens.
import { isEditableShortcutTarget } from "../input/editableShortcutTarget";
import {
  BookIcon,
  CaretLeftIcon,
  CaretRightIcon,
  XIcon,
} from "@phosphor-icons/react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Keycap } from "~/components/ui/keycap";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import FieldNoteArtworkIcon, { FieldNoteAccentIcon } from "./FieldNoteArtwork";
import {
  FIELD_NOTES,
  FIELD_NOTE_BY_ID,
  FIELD_NOTE_RARITIES,
  type FieldNoteArtwork,
  type FieldNoteDefinition,
  type FieldNoteId,
  type FieldNoteRarity,
} from "./catalog";
import {
  CENTERED_FIELD_NOTE_PLACEMENT,
  FIELD_NOTE_PLACEMENT_CHANGE_EVENT,
  FIELD_NOTE_PLACEMENT_STORAGE_KEY,
  type FieldNotePlacement,
  normalizeFieldNotePlacement,
  readFieldNotePlacement,
  readFieldNotePlacements,
  resetFieldNotePlacementIds,
  restoreFieldNotePlacements,
  saveFieldNotePlacement,
} from "./placement";
import {
  type FieldNotesProgress,
  startFieldNotes,
  subscribeFieldNoteAwards,
  useFieldNotesProgress,
} from "./progress";
import { connectFieldNotesShortcut } from "./shortcut";
import { fieldNotesOpenFromSearch, fieldNotesUrl } from "./urlState";

const DESKTOP_STAMPS_PER_PAGE = 12;
const MOBILE_STAMPS_PER_PAGE = 12;
const DESKTOP_STAMP_PAGE_COUNT = Math.ceil(
  FIELD_NOTES.length / DESKTOP_STAMPS_PER_PAGE,
);
const MOBILE_STAMP_PAGE_COUNT = Math.ceil(
  FIELD_NOTES.length / MOBILE_STAMPS_PER_PAGE,
);
const DESKTOP_SPREAD_COUNT = Math.ceil((DESKTOP_STAMP_PAGE_COUNT + 1) / 2);
const MOBILE_PAGE_COUNT = MOBILE_STAMP_PAGE_COUNT + 1;
const AWARD_ANIMATION_MS = 5600;
const FIRST_TRIGGER_REVEAL_MS = 420;

const STAMP_PALETTES = [
  {
    paper: "#e7a849",
    ink: "#51301e",
    accent: "#bd453c",
    second: "#356f67",
    label: "#f7e8c8",
  },
  {
    paper: "#82bd9b",
    ink: "#173f32",
    accent: "#e38a43",
    second: "#7a405d",
    label: "#f4e7ca",
  },
  {
    paper: "#df7e78",
    ink: "#592c32",
    accent: "#f1c95e",
    second: "#356f83",
    label: "#f7e6cc",
  },
  {
    paper: "#78b5d1",
    ink: "#203f59",
    accent: "#d84b43",
    second: "#e5bd4f",
    label: "#f5e7c9",
  },
  {
    paper: "#d6b654",
    ink: "#4f3a19",
    accent: "#568263",
    second: "#934558",
    label: "#f8e9c7",
  },
  {
    paper: "#aa8bc0",
    ink: "#422d52",
    accent: "#e29b42",
    second: "#477c74",
    label: "#f3e4c9",
  },
  {
    paper: "#e6a174",
    ink: "#58331f",
    accent: "#27776d",
    second: "#b63d42",
    label: "#f8e8cc",
  },
  {
    paper: "#6db9b6",
    ink: "#173f43",
    accent: "#de7541",
    second: "#684675",
    label: "#f5e7c9",
  },
  {
    paper: "#d981a5",
    ink: "#55283e",
    accent: "#4d7e6c",
    second: "#e8b845",
    label: "#f7e6cc",
  },
  {
    paper: "#aeb963",
    ink: "#363c20",
    accent: "#b84d42",
    second: "#3c6f87",
    label: "#f5e7c8",
  },
  {
    paper: "#315f7d",
    ink: "#f6e8c9",
    accent: "#d84e42",
    second: "#e0ad3d",
    label: "#f4e4c2",
  },
  {
    paper: "#df694f",
    ink: "#4d2733",
    accent: "#f0c34f",
    second: "#41838a",
    label: "#f8e8c9",
  },
] as const;

type StampDesign = Readonly<{
  palette: number;
  frame: 0 | 1 | 2 | 3;
  layout: 0 | 1 | 2 | 3 | 4 | 5;
  pattern: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
}>;

/** Artwork is authored so no two discoveries can land on the same visual
 * recipe. Hashing below is reserved for physical printing imperfections. */
const STAMP_DESIGNS = {
  tour: { palette: 10, frame: 1, layout: 0, pattern: 6 },
  portal: { palette: 5, frame: 2, layout: 3, pattern: 1 },
  camera: { palette: 11, frame: 0, layout: 4, pattern: 9 },
  hand: { palette: 2, frame: 3, layout: 2, pattern: 1 },
  room: { palette: 8, frame: 1, layout: 5, pattern: 4 },
  rearrange: { palette: 1, frame: 2, layout: 1, pattern: 6 },
  barbell: { palette: 0, frame: 3, layout: 5, pattern: 2 },
  globe: { palette: 3, frame: 1, layout: 0, pattern: 4 },
  chair: { palette: 9, frame: 0, layout: 3, pattern: 5 },
  ripple: { palette: 7, frame: 2, layout: 4, pattern: 4 },
  lamp: { palette: 1, frame: 3, layout: 2, pattern: 6 },
  beacon: { palette: 10, frame: 1, layout: 5, pattern: 10 },
  alarm: { palette: 11, frame: 2, layout: 0, pattern: 0 },
  clock: { palette: 4, frame: 0, layout: 3, pattern: 7 },
  tea: { palette: 6, frame: 1, layout: 4, pattern: 5 },
  shaker: { palette: 8, frame: 2, layout: 2, pattern: 0 },
  pixel: { palette: 3, frame: 3, layout: 5, pattern: 8 },
  book: { palette: 9, frame: 1, layout: 1, pattern: 2 },
  photo: { palette: 6, frame: 0, layout: 0, pattern: 7 },
  chart: { palette: 7, frame: 3, layout: 4, pattern: 8 },
  fireworks: { palette: 10, frame: 2, layout: 2, pattern: 11 },
  crown: { palette: 5, frame: 3, layout: 0, pattern: 3 },
  building: { palette: 2, frame: 1, layout: 5, pattern: 9 },
  butterfly: { palette: 4, frame: 0, layout: 3, pattern: 0 },
  golf: { palette: 1, frame: 2, layout: 4, pattern: 2 },
  "wrong-sport": { palette: 0, frame: 0, layout: 1, pattern: 11 },
  door: { palette: 2, frame: 2, layout: 0, pattern: 3 },
  path: { palette: 9, frame: 3, layout: 3, pattern: 6 },
  calendar: { palette: 4, frame: 2, layout: 5, pattern: 7 },
  dice: { palette: 0, frame: 1, layout: 3, pattern: 8 },
  journal: { palette: 5, frame: 0, layout: 2, pattern: 10 },
} as const satisfies Record<FieldNoteArtwork, StampDesign>;

type StampLetteringStyle =
  | "micro"
  | "denomination"
  | "poster"
  | "vertical"
  | "seal"
  | "split"
  | "banner"
  | "none";

type StampLettering = Readonly<{
  style: StampLetteringStyle;
  primary: string | null;
  secondary: string | null;
  denomination: string | null;
}>;

type StampIconTreatment = Readonly<{
  weight: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  scale: number;
  x: number;
  y: number;
  rotate: number;
  echo: boolean;
}>;

const STAMP_LETTERING = {
  tour: {
    style: "denomination",
    primary: "Grand circuit",
    secondary: "Seven stops",
    denomination: "7",
  },
  portal: {
    style: "vertical",
    primary: "First passage",
    secondary: "Chappy Post",
    denomination: "01",
  },
  camera: {
    style: "banner",
    primary: "Full frame",
    secondary: "Photo mode",
    denomination: "36",
  },
  hand: {
    style: "seal",
    primary: "Handle freely",
    secondary: "Field Notes",
    denomination: "4¢",
  },
  room: {
    style: "denomination",
    primary: "Every shelf",
    secondary: "Gold issue",
    denomination: "∞",
  },
  rearrange: {
    style: "split",
    primary: "Move / place",
    secondary: "Ten objects",
    denomination: "10",
  },
  barbell: {
    style: "poster",
    primary: "Heavy mail",
    secondary: "Lifted issue",
    denomination: "60kg",
  },
  globe: {
    style: "poster",
    primary: "One full turn",
    secondary: "World issue",
    denomination: "360°",
  },
  chair: {
    style: "vertical",
    primary: "Capital view",
    secondary: "Secret seat",
    denomination: "DC",
  },
  ripple: {
    style: "seal",
    primary: "Make waves",
    secondary: "Coordination",
    denomination: "~",
  },
  lamp: {
    style: "split",
    primary: "Task light",
    secondary: "Switch series",
    denomination: "OFF",
  },
  beacon: {
    style: "banner",
    primary: "Night signal",
    secondary: "Floor lamp",
    denomination: "✦",
  },
  alarm: {
    style: "denomination",
    primary: "Early issue",
    secondary: "Before dawn",
    denomination: "3:45",
  },
  clock: {
    style: "micro",
    primary: "Old time",
    secondary: "Still ticking",
    denomination: "12",
  },
  tea: {
    style: "vertical",
    primary: "Serve steaming",
    secondary: "Musings",
    denomination: "HOT",
  },
  shaker: {
    style: "poster",
    primary: "Shake well",
    secondary: "Three replies",
    denomination: "x3",
  },
  pixel: {
    style: "split",
    primary: "Two resolutions",
    secondary: "Project boards",
    denomination: "2x",
  },
  book: {
    style: "micro",
    primary: "Open edition",
    secondary: "Field library",
    denomination: "01",
  },
  photo: {
    style: "banner",
    primary: "Family archive",
    secondary: "Private issue",
    denomination: "24",
  },
  chart: {
    style: "poster",
    primary: "Up & right",
    secondary: "Growth issue",
    denomination: "↗",
  },
  fireworks: {
    style: "none",
    primary: null,
    secondary: null,
    denomination: "✹",
  },
  crown: {
    style: "seal",
    primary: "Royal issue",
    secondary: "Quietly found",
    denomination: "♛",
  },
  building: {
    style: "vertical",
    primary: "Office hours",
    secondary: "Headquarters",
    denomination: "HQ",
  },
  butterfly: {
    style: "none",
    primary: null,
    secondary: null,
    denomination: null,
  },
  golf: {
    style: "split",
    primary: "Four",
    secondary: "Green issue",
    denomination: "PAR",
  },
  "wrong-sport": {
    style: "banner",
    primary: "Wrong ball",
    secondary: "Unscheduled",
    denomination: "FORE?",
  },
  door: {
    style: "split",
    primary: "Come and go",
    secondary: "Eight exits",
    denomination: "8",
  },
  path: {
    style: "denomination",
    primary: "Full marathon",
    secondary: "One hold",
    denomination: "26.2",
  },
  calendar: {
    style: "micro",
    primary: "Second visit",
    secondary: "Day two",
    denomination: "II",
  },
  dice: {
    style: "poster",
    primary: "Six high",
    secondary: "Tower issue",
    denomination: "6",
  },
  journal: {
    style: "seal",
    primary: "Every page",
    secondary: "Complete set",
    denomination: "✓",
  },
} as const satisfies Record<FieldNoteArtwork, StampLettering>;

const STAMP_ICON_TREATMENTS = {
  tour: { weight: "fill", scale: 1.08, x: -8, y: 5, rotate: -8, echo: false },
  portal: { weight: "bold", scale: 0.9, x: -5, y: 2, rotate: 0, echo: true },
  camera: {
    weight: "duotone",
    scale: 1.18,
    x: 3,
    y: 4,
    rotate: 3,
    echo: false,
  },
  hand: { weight: "fill", scale: 1.12, x: 0, y: -2, rotate: -7, echo: false },
  room: { weight: "duotone", scale: 0.98, x: -4, y: 4, rotate: 8, echo: true },
  rearrange: {
    weight: "bold",
    scale: 0.86,
    x: 7,
    y: 5,
    rotate: -4,
    echo: true,
  },
  barbell: { weight: "fill", scale: 1.2, x: 0, y: 8, rotate: -5, echo: false },
  globe: { weight: "thin", scale: 1.16, x: 0, y: 9, rotate: 7, echo: true },
  chair: {
    weight: "duotone",
    scale: 0.92,
    x: -5,
    y: 1,
    rotate: -3,
    echo: false,
  },
  ripple: { weight: "bold", scale: 1.22, x: 0, y: -1, rotate: -9, echo: true },
  lamp: { weight: "fill", scale: 0.96, x: 7, y: 5, rotate: 4, echo: false },
  beacon: { weight: "light", scale: 1.16, x: 1, y: -3, rotate: -2, echo: true },
  alarm: { weight: "bold", scale: 0.84, x: -8, y: 9, rotate: 6, echo: false },
  clock: { weight: "thin", scale: 1.14, x: 5, y: 0, rotate: -8, echo: true },
  tea: { weight: "duotone", scale: 1.06, x: -6, y: 4, rotate: 5, echo: false },
  shaker: { weight: "fill", scale: 0.88, x: 0, y: 8, rotate: -10, echo: true },
  pixel: { weight: "regular", scale: 1.18, x: 7, y: 5, rotate: 2, echo: false },
  book: { weight: "light", scale: 1.04, x: -3, y: -1, rotate: -6, echo: true },
  photo: {
    weight: "duotone",
    scale: 1.14,
    x: 2,
    y: -5,
    rotate: 4,
    echo: false,
  },
  chart: { weight: "bold", scale: 0.9, x: 0, y: 8, rotate: -4, echo: true },
  fireworks: {
    weight: "thin",
    scale: 1.3,
    x: -6,
    y: -4,
    rotate: 11,
    echo: true,
  },
  crown: { weight: "fill", scale: 1.06, x: 0, y: 0, rotate: -5, echo: false },
  building: {
    weight: "regular",
    scale: 0.9,
    x: -7,
    y: 5,
    rotate: 3,
    echo: true,
  },
  butterfly: {
    weight: "duotone",
    scale: 1.34,
    x: 3,
    y: 0,
    rotate: -12,
    echo: true,
  },
  golf: { weight: "bold", scale: 1.08, x: 6, y: 6, rotate: 7, echo: false },
  "wrong-sport": {
    weight: "light",
    scale: 1.2,
    x: 0,
    y: -4,
    rotate: -8,
    echo: true,
  },
  door: { weight: "regular", scale: 1.1, x: -4, y: 3, rotate: -6, echo: false },
  path: { weight: "bold", scale: 1.12, x: 2, y: 2, rotate: 5, echo: true },
  calendar: {
    weight: "light",
    scale: 1,
    x: -2,
    y: 1,
    rotate: -3,
    echo: false,
  },
  dice: { weight: "duotone", scale: 1.16, x: 4, y: 6, rotate: 9, echo: true },
  journal: {
    weight: "fill",
    scale: 1.02,
    x: 0,
    y: -2,
    rotate: -4,
    echo: false,
  },
} as const satisfies Record<FieldNoteArtwork, StampIconTreatment>;

const STAMP_TILTS = [-2.8, 1.6, -1.2, 2.3, -0.4, 0.8, -2, 1.1] as const;
const STAMP_OFFSETS = [-2, -1, 0, 1, 2] as const;
const STAMP_NOTCHES = [3.4, 3.8, 4.2, 4.6] as const;
const STAMP_STEPS = [12.5, 13.5, 14.5, 15.5] as const;

function stampSeed(note: FieldNoteDefinition) {
  return (
    Array.from(note.id).reduce(
      (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619),
      2166136261,
    ) >>> 0
  );
}

function stampStyle(note: FieldNoteDefinition): CSSProperties {
  const seed = stampSeed(note);
  const palette = STAMP_PALETTES[STAMP_DESIGNS[note.artwork].palette];
  const icon = STAMP_ICON_TREATMENTS[note.artwork];
  const notch = STAMP_NOTCHES[(seed >>> 6) % STAMP_NOTCHES.length]!;
  return {
    "--stamp-paper": palette.paper,
    "--stamp-ink": palette.ink,
    "--stamp-accent": palette.accent,
    "--stamp-second": palette.second,
    "--stamp-label": palette.label,
    "--stamp-icon-scale": icon.scale,
    "--stamp-icon-x": `${icon.x}px`,
    "--stamp-icon-y": `${icon.y}px`,
    "--stamp-icon-rotate": `${icon.rotate}deg`,
    "--stamp-tilt": `${STAMP_TILTS[seed % STAMP_TILTS.length]}deg`,
    "--stamp-x": `${STAMP_OFFSETS[(seed >>> 3) % STAMP_OFFSETS.length]}px`,
    "--stamp-y": `${STAMP_OFFSETS[(seed >>> 9) % STAMP_OFFSETS.length]}px`,
    "--stamp-notch": `${notch}px`,
    "--stamp-step-x": `${STAMP_STEPS[(seed >>> 12) % STAMP_STEPS.length]}px`,
    "--stamp-step-y": `${STAMP_STEPS[(seed >>> 15) % STAMP_STEPS.length]}px`,
    "--stamp-art-tilt": `${STAMP_TILTS[(seed >>> 18) % STAMP_TILTS.length]! / 5}deg`,
    "--cancel-right": `${STAMP_OFFSETS[(seed >>> 21) % STAMP_OFFSETS.length]! - 7}px`,
    "--cancel-bottom": `${STAMP_OFFSETS[(seed >>> 24) % STAMP_OFFSETS.length]! + 1}px`,
    "--cancel-tilt": `${STAMP_TILTS[(seed >>> 27) % STAMP_TILTS.length]! * 4}deg`,
    "--pattern-angle": `${(seed % 23) - 11}deg`,
    "--pattern-size": `${18 + ((seed >>> 11) % 13)}px`,
    "--pattern-x": `${35 + ((seed >>> 17) % 31)}%`,
    "--pattern-y": `${30 + ((seed >>> 22) % 36)}%`,
  } as CSSProperties;
}

function awardFlightStyle(
  stamp: HTMLElement,
  trigger: HTMLElement,
): CSSProperties | undefined {
  const stampRect = stamp.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  if (!stampRect.width || !stampRect.height) return undefined;

  const dx =
    triggerRect.left +
    triggerRect.width / 2 -
    (stampRect.left + stampRect.width / 2);
  const dy =
    triggerRect.top +
    triggerRect.height / 2 -
    (stampRect.top + stampRect.height / 2);

  return {
    "--flight-x": `${dx}px`,
    "--flight-y": `${dy}px`,
  } as CSSProperties;
}

function isFound(note: FieldNoteDefinition, progress: FieldNotesProgress) {
  return progress.earned[note.id as FieldNoteId] !== undefined;
}

function titleFor(note: FieldNoteDefinition, found: boolean) {
  return note.hidden && !found ? "?" : note.title;
}

function headingFor(note: FieldNoteDefinition, found: boolean) {
  return note.hidden && !found ? "Secret finding" : note.title;
}

function copyFor(note: FieldNoteDefinition, found: boolean) {
  if (found) return note.foundCopy;
  if (note.hidden)
    return "No clue for this one. You'll know it when you find it.";
  return note.hint ?? "Take another look around the room.";
}

function visibleRarity(note: FieldNoteDefinition, found: boolean) {
  return note.hidden && !found ? null : note.rarity;
}

function totalFound(progress: FieldNotesProgress) {
  return Object.keys(progress.earned).length;
}

type FieldNotesMilestone = "none" | "ten" | "twenty" | "complete";

function fieldNotesMilestone(count: number): FieldNotesMilestone {
  if (FIELD_NOTES.length > 0 && count === FIELD_NOTES.length) return "complete";
  if (count >= 20) return "twenty";
  if (count >= 10) return "ten";
  return "none";
}

function rarityFound(rarity: FieldNoteRarity, progress: FieldNotesProgress) {
  return FIELD_NOTES.filter(
    (note) => note.rarity === rarity && isFound(note, progress),
  ).length;
}

function rarityTotal(rarity: FieldNoteRarity) {
  return FIELD_NOTES.filter((note) => note.rarity === rarity).length;
}

function StampHint({
  note,
  found,
  id,
  style,
  state,
  placement,
  onExited,
}: {
  note: FieldNoteDefinition;
  found: boolean;
  id: string;
  style: CSSProperties;
  state: "open" | "closing";
  placement: "top" | "bottom";
  onExited: () => void;
}) {
  const rarity = visibleRarity(note, found);
  // The outer div owns the fixed position and centering transform; the
  // paper animates inside it because the enter/exit keyframes would
  // otherwise overwrite that transform and make the slip jump.
  return (
    <div style={style} className="pointer-events-none">
      <div
        id={id}
        role="tooltip"
        data-state={state === "open" ? "open" : "closed"}
        data-side={placement}
        onAnimationEnd={(event) => {
          if (state === "closing" && event.target === event.currentTarget)
            onExited();
        }}
        className="field-notes-paper-slip field-notes-stamp-tooltip relative w-56 overflow-hidden px-4 py-3 pr-11 text-left animate-in fade-in-0 zoom-in-95 data-[side=bottom]:origin-top data-[side=top]:origin-bottom data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none"
      >
        <p className="field-notes-hand field-notes-strong text-lg leading-6 text-[#362518]">
          {headingFor(note, found)}
        </p>
        {rarity && (
          <span
            role="img"
            aria-label={`${rarity} rarity`}
            data-rarity={rarity.toLowerCase()}
            className="field-notes-rarity-swatch absolute right-3.5 top-3.5 size-5"
          />
        )}
        <p className="field-notes-fine field-notes-strong text-[15px] leading-6 text-[#5b402a]">
          {copyFor(note, found)}
        </p>
      </div>
    </div>
  );
}

function StampPaper({ note }: { note: FieldNoteDefinition }) {
  const design = STAMP_DESIGNS[note.artwork];
  const lettering = STAMP_LETTERING[note.artwork];
  const icon = STAMP_ICON_TREATMENTS[note.artwork];
  return (
    <span
      data-rarity={note.rarity.toLowerCase()}
      className="field-notes-stamp-shadow relative grid size-full"
    >
      <span
        data-rarity={note.rarity.toLowerCase()}
        className="field-notes-stamp-paper relative grid size-full place-items-center p-[9px]"
      >
        <span
          data-artwork={note.artwork}
          data-frame={design.frame}
          data-layout={design.layout}
          data-pattern={design.pattern}
          data-lettering={lettering.style}
          className="field-notes-stamp-art field-notes-stamp-earned relative z-[1] grid size-full place-items-center overflow-hidden border p-1"
        >
          <span aria-hidden className="field-notes-stamp-pattern absolute" />
          <span className="field-notes-stamp-glyph relative z-[1] mt-1 grid place-items-center">
            <span className="field-notes-stamp-icon-frame relative grid place-items-center">
              <span className="relative z-[1] grid place-items-center">
                {icon.echo && (
                  <span
                    aria-hidden
                    className="field-notes-stamp-icon-accent absolute grid place-items-center"
                  >
                    <FieldNoteAccentIcon note={note} size={38} weight="thin" />
                  </span>
                )}
                <FieldNoteArtworkIcon
                  note={note}
                  earned
                  size={44}
                  weight={icon.weight}
                />
              </span>
            </span>
          </span>
          <span
            aria-hidden
            data-lettering={lettering.style}
            className="field-notes-stamp-lettering absolute inset-0 z-[2] font-sans uppercase leading-none"
          >
            {lettering.primary && (
              <span className="field-notes-stamp-primary">
                {lettering.primary}
              </span>
            )}
            {lettering.secondary && (
              <span className="field-notes-stamp-secondary">
                {lettering.secondary}
              </span>
            )}
            {lettering.denomination && (
              <span className="field-notes-stamp-denomination">
                {lettering.denomination}
              </span>
            )}
          </span>
          <span
            aria-hidden
            className="field-notes-cancellation border-current/35 absolute size-8 rounded-full border opacity-35"
          >
            <span className="absolute left-[-11px] top-2 h-px w-7 bg-current shadow-[0_4px_0_current,0_8px_0_current]" />
          </span>
        </span>
      </span>
    </span>
  );
}

function LockedStampMount({ note }: { note: FieldNoteDefinition }) {
  const hidden = note.hidden;
  return (
    <span
      data-kind={hidden ? "secret" : "visible"}
      className="field-notes-discovery-mount relative grid place-items-center text-center"
    >
      <span
        aria-hidden
        className="field-notes-mount-corners absolute inset-0"
      />
      <span className="field-notes-mount-copy relative z-[1] grid w-full place-items-center">
        <span className="field-notes-mount-icon grid place-items-center">
          <FieldNoteArtworkIcon note={note} earned={false} size={24} />
        </span>
        <span className="field-notes-mount-title field-notes-fine field-notes-strong line-clamp-2 w-full px-1 leading-tight">
          {titleFor(note, false)}
        </span>
        <span className="field-notes-mount-status field-notes-hand field-notes-strong text-[10px] lowercase leading-none">
          {hidden ? "secret" : "clue inside"}
        </span>
      </span>
    </span>
  );
}

function stampAriaLabel(note: FieldNoteDefinition, found: boolean) {
  if (found)
    return `${note.title}. Found. ${note.rarity} rarity. ${note.foundCopy}`;
  if (note.hidden) return "Secret finding. Not yet found. No hint available.";
  return `${note.title}. Not yet found. ${note.rarity} rarity. Hint: ${copyFor(note, false)}`;
}

type StampDragSession = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCenterX: number;
  startCenterY: number;
  pageLeft: number;
  pageTop: number;
  pageWidth: number;
  pageHeight: number;
  stampWidth: number;
  stampHeight: number;
  startPlacement: FieldNotePlacement;
  currentPlacement: FieldNotePlacement;
  moved: boolean;
};

const STAMP_DRAG_THRESHOLD_PX = 4;

/** The one stamp hint allowed on screen; openHint dismisses the previous
 * holder instantly instead of letting exit animations pile up. */
let activeStampHintDismiss: (() => void) | null = null;

function stampHomeLeft(slotIndex: number) {
  const column = slotIndex % 3;
  if (column === 0)
    return "calc(50% - var(--field-notes-stamp-size) - var(--field-notes-stamp-gap-x))";
  if (column === 2)
    return "calc(50% + var(--field-notes-stamp-size) + var(--field-notes-stamp-gap-x))";
  return "50%";
}

function stampHomeTop(slotIndex: number) {
  const row = Math.floor(slotIndex / 3);
  const rowOffset = Array.from(
    { length: row },
    () => " + var(--field-notes-stamp-size) + var(--field-notes-stamp-gap-y)",
  ).join("");
  return `calc(var(--field-notes-stamp-grid-top) + var(--field-notes-stamp-size) / 2${rowOffset})`;
}

function stampPlacementStyle(
  placement: FieldNotePlacement,
  slotIndex: number,
): CSSProperties {
  return {
    "--stamp-home-left": stampHomeLeft(slotIndex),
    "--stamp-home-top": stampHomeTop(slotIndex),
    "--stamp-page-left": `${placement.x * 100}%`,
    "--stamp-page-top": `${placement.y * 100}%`,
    "--stamp-user-tilt": `${placement.tilt}deg`,
  } as CSSProperties;
}

export function PostageStamp({
  note,
  progress,
  movable = false,
  slotIndex = 0,
}: {
  note: FieldNoteDefinition;
  progress: FieldNotesProgress;
  movable?: boolean;
  slotIndex?: number;
}) {
  const found = isFound(note, progress);
  const canMove = found && movable;
  const [hintPhase, setHintPhase] = useState<"closed" | "open" | "closing">(
    "closed",
  );
  const [dragging, setDragging] = useState(false);
  const [placement, setPlacement] = useState<FieldNotePlacement>(() =>
    movable
      ? readFieldNotePlacement(note.id as FieldNoteId)
      : CENTERED_FIELD_NOTE_PLACEMENT,
  );
  const [hintPosition, setHintPosition] = useState<{
    left: number;
    top: number;
    placement: "top" | "bottom";
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragSessionRef = useRef<StampDragSession | null>(null);
  const hintId = useId();
  const positionHint = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const halfWidth = 112;
    const gutter = 12;
    const viewportWidth = window.innerWidth;
    const placement = rect.top >= 150 ? "top" : "bottom";
    setHintPosition({
      left: Math.min(
        viewportWidth - halfWidth - gutter,
        Math.max(halfWidth + gutter, rect.left + rect.width / 2),
      ),
      top: placement === "top" ? rect.top - 10 : rect.bottom + 10,
      placement,
    });
  }, []);
  const dismissHint = useCallback(() => setHintPhase("closed"), []);
  const openHint = useCallback(() => {
    // Moving straight onto another stamp drops the outgoing hint instantly:
    // letting its exit animation overlap the incoming hint reads as jitter.
    if (activeStampHintDismiss !== dismissHint) activeStampHintDismiss?.();
    activeStampHintDismiss = dismissHint;
    positionHint();
    setHintPhase("open");
  }, [dismissHint, positionHint]);
  const closeHint = useCallback(() => {
    setHintPhase((phase) => (phase === "open" ? "closing" : phase));
  }, []);

  useEffect(
    () => () => {
      if (activeStampHintDismiss === dismissHint) activeStampHintDismiss = null;
    },
    [dismissHint],
  );

  useLayoutEffect(() => {
    // Only the open hint tracks its trigger; a closing hint holds still so
    // the exit animation plays in place.
    if (hintPhase !== "open") return;
    positionHint();
    window.addEventListener("resize", positionHint);
    window.addEventListener("scroll", positionHint, true);
    return () => {
      window.removeEventListener("resize", positionHint);
      window.removeEventListener("scroll", positionHint, true);
    };
  }, [hintPhase, positionHint]);

  useEffect(() => {
    if (hintPhase !== "closing") return;
    // Unmount fallback for when the exit animation never fires
    // (reduced motion, jsdom); slightly longer than the exit's 150ms.
    const timer = window.setTimeout(() => setHintPhase("closed"), 220);
    return () => window.clearTimeout(timer);
  }, [hintPhase]);

  useEffect(() => {
    if (!movable) {
      setPlacement(CENTERED_FIELD_NOTE_PLACEMENT);
      return;
    }

    const syncPlacement = () =>
      setPlacement(readFieldNotePlacement(note.id as FieldNoteId));
    const syncStoredPlacement = (event: StorageEvent) => {
      if (event.key === FIELD_NOTE_PLACEMENT_STORAGE_KEY) syncPlacement();
    };
    window.addEventListener(FIELD_NOTE_PLACEMENT_CHANGE_EVENT, syncPlacement);
    window.addEventListener("storage", syncStoredPlacement);
    return () => {
      window.removeEventListener(
        FIELD_NOTE_PLACEMENT_CHANGE_EVENT,
        syncPlacement,
      );
      window.removeEventListener("storage", syncStoredPlacement);
    };
  }, [movable, note.id]);

  const finishPointerCapture = useCallback((pointerId: number) => {
    const trigger = triggerRef.current;
    if (trigger?.hasPointerCapture?.(pointerId))
      trigger.releasePointerCapture(pointerId);
  }, []);

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!canMove || (event.pointerType === "mouse" && event.button !== 0))
        return;
      const page = event.currentTarget.closest<HTMLElement>(
        ".field-notes-loose-stamp-layer",
      );
      if (!page) return;
      const pageRect = page.getBoundingClientRect();
      const stampRect = event.currentTarget.getBoundingClientRect();
      if (!pageRect.width || !pageRect.height || !stampRect.width) return;
      dragSessionRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startCenterX: stampRect.left + stampRect.width / 2,
        startCenterY: stampRect.top + stampRect.height / 2,
        pageLeft: pageRect.left,
        pageTop: pageRect.top,
        pageWidth: pageRect.width,
        pageHeight: pageRect.height,
        stampWidth: stampRect.width,
        stampHeight: stampRect.height,
        startPlacement: placement,
        currentPlacement: placement,
        moved: false,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [canMove, placement],
  );

  const moveStamp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const session = dragSessionRef.current;
      if (session?.pointerId !== event.pointerId) return;
      const dx = event.clientX - session.startClientX;
      const dy = event.clientY - session.startClientY;
      if (!session.moved && Math.hypot(dx, dy) < STAMP_DRAG_THRESHOLD_PX)
        return;

      if (!session.moved) {
        session.moved = true;
        setDragging(true);
        setHintPhase("closed");
      }
      event.preventDefault();
      const edgeInset = 6;
      const halfWidth = session.stampWidth / 2;
      const halfHeight = session.stampHeight / 2;
      const centerX = Math.max(
        session.pageLeft + halfWidth + edgeInset,
        Math.min(
          session.pageLeft + session.pageWidth - halfWidth - edgeInset,
          session.startCenterX + dx,
        ),
      );
      const centerY = Math.max(
        session.pageTop + halfHeight + edgeInset,
        Math.min(
          session.pageTop + session.pageHeight - halfHeight - edgeInset,
          session.startCenterY + dy,
        ),
      );
      const next = normalizeFieldNotePlacement({
        placed: true,
        x: (centerX - session.pageLeft) / session.pageWidth,
        y: (centerY - session.pageTop) / session.pageHeight,
        tilt: session.startPlacement.tilt + (dx / session.pageWidth) * 5,
      });
      session.currentPlacement = next;
      setPlacement(next);
    },
    [],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const session = dragSessionRef.current;
      if (!session) {
        if (event.pointerType === "touch") {
          if (hintPhase === "open") closeHint();
          else openHint();
        }
        return;
      }
      if (session.pointerId !== event.pointerId) return;
      dragSessionRef.current = null;
      finishPointerCapture(event.pointerId);
      setDragging(false);

      if (session.moved) {
        saveFieldNotePlacement(
          note.id as FieldNoteId,
          session.currentPlacement,
        );
        return;
      }
      if (event.pointerType !== "touch") return;
      if (hintPhase === "open") closeHint();
      else openHint();
    },
    [closeHint, finishPointerCapture, hintPhase, note.id, openHint],
  );

  const cancelDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const session = dragSessionRef.current;
      if (session?.pointerId !== event.pointerId) return;
      dragSessionRef.current = null;
      finishPointerCapture(event.pointerId);
      setPlacement(session.startPlacement);
      setDragging(false);
    },
    [finishPointerCapture],
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={stampAriaLabel(note, found)}
        aria-describedby={hintPhase === "open" ? hintId : undefined}
        data-state={found ? "earned" : note.hidden ? "secret" : "locked"}
        data-movable={canMove}
        data-placed={canMove && placement.placed}
        data-dragging={dragging}
        onMouseEnter={() => {
          if (!dragSessionRef.current) openHint();
        }}
        onMouseLeave={closeHint}
        onFocus={() => {
          if (!dragSessionRef.current) openHint();
        }}
        onBlur={closeHint}
        onPointerDown={beginDrag}
        onPointerMove={moveStamp}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        className="field-notes-postage relative grid size-full place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a5435] motion-reduce:transition-none"
        style={{
          ...stampStyle(note),
          ...stampPlacementStyle(
            canMove ? placement : CENTERED_FIELD_NOTE_PLACEMENT,
            slotIndex,
          ),
        }}
      >
        {found ? <StampPaper note={note} /> : <LockedStampMount note={note} />}
      </button>
      {hintPhase !== "closed" &&
        hintPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <StampHint
            note={note}
            found={found}
            id={hintId}
            state={hintPhase}
            placement={hintPosition.placement}
            onExited={() => setHintPhase("closed")}
            style={{
              position: "fixed",
              left: hintPosition.left,
              top: hintPosition.top,
              zIndex: 6000,
              transform:
                hintPosition.placement === "top"
                  ? "translate(-50%, -100%)"
                  : "translate(-50%, 0)",
            }}
          />,
          document.body,
        )}
    </>
  );
}

function EmptyStampMount() {
  return <div aria-hidden className="field-notes-empty-stamp-mount" />;
}

function FieldNotesBotanicalSketch({
  milestone,
}: {
  milestone: FieldNotesMilestone;
}) {
  const [rustling, setRustling] = useState(false);

  const rustle = () => {
    setRustling(false);
    window.requestAnimationFrame(() => setRustling(true));
  };

  return (
    <button
      type="button"
      aria-label="Botanical sketch"
      data-milestone={milestone}
      data-rustling={rustling ? "true" : "false"}
      onClick={rustle}
      onAnimationEnd={(event) => {
        if (
          event.animationName === "field-notes-botanical-draw-click" &&
          (event.target as Element).matches("path:last-child")
        )
          setRustling(false);
      }}
      className="field-notes-botanical-sketch absolute right-7 top-6 h-[4.5rem] w-28 rounded-md text-[#704934] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a5435]"
    >
      <svg aria-hidden viewBox="0 0 112 72" className="size-full" fill="none">
        <g className="field-notes-botanical-color" stroke="none">
          <ellipse
            cx="31"
            cy="36"
            rx="3.8"
            ry="8"
            transform="rotate(-42 31 36)"
          />
          <ellipse
            cx="48"
            cy="29"
            rx="3.6"
            ry="8"
            transform="rotate(4 48 29)"
          />
          <ellipse
            cx="65"
            cy="18"
            rx="3.4"
            ry="7.5"
            transform="rotate(7 65 18)"
          />
          <ellipse
            cx="78"
            cy="27"
            rx="3.1"
            ry="7.2"
            transform="rotate(-68 78 27)"
          />
        </g>
        <g className="field-notes-botanical-butterfly" stroke="none">
          <ellipse
            cx="94"
            cy="44"
            rx="5"
            ry="3.1"
            transform="rotate(28 94 44)"
          />
          <ellipse
            cx="103"
            cy="43"
            rx="5"
            ry="3.1"
            transform="rotate(-31 103 43)"
          />
          <ellipse cx="98.5" cy="47" rx="1.3" ry="4.6" />
        </g>
        <g className="field-notes-botanical-bloom" stroke="none">
          <circle cx="21" cy="48" r="2.4" />
          <circle cx="85" cy="13" r="2.2" />
          <circle cx="100" cy="10" r="1.8" />
        </g>
        <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path pathLength="1" d="M13 62C31 52 42 41 57 31c14-9 27-16 43-21" />
          <path
            pathLength="1"
            d="M22 57c-7-1-12-5-12-10 0-4 3-7 7-7 5 0 8 4 7 8-1 3-4 4-6 2"
          />
          <path pathLength="1" d="M34 49c-1-8-4-14-9-19 8 2 13 7 14 14" />
          <path pathLength="1" d="M45 40c-2-8-1-14 2-20 4 6 5 11 3 17" />
          <path pathLength="1" d="M52 35c7 0 13 2 18 6-7 1-12-1-16-4" />
          <path pathLength="1" d="M61 29c-1-7 0-13 4-19 3 6 3 11 1 16" />
          <path pathLength="1" d="M68 25c7 0 13 2 18 6-7 1-12-1-16-4" />
          <path pathLength="1" d="M78 20c0-6 2-11 6-15 2 5 1 9-1 13" />
          <path pathLength="1" d="M84 16c6 0 11 1 16 4-5 2-10 1-14-2" />
          <path pathLength="1" d="M29 31c-5-5-7-11-6-18 7 3 11 8 12 15" />
          <path
            pathLength="1"
            d="M25 14c2 5 4 9 7 13M47 21c1 5 1 10 0 15M64 11c1 5 1 10-1 15M84 6c0 4-1 8-3 12"
          />
        </g>
      </svg>
    </button>
  );
}

function PageFolio({
  number,
  side,
  children,
}: {
  number: number;
  side: "left" | "right";
  children?: ReactNode;
}) {
  return (
    <div
      className={`field-notes-folio absolute bottom-5 z-[4] flex items-baseline gap-1.5 whitespace-nowrap ${side === "right" ? "flex-row-reverse" : ""} ${side === "left" ? "left-7 md:left-10" : "right-7 md:right-10"}`}
    >
      <span className="field-notes-page-number field-notes-hand field-notes-strong whitespace-nowrap text-sm tabular-nums leading-none">
        page {number}
      </span>
      {children}
    </div>
  );
}

function OverviewPage({ progress }: { progress: FieldNotesProgress }) {
  const count = totalFound(progress);
  const milestone = fieldNotesMilestone(count);
  const recent = useMemo(
    () =>
      FIELD_NOTES.flatMap((note) => {
        const earnedAt = progress.earned[note.id];
        return earnedAt === undefined ? [] : [{ note, earnedAt }];
      })
        .sort((a, b) => b.earnedAt - a.earnedAt)
        .slice(0, 2),
    [progress.earned],
  );

  return (
    <section
      data-milestone={milestone}
      className="field-notes-overview-page field-notes-page field-notes-album-paper relative flex h-[var(--field-notes-page-height)] flex-col bg-[#f2e7cf] px-4 pb-4 pt-6 text-[#3f2c1c] shadow-[inset_0_0_32px_rgba(91,63,32,0.08)] md:px-7 md:pb-6"
    >
      <PageFolio number={1} side="left" />
      <FieldNotesBotanicalSketch milestone={milestone} />
      <h2 className="field-notes-title field-notes-hand w-fit text-[2.75rem] leading-[48px] tracking-[-0.05em] md:text-5xl">
        Field Notes
      </h2>

      <div className="mt-10 flex items-center gap-5 md:mt-12 md:gap-6">
        <div className="field-notes-count-medallion relative grid size-28 shrink-0 place-items-center rounded-full text-center">
          {milestone === "complete" && (
            <span
              aria-hidden
              className="field-notes-completion-foil absolute inset-1 overflow-hidden rounded-full"
            />
          )}
          <span
            aria-hidden
            className="field-notes-count-inner absolute inset-2 rounded-full border border-dashed border-[#905e46]/30"
          />
          <span
            aria-hidden
            className="field-notes-count-jewel field-notes-count-jewel-top"
          />
          <span
            aria-hidden
            className="field-notes-count-jewel field-notes-count-jewel-right"
          />
          <span
            aria-hidden
            className="field-notes-count-jewel field-notes-count-jewel-bottom"
          />
          <span
            aria-hidden
            className="field-notes-count-jewel field-notes-count-jewel-left"
          />
          <span className="relative z-[1]">
            <span className="field-notes-count-number field-notes-hand block text-5xl leading-none">
              {count}
            </span>
            <span className="field-notes-count-caption field-notes-fine field-notes-strong mt-1 block text-[#5c402b]/80">
              of {FIELD_NOTES.length} found
            </span>
          </span>
        </div>
        <div className="grid max-w-44 gap-2">
          <p className="field-notes-overview-copy text-base leading-[22px] text-[#4b3524]/90 md:text-lg">
            Look closer. Each discovery earns a stamp!
          </p>
          {milestone === "complete" && (
            <span className="field-notes-completion-seal field-notes-fine field-notes-strong">
              Field journal complete
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-0 py-3 md:mt-5 md:py-3.5">
        {FIELD_NOTE_RARITIES.map((rarity) => (
          <div
            key={rarity}
            className="flex items-baseline justify-between gap-2"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden
                data-rarity={rarity.toLowerCase()}
                className="field-notes-rarity-swatch size-3 shrink-0"
              />
              <span className="field-notes-fine truncate text-[#4b3524]/65">
                {rarity}
              </span>
            </span>
            <span className="field-notes-fine field-notes-strong tabular-nums text-[#4b3524]">
              {rarityFound(rarity, progress)}/{rarityTotal(rarity)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center py-4 md:py-5">
        <div className="mb-2 h-6">
          <span className="field-notes-latest-heading field-notes-fine field-notes-strong inline-block text-[#4b3524]/80">
            newest stamps
          </span>
        </div>
        <div className="field-notes-latest-grid grid justify-center gap-2.5">
          {Array.from({ length: 2 }, (_, index) => {
            const entry = recent[index];
            return (
              <div
                key={entry?.note.id ?? `empty:${index}`}
                className="field-notes-stamp-slot"
              >
                {entry ? (
                  <PostageStamp note={entry.note} progress={progress} />
                ) : (
                  <EmptyStampMount />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StampPage({
  pageIndex,
  progress,
  stampsPerPage,
}: {
  pageIndex: number;
  progress: FieldNotesProgress;
  stampsPerPage: number;
}) {
  const start = (pageIndex - 1) * stampsPerPage;
  const slots = useMemo(
    () =>
      Array.from(
        { length: stampsPerPage },
        (_, offset) => FIELD_NOTES[start + offset],
      ),
    [stampsPerPage, start],
  );
  const noteIds = useMemo(
    () => slots.flatMap((note) => (note ? [note.id] : [])),
    [slots],
  );
  const [placedStampIds, setPlacedStampIds] = useState<FieldNoteId[]>([]);
  const [undoPlacements, setUndoPlacements] = useState<Partial<
    Record<FieldNoteId, FieldNotePlacement>
  > | null>(null);

  useEffect(() => {
    const syncPlacements = () => {
      const placements = readFieldNotePlacements();
      setPlacedStampIds(noteIds.filter((id) => placements[id]?.placed));
    };
    const syncStoredPlacements = (event: StorageEvent) => {
      if (event.key === FIELD_NOTE_PLACEMENT_STORAGE_KEY) syncPlacements();
    };
    syncPlacements();
    window.addEventListener(FIELD_NOTE_PLACEMENT_CHANGE_EVENT, syncPlacements);
    window.addEventListener("storage", syncStoredPlacements);
    return () => {
      window.removeEventListener(
        FIELD_NOTE_PLACEMENT_CHANGE_EVENT,
        syncPlacements,
      );
      window.removeEventListener("storage", syncStoredPlacements);
    };
  }, [noteIds]);

  useEffect(() => {
    if (!undoPlacements) return;
    const timer = window.setTimeout(() => setUndoPlacements(null), 4500);
    return () => window.clearTimeout(timer);
  }, [undoPlacements]);

  const returnStamps = useCallback(() => {
    const removed = resetFieldNotePlacementIds(noteIds);
    if (Object.keys(removed).length) setUndoPlacements(removed);
  }, [noteIds]);

  const undoReturn = useCallback(() => {
    if (!undoPlacements) return;
    restoreFieldNotePlacements(undoPlacements);
    setUndoPlacements(null);
  }, [undoPlacements]);

  return (
    <section className="field-notes-stamp-page field-notes-page field-notes-album-paper relative h-[var(--field-notes-page-height)] bg-[#f2e7cf] px-2 pb-4 pt-5 text-[#3f2c1c] shadow-[inset_0_0_32px_rgba(91,63,32,0.08)] md:px-6 md:pb-7">
      <PageFolio
        number={pageIndex + 1}
        side={(pageIndex + 1) % 2 === 0 ? "right" : "left"}
      >
        {placedStampIds.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Return stamps to their mounts"
                onClick={returnStamps}
                className="field-notes-return-stamps field-notes-hand field-notes-strong rounded px-0.5 text-xs leading-none text-[#5b402a]/35 transition-[color,transform] hover:text-[#5b402a]/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[#8a5435]/60 active:scale-95 motion-reduce:transition-none"
              >
                reset
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Return stamps to their mounts
            </TooltipContent>
          </Tooltip>
        ) : undoPlacements ? (
          <button
            type="button"
            onClick={undoReturn}
            className="field-notes-return-stamps field-notes-hand field-notes-strong rounded px-0.5 text-xs leading-none text-[#5b402a]/45 transition-colors hover:text-[#5b402a]/75 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[#8a5435]/60"
          >
            undo
          </button>
        ) : null}
      </PageFolio>
      <div className="field-notes-stamp-page-heading mx-auto mb-3 pb-2">
        <h2 className="field-notes-hand text-lg leading-6">
          Findings {String(start + 1).padStart(2, "0")} to{" "}
          {String(start + stampsPerPage).padStart(2, "0")}
        </h2>
      </div>

      <ul className="field-notes-stamp-grid grid justify-center gap-x-1.5 gap-y-2.5 md:gap-x-4 md:gap-y-3.5">
        {slots.map((note, offset) => (
          <li
            key={note?.id ?? `future:${pageIndex}:${offset}`}
            className="field-notes-stamp-slot"
          >
            {note && !isFound(note, progress) ? (
              <PostageStamp note={note} progress={progress} />
            ) : (
              <EmptyStampMount />
            )}
          </li>
        ))}
      </ul>
      <div className="field-notes-loose-stamp-layer pointer-events-none absolute inset-0 z-[2]">
        {slots.map((note, offset) =>
          note && isFound(note, progress) ? (
            <PostageStamp
              key={note.id}
              note={note}
              progress={progress}
              movable
              slotIndex={offset}
            />
          ) : null,
        )}
      </div>
    </section>
  );
}

function PageTurnButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "previous" ? CaretLeftIcon : CaretRightIcon;
  return (
    <button
      type="button"
      aria-label={`${direction === "previous" ? "Previous" : "Next"} album page`}
      disabled={disabled}
      onClick={onClick}
      className="field-notes-page-turn-button pointer-events-auto grid size-7 place-items-center rounded-full border border-[#8a5435]/20 bg-[#f6ead3]/75 text-[#5b402a]/65 shadow-sm transition-[color,background-color,transform,opacity] hover:scale-105 hover:bg-[#fbf0dc] hover:text-[#49311f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a5435] active:scale-95 disabled:pointer-events-none disabled:opacity-20 motion-reduce:transition-none"
    >
      <Icon aria-hidden size={13} weight="bold" />
    </button>
  );
}

type PageTurnDirection = "previous" | "next";

type AlbumTurn = {
  direction: PageTurnDirection;
  from: number;
  to: number;
};

function DesktopBookStage({
  pages,
  spread,
  turn,
  onTurnEnd,
  onPrevious,
  onNext,
}: {
  pages: ReactNode[];
  spread: number;
  turn: AlbumTurn | null;
  onTurnEnd: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const visibleSpread = turn?.to ?? spread;
  const sourceLeft = turn ? pages[turn.from * 2] : null;
  const sourceRight = turn ? pages[turn.from * 2 + 1] : null;
  const targetLeft = turn ? pages[turn.to * 2] : null;
  const targetRight = turn ? pages[turn.to * 2 + 1] : null;

  return (
    <div
      aria-busy={turn !== null}
      className={`field-notes-book-stage relative ${turn ? "pointer-events-none" : ""}`}
    >
      <div className="field-notes-page-block relative overflow-hidden rounded-md border border-[#b9a789]">
        <div className="field-notes-page-spread grid grid-cols-2">
          {pages[visibleSpread * 2]}
          {pages[visibleSpread * 2 + 1]}
        </div>

        {turn && (
          <div
            aria-hidden
            data-side={turn.direction === "next" ? "left" : "right"}
            className={`field-notes-turn-static absolute inset-y-0 z-10 w-1/2 overflow-hidden ${turn.direction === "next" ? "left-0" : "right-0"}`}
          >
            {turn.direction === "next" ? sourceLeft : sourceRight}
          </div>
        )}
      </div>

      {turn && (
        <div
          aria-hidden
          data-direction={turn.direction}
          className="field-notes-turn-leaf absolute inset-y-0 z-20 w-1/2"
          onAnimationEnd={(event) => {
            if (event.currentTarget === event.target) onTurnEnd();
          }}
        >
          <div className="field-notes-turn-face field-notes-turn-front">
            {turn.direction === "next" ? sourceRight : sourceLeft}
          </div>
          <div className="field-notes-turn-face field-notes-turn-back">
            {turn.direction === "next" ? targetLeft : targetRight}
          </div>
        </div>
      )}

      <span
        aria-hidden
        className="field-notes-book-spine pointer-events-none absolute inset-y-0 left-1/2 z-30"
      />

      <div className="field-notes-in-page-controls pointer-events-none absolute inset-x-0 bottom-2 z-40 text-[#5b402a]/65">
        <div className="absolute bottom-0 left-1/4 -translate-x-1/2">
          <PageTurnButton
            direction="previous"
            disabled={spread === 0 || turn !== null}
            onClick={onPrevious}
          />
        </div>
        <div className="absolute bottom-0 left-3/4 -translate-x-1/2">
          <PageTurnButton
            direction="next"
            disabled={spread === DESKTOP_SPREAD_COUNT - 1 || turn !== null}
            onClick={onNext}
          />
        </div>
      </div>
    </div>
  );
}

function MobileBookStage({
  pages,
  page,
  turn,
  onTurnEnd,
  onPrevious,
  onNext,
}: {
  pages: ReactNode[];
  page: number;
  turn: AlbumTurn | null;
  onTurnEnd: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const visiblePage = turn?.to ?? page;
  const [entryReady, setEntryReady] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (entryReady) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setEntryReady(true));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [entryReady]);

  return (
    <div
      aria-busy={turn !== null}
      data-mobile-entry={entryReady ? "open" : "preparing"}
      className={`field-notes-mobile-stage relative ${turn ? "pointer-events-none" : ""}`}
    >
      <div className="field-notes-page-block overflow-hidden rounded-md border border-[#b9a789]">
        {pages[visiblePage]}
      </div>
      {turn && (
        <div
          aria-hidden
          data-direction={turn.direction}
          className="field-notes-mobile-turn-leaf absolute inset-0 z-20"
          onAnimationEnd={(event) => {
            if (event.currentTarget === event.target) onTurnEnd();
          }}
        >
          <div className="field-notes-turn-face field-notes-turn-front">
            {pages[turn.from]}
          </div>
          <div className="field-notes-turn-face field-notes-turn-back">
            {pages[turn.to]}
          </div>
        </div>
      )}
      <div className="field-notes-in-page-controls pointer-events-none absolute inset-x-0 bottom-2 z-40 text-[#5b402a]/65">
        <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
          <PageTurnButton
            direction="previous"
            disabled={page === 0 || turn !== null}
            onClick={onPrevious}
          />
          <PageTurnButton
            direction="next"
            disabled={page === MOBILE_PAGE_COUNT - 1 || turn !== null}
            onClick={onNext}
          />
        </div>
      </div>
    </div>
  );
}

export function CompactAlbum({
  open,
  progress,
  onClose,
}: {
  open: boolean;
  progress: FieldNotesProgress;
  onClose: () => void;
}) {
  const [mobilePage, setMobilePage] = useState(0);
  const [mobileTurn, setMobileTurn] = useState<AlbumTurn | null>(null);
  const [desktopSpread, setDesktopSpread] = useState(0);
  const [desktopTurn, setDesktopTurn] = useState<AlbumTurn | null>(null);
  const desktopPages = [
    <OverviewPage key="desktop:overview" progress={progress} />,
    ...Array.from({ length: DESKTOP_STAMP_PAGE_COUNT }, (_, index) => (
      <StampPage
        key={`desktop:stamps:${index}`}
        pageIndex={index + 1}
        progress={progress}
        stampsPerPage={DESKTOP_STAMPS_PER_PAGE}
      />
    )),
  ];
  const mobilePages = [
    <OverviewPage key="mobile:overview" progress={progress} />,
    ...Array.from({ length: MOBILE_STAMP_PAGE_COUNT }, (_, index) => (
      <StampPage
        key={`mobile:stamps:${index}`}
        pageIndex={index + 1}
        progress={progress}
        stampsPerPage={MOBILE_STAMPS_PER_PAGE}
      />
    )),
  ];

  const beginDesktopTurn = useCallback(
    (direction: PageTurnDirection) => {
      if (desktopTurn) return;
      const to = desktopSpread + (direction === "next" ? 1 : -1);
      if (to < 0 || to >= DESKTOP_SPREAD_COUNT) return;
      setDesktopTurn({ direction, from: desktopSpread, to });
    },
    [desktopSpread, desktopTurn],
  );

  const beginMobileTurn = useCallback(
    (direction: PageTurnDirection) => {
      if (mobileTurn) return;
      const to = mobilePage + (direction === "next" ? 1 : -1);
      if (to < 0 || to >= MOBILE_PAGE_COUNT) return;
      setMobileTurn({ direction, from: mobilePage, to });
    },
    [mobilePage, mobileTurn],
  );

  const finishDesktopTurn = useCallback(() => {
    if (!desktopTurn) return;
    setDesktopSpread(desktopTurn.to);
    setDesktopTurn(null);
  }, [desktopTurn]);

  const finishMobileTurn = useCallback(() => {
    if (!mobileTurn) return;
    setMobilePage(mobileTurn.to);
    setMobileTurn(null);
  }, [mobileTurn]);

  useEffect(() => {
    if (!desktopTurn && !mobileTurn) return;
    const fallback = window.setTimeout(() => {
      finishDesktopTurn();
      finishMobileTurn();
    }, 960);
    return () => window.clearTimeout(fallback);
  }, [desktopTurn, finishDesktopTurn, finishMobileTurn, mobileTurn]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isEditableShortcutTarget(event.target) ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      )
        return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? "previous" : "next";
      if (window.matchMedia("(min-width: 768px)").matches) {
        beginDesktopTurn(direction);
      } else {
        beginMobileTurn(direction);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginDesktopTurn, beginMobileTurn, open]);

  return (
    <TooltipProvider delayDuration={180} skipDelayDuration={80}>
      <Dialog.Portal>
        <Dialog.Overlay className="field-notes-album-overlay bg-[#17212a]/16 fixed inset-0 z-[5000] backdrop-blur-[1px]" />
        <Dialog.Content
          data-stacks-scrollable
          // Opening with F must not paint a focus ring on the first control
          // (the close button). Focus stays put; the dialog still traps Tab
          // and Escape still closes through the dismissable layer.
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="field-notes-album fixed left-1/2 top-1/2 z-[5001] max-h-[min(45rem,calc(100dvh-0.5rem))] w-[min(28rem,calc(100vw-0.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-visible rounded-[1.05rem] border border-[#29180f] bg-[#54351f] p-1.5 focus:outline-none md:max-h-[min(45rem,calc(100dvh-1rem))] md:w-[min(50rem,calc(100vw-1rem))] md:p-3"
        >
          <Dialog.Title className="sr-only">Field Notes album</Dialog.Title>
          <Dialog.Description className="sr-only">
            An album of {FIELD_NOTES.length} stamps earned by exploring the
            room.
          </Dialog.Description>
          <span aria-hidden className="field-notes-cover-tooling" />
          <span aria-hidden className="field-notes-cover-wear" />

          <div className="field-notes-close-motion absolute right-4 top-4 z-50">
            <button
              type="button"
              aria-label="Close Field Notes"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full border border-[#5a4229]/10 bg-[#f2e7cf]/75 text-[#493721]/55 shadow-sm transition-[color,background-color,transform] hover:rotate-3 hover:scale-105 hover:bg-[#f2e7cf] hover:text-[#493721] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5a4229] active:scale-95 motion-reduce:transition-none"
            >
              <XIcon aria-hidden size={14} weight="bold" />
            </button>
          </div>

          <div className="relative z-10 hidden md:block">
            <DesktopBookStage
              pages={desktopPages}
              spread={desktopSpread}
              turn={desktopTurn}
              onTurnEnd={finishDesktopTurn}
              onPrevious={() => beginDesktopTurn("previous")}
              onNext={() => beginDesktopTurn("next")}
            />
          </div>

          <div className="relative z-10 md:hidden">
            <MobileBookStage
              pages={mobilePages}
              page={mobilePage}
              turn={mobileTurn}
              onTurnEnd={finishMobileTurn}
              onPrevious={() => beginMobileTurn("previous")}
              onNext={() => beginMobileTurn("next")}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </TooltipProvider>
  );
}

function CollectionGlyph({
  collecting,
  foundCount,
  targetRef,
}: {
  collecting: boolean;
  foundCount: number;
  targetRef: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <span
      ref={targetRef}
      aria-hidden
      data-collecting={collecting ? "true" : "false"}
      className="field-notes-collection-glyph relative grid size-[22px] place-items-center"
    >
      <span className="field-notes-collection-book-icon absolute grid place-items-center">
        <BookIcon className="stacks-rail-icon" size={22} weight="bold" />
        <span className="field-notes-book-count pointer-events-none absolute font-sans font-extrabold tabular-nums">
          {foundCount}
        </span>
      </span>
      <span className="field-notes-mini-album absolute left-1/2 top-1/2 h-[17px] w-7">
        <span className="field-notes-mini-album-leather absolute inset-0 overflow-hidden rounded-[3px] border border-[#29180f] bg-[#54351f] shadow-[0_3px_6px_rgba(20,11,6,0.32)]">
          <span className="field-notes-mini-album-tooling absolute inset-px rounded-[2px] border border-dashed border-[#dfb36e]/25" />
          <span className="field-notes-mini-album-paper absolute inset-[2px] flex overflow-hidden rounded-[1px] bg-[#f2e7cf] shadow-[inset_0_0_3px_rgba(91,63,32,0.18)]">
            <span className="field-notes-mini-album-left-page relative h-full w-1/2 border-r border-[#765337]/20" />
            <span className="field-notes-mini-album-right-page relative h-full w-1/2" />
            <span className="field-notes-mini-album-spine absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-[#624326]/20 shadow-[-1px_0_2px_rgba(54,33,18,0.18),1px_0_1px_rgba(255,255,255,0.25)]" />
          </span>
        </span>
      </span>
      <span className="field-notes-collection-receipt absolute size-5 rounded-full border border-current" />
      <span className="field-notes-collection-spark absolute -right-1.5 -top-1 text-[8px] leading-none">
        ✦
      </span>
    </span>
  );
}

function FieldNotesTrigger({
  awardId,
  foundCount,
  onOpen,
  targetRef,
}: {
  awardId: FieldNoteId | undefined;
  foundCount: number;
  onOpen: () => void;
  targetRef: RefObject<HTMLSpanElement | null>;
}) {
  const collecting = awardId !== undefined;
  const status = `${foundCount} of ${FIELD_NOTES.length} found`;
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const openFieldNotes = () => {
    setTooltipOpen(false);
    onOpen();
  };
  return (
    <TooltipProvider delayDuration={260} skipDelayDuration={100}>
      <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Open Field Notes, ${status}`}
            aria-keyshortcuts="F"
            onClick={openFieldNotes}
            className={`field-notes-trigger stacks-mobile-secondary-chrome stacks-on-background-text pointer-events-auto grid size-9 place-items-center rounded-full text-foreground transition-[color,transform,background-color] hover:bg-foreground/[0.09] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current active:scale-95 active:bg-foreground/[0.14] motion-reduce:transition-none ${collecting ? "bg-foreground/[0.07] text-foreground" : "text-foreground/75"}`}
          >
            <CollectionGlyph
              key={awardId ?? "idle"}
              collecting={collecting}
              foundCount={foundCount}
              targetRef={targetRef}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          sideOffset={8}
          className="field-notes-glass-tooltip field-notes-trigger-tooltip z-[2200] px-3 py-2"
        >
          <div className="flex items-center gap-1.5">
            <p className="field-notes-trigger-title field-notes-hand field-notes-strong text-base leading-none">
              Field Notes
            </p>
            <Keycap aria-hidden="true">F</Keycap>
          </div>
          <p className="field-notes-fine mt-1 leading-none text-white/70">
            {status}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MobileAwardNotice({
  note,
  onOpen,
  triggerRef,
}: {
  note: FieldNoteDefinition | undefined;
  onOpen: () => void;
  triggerRef: RefObject<HTMLSpanElement | null>;
}) {
  const stampRef = useRef<HTMLSpanElement>(null);
  const [flightStyle, setFlightStyle] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!note) {
      setFlightStyle(undefined);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const stamp = stampRef.current;
      const trigger = triggerRef.current;
      if (!stamp || !trigger) return;
      setFlightStyle(awardFlightStyle(stamp, trigger));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [note, triggerRef]);

  if (!note || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-rarity={note.rarity.toLowerCase()}
      className="field-notes-mobile-award-shell pointer-events-none fixed z-[2100]"
      style={flightStyle}
    >
      <button
        type="button"
        aria-label={`Open Field Notes to view ${note.title}`}
        onClick={onOpen}
        data-ready={flightStyle ? "true" : "false"}
        className="field-notes-award-composite field-notes-mobile-award pointer-events-auto relative inline-flex min-h-10 items-start text-left text-[#6e382d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e6c8]"
      >
        <span className="field-notes-award-stamp-slot field-notes-mobile-award-stamp-slot relative block min-h-10 shrink-0">
          <span
            ref={stampRef}
            aria-hidden
            data-ready={flightStyle ? "true" : "false"}
            className="field-notes-mobile-award-stamp absolute z-[2] size-24"
            style={stampStyle(note)}
          >
            <StampPaper note={note} />
          </span>
        </span>
        <span className="field-notes-paper-slip field-notes-mobile-award-copy relative inline-flex min-h-10 shrink-0 flex-col justify-center px-2 py-1">
          <span className="field-notes-award-text block">
            <span className="field-notes-award-kicker field-notes-hand field-notes-strong block leading-4 tracking-[0.02em] opacity-55">
              Field note found
            </span>
            <span className="field-notes-award-title field-notes-hand block font-bold leading-4">
              {note.title}
            </span>
          </span>
        </span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        Field note found: {note.title}
      </span>
    </div>,
    document.body,
  );
}

function AwardNotice({
  note,
  onOpen,
  triggerRef,
}: {
  note: FieldNoteDefinition | undefined;
  onOpen: () => void;
  triggerRef: RefObject<HTMLSpanElement | null>;
}) {
  const stampRef = useRef<HTMLDivElement>(null);
  const [flightStyle, setFlightStyle] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!note) {
      setFlightStyle(undefined);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const stamp = stampRef.current;
      const trigger = triggerRef.current;
      if (!stamp || !trigger) return;

      setFlightStyle(awardFlightStyle(stamp, trigger));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [note, triggerRef]);

  if (!note || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-rarity={note.rarity.toLowerCase()}
      className="field-notes-award-scene pointer-events-none fixed z-[2100]"
      style={flightStyle}
    >
      <div className="field-notes-award-composite field-notes-desktop-award-composite pointer-events-none absolute inline-flex items-start">
        <div className="field-notes-award-stamp-slot field-notes-desktop-award-stamp-slot relative min-h-24 shrink-0">
          <div
            ref={stampRef}
            aria-hidden
            data-ready={flightStyle ? "true" : "false"}
            className="field-notes-award-stamp absolute top-0 size-24"
            style={stampStyle(note)}
          >
            <StampPaper note={note} />
          </div>
        </div>
        <button
          type="button"
          aria-label={`Open Field Notes to view ${note.title}`}
          onClick={onOpen}
          data-ready={flightStyle ? "true" : "false"}
          className="field-notes-paper-slip field-notes-award-copy pointer-events-auto relative mt-2 shrink-0 -rotate-1 cursor-pointer px-3 py-2 text-left text-[#6e382d] transition-[background-color,border-color] hover:border-[#8e4f3b]/45 hover:bg-[#f9ebcf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e6c8]"
        >
          <span
            aria-hidden
            className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rotate-45 border-b border-l border-[#8e4f3b]/30 bg-[#f6e6c8]"
          />
          <div className="field-notes-award-text">
            <p className="field-notes-award-kicker field-notes-hand field-notes-strong leading-4 tracking-[0.02em] opacity-55">
              Field note found
            </p>
            <p className="field-notes-award-title field-notes-hand text-base font-bold leading-4">
              {note.title}
            </p>
          </div>
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default function FieldNotesChrome() {
  const progress = useFieldNotesProgress();
  const foundCount = totalFound(progress);
  const showTrigger = foundCount > 0;
  const [open, setOpen] = useState(() =>
    typeof window === "undefined"
      ? false
      : fieldNotesOpenFromSearch(window.location.search),
  );
  const openRef = useRef(open);
  const [awardQueue, setAwardQueue] = useState<FieldNoteId[]>([]);
  const [firstAwardReleased, setFirstAwardReleased] = useState(false);
  const triggerWasVisible = useRef(showTrigger);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const setOpenWithUrl = useCallback((nextState: SetStateAction<boolean>) => {
    const next =
      typeof nextState === "function" ? nextState(openRef.current) : nextState;
    openRef.current = next;
    window.history.replaceState(
      window.history.state,
      "",
      fieldNotesUrl(window.location.href, next),
    );
    setOpen(next);
  }, []);

  useEffect(() => startFieldNotes(), []);
  useEffect(
    () => connectFieldNotesShortcut(() => setOpenWithUrl((value) => !value)),
    [setOpenWithUrl],
  );
  useEffect(() => {
    const syncFromUrl = () => {
      const next = fieldNotesOpenFromSearch(window.location.search);
      openRef.current = next;
      setOpen(next);
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);
  useEffect(
    () =>
      subscribeFieldNoteAwards((ids) =>
        setAwardQueue((queue) => [...queue, ...ids]),
      ),
    [],
  );
  const firstTriggerRevealPending =
    showTrigger && awardQueue.length > 0 && !triggerWasVisible.current;
  useEffect(() => {
    if (!showTrigger) {
      triggerWasVisible.current = false;
      setFirstAwardReleased(false);
      return;
    }
    if (awardQueue.length === 0) triggerWasVisible.current = true;
  }, [awardQueue.length, showTrigger]);
  useEffect(() => {
    if (!firstTriggerRevealPending) return;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(
      () => {
        triggerWasVisible.current = true;
        setFirstAwardReleased(true);
      },
      reduceMotion ? 0 : FIRST_TRIGGER_REVEAL_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [firstTriggerRevealPending]);
  const activeAwardId =
    firstTriggerRevealPending && !firstAwardReleased
      ? undefined
      : awardQueue[0];
  const activeAward = activeAwardId
    ? FIELD_NOTE_BY_ID.get(activeAwardId)
    : undefined;
  useEffect(() => {
    if (!activeAward) return;
    const timeout = window.setTimeout(
      () => setAwardQueue((queue) => queue.slice(1)),
      AWARD_ANIMATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [activeAward]);
  useEffect(() => {
    if (open) {
      document.documentElement.setAttribute("data-field-notes-open", "");
      return;
    }
    const timeout = window.setTimeout(
      () => document.documentElement.removeAttribute("data-field-notes-open"),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [open]);
  useEffect(
    () => () =>
      document.documentElement.removeAttribute("data-field-notes-open"),
    [],
  );

  const openAward = () => {
    setAwardQueue([]);
    setOpenWithUrl(true);
  };
  return (
    <>
      <style>{`
        html[data-field-notes-open] body {
          pointer-events: auto !important;
        }
        .field-notes-album,
        .field-notes-hand,
        .field-notes-fine,
        .field-notes-strong {
          font-family: "handsome-pro", "Bradley Hand", "Segoe Print", cursive;
          font-style: normal;
          font-synthesis: none;
        }
        .field-notes-album {
          --field-notes-page-height: min(34rem, calc(100dvh - 4.75rem));
          --field-notes-stamp-size: clamp(3.5rem, min(calc((100vw - 3.75rem) / 3), calc((100dvh - 13.5rem) / 4)), 6rem);
          --field-notes-stamp-gap-x: .375rem;
          --field-notes-stamp-gap-y: .625rem;
          --field-notes-stamp-grid-top: 4rem;
          --field-notes-book-shadow-entry: 0 2px 4px rgba(23,12,7,.28), 0 8px 24px rgba(18,27,33,.22);
          --field-notes-book-shadow-peak: 0 4px 7px rgba(23,12,7,.38), 0 24px 54px rgba(18,27,33,.38);
          --field-notes-book-shadow-rest: 0 3px 6px rgba(23,12,7,.34), 0 18px 44px rgba(18,27,33,.34);
          font-size: 12px;
          font-weight: 400;
          transform-origin: center 58%;
          border-radius: 1.05rem .88rem 1.12rem .94rem;
          background-color: #54351f;
          background-image:
            radial-gradient(ellipse at 0 0, rgba(239,202,137,.18), transparent 16%),
            radial-gradient(ellipse at 100% 0, rgba(31,16,9,.28), transparent 18%),
            radial-gradient(ellipse at 0 100%, rgba(28,14,8,.3), transparent 19%),
            radial-gradient(ellipse at 100% 100%, rgba(225,181,112,.12), transparent 17%),
            repeating-linear-gradient(103deg, transparent 0 7px, rgba(255,255,255,.018) 8px, transparent 10px),
            repeating-radial-gradient(ellipse at 32% 41%, rgba(30,15,8,.09) 0 .6px, transparent .9px 5px);
          box-shadow:
            inset 0 0 0 2px rgba(231,190,122,.1),
            inset 0 0 26px rgba(25,12,7,.42),
            var(--field-notes-book-shadow-rest);
        }
        .field-notes-stamp-tooltip,
        .field-notes-album-paper,
        .field-notes-award-copy,
        .field-notes-mobile-award-copy {
          --field-notes-rule-step: 24px;
          --field-notes-rule-color: rgba(63,126,140,.08);
          --field-notes-rules: repeating-linear-gradient(
            180deg,
            transparent 0 calc(var(--field-notes-rule-step) - 1px),
            var(--field-notes-rule-color) calc(var(--field-notes-rule-step) - 1px),
            var(--field-notes-rule-color) var(--field-notes-rule-step)
          );
        }
        .field-notes-stamp-tooltip {
          --field-notes-rule-offset: 7px;
          background-image: var(--field-notes-rules);
          background-position: 0 var(--field-notes-rule-offset);
        }
        /* Fully opaque: the slip floats over the busy stamp grid, and the
           shared paper-slip's 95% alpha lets the stamps ghost through.
           Doubled class beats .field-notes-paper-slip's later background. */
        .field-notes-stamp-tooltip.field-notes-stamp-tooltip {
          background-color: #f6e6c8;
        }
        .field-notes-paper-slip {
          background-color: rgba(246,230,200,.95);
          border: 1px solid rgba(142,79,59,.3);
          border-radius: .4rem;
          box-shadow:
            inset 0 1px 0 rgba(255,249,232,.65),
            0 8px 24px rgba(22,14,8,.16);
        }
        .field-notes-award-copy,
        .field-notes-mobile-award-copy {
          --field-notes-rule-step: 16px;
          --field-notes-rule-offset: 5px;
          box-sizing: border-box;
          inline-size: max-content;
          min-inline-size: var(--field-notes-award-copy-min);
          max-inline-size: var(--field-notes-award-copy-max);
          background-image: var(--field-notes-rules);
          background-position: 0 var(--field-notes-rule-offset);
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .field-notes-award-copy {
          --field-notes-award-copy-min: min(9rem, var(--field-notes-award-paper-viewport-max));
          --field-notes-award-copy-max: min(20rem, var(--field-notes-award-paper-viewport-max));
        }
        .field-notes-mobile-award-copy {
          --field-notes-award-copy-min: min(8rem, var(--field-notes-award-paper-viewport-max));
          --field-notes-award-copy-max: min(15rem, var(--field-notes-award-paper-viewport-max));
        }
        .field-notes-album-overlay[data-state="open"] {
          animation: field-notes-album-overlay-in 360ms ease-out both;
        }
        .field-notes-album-overlay[data-state="closed"] {
          animation: field-notes-album-overlay-out 240ms ease-in both;
        }
        .field-notes-album[data-state="open"] {
          animation: field-notes-album-open 560ms cubic-bezier(.18,.82,.22,1) both;
        }
        .field-notes-album[data-state="closed"] {
          pointer-events: none;
          animation: field-notes-album-close 280ms cubic-bezier(.55,.02,.78,.28) both;
        }
        .field-notes-album[data-state="open"] .field-notes-book-stage {
          animation: field-notes-pages-open 620ms cubic-bezier(.18,.82,.22,1) both;
        }
        .field-notes-album[data-state="closed"] .field-notes-book-stage {
          animation: field-notes-pages-close 250ms cubic-bezier(.55,.02,.78,.28) both;
        }
        .field-notes-mobile-stage[data-mobile-entry="preparing"] {
          opacity: .46;
          transform: translateY(10px) rotateX(2.4deg) scale(.965);
        }
        .field-notes-mobile-stage[data-mobile-entry="open"] {
          animation: field-notes-mobile-stage-open 720ms cubic-bezier(.2,.68,.2,1) both;
        }
        .field-notes-album[data-state="closed"] .field-notes-mobile-stage {
          animation: field-notes-mobile-stage-close 360ms cubic-bezier(.32,0,.28,1) both;
        }
        .field-notes-album[data-state="open"] .field-notes-close-motion {
          animation: field-notes-close-control-in 320ms 190ms cubic-bezier(.16,1,.3,1) both;
        }
        .field-notes-album[data-state="closed"] .field-notes-close-motion {
          animation: field-notes-close-control-out 140ms ease-in both;
        }
        @media (max-width: 767px) {
          .field-notes-album-overlay {
            background-color: rgba(87,69,53,.14) !important;
          }
          .field-notes-album-overlay[data-state="open"] {
            animation: field-notes-mobile-overlay-in 700ms cubic-bezier(.2,.68,.2,1) both;
          }
          .field-notes-album-overlay[data-state="closed"] {
            animation: field-notes-mobile-overlay-out 400ms cubic-bezier(.32,0,.28,1) both;
          }
          .field-notes-album[data-state="open"] {
            animation: field-notes-mobile-album-open 760ms cubic-bezier(.2,.68,.2,1) both;
          }
          .field-notes-album[data-state="closed"] {
            animation: field-notes-mobile-album-close 380ms cubic-bezier(.32,0,.28,1) both;
          }
        }
        .field-notes-book-count {
          left: 56%;
          top: 51%;
          color: currentColor;
          font-size: 8px;
          letter-spacing: -.08em;
          line-height: 1;
          transform: translate(-50%,-50%);
        }
        .field-notes-fine {
          font-size: 12px;
          font-weight: 400;
        }
        .field-notes-overview-page .field-notes-fine {
          font-size: 20px;
          line-height: 24px;
        }
        .field-notes-title {
          position: relative;
          transform: translateY(10px) rotate(-1deg);
          text-shadow: 1px 2px 0 rgba(144, 94, 70, .12);
        }
        .field-notes-overview-copy {
          font-size: 22px;
          line-height: 24px;
          transform: translateY(2px);
        }
        .field-notes-latest-heading {
          transform: translateY(1px);
        }
        .field-notes-title::after {
          content: "";
          position: absolute;
          right: -9%;
          bottom: -.55rem;
          left: 3%;
          height: .6rem;
          border-top: 2px solid rgba(144, 94, 70, .38);
          border-radius: 50%;
          transform: rotate(-1.5deg);
        }
        .field-notes-botanical-sketch {
          opacity: .48;
          transition: opacity 180ms ease;
        }
        .field-notes-botanical-color,
        .field-notes-botanical-butterfly,
        .field-notes-botanical-bloom {
          opacity: 0;
          transition: opacity 380ms ease;
        }
        .field-notes-botanical-color {
          fill: #718765;
        }
        .field-notes-botanical-butterfly {
          fill: #9c694f;
        }
        .field-notes-botanical-bloom {
          fill: #bf865f;
        }
        .field-notes-overview-page:not([data-milestone="none"]) .field-notes-botanical-color,
        .field-notes-overview-page[data-milestone="twenty"] .field-notes-botanical-butterfly,
        .field-notes-overview-page[data-milestone="complete"] .field-notes-botanical-butterfly,
        .field-notes-overview-page[data-milestone="complete"] .field-notes-botanical-bloom {
          opacity: .62;
        }
        .field-notes-botanical-sketch svg {
          transform: rotate(-5deg);
          filter: drop-shadow(.5px .6px 0 rgba(144,94,70,.16));
        }
        .field-notes-botanical-sketch:hover,
        .field-notes-botanical-sketch:focus-visible {
          opacity: .72;
        }
        .field-notes-botanical-sketch svg path {
          stroke-dasharray: 1;
          stroke-dashoffset: 0;
          stroke-width: 1.45;
          vector-effect: non-scaling-stroke;
        }
        .field-notes-botanical-sketch:hover svg path,
        .field-notes-botanical-sketch:focus-visible svg path {
          animation: field-notes-botanical-draw-hover 920ms ease-in-out both;
        }
        .field-notes-botanical-sketch[data-rustling="true"] svg path {
          animation: field-notes-botanical-draw-click 920ms ease-in-out both;
        }
        .field-notes-botanical-sketch svg path:nth-child(1) { animation-delay: 0ms; }
        .field-notes-botanical-sketch svg path:nth-child(2) { animation-delay: 45ms; }
        .field-notes-botanical-sketch svg path:nth-child(3) { animation-delay: 90ms; }
        .field-notes-botanical-sketch svg path:nth-child(4) { animation-delay: 135ms; }
        .field-notes-botanical-sketch svg path:nth-child(5) { animation-delay: 180ms; }
        .field-notes-botanical-sketch svg path:nth-child(6) { animation-delay: 225ms; }
        .field-notes-botanical-sketch svg path:nth-child(7) { animation-delay: 270ms; }
        .field-notes-botanical-sketch svg path:nth-child(8) { animation-delay: 315ms; }
        .field-notes-botanical-sketch svg path:nth-child(9) { animation-delay: 360ms; }
        .field-notes-botanical-sketch svg path:nth-child(10) { animation-delay: 405ms; }
        .field-notes-botanical-sketch svg path:nth-child(11) { animation-delay: 450ms; }
        .field-notes-count-medallion {
          color: #4a301f;
          border: 1px solid rgba(128, 76, 45, .5);
          background:
            radial-gradient(circle at 35% 28%, rgba(255, 250, 225, .9), transparent 30%),
            radial-gradient(circle, rgba(201, 148, 82, .16), transparent 64%);
          box-shadow:
            0 0 0 3px #f2e7cf,
            0 0 0 5px rgba(144, 94, 70, .38),
            0 0 0 9px #f2e7cf,
            0 0 0 10px rgba(144, 94, 70, .2),
            inset 0 0 0 3px rgba(255, 250, 230, .5),
            inset 0 0 22px rgba(151, 92, 48, .12),
            0 8px 18px rgba(91, 57, 27, .1);
          transform: rotate(-2deg);
        }
        .field-notes-overview-page[data-milestone="complete"] .field-notes-count-medallion {
          border-color: rgba(151, 106, 27, .72);
          box-shadow:
            0 0 0 3px #f2e7cf,
            0 0 0 5px rgba(184, 135, 38, .7),
            0 0 0 9px #f2e7cf,
            0 0 0 10px rgba(127, 62, 52, .34),
            inset 0 0 0 3px rgba(255, 250, 230, .64),
            inset 0 0 22px rgba(178, 127, 35, .2),
            0 8px 18px rgba(91, 57, 27, .14);
        }
        .field-notes-completion-foil {
          z-index: 0;
        }
        .field-notes-completion-foil::after {
          content: "";
          position: absolute;
          inset: -35%;
          background: linear-gradient(112deg, transparent 34%, rgba(232,190,78,.08) 43%, rgba(255,241,165,.58) 50%, rgba(184,127,31,.1) 57%, transparent 66%);
          transform: translateX(-85%);
          animation: field-notes-completion-foil 1300ms 260ms ease-out both;
        }
        .field-notes-completion-seal {
          display: grid;
          width: 5.25rem;
          min-height: 2.35rem;
          place-items: center;
          padding: .2rem .45rem;
          color: rgba(112, 48, 45, .76);
          border: 2px double rgba(112, 48, 45, .58);
          border-radius: 50%;
          font-size: 14px !important;
          line-height: 14px !important;
          text-align: center;
          text-transform: uppercase;
          transform: rotate(-5deg);
          animation: field-notes-completion-seal 460ms 520ms cubic-bezier(.2,.8,.2,1.15) both;
        }
        .field-notes-count-inner::before,
        .field-notes-count-inner::after {
          content: "";
          position: absolute;
          inset: 5px;
          border-radius: 999px;
          border: 1px solid rgba(144, 94, 70, .16);
        }
        .field-notes-count-inner::after {
          inset: 10px;
          border-style: dotted;
        }
        .field-notes-count-number {
          color: #3f2819;
          font-size: 60px;
          transform: translateY(3px);
          text-shadow: 1px 2px 0 rgba(177, 119, 69, .18);
        }
        .field-notes-count-caption {
          transform: translateY(-3px);
        }
        .field-notes-count-jewel {
          position: absolute;
          z-index: 2;
          width: .48rem;
          height: .48rem;
          border: 1px solid rgba(128, 76, 45, .5);
          background: #f2e7cf;
          box-shadow: inset 0 0 0 1px rgba(255, 250, 230, .7);
          transform: rotate(45deg);
        }
        .field-notes-count-jewel-top {
          top: -.3rem;
          left: calc(50% - .24rem);
        }
        .field-notes-count-jewel-right {
          top: calc(50% - .24rem);
          right: -.3rem;
        }
        .field-notes-count-jewel-bottom {
          bottom: -.3rem;
          left: calc(50% - .24rem);
        }
        .field-notes-count-jewel-left {
          top: calc(50% - .24rem);
          left: -.3rem;
        }
        .field-notes-hand,
        .field-notes-strong {
          font-weight: 700;
        }
        .field-notes-cover-tooling,
        .field-notes-cover-wear {
          position: absolute;
          inset: 5px;
          z-index: 0;
          border-radius: .78rem;
          pointer-events: none;
        }
        .field-notes-cover-tooling {
          border: 1px solid rgba(224,181,111,.2);
          box-shadow:
            0 0 0 1px rgba(31,16,9,.45),
            inset 0 0 0 1px rgba(31,16,9,.38);
        }
        .field-notes-cover-tooling::before {
          content: "";
          position: absolute;
          inset: 4px;
          border: 1px dashed rgba(224,181,111,.12);
          border-radius: .6rem;
        }
        .field-notes-cover-wear {
          inset: 0;
          background:
            radial-gradient(circle at 0 0, rgba(242,205,142,.14) 0 4px, rgba(35,18,10,.2) 5px 13px, transparent 28px),
            radial-gradient(circle at 100% 0, rgba(35,18,10,.3) 0 8px, transparent 28px),
            radial-gradient(circle at 0 100%, rgba(35,18,10,.32) 0 9px, transparent 30px),
            radial-gradient(circle at 100% 100%, rgba(233,194,129,.11) 0 5px, rgba(35,18,10,.22) 7px 14px, transparent 31px);
          mix-blend-mode: multiply;
        }
        .field-notes-postage {
          container-type: inline-size;
          transition: left 220ms cubic-bezier(.2,.8,.2,1), top 220ms cubic-bezier(.2,.8,.2,1), transform 180ms ease;
        }
        .field-notes-postage[data-state="earned"][data-movable="true"] {
          position: absolute;
          left: var(--stamp-home-left);
          top: var(--stamp-home-top);
          z-index: 2;
          width: var(--field-notes-stamp-size);
          height: var(--field-notes-stamp-size);
          cursor: grab;
          pointer-events: auto;
          touch-action: none;
          transform: translate3d(-50%,-50%,0) translate3d(var(--stamp-x),var(--stamp-y),0) rotate(calc(var(--stamp-tilt) + var(--stamp-user-tilt)));
        }
        .field-notes-postage[data-state="earned"][data-movable="true"][data-placed="true"] {
          left: var(--stamp-page-left);
          top: var(--stamp-page-top);
        }
        .field-notes-postage[data-dragging="true"] {
          z-index: 6;
          cursor: grabbing;
          transition: none;
        }
        .field-notes-postage[data-state="earned"] {
          transform: translate3d(var(--stamp-x), var(--stamp-y), 0) rotate(var(--stamp-tilt));
        }
        .field-notes-postage:hover,
        .field-notes-postage:focus-visible {
          z-index: 4;
        }
        .field-notes-stamp-shadow,
        .field-notes-stamp-paper,
        .field-notes-stamp-art {
          min-height: 0;
          min-width: 0;
        }
        .field-notes-postage[data-state="earned"]:not([data-movable="true"]):hover,
        .field-notes-postage[data-state="earned"]:not([data-movable="true"]):focus-visible {
          transform: translate3d(var(--stamp-x), var(--stamp-y), 0) rotate(var(--stamp-tilt));
        }
        .field-notes-stamp-shadow {
          filter: drop-shadow(0 4px 5px rgba(45,29,15,.2));
          transform: scale(1);
          transition: filter 180ms ease, transform 220ms cubic-bezier(.2,.8,.2,1);
        }
        .field-notes-postage[data-state="earned"][data-movable="true"]:active .field-notes-stamp-shadow,
        .field-notes-postage[data-dragging="true"] .field-notes-stamp-shadow {
          filter: drop-shadow(0 12px 10px rgba(45,29,15,.28));
          transform: scale(1.1);
        }
        .field-notes-postage[data-dragging="true"] .field-notes-stamp-shadow {
          /* Transform must not transition mid-drag or the stamp lags the
             pointer; the pickup scale eases in through the :active rule
             above before the drag threshold trips. */
          transition: filter 120ms ease;
          will-change: transform;
        }
        .field-notes-stamp-glyph {
          min-width: 0;
          width: 100%;
          height: 100%;
          align-content: center;
        }
        .field-notes-stamp-lettering {
          color: currentColor;
          pointer-events: none;
        }
        .field-notes-stamp-primary,
        .field-notes-stamp-secondary,
        .field-notes-stamp-denomination {
          position: absolute;
          white-space: nowrap;
        }
        .field-notes-stamp-primary,
        .field-notes-stamp-secondary {
          max-width: calc(100% - 8px);
          overflow: hidden;
        }
        .field-notes-stamp-denomination {
          max-width: none;
          overflow: visible;
          line-height: 1;
        }
        .field-notes-stamp-lettering[data-lettering="micro"] {
          font-family: "Arial Narrow", "Helvetica Neue", sans-serif;
        }
        .field-notes-stamp-lettering[data-lettering="micro"] .field-notes-stamp-primary {
          bottom: 4px;
          left: 4px;
          font-size: clamp(5px, 7cqi, 7px);
          font-weight: 800;
          letter-spacing: .08em;
        }
        .field-notes-stamp-lettering[data-lettering="micro"] .field-notes-stamp-secondary {
          top: 4px;
          left: 4px;
          font-size: 5px;
          letter-spacing: .12em;
          opacity: .72;
        }
        .field-notes-stamp-lettering[data-lettering="micro"] .field-notes-stamp-denomination {
          right: 4px;
          bottom: 3px;
          font-family: Georgia, serif;
          font-size: clamp(9px, 13cqi, 13px);
          font-weight: 700;
        }
        .field-notes-stamp-lettering[data-lettering="denomination"] .field-notes-stamp-primary {
          bottom: 4px;
          left: 4px;
          max-width: calc(100% - 8px);
          font-family: "Arial Narrow", sans-serif;
          font-size: clamp(6px, 8cqi, 8px);
          font-weight: 900;
          letter-spacing: .04em;
        }
        .field-notes-stamp-lettering[data-lettering="denomination"] .field-notes-stamp-secondary {
          top: 4px;
          left: 4px;
          font-size: 5px;
          letter-spacing: .11em;
          opacity: .7;
        }
        .field-notes-stamp-lettering[data-lettering="denomination"] .field-notes-stamp-denomination {
          top: 5px;
          right: 6px;
          font-family: Georgia, serif;
          font-size: clamp(16px, 26cqi, 24px);
          font-weight: 700;
          letter-spacing: -.08em;
          opacity: .86;
        }
        .field-notes-stamp-art[data-lettering="denomination"] .field-notes-stamp-icon-frame {
          transform: translateX(-7px) scale(.84);
        }
        .field-notes-stamp-lettering[data-lettering="poster"] .field-notes-stamp-primary {
          top: 4px;
          right: 3px;
          left: 3px;
          text-align: center;
          font-family: Impact, "Arial Black", sans-serif;
          font-size: clamp(8px, 12cqi, 12px);
          letter-spacing: -.015em;
        }
        .field-notes-stamp-lettering[data-lettering="poster"] .field-notes-stamp-secondary {
          bottom: 4px;
          left: 4px;
          font-size: 5px;
          letter-spacing: .1em;
          opacity: .72;
        }
        .field-notes-stamp-lettering[data-lettering="poster"] .field-notes-stamp-denomination {
          right: 4px;
          bottom: 2px;
          font-family: Georgia, serif;
          font-size: clamp(10px, 15cqi, 15px);
          font-weight: 800;
        }
        .field-notes-stamp-art[data-lettering="poster"] .field-notes-stamp-icon-frame {
          transform: translateY(5px) scale(.78);
        }
        .field-notes-stamp-lettering[data-lettering="vertical"] .field-notes-stamp-primary {
          top: 4px;
          right: 3px;
          max-height: calc(100% - 8px);
          font-family: "Arial Narrow", sans-serif;
          font-size: clamp(5px, 7cqi, 7px);
          font-weight: 900;
          letter-spacing: .05em;
          writing-mode: vertical-rl;
        }
        .field-notes-stamp-lettering[data-lettering="vertical"] .field-notes-stamp-secondary {
          bottom: 4px;
          left: 3px;
          font-size: 5px;
          letter-spacing: .08em;
          transform: rotate(-90deg) translateY(100%);
          transform-origin: left bottom;
        }
        .field-notes-stamp-lettering[data-lettering="vertical"] .field-notes-stamp-denomination {
          top: 3px;
          left: 4px;
          font-family: Georgia, serif;
          font-size: clamp(10px, 16cqi, 16px);
          font-weight: 700;
        }
        .field-notes-stamp-art[data-lettering="vertical"] .field-notes-stamp-icon-frame {
          transform: translateX(-4px) scale(.82);
        }
        .field-notes-stamp-lettering[data-lettering="seal"] .field-notes-stamp-primary {
          right: 4px;
          bottom: 3px;
          left: 4px;
          text-align: center;
          font-family: "handsome-pro", Georgia, serif;
          font-size: clamp(6px, 9cqi, 9px);
          font-weight: 700;
        }
        .field-notes-stamp-lettering[data-lettering="seal"] .field-notes-stamp-secondary {
          top: 4px;
          right: 4px;
          left: 4px;
          text-align: center;
          font-size: 5px;
          letter-spacing: .13em;
          opacity: .68;
        }
        .field-notes-stamp-lettering[data-lettering="seal"] .field-notes-stamp-denomination {
          top: 5px;
          right: 4px;
          font-family: Georgia, serif;
          font-size: clamp(9px, 13cqi, 13px);
          font-weight: 800;
        }
        .field-notes-stamp-lettering[data-lettering="split"] .field-notes-stamp-primary {
          bottom: 4px;
          left: 4px;
          font-family: "Arial Narrow", sans-serif;
          font-size: clamp(6px, 8cqi, 8px);
          font-weight: 900;
        }
        .field-notes-stamp-lettering[data-lettering="split"] .field-notes-stamp-secondary {
          top: 4px;
          right: 4px;
          font-size: 5px;
          letter-spacing: .09em;
          opacity: .68;
        }
        .field-notes-stamp-lettering[data-lettering="split"] .field-notes-stamp-denomination {
          top: 3px;
          left: 4px;
          font-family: Georgia, serif;
          font-size: clamp(12px, 19cqi, 19px);
          font-weight: 800;
        }
        .field-notes-stamp-art[data-lettering="split"] .field-notes-stamp-icon-frame {
          transform: translate(5px,3px) scale(.84);
        }
        .field-notes-stamp-lettering[data-lettering="banner"] .field-notes-stamp-primary {
          right: 0;
          bottom: 0;
          left: 0;
          max-width: none;
          padding: 3px 2px;
          color: var(--stamp-label);
          background: color-mix(in srgb, var(--stamp-ink) 58%, #24170f 42%);
          text-align: center;
          font-family: "Arial Narrow", sans-serif;
          font-size: clamp(6px, 9cqi, 9px);
          font-weight: 900;
          letter-spacing: .05em;
        }
        .field-notes-stamp-lettering[data-lettering="banner"] .field-notes-stamp-secondary {
          top: 4px;
          left: 4px;
          font-size: 5px;
          letter-spacing: .1em;
          opacity: .72;
        }
        .field-notes-stamp-lettering[data-lettering="banner"] .field-notes-stamp-denomination {
          top: 3px;
          right: 4px;
          font-family: Georgia, serif;
          font-size: clamp(10px, 15cqi, 15px);
          font-weight: 800;
        }
        .field-notes-stamp-art[data-lettering="banner"] .field-notes-stamp-icon-frame {
          transform: translateY(-5px) scale(.84);
        }
        .field-notes-stamp-lettering[data-lettering="none"] .field-notes-stamp-denomination {
          right: 4px;
          bottom: 3px;
          font-family: Georgia, serif;
          font-size: clamp(15px, 23cqi, 23px);
          font-weight: 800;
          opacity: .8;
        }
        .field-notes-stamp-art[data-lettering="none"] .field-notes-stamp-icon-frame {
          transform: scale(1.08);
        }
        .field-notes-discovery-mount {
          width: calc(100% - 10px);
          height: calc(100% - 10px);
          color: rgba(82,62,42,.58);
          background: rgba(232,220,197,.16);
          border: 1px dashed rgba(91,68,44,.32);
          box-shadow:
            inset 0 2px 8px rgba(93,65,34,.055),
            inset 0 0 0 5px rgba(242,231,207,.22);
          transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease;
        }
        .field-notes-discovery-mount::before {
          content: "";
          position: absolute;
          inset: 5px;
          border: 1px solid rgba(91,68,44,.09);
          pointer-events: none;
        }
        .field-notes-mount-corners {
          pointer-events: none;
          background:
            linear-gradient(rgba(91,68,44,.22),rgba(91,68,44,.22)) 4px 4px / 10px 1px no-repeat,
            linear-gradient(rgba(91,68,44,.22),rgba(91,68,44,.22)) 4px 4px / 1px 10px no-repeat,
            linear-gradient(rgba(91,68,44,.22),rgba(91,68,44,.22)) calc(100% - 4px) 4px / 10px 1px no-repeat,
            linear-gradient(rgba(91,68,44,.22),rgba(91,68,44,.22)) calc(100% - 4px) 4px / 1px 10px no-repeat,
            linear-gradient(rgba(91,68,44,.22),rgba(91,68,44,.22)) 4px calc(100% - 4px) / 10px 1px no-repeat,
            linear-gradient(rgba(91,68,44,.22),rgba(91,68,44,.22)) 4px calc(100% - 4px) / 1px 10px no-repeat,
            linear-gradient(rgba(91,68,44,.22),rgba(91,68,44,.22)) calc(100% - 4px) calc(100% - 4px) / 10px 1px no-repeat,
            linear-gradient(rgba(91,68,44,.22),rgba(91,68,44,.22)) calc(100% - 4px) calc(100% - 4px) / 1px 10px no-repeat;
        }
        .field-notes-mount-copy {
          gap: 2px;
        }
        .field-notes-mount-icon {
          width: clamp(1.5rem, 46%, 2.35rem);
          aspect-ratio: 1;
          border-radius: 50%;
          background: rgba(91,68,44,.055);
        }
        .field-notes-mount-icon svg {
          width: 82%;
          height: 82%;
        }
        .field-notes-mount-title {
          font-size: clamp(8px, 11cqi, 11px);
        }
        .field-notes-mount-status {
          color: rgba(82,62,42,.5);
        }
        .field-notes-discovery-mount[data-kind="secret"] {
          color: rgba(82,62,42,.38);
          border-style: dotted;
          background: rgba(232,220,197,.1);
        }
        .field-notes-postage[data-state="locked"]:hover .field-notes-discovery-mount,
        .field-notes-postage[data-state="locked"]:focus-visible .field-notes-discovery-mount,
        .field-notes-postage[data-state="secret"]:hover .field-notes-discovery-mount,
        .field-notes-postage[data-state="secret"]:focus-visible .field-notes-discovery-mount {
          color: rgba(82,62,42,.78);
          border-color: rgba(91,68,44,.5);
          background: rgba(232,220,197,.28);
        }
        .field-notes-stamp-paper {
          background: #fbf0d9;
          -webkit-mask:
            radial-gradient(circle at 50% 0, transparent 0 var(--stamp-notch), #000 calc(var(--stamp-notch) + .65px)) top left / var(--stamp-step-x) 100% repeat-x,
            radial-gradient(circle at 50% 100%, transparent 0 var(--stamp-notch), #000 calc(var(--stamp-notch) + .65px)) bottom left / var(--stamp-step-x) 100% repeat-x,
            radial-gradient(circle at 0 50%, transparent 0 var(--stamp-notch), #000 calc(var(--stamp-notch) + .65px)) top left / 100% var(--stamp-step-y) repeat-y,
            radial-gradient(circle at 100% 50%, transparent 0 var(--stamp-notch), #000 calc(var(--stamp-notch) + .65px)) top right / 100% var(--stamp-step-y) repeat-y;
          -webkit-mask-composite: source-in;
          mask:
            radial-gradient(circle at 50% 0, transparent 0 var(--stamp-notch), #000 calc(var(--stamp-notch) + .65px)) top left / var(--stamp-step-x) 100% repeat-x,
            radial-gradient(circle at 50% 100%, transparent 0 var(--stamp-notch), #000 calc(var(--stamp-notch) + .65px)) bottom left / var(--stamp-step-x) 100% repeat-x,
            radial-gradient(circle at 0 50%, transparent 0 var(--stamp-notch), #000 calc(var(--stamp-notch) + .65px)) top left / 100% var(--stamp-step-y) repeat-y,
            radial-gradient(circle at 100% 50%, transparent 0 var(--stamp-notch), #000 calc(var(--stamp-notch) + .65px)) top right / 100% var(--stamp-step-y) repeat-y;
          mask-composite: intersect;
        }
        .field-notes-stamp-paper::before {
          content: "";
          position: absolute;
          inset: 4px;
          z-index: 2;
          pointer-events: none;
        }
        .field-notes-stamp-paper[data-rarity="common"] {
          --stamp-notch: 2.6px;
          --stamp-step-x: 16px;
          --stamp-step-y: 15.5px;
          background: #f8edda;
        }
        .field-notes-stamp-paper[data-rarity="common"]::before {
          border: 1px solid rgba(111,81,54,.28);
        }
        .field-notes-stamp-paper[data-rarity="uncommon"] {
          --stamp-notch: 3.4px;
          --stamp-step-x: 14px;
          --stamp-step-y: 13.5px;
          background: #e3ecdf;
        }
        .field-notes-stamp-paper[data-rarity="uncommon"]::before {
          border: 1px solid rgba(74,111,82,.72);
          box-shadow:
            0 0 0 2px #e3ecdf,
            0 0 0 3px rgba(74,111,82,.28);
        }
        .field-notes-stamp-paper[data-rarity="rare"] {
          --stamp-notch: 4.1px;
          --stamp-step-x: 12.5px;
          --stamp-step-y: 12px;
          background:
            repeating-linear-gradient(
              90deg,
              #dce8f0 0 3px,
              #aec3d2 3px 4px,
              #dce8f0 4px 7px
            );
        }
        .field-notes-stamp-paper[data-rarity="rare"]::before {
          border: 1px solid rgba(55,89,113,.82);
          box-shadow:
            0 0 0 2px rgba(220,232,240,.92),
            0 0 0 3px rgba(55,89,113,.48);
        }
        .field-notes-stamp-paper[data-rarity="legendary"] {
          --stamp-notch: 4.7px;
          --stamp-step-x: 10.5px;
          --stamp-step-y: 11px;
          background-color: #c99720;
          background-image: url("/images/stacks/field-notes-gold-foil.webp");
          background-position: 47% 42%;
          background-size: 190px 190px;
        }
        .field-notes-stamp-paper[data-rarity="legendary"]::before {
          border: 2px solid rgba(107,48,68,.88);
          box-shadow: inset 0 0 0 2px rgba(250,220,126,.82);
        }
        .field-notes-stamp-paper[data-rarity="hidden"] {
          --stamp-notch: 3.4px;
          --stamp-step-x: 14.5px;
          --stamp-step-y: 14px;
          background: #e3ded3;
        }
        .field-notes-stamp-paper[data-rarity="hidden"]::before {
          border: 1px dashed rgba(72,64,55,.22);
        }
        .field-notes-stamp-art {
          border-color: color-mix(in srgb, currentColor 42%, transparent);
          transform: rotate(var(--stamp-art-tilt));
        }
        .field-notes-stamp-earned {
          color: var(--stamp-ink);
          background:
            linear-gradient(145deg, rgba(255,255,255,.14), transparent 42%),
            var(--stamp-paper);
          box-shadow: inset 0 0 12px rgba(45,29,15,.08);
        }
        .field-notes-stamp-art[data-frame="1"] {
          border-style: double;
          border-width: 3px;
        }
        .field-notes-stamp-art[data-frame="2"] {
          border-style: dashed;
          box-shadow: inset 0 0 0 1px currentColor;
        }
        .field-notes-stamp-art[data-frame="3"] {
          border-width: 2px;
          border-color: var(--stamp-accent);
          box-shadow: inset 0 0 0 2px var(--stamp-paper), inset 0 0 0 3px var(--stamp-second);
        }
        .field-notes-rarity-swatch {
          display: inline-block;
          color: #6f5136;
          background: currentColor;
          -webkit-mask:
            radial-gradient(circle at 50% 0, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top left / var(--swatch-step) 100% repeat-x,
            radial-gradient(circle at 50% 100%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) bottom left / var(--swatch-step) 100% repeat-x,
            radial-gradient(circle at 0 50%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top left / 100% var(--swatch-step) repeat-y,
            radial-gradient(circle at 100% 50%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top right / 100% var(--swatch-step) repeat-y;
          -webkit-mask-composite: source-in;
          mask:
            radial-gradient(circle at 50% 0, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top left / var(--swatch-step) 100% repeat-x,
            radial-gradient(circle at 50% 100%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) bottom left / var(--swatch-step) 100% repeat-x,
            radial-gradient(circle at 0 50%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top left / 100% var(--swatch-step) repeat-y,
            radial-gradient(circle at 100% 50%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top right / 100% var(--swatch-step) repeat-y;
          mask-composite: intersect;
        }
        .field-notes-rarity-swatch[data-rarity="common"] {
          --swatch-notch: .65px;
          --swatch-step: 6px;
          background: #b49a77;
        }
        .field-notes-rarity-swatch[data-rarity="uncommon"] {
          --swatch-notch: .9px;
          --swatch-step: 5px;
          background: #62826a;
        }
        .field-notes-rarity-swatch[data-rarity="rare"] {
          --swatch-notch: 1.2px;
          --swatch-step: 4px;
          background:
            repeating-linear-gradient(
              90deg,
              #51748c 0 2px,
              #b7cad7 2px 3px
            );
        }
        .field-notes-rarity-swatch[data-rarity="legendary"] {
          --swatch-notch: 1.45px;
          --swatch-step: 3.5px;
          background-color: #c99720;
          background-image: url("/images/stacks/field-notes-gold-foil.webp");
          background-position: 43% 38%;
          background-size: 42px 42px;
        }
        .field-notes-stamp-art::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 18% 27%, currentColor 0 .55px, transparent .8px),
            radial-gradient(circle at 74% 66%, currentColor 0 .45px, transparent .75px),
            radial-gradient(circle at 42% 82%, currentColor 0 .4px, transparent .7px);
          background-size: 13px 17px, 19px 14px, 11px 23px;
          mix-blend-mode: multiply;
          opacity: .12;
        }
        .field-notes-stamp-pattern {
          inset: -12%;
          opacity: .5;
          transform: rotate(var(--pattern-angle)) scale(1.08);
          transform-origin: var(--pattern-x) var(--pattern-y);
        }
        .field-notes-stamp-art[data-pattern="0"] .field-notes-stamp-pattern {
          background:
            radial-gradient(circle at 18% 22%, var(--stamp-accent) 0 5px, transparent 5.7px),
            radial-gradient(circle at 72% 68%, var(--stamp-second) 0 7px, transparent 7.7px),
            radial-gradient(circle at 82% 16%, var(--stamp-accent) 0 2.5px, transparent 3px);
        }
        .field-notes-stamp-art[data-pattern="1"] .field-notes-stamp-pattern {
          background: conic-gradient(from 45deg, var(--stamp-accent) 0 25%, transparent 0 50%, var(--stamp-second) 0 75%, transparent 0);
          background-size: var(--pattern-size) var(--pattern-size);
          opacity: .36;
        }
        .field-notes-stamp-art[data-pattern="2"] .field-notes-stamp-pattern {
          background: repeating-linear-gradient(115deg, var(--stamp-accent) 0 3px, transparent 3px 11px, var(--stamp-second) 11px 14px, transparent 14px 23px);
          opacity: .38;
        }
        .field-notes-stamp-art[data-pattern="3"] .field-notes-stamp-pattern {
          background: repeating-conic-gradient(from 8deg at var(--pattern-x) var(--pattern-y), var(--stamp-accent) 0 8deg, transparent 8deg 20deg, var(--stamp-second) 20deg 25deg, transparent 25deg 38deg);
          opacity: .36;
        }
        .field-notes-stamp-art[data-pattern="4"] .field-notes-stamp-pattern {
          background: repeating-radial-gradient(circle at var(--pattern-x) var(--pattern-y), transparent 0 7px, var(--stamp-accent) 8px 9px, transparent 10px 15px, var(--stamp-second) 16px 17px);
          opacity: .44;
        }
        .field-notes-stamp-art[data-pattern="5"] .field-notes-stamp-pattern {
          background:
            radial-gradient(circle at 0 100%, var(--stamp-accent) 0 8px, transparent 8.8px),
            radial-gradient(circle at 100% 0, var(--stamp-second) 0 6px, transparent 6.8px);
          background-size: var(--pattern-size) var(--pattern-size);
          opacity: .42;
        }
        .field-notes-stamp-art[data-pattern="6"] .field-notes-stamp-pattern {
          background:
            linear-gradient(135deg, transparent 0 43%, var(--stamp-accent) 43% 51%, transparent 51%),
            linear-gradient(90deg, var(--stamp-second) 0 24%, transparent 24% 76%, var(--stamp-second) 76%);
          opacity: .34;
        }
        .field-notes-stamp-art[data-pattern="7"] .field-notes-stamp-pattern {
          background:
            radial-gradient(ellipse at 16% 23%, var(--stamp-accent) 0 2px, transparent 2.7px),
            radial-gradient(ellipse at 79% 31%, var(--stamp-second) 0 3px, transparent 3.7px),
            radial-gradient(ellipse at 38% 76%, var(--stamp-accent) 0 3.5px, transparent 4.2px),
            radial-gradient(ellipse at 88% 83%, var(--stamp-second) 0 1.8px, transparent 2.5px);
          background-size: 27px 31px, 33px 26px, 38px 35px, 21px 29px;
          opacity: .46;
        }
        .field-notes-stamp-art[data-pattern="8"] .field-notes-stamp-pattern {
          background:
            linear-gradient(var(--stamp-accent) 1px, transparent 1px),
            linear-gradient(90deg, var(--stamp-second) 1px, transparent 1px),
            linear-gradient(135deg, transparent 46%, var(--stamp-accent) 47% 53%, transparent 54%);
          background-size: 12px 12px, 12px 12px, 28px 28px;
          opacity: .38;
        }
        .field-notes-stamp-art[data-pattern="9"] .field-notes-stamp-pattern {
          background:
            linear-gradient(180deg, var(--stamp-second) 0 22%, transparent 22% 42%, var(--stamp-accent) 42% 58%, transparent 58% 78%, var(--stamp-second) 78%),
            repeating-linear-gradient(90deg, transparent 0 11px, var(--stamp-accent) 11px 13px);
          opacity: .42;
        }
        .field-notes-stamp-art[data-pattern="10"] .field-notes-stamp-pattern {
          background:
            conic-gradient(from 218deg at 18% 82%, transparent 0 14deg, var(--stamp-accent) 14deg 42deg, transparent 42deg 360deg),
            linear-gradient(105deg, transparent 0 54%, var(--stamp-second) 55% 59%, transparent 60%);
          opacity: .5;
        }
        .field-notes-stamp-art[data-pattern="11"] .field-notes-stamp-pattern {
          background:
            conic-gradient(from 0deg at 28% 34%, transparent 0 8%, var(--stamp-accent) 8% 17%, transparent 17% 33%, var(--stamp-second) 33% 41%, transparent 41% 100%),
            radial-gradient(circle at 76% 70%, var(--stamp-second) 0 3px, transparent 3.5px),
            radial-gradient(circle at 70% 20%, var(--stamp-accent) 0 2px, transparent 2.5px);
          opacity: .52;
        }
        .field-notes-stamp-icon-frame {
          width: clamp(1.8rem, 58%, 2.9rem);
          aspect-ratio: 1;
          max-height: 100%;
        }
        .field-notes-stamp-icon-frame > span {
          width: 100%;
          height: 100%;
          transform: translate(var(--stamp-icon-x), var(--stamp-icon-y)) rotate(var(--stamp-icon-rotate)) scale(var(--stamp-icon-scale));
          transform-origin: center;
        }
        .field-notes-stamp-icon-frame svg {
          width: 84%;
          height: 84%;
        }
        .field-notes-stamp-icon-accent {
          top: 50%;
          left: 50%;
          width: 100%;
          height: 100%;
          color: var(--stamp-accent);
          opacity: .26;
          transform: translate(-72%,-66%) rotate(-11deg) scale(.74);
          mix-blend-mode: multiply;
        }
        .field-notes-stamp-icon-accent svg {
          width: 74%;
          height: 74%;
        }
        .field-notes-stamp-icon-frame::before {
          content: "";
          position: absolute;
          inset: 0;
          background: var(--stamp-accent);
          opacity: .32;
        }
        .field-notes-stamp-art[data-layout="0"] .field-notes-stamp-icon-frame::before {
          border-radius: 999px;
        }
        .field-notes-stamp-art[data-layout="1"] .field-notes-stamp-icon-frame {
          color: var(--stamp-second);
          transform: rotate(-5deg);
        }
        .field-notes-stamp-art[data-layout="1"] .field-notes-stamp-icon-frame::before {
          border: 1px solid var(--stamp-second);
          background: transparent;
          transform: rotate(9deg);
        }
        .field-notes-stamp-art[data-layout="2"] .field-notes-stamp-glyph {
          transform: rotate(1.5deg);
        }
        .field-notes-stamp-art[data-layout="2"] .field-notes-stamp-icon-frame::before {
          border-radius: 38% 62% 44% 56%;
          background: var(--stamp-second);
          opacity: .24;
          transform: rotate(13deg);
        }
        .field-notes-stamp-art[data-layout="3"] .field-notes-stamp-icon-frame {
          color: var(--stamp-accent);
        }
        .field-notes-stamp-art[data-layout="3"] .field-notes-stamp-icon-frame::before {
          border: 1px dashed var(--stamp-accent);
          border-radius: 46%;
          background: var(--stamp-paper);
          opacity: .72;
          transform: rotate(-8deg);
        }
        .field-notes-stamp-art[data-layout="4"] .field-notes-stamp-icon-frame {
          width: min(68%, 3.2rem);
          color: var(--stamp-second);
          transform: rotate(4deg);
        }
        .field-notes-stamp-art[data-layout="4"] .field-notes-stamp-icon-frame::before {
          border-radius: 50% 42% 55% 38%;
          background: var(--stamp-accent);
          opacity: .42;
          transform: rotate(-9deg);
        }
        .field-notes-stamp-art[data-layout="5"] .field-notes-stamp-icon-frame {
          width: min(72%, 3.35rem);
          aspect-ratio: 1.35;
          color: var(--stamp-accent);
          transform: rotate(-3deg);
        }
        .field-notes-stamp-art[data-layout="5"] .field-notes-stamp-icon-frame::before {
          border: 2px solid var(--stamp-second);
          background: color-mix(in srgb, var(--stamp-label) 28%, transparent);
          transform: skewX(-8deg);
        }
        .field-notes-cancellation {
          right: var(--cancel-right);
          bottom: var(--cancel-bottom);
          transform: rotate(var(--cancel-tilt));
        }
        .field-notes-album-paper {
          --field-notes-rule-offset: -5px;
          background-color: #f2e7cf;
          background-image:
            var(--field-notes-rules),
            radial-gradient(ellipse at 1% 4%, rgba(105,68,32,.09), transparent 16%),
            radial-gradient(ellipse at 98% 97%, rgba(105,68,32,.08), transparent 18%);
          background-position: 0 var(--field-notes-rule-offset), 0 0, 0 0;
          background-size: auto;
        }
        .field-notes-overview-page {
          --field-notes-rule-offset: -1px;
        }
        .field-notes-page::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 3;
          background:
            linear-gradient(90deg, rgba(80,49,24,.1), transparent 4%, transparent 95%, rgba(80,49,24,.08)),
            linear-gradient(180deg, rgba(80,49,24,.06), transparent 5%, transparent 94%, rgba(80,49,24,.11));
          box-shadow: inset 0 0 14px rgba(92,57,27,.09);
          mix-blend-mode: multiply;
        }
        .field-notes-stamp-slot {
          width: var(--field-notes-stamp-size);
          height: var(--field-notes-stamp-size);
          min-width: 0;
          container-type: inline-size;
        }
        .field-notes-empty-stamp-mount {
          width: 80%;
          height: 80%;
          margin: 10%;
          border: 1px dashed rgba(113,88,59,.22);
          background: rgba(232,220,197,.35);
          box-shadow: inset 0 2px 8px rgba(93,65,34,.05);
        }
        html.dark .field-notes-empty-stamp-mount {
          border-color: rgba(113,88,59,.22);
          background: rgba(232,220,197,.35);
        }
        .field-notes-loose-stamp-layer {
          overflow: hidden;
        }
        @container (max-width: 72px) {
          .field-notes-mount-copy { gap: 1px; }
          .field-notes-mount-status { display: none; }
          .field-notes-discovery-mount::before { inset: 3px; }
        }
        .field-notes-latest-grid {
          grid-template-columns: repeat(2, var(--field-notes-stamp-size));
        }
        .field-notes-latest-grid .field-notes-stamp-slot {
          aspect-ratio: 1;
          contain: size;
        }
        .field-notes-stamp-page-heading {
          width: calc(3 * var(--field-notes-stamp-size) + .75rem);
        }
        .field-notes-stamp-page-heading h2 {
          font-size: 22px;
          line-height: 24px;
        }
        .field-notes-stamp-grid {
          grid-template-columns: repeat(3, var(--field-notes-stamp-size));
        }
        .field-notes-book-stage,
        .field-notes-mobile-stage {
          perspective: 1600px;
          perspective-origin: 50% 48%;
          transform-style: preserve-3d;
          isolation: isolate;
          overflow: visible;
        }
        .field-notes-page-block {
          box-shadow:
            0 1px 0 #fbf1dc,
            0 3px 0 #d8c8a9,
            0 5px 0 #baa889,
            0 10px 20px rgba(31,16,9,.3);
        }
        .field-notes-in-page-controls {
          text-shadow: 0 1px 0 rgba(255,250,232,.65);
        }
        .field-notes-page-spread {
          /* No preserve-3d here: Chromium cannot hit-test the rotateY'd
             pages inside a preserve-3d parent, which silently kills every
             hover target on the pages (stamp hints, botanical sketch). The
             perspective still applies to the pages' own tilt without it. */
          perspective: 1800px;
          perspective-origin: 50% 46%;
        }
        .field-notes-page-spread > .field-notes-page:first-child,
        .field-notes-turn-static[data-side="left"] {
          transform: rotateY(1.1deg);
          transform-origin: left center;
        }
        .field-notes-page-spread > .field-notes-page:last-child,
        .field-notes-turn-static[data-side="right"] {
          transform: rotateY(-1.1deg);
          transform-origin: right center;
        }
        .field-notes-turn-static {
          transform-style: preserve-3d;
        }
        .field-notes-book-spine {
          width: clamp(2.75rem, 5vw, 4rem);
          transform: translate3d(-50%,0,18px);
          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(59,37,21,.04) 22%,
              rgba(48,29,17,.14) 43%,
              rgba(35,20,12,.28) 49%,
              rgba(255,250,230,.2) 51%,
              rgba(57,35,20,.11) 58%,
              transparent
            );
        }
        .field-notes-book-spine::before {
          content: "";
          position: absolute;
          inset-block: .2rem;
          left: calc(50% - 1px);
          width: 2px;
          background: linear-gradient(90deg, rgba(39,22,13,.28), rgba(255,249,229,.16));
          box-shadow: -5px 0 10px rgba(50,30,17,.12), 5px 0 10px rgba(50,30,17,.08);
        }
        .field-notes-book-spine::after {
          content: "";
          position: absolute;
          inset: .35rem 28%;
          border-radius: 50%;
          box-shadow: inset 0 0 10px rgba(45,27,15,.08);
        }
        .field-notes-turn-leaf,
        .field-notes-mobile-turn-leaf {
          transform-style: preserve-3d;
          will-change: transform;
        }
        .field-notes-turn-leaf[data-direction="next"] {
          left: 50%;
          transform-origin: left center;
          animation: field-notes-turn-next 880ms linear both;
        }
        .field-notes-turn-leaf[data-direction="previous"] {
          right: 50%;
          transform-origin: right center;
          animation: field-notes-turn-previous 880ms linear both;
        }
        .field-notes-mobile-turn-leaf[data-direction="next"] {
          transform-origin: left center;
          animation: field-notes-turn-next 880ms linear both;
        }
        .field-notes-mobile-turn-leaf[data-direction="previous"] {
          transform-origin: right center;
          animation: field-notes-turn-previous 880ms linear both;
        }
        .field-notes-turn-face {
          position: absolute;
          inset: 0;
          overflow: hidden;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform-style: preserve-3d;
        }
        [data-direction="next"] > .field-notes-turn-back {
          transform: rotateY(180deg);
        }
        [data-direction="previous"] > .field-notes-turn-back {
          transform: rotateY(-180deg);
        }
        .field-notes-turn-front::after,
        .field-notes-turn-back::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(90deg, rgba(58,37,20,.14), transparent 24%, transparent 80%, rgba(255,255,255,.1));
          opacity: 0;
          will-change: opacity;
        }
        [data-direction] > .field-notes-turn-front::after,
        [data-direction] > .field-notes-turn-back::after {
          animation: field-notes-turn-shade 880ms ease-in-out both;
        }
        .field-notes-award-scene {
          --field-notes-award-duration: ${AWARD_ANIMATION_MS}ms;
          --field-notes-award-stamp-inline-offset: -1.14rem;
          --field-notes-award-stamp-visible-width: 3.72rem;
          --field-notes-award-stamp-slot: calc(var(--field-notes-award-stamp-visible-width) + var(--field-notes-award-stamp-paper-gap));
          --field-notes-award-paper-viewport-max: calc(100vw - var(--field-notes-award-stamp-slot) - 2rem);
          --field-notes-award-ray-center-x: 1.86rem;
          --field-notes-award-ray-center-y: 3rem;
          display: none;
          left: 50vw;
          top: max(4.75rem, calc(env(safe-area-inset-top) + 3.75rem));
          width: min(15rem, calc(100vw - 2rem));
          height: 6rem;
          perspective: 900px;
          transform: translateX(-50%);
        }
        .field-notes-mobile-award-shell {
          --field-notes-award-duration: ${AWARD_ANIMATION_MS}ms;
          --field-notes-award-stamp-inline-offset: -1.74rem;
          --field-notes-award-stamp-visible-width: 2.52rem;
          --field-notes-award-stamp-slot: calc(var(--field-notes-award-stamp-visible-width) + var(--field-notes-award-stamp-paper-gap));
          --field-notes-award-paper-viewport-max: calc(100vw - var(--field-notes-award-stamp-slot) - 2rem);
          --field-notes-award-ray-center-x: 1.26rem;
          --field-notes-award-ray-center-y: 1.25rem;
          display: block;
          left: 50vw;
          top: calc(env(safe-area-inset-top) + .5rem);
          width: min(16rem, calc(100vw - 3.25rem));
          perspective: 500px;
          transform: translateX(-50%);
        }
        .field-notes-award-scene,
        .field-notes-mobile-award-shell {
          --field-notes-award-stamp-paper-gap: .625rem;
          --field-notes-award-ray-inner: rgba(255,244,205,.58);
          --field-notes-award-ray-outer: rgba(225,184,111,.3);
          --field-notes-award-ray-peak: .5;
          --field-notes-award-ray-mid: .34;
          --field-notes-award-ray-rest: .22;
          --field-notes-award-ray-exit: .1;
          isolation: isolate;
          overflow: visible;
        }
        .field-notes-award-composite {
          inline-size: max-content;
          inset-inline-start: 50%;
          translate: -50% 0;
          isolation: isolate;
          overflow: visible;
        }
        .field-notes-desktop-award-composite {
          top: 0;
        }
        .field-notes-award-stamp-slot {
          inline-size: var(--field-notes-award-stamp-slot);
          min-inline-size: var(--field-notes-award-stamp-slot);
        }
        .field-notes-award-composite::before {
          content: "";
          position: absolute;
          left: var(--field-notes-award-ray-center-x);
          top: var(--field-notes-award-ray-center-y);
          width: 8rem;
          height: 8rem;
          border-radius: 50%;
          z-index: -1;
          pointer-events: none;
          background: repeating-conic-gradient(
            from 0deg,
            var(--field-notes-award-ray-inner) 0deg 6deg,
            transparent 6deg 21deg
          );
          -webkit-mask: radial-gradient(circle, #000 0 30%, rgba(0,0,0,.76) 42%, rgba(0,0,0,.28) 55%, transparent 68%);
          mask: radial-gradient(circle, #000 0 30%, rgba(0,0,0,.76) 42%, rgba(0,0,0,.28) 55%, transparent 68%);
          filter: drop-shadow(0 0 3px var(--field-notes-award-ray-inner));
          opacity: 0;
          animation: field-notes-award-rays-clockwise var(--field-notes-award-duration) linear both;
        }
        .field-notes-award-composite::after {
          content: "";
          position: absolute;
          left: var(--field-notes-award-ray-center-x);
          top: var(--field-notes-award-ray-center-y);
          width: 9.5rem;
          height: 9.5rem;
          border-radius: 50%;
          z-index: -1;
          pointer-events: none;
          background: repeating-conic-gradient(
            from 11deg,
            var(--field-notes-award-ray-outer) 0deg 10deg,
            transparent 10deg 40deg
          );
          -webkit-mask: radial-gradient(circle, #000 0 27%, rgba(0,0,0,.7) 40%, rgba(0,0,0,.24) 54%, transparent 67%);
          mask: radial-gradient(circle, #000 0 27%, rgba(0,0,0,.7) 40%, rgba(0,0,0,.24) 54%, transparent 67%);
          filter: drop-shadow(0 0 4px var(--field-notes-award-ray-outer));
          opacity: 0;
          animation: field-notes-award-rays-counterclockwise var(--field-notes-award-duration) linear both;
        }
        :is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="common"] .field-notes-award-composite::before,
        :is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="common"] .field-notes-award-composite::after {
          content: none;
          animation: none;
        }
        :is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="uncommon"] {
          --field-notes-award-ray-inner: rgba(207,239,205,.34);
          --field-notes-award-ray-outer: rgba(83,157,111,.28);
          --field-notes-award-ray-peak: .22;
          --field-notes-award-ray-mid: .13;
          --field-notes-award-ray-rest: .07;
          --field-notes-award-ray-exit: .025;
        }
        :is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="rare"] {
          --field-notes-award-ray-inner: rgba(194,232,255,.62);
          --field-notes-award-ray-outer: rgba(63,139,190,.54);
          --field-notes-award-ray-peak: .56;
          --field-notes-award-ray-mid: .38;
          --field-notes-award-ray-rest: .24;
          --field-notes-award-ray-exit: .11;
        }
        :is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="legendary"] {
          --field-notes-award-ray-inner: rgba(255,238,151,.72);
          --field-notes-award-ray-outer: rgba(245,184,42,.72);
          --field-notes-award-ray-peak: .78;
          --field-notes-award-ray-mid: .56;
          --field-notes-award-ray-rest: .38;
          --field-notes-award-ray-exit: .18;
        }
        :is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="legendary"] .field-notes-award-composite::before {
          width: 11rem;
          height: 11rem;
        }
        :is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="legendary"] .field-notes-award-composite::after {
          width: 13rem;
          height: 13rem;
        }
        :is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="hidden"] {
          --field-notes-award-ray-inner: rgba(220,202,237,.56);
          --field-notes-award-ray-outer: rgba(126,92,158,.46);
          --field-notes-award-ray-peak: .54;
          --field-notes-award-ray-mid: .36;
          --field-notes-award-ray-rest: .23;
          --field-notes-award-ray-exit: .1;
        }
        .field-notes-mobile-award {
          max-inline-size: calc(100vw - 2rem);
        }
        .field-notes-mobile-award[data-ready="true"] {
          animation: field-notes-mobile-award-hitbox var(--field-notes-award-duration) linear both;
        }
        .field-notes-mobile-award-stamp {
          left: var(--field-notes-award-stamp-inline-offset);
          top: -1.75rem;
          transform-origin: center;
          transform-style: preserve-3d;
          will-change: transform, filter;
        }
        .field-notes-mobile-award-stamp[data-ready="true"] {
          animation: field-notes-mobile-award-stamp var(--field-notes-award-duration) linear both;
        }
        .field-notes-mobile-award[data-ready="true"] .field-notes-mobile-award-copy {
          transform-origin: left center;
          animation: field-notes-award-copy var(--field-notes-award-duration) linear both;
        }
        .field-notes-paper-slip::after {
          content: "";
          position: absolute;
          inset: 3px;
          border: 1px dashed rgba(142,79,59,.18);
          border-radius: .25rem;
          pointer-events: none;
        }
        .field-notes-mobile-award-copy::before {
          content: "";
          position: absolute;
          left: -.29rem;
          top: 50%;
          width: .52rem;
          height: .52rem;
          border-bottom: 1px solid rgba(142,79,59,.3);
          border-left: 1px solid rgba(142,79,59,.3);
          background: #f6e6c8;
          transform: translateY(-50%) rotate(45deg);
          pointer-events: none;
        }
        .field-notes-award-kicker {
          font-size: 11px;
          line-height: 1;
        }
        .field-notes-award-text {
          translate: 0 .1875rem;
        }
        .field-notes-award-title {
          font-size: 14px;
          font-weight: 700;
        }
        .field-notes-award-stamp {
          left: var(--field-notes-award-stamp-inline-offset);
          opacity: 0;
          transform: scale(.7) rotate(calc(var(--stamp-tilt) - 7deg));
          transform-origin: center;
          transform-style: preserve-3d;
          will-change: transform, opacity, filter;
        }
        .field-notes-award-stamp[data-ready="true"] {
          animation: field-notes-award-flight var(--field-notes-award-duration) linear both;
        }
        .field-notes-award-stamp .field-notes-stamp-paper::after {
          content: "";
          position: absolute;
          inset: 7px;
          z-index: 3;
          pointer-events: none;
          background: linear-gradient(112deg, transparent 18%, rgba(255,255,255,.22) 42%, rgba(255,250,226,.36) 49%, transparent 66%);
          mix-blend-mode: soft-light;
          opacity: 0;
          transform: translateX(-115%);
        }
        .field-notes-award-stamp[data-ready="true"] .field-notes-stamp-paper::after {
          animation: field-notes-award-light var(--field-notes-award-duration) ease-in-out both;
        }
        .field-notes-award-copy,
        .field-notes-mobile-award-copy {
          opacity: 0;
          pointer-events: none;
          transform-origin: left center;
          transform-style: preserve-3d;
          backface-visibility: hidden;
          will-change: transform, opacity;
        }
        .field-notes-award-copy[data-ready="true"] {
          animation: field-notes-award-copy var(--field-notes-award-duration) linear both;
        }
        .field-notes-collection-glyph {
          --field-notes-award-duration: ${AWARD_ANIMATION_MS}ms;
          perspective: 120px;
        }
        .field-notes-collection-book-icon,
        .field-notes-mini-album,
        .field-notes-collection-receipt,
        .field-notes-collection-spark {
          transform-origin: center;
        }
        .field-notes-collection-book-icon {
          opacity: 1;
          transform: scale(1) rotate(0deg);
          filter: blur(0);
          transition:
            opacity 150ms ease-out,
            transform 240ms cubic-bezier(.16,1,.3,1),
            filter 150ms ease-out;
        }
        .field-notes-mini-album,
        .field-notes-collection-receipt,
        .field-notes-collection-spark {
          opacity: 0;
        }
        .field-notes-mini-album {
          transform: translate(-50%,-50%) scale(.45,.82) rotate(-6deg);
          transform-style: preserve-3d;
          transition:
            opacity 160ms ease-out,
            transform 280ms cubic-bezier(.16,1,.3,1);
        }
        .field-notes-mini-album-leather {
          background-image:
            radial-gradient(circle at 12% 16%, rgba(239,202,137,.16), transparent 28%),
            repeating-linear-gradient(103deg, transparent 0 3px, rgba(255,255,255,.025) 4px, transparent 5px);
        }
        .field-notes-mini-album-left-page {
          background: linear-gradient(90deg, rgba(255,255,255,.16), transparent 70%);
          transform-origin: right center;
          transform: scaleX(.18) rotateY(18deg);
          transition: transform 280ms cubic-bezier(.16,1,.3,1);
        }
        .field-notes-mini-album-right-page {
          background: linear-gradient(270deg, rgba(255,255,255,.14), transparent 70%);
          transform-origin: left center;
          transform: scaleX(.18) rotateY(-18deg);
          transition: transform 280ms cubic-bezier(.16,1,.3,1);
        }
        .field-notes-mini-album-left-page::after,
        .field-notes-mini-album-right-page::after {
          content: "";
          position: absolute;
          inset: 3px 2px;
          background: repeating-linear-gradient(180deg, rgba(93,64,35,.24) 0 .5px, transparent .5px 3px);
          opacity: .38;
        }
        .field-notes-trigger-tooltip {
          border-radius: .6rem .48rem .56rem .44rem;
        }
        .field-notes-trigger-cluster[data-first-reveal="true"] .field-notes-trigger {
          animation: field-notes-trigger-reveal 360ms cubic-bezier(.16,1,.3,1);
        }
        .field-notes-trigger-title {
          display: inline-block;
          letter-spacing: .015em;
          text-shadow: .5px 1px 0 rgba(0,0,0,.18);
          transform: rotate(-1deg);
        }
        .field-notes-trigger:focus-visible .field-notes-collection-glyph[data-collecting="false"] .field-notes-collection-book-icon {
          opacity: 0;
          filter: blur(.5px);
          transform: scale(.56,.82) rotate(6deg);
        }
        .field-notes-trigger:focus-visible .field-notes-collection-glyph[data-collecting="false"] .field-notes-mini-album {
          opacity: 1;
          transform: translate(-50%,-50%) perspective(120px) rotateX(0deg) rotateY(0deg) rotateZ(-1deg) scale(1);
        }
        .field-notes-trigger:focus-visible .field-notes-collection-glyph[data-collecting="false"] .field-notes-mini-album-left-page,
        .field-notes-trigger:focus-visible .field-notes-collection-glyph[data-collecting="false"] .field-notes-mini-album-right-page {
          transform: scaleX(1) rotateY(0deg);
        }
        @media (hover: hover) {
          .field-notes-trigger:hover .field-notes-collection-glyph[data-collecting="false"] .field-notes-collection-book-icon {
            opacity: 0;
            filter: blur(.5px);
            transform: scale(.56,.82) rotate(6deg);
          }
          .field-notes-trigger:hover .field-notes-collection-glyph[data-collecting="false"] .field-notes-mini-album {
            opacity: 1;
            transform: translate(-50%,-50%) perspective(120px) rotateX(0deg) rotateY(0deg) rotateZ(-1deg) scale(1);
          }
          .field-notes-trigger:hover .field-notes-collection-glyph[data-collecting="false"] .field-notes-mini-album-left-page,
          .field-notes-trigger:hover .field-notes-collection-glyph[data-collecting="false"] .field-notes-mini-album-right-page {
            transform: scaleX(1) rotateY(0deg);
          }
        }
        .field-notes-collection-glyph[data-collecting="true"] .field-notes-collection-book-icon {
          animation: field-notes-glyph-book-icon var(--field-notes-award-duration) cubic-bezier(.16,1,.3,1) both;
        }
        .field-notes-collection-glyph[data-collecting="true"] .field-notes-mini-album {
          animation: field-notes-mini-album-cycle var(--field-notes-award-duration) cubic-bezier(.16,1,.3,1) both;
        }
        .field-notes-collection-glyph[data-collecting="true"] .field-notes-mini-album-left-page {
          animation: field-notes-mini-album-left-page var(--field-notes-award-duration) cubic-bezier(.16,1,.3,1) both;
        }
        .field-notes-collection-glyph[data-collecting="true"] .field-notes-mini-album-right-page {
          animation: field-notes-mini-album-right-page var(--field-notes-award-duration) cubic-bezier(.16,1,.3,1) both;
        }
        .field-notes-collection-glyph[data-collecting="true"] .field-notes-collection-receipt {
          animation: field-notes-glyph-receipt var(--field-notes-award-duration) ease-out both;
        }
        .field-notes-collection-glyph[data-collecting="true"] .field-notes-collection-spark {
          animation: field-notes-glyph-spark var(--field-notes-award-duration) ease-out both;
        }
        @media (min-width: 768px) {
          .field-notes-album {
            --field-notes-page-height: min(34rem, calc(100dvh - 5.5rem));
            --field-notes-stamp-size: min(6rem, calc((100dvh - 15rem) / 4));
            --field-notes-stamp-gap-x: 1rem;
            --field-notes-stamp-gap-y: .875rem;
            --field-notes-book-shadow-entry: 0 3px 5px rgba(23,12,7,.3), 0 12px 34px rgba(18,27,33,.24);
            --field-notes-book-shadow-peak: 0 6px 10px rgba(23,12,7,.4), 0 38px 96px rgba(18,27,33,.42);
            --field-notes-book-shadow-rest: 0 5px 9px rgba(23,12,7,.36), 0 30px 78px rgba(18,27,33,.38);
          }
          .field-notes-stamp-grid {
            grid-template-columns: repeat(3, var(--field-notes-stamp-size));
          }
          .field-notes-stamp-page-heading {
            width: calc(3 * var(--field-notes-stamp-size) + 2rem);
          }
        }
        @media (min-width: 1200px) {
          .field-notes-award-scene { display: block; }
          .field-notes-mobile-award-shell { display: none; }
          .field-notes-award-kicker { font-size: 12px; }
          .field-notes-award-title { font-size: 16px; }
        }
        @keyframes field-notes-album-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes field-notes-album-overlay-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes field-notes-mobile-overlay-in {
          0% { opacity: 0; }
          42% { opacity: .46; }
          82% { opacity: .9; }
          94% { opacity: .98; }
          100% { opacity: 1; }
        }
        @keyframes field-notes-mobile-overlay-out {
          0% { opacity: 1; }
          55% { opacity: .42; }
          82% { opacity: .14; }
          94% { opacity: .04; }
          100% { opacity: 0; }
        }
        @keyframes field-notes-album-open {
          0% {
            opacity: 0;
            transform: perspective(1200px) translate3d(-50%,-46%,0) rotateX(5deg) rotateZ(-1.1deg) scale(.93);
            box-shadow: inset 0 0 0 2px rgba(231,190,122,.08), inset 0 0 26px rgba(25,12,7,.42), var(--field-notes-book-shadow-entry);
          }
          54% {
            opacity: 1;
            transform: perspective(1200px) translate3d(-50%,-50%,0) rotateX(-.45deg) rotateZ(.12deg) scale(1.008);
            box-shadow: inset 0 0 0 2px rgba(231,190,122,.1), inset 0 0 26px rgba(25,12,7,.42), var(--field-notes-book-shadow-peak);
          }
          100% {
            opacity: 1;
            transform: perspective(1200px) translate3d(-50%,-50%,0) rotateX(0deg) rotateZ(0deg) scale(1);
            box-shadow: inset 0 0 0 2px rgba(231,190,122,.1), inset 0 0 26px rgba(25,12,7,.42), var(--field-notes-book-shadow-rest);
          }
        }
        @keyframes field-notes-album-close {
          0% {
            opacity: 1;
            transform: perspective(1200px) translate3d(-50%,-50%,0) rotateX(0deg) rotateZ(0deg) scale(1);
          }
          24% {
            opacity: 1;
            transform: perspective(1200px) translate3d(-50%,-50%,0) rotateX(-.35deg) rotateZ(.08deg) scale(1.004);
          }
          100% {
            opacity: 0;
            transform: perspective(1200px) translate3d(-50%,-47%,0) rotateX(4deg) rotateZ(-.7deg) scale(.94);
          }
        }
        @keyframes field-notes-mobile-album-open {
          0% {
            opacity: .42;
            transform: perspective(1200px) translate3d(-50%,-48%,0) rotateX(2.2deg) rotateZ(-.45deg) scale(.965);
            box-shadow: inset 0 0 0 2px rgba(231,190,122,.08), inset 0 0 26px rgba(25,12,7,.42), var(--field-notes-book-shadow-entry);
          }
          38% {
            opacity: .82;
            transform: perspective(1200px) translate3d(-50%,-49.4%,0) rotateX(.3deg) rotateZ(-.08deg) scale(.992);
            box-shadow: inset 0 0 0 2px rgba(231,190,122,.09), inset 0 0 26px rgba(25,12,7,.42), var(--field-notes-book-shadow-entry);
          }
          72% {
            opacity: .96;
            transform: perspective(1200px) translate3d(-50%,-50%,0) rotateX(-.12deg) rotateZ(.04deg) scale(1.003);
            box-shadow: inset 0 0 0 2px rgba(231,190,122,.1), inset 0 0 26px rgba(25,12,7,.42), var(--field-notes-book-shadow-peak);
          }
          90% {
            opacity: .992;
            transform: perspective(1200px) translate3d(-50%,-50%,0) rotateX(-.03deg) rotateZ(.01deg) scale(1.0006);
            box-shadow: inset 0 0 0 2px rgba(231,190,122,.1), inset 0 0 26px rgba(25,12,7,.42), var(--field-notes-book-shadow-rest);
          }
          100% {
            opacity: 1;
            transform: perspective(1200px) translate3d(-50%,-50%,0) rotateX(0deg) rotateZ(0deg) scale(1);
            box-shadow: inset 0 0 0 2px rgba(231,190,122,.1), inset 0 0 26px rgba(25,12,7,.42), var(--field-notes-book-shadow-rest);
          }
        }
        @keyframes field-notes-mobile-album-close {
          0% {
            opacity: 1;
            transform: perspective(1200px) translate3d(-50%,-50%,0) rotateX(0deg) rotateZ(0deg) scale(1);
          }
          58% {
            opacity: .74;
            transform: perspective(1200px) translate3d(-50%,-49.35%,0) rotateX(.6deg) rotateZ(-.08deg) scale(.988);
          }
          82% {
            opacity: .34;
            transform: perspective(1200px) translate3d(-50%,-48.45%,0) rotateX(1.65deg) rotateZ(-.25deg) scale(.974);
          }
          94% {
            opacity: .18;
            transform: perspective(1200px) translate3d(-50%,-48.08%,0) rotateX(2.08deg) rotateZ(-.33deg) scale(.969);
          }
          100% {
            opacity: .14;
            transform: perspective(1200px) translate3d(-50%,-48%,0) rotateX(2.2deg) rotateZ(-.35deg) scale(.968);
          }
        }
        @keyframes field-notes-pages-open {
          0% { opacity: .18; transform: rotateX(4deg) scaleX(.72); }
          46% { opacity: 1; transform: rotateX(-.3deg) scaleX(.99); }
          72% { opacity: 1; transform: rotateX(0deg) scaleX(1.008); }
          100% { opacity: 1; transform: rotateX(0deg) scaleX(1); }
        }
        @keyframes field-notes-pages-close {
          0% { opacity: 1; transform: rotateX(0deg) scaleX(1); }
          100% { opacity: .18; transform: rotateX(3deg) scaleX(.78); }
        }
        @keyframes field-notes-mobile-stage-open {
          0% { opacity: .46; transform: translateY(10px) rotateX(2.4deg) scale(.965); }
          38% { opacity: .78; transform: translateY(3px) rotateX(.5deg) scale(.988); }
          74% { opacity: .96; transform: translateY(-1px) rotateX(-.12deg) scale(1.003); }
          90% { opacity: .994; transform: translateY(-.2px) rotateX(-.03deg) scale(1.0005); }
          100% { opacity: 1; transform: translateY(0) rotateX(0deg) scale(1); }
        }
        @keyframes field-notes-mobile-stage-close {
          0% { opacity: 1; transform: translateY(0) rotateX(0deg) scale(1); }
          58% { opacity: .72; transform: translateY(3px) rotateX(.65deg) scale(.988); }
          82% { opacity: .38; transform: translateY(6.5px) rotateX(1.45deg) scale(.976); }
          94% { opacity: .22; transform: translateY(8.4px) rotateX(1.88deg) scale(.971); }
          100% { opacity: .18; transform: translateY(9px) rotateX(2deg) scale(.97); }
        }
        @keyframes field-notes-close-control-in {
          0% { opacity: 0; transform: translate3d(5px,-5px,0) scale(.72) rotate(12deg); }
          70% { opacity: 1; transform: translate3d(-1px,1px,0) scale(1.04) rotate(-2deg); }
          100% { opacity: 1; transform: translate3d(0,0,0) scale(1) rotate(0deg); }
        }
        @keyframes field-notes-close-control-out {
          from { opacity: 1; transform: translate3d(0,0,0) scale(1) rotate(0deg); }
          to { opacity: 0; transform: translate3d(4px,-4px,0) scale(.76) rotate(9deg); }
        }
        @keyframes field-notes-turn-next {
          0% { transform: rotateY(-1.1deg); }
          12% { transform: rotateY(-8deg); }
          28% { transform: rotateY(-39deg); }
          50% { transform: rotateY(-90deg); }
          72% { transform: rotateY(-141deg); }
          88% { transform: rotateY(-172deg); }
          100% { transform: rotateY(-178.9deg); }
        }
        @keyframes field-notes-turn-previous {
          0% { transform: rotateY(1.1deg); }
          12% { transform: rotateY(8deg); }
          28% { transform: rotateY(39deg); }
          50% { transform: rotateY(90deg); }
          72% { transform: rotateY(141deg); }
          88% { transform: rotateY(172deg); }
          100% { transform: rotateY(178.9deg); }
        }
        @keyframes field-notes-turn-shade {
          0% { opacity: 0; }
          28% { opacity: .4; }
          50% { opacity: .72; }
          72% { opacity: .34; }
          88% { opacity: .06; }
          100% { opacity: 0; }
        }
        @keyframes field-notes-award-rays-clockwise {
          0% { opacity: 0; transform: translate(-50%,-50%) rotate(-24deg) scale(.58); }
          7% { opacity: var(--field-notes-award-ray-peak); transform: translate(-50%,-50%) rotate(-4deg) scale(1.08); }
          18% { opacity: var(--field-notes-award-ray-mid); transform: translate(-50%,-50%) rotate(28deg) scale(.94); }
          34% { opacity: var(--field-notes-award-ray-rest); transform: translate(-50%,-50%) rotate(62deg) scale(1.03); }
          44% { opacity: var(--field-notes-award-ray-exit); transform: translate(-50%,-50%) rotate(86deg) scale(.96); }
          52%, 100% { opacity: 0; transform: translate(-50%,-50%) rotate(106deg) scale(.76); }
        }
        @keyframes field-notes-trigger-reveal {
          from { opacity: 0; transform: translateY(-3px) scale(.72); }
          to { opacity: var(--stacks-secondary-chrome-idle-opacity, 1); transform: translateY(0) scale(1); }
        }
        @keyframes field-notes-award-rays-counterclockwise {
          0% { opacity: 0; transform: translate(-50%,-50%) rotate(18deg) scale(.44); }
          8% { opacity: var(--field-notes-award-ray-peak); transform: translate(-50%,-50%) rotate(2deg) scale(.9); }
          20% { opacity: var(--field-notes-award-ray-mid); transform: translate(-50%,-50%) rotate(-24deg) scale(1.06); }
          34% { opacity: var(--field-notes-award-ray-rest); transform: translate(-50%,-50%) rotate(-48deg) scale(.9); }
          44% { opacity: var(--field-notes-award-ray-exit); transform: translate(-50%,-50%) rotate(-66deg) scale(1); }
          52%, 100% { opacity: 0; transform: translate(-50%,-50%) rotate(-82deg) scale(.7); }
        }
        @keyframes field-notes-award-flight {
          0% {
            opacity: 0;
            filter: drop-shadow(0 2px 2px rgba(33,20,10,.06));
            transform: translate3d(-4px,-13px,0) perspective(700px) rotateX(16deg) rotateY(-13deg) rotateZ(calc(var(--stamp-tilt) - 12deg)) scale(.44);
          }
          4% {
            opacity: 1;
            filter: drop-shadow(0 11px 13px rgba(33,20,10,.21));
            transform: translate3d(1px,1px,0) perspective(700px) rotateX(-3deg) rotateY(4deg) rotateZ(calc(var(--stamp-tilt) + 1.4deg)) scale(.68);
          }
          8% {
            opacity: 1;
            filter: drop-shadow(0 8px 9px rgba(33,20,10,.18));
            transform: translate3d(0,0,0) perspective(700px) rotateX(1deg) rotateY(-1.5deg) rotateZ(var(--stamp-tilt)) scale(.62);
          }
          20% {
            opacity: 1;
            filter: drop-shadow(0 13px 15px rgba(33,20,10,.22));
            transform: translate3d(0,-4px,0) perspective(700px) rotateX(-1.5deg) rotateY(2.4deg) rotateZ(calc(var(--stamp-tilt) + .8deg)) scale(.63);
          }
          34% {
            opacity: 1;
            filter: drop-shadow(0 7px 8px rgba(33,20,10,.17));
            transform: translate3d(0,2.5px,0) perspective(700px) rotateX(1.5deg) rotateY(-1.4deg) rotateZ(calc(var(--stamp-tilt) - .65deg)) scale(.61);
          }
          48% {
            opacity: 1;
            filter: drop-shadow(0 12px 14px rgba(33,20,10,.21));
            transform: translate3d(0,-3.5px,0) perspective(700px) rotateX(-1.2deg) rotateY(2deg) rotateZ(calc(var(--stamp-tilt) + .6deg)) scale(.625);
          }
          62% {
            opacity: 1;
            filter: drop-shadow(0 8px 9px rgba(33,20,10,.18));
            transform: translate3d(0,1.75px,0) perspective(700px) rotateX(1deg) rotateY(-1.1deg) rotateZ(calc(var(--stamp-tilt) - .35deg)) scale(.615);
          }
          70% {
            opacity: 1;
            filter: drop-shadow(0 11px 12px rgba(33,20,10,.2));
            transform: translate3d(0,-2.5px,0) perspective(700px) rotateX(-.8deg) rotateY(1.25deg) rotateZ(calc(var(--stamp-tilt) + .4deg)) scale(.62);
            animation-timing-function: cubic-bezier(.16,.72,.24,1);
          }
          81% {
            opacity: 1;
            filter: drop-shadow(0 1px 1px rgba(33,20,10,.06));
            transform: translate3d(var(--flight-x),var(--flight-y),0) perspective(700px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(.07);
          }
          82%, 100% {
            opacity: 0;
            filter: drop-shadow(0 0 0 rgba(33,20,10,0));
            transform: translate3d(var(--flight-x),var(--flight-y),0) perspective(700px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(.025,.06);
          }
        }
        @keyframes field-notes-award-light {
          0%, 8% { opacity: 0; transform: translateX(-115%); }
          20% { opacity: .24; transform: translateX(-82%); }
          48% { opacity: .46; transform: translateX(8%); }
          70% { opacity: .12; transform: translateX(105%); }
          72%, 100% { opacity: 0; transform: translateX(115%); }
        }
        @keyframes field-notes-award-copy {
          0% {
            opacity: 0;
            pointer-events: none;
            transform: translate3d(-34px,-2px,0) perspective(650px) rotateX(5deg) rotateY(-68deg) rotateZ(-2deg) scaleX(.42);
          }
          4% {
            opacity: .35;
            pointer-events: auto;
            transform: translate3d(-12px,0,0) perspective(650px) rotateX(2deg) rotateY(-28deg) rotateZ(-1deg) scaleX(.76);
          }
          7% {
            opacity: 1;
            pointer-events: auto;
            transform: translate3d(-1px,-.5px,0) perspective(650px) rotateX(-1deg) rotateY(4deg) rotateZ(.35deg) scaleX(1.035);
          }
          11% {
            opacity: 1;
            pointer-events: auto;
            transform: translate3d(0,0,0) perspective(650px) rotateX(.6deg) rotateY(-.8deg) rotateZ(-.18deg) scaleX(1);
          }
          20% {
            opacity: 1;
            pointer-events: auto;
            transform: translate3d(0,-3px,0) perspective(650px) rotateX(-1deg) rotateY(1.4deg) rotateZ(.5deg) scale(1.01);
          }
          34% {
            opacity: 1;
            pointer-events: auto;
            transform: translate3d(0,2px,0) perspective(650px) rotateX(1.1deg) rotateY(-.9deg) rotateZ(-.4deg) scale(.995);
          }
          48% {
            opacity: 1;
            pointer-events: auto;
            transform: translate3d(0,-2.5px,0) perspective(650px) rotateX(-.9deg) rotateY(1.2deg) rotateZ(.4deg) scale(1.006);
          }
          62% {
            opacity: 1;
            pointer-events: auto;
            transform: translate3d(0,1.25px,0) perspective(650px) rotateX(.8deg) rotateY(-.7deg) rotateZ(-.28deg) scale(.998);
          }
          66% {
            opacity: .42;
            pointer-events: none;
            transform: translate3d(0,-.5px,0) perspective(650px) rotateX(.4deg) rotateY(.5deg) rotateZ(.1deg) scale(.98);
          }
          69%, 100% {
            opacity: 0;
            pointer-events: none;
            transform: translate3d(0,-2px,0) perspective(650px) rotateX(.6deg) rotateY(1deg) rotateZ(.2deg) scale(.95);
          }
        }
        @keyframes field-notes-mobile-award-hitbox {
          0%, 66% { pointer-events: auto; }
          67%, 100% { pointer-events: none; }
        }
        @keyframes field-notes-mobile-award-stamp {
          0% {
            opacity: 1;
            filter: drop-shadow(0 2px 2px rgba(33,20,10,.04));
            transform: perspective(500px) rotateX(12deg) rotateY(-9deg) rotateZ(calc(var(--stamp-tilt) - 8deg)) scale(.3);
          }
          7% {
            filter: drop-shadow(0 7px 8px rgba(33,20,10,.18));
            transform: perspective(500px) rotateX(-2deg) rotateY(3deg) rotateZ(calc(var(--stamp-tilt) + .8deg)) scale(.43);
          }
          11% {
            transform: perspective(500px) rotateX(.5deg) rotateY(-.8deg) rotateZ(var(--stamp-tilt)) scale(.42);
          }
          20% {
            filter: drop-shadow(0 8px 9px rgba(33,20,10,.2));
            transform: translate3d(0,-4px,0) perspective(500px) rotateX(-1.2deg) rotateY(1.8deg) rotateZ(calc(var(--stamp-tilt) + .6deg)) scale(.43);
          }
          34% {
            filter: drop-shadow(0 6px 7px rgba(33,20,10,.16));
            transform: translate3d(0,2.5px,0) perspective(500px) rotateX(1.2deg) rotateY(-1deg) rotateZ(calc(var(--stamp-tilt) - .5deg)) scale(.415);
          }
          48% {
            filter: drop-shadow(0 8px 9px rgba(33,20,10,.19));
            transform: translate3d(0,-3.5px,0) perspective(500px) rotateX(-1deg) rotateY(1.5deg) rotateZ(calc(var(--stamp-tilt) + .45deg)) scale(.425);
          }
          62% {
            filter: drop-shadow(0 7px 8px rgba(33,20,10,.18));
            transform: translate3d(0,1.75px,0) perspective(500px) rotateX(.8deg) rotateY(-.8deg) rotateZ(calc(var(--stamp-tilt) - .25deg)) scale(.418);
          }
          70% {
            filter: drop-shadow(0 8px 9px rgba(33,20,10,.19));
            transform: translate3d(0,-2.5px,0) perspective(500px) rotateX(-.7deg) rotateY(1deg) rotateZ(calc(var(--stamp-tilt) + .3deg)) scale(.42);
            animation-timing-function: cubic-bezier(.16,.72,.24,1);
          }
          81% {
            opacity: 1;
            filter: drop-shadow(0 1px 1px rgba(33,20,10,.04));
            transform: translate3d(var(--flight-x),var(--flight-y),0) perspective(500px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(.05);
          }
          82%, 100% {
            opacity: 0;
            filter: drop-shadow(0 0 0 rgba(33,20,10,0));
            transform: translate3d(var(--flight-x),var(--flight-y),0) perspective(500px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(.02,.05);
          }
        }
        @keyframes field-notes-glyph-book-icon {
          0%, 60% { opacity: 1; transform: scale(1) rotate(0deg); }
          68%, 81% { opacity: 0; transform: scale(.7) rotate(7deg); }
          82% { opacity: 1; transform: scale(.72,.9) rotate(5deg); }
          84% { opacity: 1; transform: scale(1.25,.86) rotate(-5deg); }
          86% { opacity: 1; transform: scale(.94,1.06) rotate(2deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes field-notes-mini-album-cycle {
          0%, 59% { opacity: 0; transform: translate(-50%,-50%) perspective(120px) rotateX(3deg) rotateY(-7deg) rotateZ(-6deg) scale(.4,.82); }
          66% { opacity: 1; transform: translate(-50%,-50%) perspective(120px) rotateX(1deg) rotateY(-3deg) rotateZ(1.5deg) scale(.72,.98); }
          72% { opacity: 1; transform: translate(-50%,-50%) perspective(120px) rotateX(0deg) rotateY(0deg) rotateZ(-.7deg) scale(1); }
          78% { opacity: 1; transform: translate(-50%,-50%) perspective(120px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1); }
          79% { opacity: 1; transform: translate(-50%,-53%) perspective(120px) rotateX(-1deg) rotateY(1deg) rotateZ(.5deg) scale(1.04,.96); }
          81% { opacity: 1; transform: translate(-50%,-44%) perspective(120px) rotateX(2deg) rotateY(0deg) rotateZ(-1deg) scale(1.16,.68); }
          82% { opacity: 1; transform: translate(-50%,-50%) perspective(120px) rotateX(0deg) rotateY(-1deg) rotateZ(1deg) scale(.6,.92); }
          83% { opacity: 0; transform: translate(-50%,-50%) perspective(120px) rotateX(2deg) rotateY(-4deg) rotateZ(3deg) scale(.4,.82); }
          100% { opacity: 0; transform: translate(-50%,-50%) perspective(120px) rotateX(2deg) rotateY(-5deg) rotateZ(5deg) scale(.38,.8); }
        }
        @keyframes field-notes-mini-album-left-page {
          0%, 61% { transform: scaleX(.16) rotateY(18deg); }
          72%, 78% { transform: scaleX(1) rotateY(0deg); }
          79% { transform: scaleX(.72) rotateY(5deg); }
          81%, 100% { transform: scaleX(.12) rotateY(20deg); }
        }
        @keyframes field-notes-mini-album-right-page {
          0%, 61% { transform: scaleX(.16) rotateY(-18deg); }
          72%, 78% { transform: scaleX(1) rotateY(0deg); }
          79% { transform: scaleX(.72) rotateY(-5deg); }
          81%, 100% { transform: scaleX(.12) rotateY(-20deg); }
        }
        @keyframes field-notes-glyph-receipt {
          0%, 78% { opacity: 0; transform: scale(.35); }
          80% { opacity: .6; transform: scale(.72); }
          82% { opacity: .45; transform: scale(1.25); }
          85%, 100% { opacity: 0; transform: scale(1.8); }
        }
        @keyframes field-notes-glyph-spark {
          0%, 78% { opacity: 0; transform: scale(.25) rotate(-24deg); }
          80% { opacity: .95; transform: scale(1.15) rotate(0deg); }
          82% { opacity: .55; transform: scale(1.6) rotate(12deg); }
          85%, 100% { opacity: 0; transform: scale(.65) rotate(24deg); }
        }
        @keyframes field-notes-botanical-draw-hover {
          0% { stroke-dashoffset: 0; opacity: 1; }
          44%, 54% { stroke-dashoffset: 1; opacity: .18; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes field-notes-botanical-draw-click {
          0% { stroke-dashoffset: 0; opacity: 1; }
          44%, 54% { stroke-dashoffset: 1; opacity: .18; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes field-notes-completion-foil {
          0% { transform: translateX(-85%); }
          100% { transform: translateX(85%); }
        }
        @keyframes field-notes-completion-seal {
          0% { opacity: 0; transform: scale(1.35) rotate(-9deg); }
          72% { opacity: .82; transform: scale(.96) rotate(-4deg); }
          100% { opacity: 1; transform: scale(1) rotate(-5deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .field-notes-botanical-sketch,
          .field-notes-botanical-sketch svg,
          .field-notes-botanical-sketch svg path,
          .field-notes-botanical-color,
          .field-notes-botanical-butterfly,
          .field-notes-botanical-bloom,
          .field-notes-completion-foil::after,
          .field-notes-completion-seal {
            animation: none;
            transition: none;
          }
          .field-notes-trigger-cluster[data-first-reveal="true"] .field-notes-trigger {
            animation: none;
          }
          .field-notes-completion-foil::after {
            transform: translateX(0);
            opacity: .28;
          }
          .field-notes-album-overlay[data-state],
          .field-notes-album[data-state],
          .field-notes-album[data-state] .field-notes-book-stage,
          .field-notes-album[data-state] .field-notes-mobile-stage,
          .field-notes-album[data-state] .field-notes-close-motion,
          .field-notes-turn-leaf,
          .field-notes-mobile-turn-leaf {
            animation-duration: 1ms;
          }
          .field-notes-award-stamp {
            display: block;
            opacity: 1;
            filter: none;
            transform: scale(.62);
            animation: none;
          }
          .field-notes-award-composite::before {
            opacity: var(--field-notes-award-ray-rest);
            transform: translate(-50%,-50%) scale(1);
            animation: none;
          }
          .field-notes-award-composite::after {
            opacity: 0;
            animation: none;
          }
          .field-notes-award-copy,
          .field-notes-award-copy[data-ready="true"] {
            opacity: 1;
            pointer-events: auto;
            transform: none;
            animation: none;
          }
          .field-notes-mobile-award {
            opacity: 1;
            transform: none;
            animation: none;
          }
          .field-notes-mobile-award[data-ready="true"] .field-notes-mobile-award-copy {
            opacity: 1;
            transform: none;
            animation: none;
          }
          .field-notes-mobile-award-stamp {
            filter: none;
            transform: scale(.42);
            animation: none;
          }
          .field-notes-collection-glyph[data-collecting="true"] .field-notes-collection-journal-icon {
            opacity: 1;
            transform: none;
            animation: none;
          }
          .field-notes-trigger:focus-visible .field-notes-collection-glyph[data-collecting="false"] .field-notes-collection-journal-icon,
          .field-notes-trigger:hover .field-notes-collection-glyph[data-collecting="false"] .field-notes-collection-journal-icon {
            opacity: 1;
            filter: none;
            transform: none;
            transition: none;
          }
          .field-notes-trigger:focus-visible .field-notes-collection-glyph[data-collecting="false"] .field-notes-mini-album,
          .field-notes-trigger:hover .field-notes-collection-glyph[data-collecting="false"] .field-notes-mini-album {
            opacity: 0;
            transition: none;
          }
          .field-notes-collection-glyph[data-collecting="true"] .field-notes-mini-album,
          .field-notes-collection-glyph[data-collecting="true"] .field-notes-mini-album-left-page,
          .field-notes-collection-glyph[data-collecting="true"] .field-notes-mini-album-right-page,
          .field-notes-collection-glyph[data-collecting="true"] .field-notes-collection-receipt,
          .field-notes-collection-glyph[data-collecting="true"] .field-notes-collection-spark {
            opacity: 0;
            animation: none;
          }
          .field-notes-postage { transition: none; }
          .field-notes-stamp-shadow { transition: none; }
        }
      `}</style>
      <Dialog.Root open={open} onOpenChange={setOpenWithUrl}>
        {showTrigger && (
          <div
            data-first-reveal={firstTriggerRevealPending ? "true" : undefined}
            className="field-notes-trigger-cluster relative flex items-center"
          >
            <FieldNotesTrigger
              awardId={activeAward?.id}
              foundCount={foundCount}
              onOpen={() => setOpenWithUrl(true)}
              targetRef={triggerRef}
            />
            <MobileAwardNotice
              key={activeAward?.id ?? "idle"}
              note={activeAward}
              onOpen={openAward}
              triggerRef={triggerRef}
            />
          </div>
        )}
        <AwardNotice
          key={activeAward?.id ?? "idle"}
          note={activeAward}
          onOpen={openAward}
          triggerRef={triggerRef}
        />
        <CompactAlbum
          open={open}
          progress={progress}
          onClose={() => setOpenWithUrl(false)}
        />
      </Dialog.Root>
    </>
  );
}

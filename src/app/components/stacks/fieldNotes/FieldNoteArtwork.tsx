import {
  AlarmIcon,
  ArmchairIcon,
  ArrowsOutIcon,
  BarbellIcon,
  BookOpenIcon,
  BuildingsIcon,
  ButterflyIcon,
  CalendarCheckIcon,
  CameraIcon,
  ChartLineIcon,
  ClockIcon,
  CoffeeIcon,
  CompassIcon,
  CrownIcon,
  DiceSixIcon,
  DoorOpenIcon,
  FlagIcon,
  FlaskIcon,
  FootprintsIcon,
  GlobeHemisphereWestIcon,
  GolfIcon,
  HandGrabbingIcon,
  HandIcon,
  type Icon,
  type IconProps,
  ImageIcon,
  LampIcon,
  LighthouseIcon,
  MagicWandIcon,
  MapPinIcon,
  MapTrifoldIcon,
  NotebookIcon,
  PathIcon,
  QuestionIcon,
  SparkleIcon,
  SquaresFourIcon,
  StackIcon,
  StampIcon,
  TerminalWindowIcon,
  WaveSineIcon,
  WrenchIcon,
} from "@phosphor-icons/react";

import { type FieldNoteArtwork, type FieldNoteDefinition } from "./catalog";

type AuthoredVisionArtwork = "vision" | "retro-vision";
type LibraryArtwork = Exclude<FieldNoteArtwork, AuthoredVisionArtwork>;

const ARTWORK: Record<LibraryArtwork, Icon> = {
  tour: CompassIcon,
  portal: ArrowsOutIcon,
  camera: CameraIcon,
  hand: HandIcon,
  room: FootprintsIcon,
  rearrange: SquaresFourIcon,
  barbell: BarbellIcon,
  globe: GlobeHemisphereWestIcon,
  atlas: MapTrifoldIcon,
  chapter: MapPinIcon,
  console: TerminalWindowIcon,
  chair: ArmchairIcon,
  ripple: WaveSineIcon,
  lamp: LampIcon,
  beacon: LighthouseIcon,
  alarm: AlarmIcon,
  clock: ClockIcon,
  tea: CoffeeIcon,
  shaker: FlaskIcon,
  pixel: MagicWandIcon,
  book: BookOpenIcon,
  photo: ImageIcon,
  chart: ChartLineIcon,
  fireworks: SparkleIcon,
  crown: CrownIcon,
  building: BuildingsIcon,
  butterfly: ButterflyIcon,
  golf: GolfIcon,
  "golf-journey": GolfIcon,
  "wrong-sport": FlagIcon,
  door: DoorOpenIcon,
  path: PathIcon,
  calendar: CalendarCheckIcon,
  dice: DiceSixIcon,
  stamp: StampIcon,
  journal: NotebookIcon,
};

const ACCENT_ARTWORK: Record<LibraryArtwork, Icon> = {
  tour: FlagIcon,
  portal: SparkleIcon,
  camera: ImageIcon,
  hand: FootprintsIcon,
  room: ArrowsOutIcon,
  rearrange: MagicWandIcon,
  barbell: CrownIcon,
  globe: CompassIcon,
  atlas: GlobeHemisphereWestIcon,
  chapter: BuildingsIcon,
  console: WrenchIcon,
  chair: CoffeeIcon,
  ripple: LighthouseIcon,
  lamp: SparkleIcon,
  beacon: CompassIcon,
  alarm: ClockIcon,
  clock: AlarmIcon,
  tea: BookOpenIcon,
  shaker: CoffeeIcon,
  pixel: SquaresFourIcon,
  book: MagicWandIcon,
  photo: CameraIcon,
  chart: CrownIcon,
  fireworks: FlagIcon,
  crown: BuildingsIcon,
  building: CrownIcon,
  butterfly: SparkleIcon,
  golf: FlagIcon,
  "golf-journey": PathIcon,
  "wrong-sport": GolfIcon,
  door: CompassIcon,
  path: FootprintsIcon,
  calendar: CoffeeIcon,
  dice: StackIcon,
  stamp: HandGrabbingIcon,
  journal: CrownIcon,
};

function SpatialLensArtwork({ size = 28 }: { size?: IconProps["size"] }) {
  return (
    <svg
      aria-hidden
      data-field-note-artwork="spatial-lens"
      width={size}
      height={size}
      viewBox="0 0 256 180"
      fill="none"
    >
      <path
        d="M26 101C48 45 193 35 229 84c30 41-27 73-94 73-71 0-127-16-109-56Z"
        fill="var(--stamp-label, currentColor)"
        opacity=".2"
      />
      <path
        d="M33 87C67 44 184 36 222 74c33 33-12 66-84 75-69 8-138-20-105-62Z"
        stroke="var(--stamp-ink, currentColor)"
        strokeWidth="8"
        opacity=".9"
      />
      <path
        d="M48 106C68 72 170 49 211 75c31 20-9 51-72 61-60 10-113 2-91-30Z"
        fill="var(--stamp-ink, currentColor)"
        opacity=".82"
      />
      <path
        d="M60 99c28-24 102-39 139-24"
        stroke="var(--stamp-paper, currentColor)"
        strokeWidth="6"
        strokeLinecap="round"
        opacity=".72"
      />
      <ellipse
        cx="132"
        cy="94"
        rx="104"
        ry="42"
        transform="rotate(-11 132 94)"
        stroke="var(--stamp-second, currentColor)"
        strokeWidth="3"
        strokeDasharray="9 8"
        opacity=".7"
      />
      <circle
        cx="205"
        cy="61"
        r="10"
        fill="var(--stamp-accent, currentColor)"
      />
      <circle cx="48" cy="131" r="5" fill="var(--stamp-second, currentColor)" />
    </svg>
  );
}

function DistortionFieldArtwork({ size = 28 }: { size?: IconProps["size"] }) {
  return (
    <svg
      aria-hidden
      data-field-note-artwork="distortion-field"
      width={size}
      height={size}
      viewBox="0 0 256 180"
      fill="none"
      shapeRendering="crispEdges"
    >
      <g
        stroke="var(--stamp-second, currentColor)"
        strokeWidth="5"
        opacity=".68"
      >
        <path d="M18 28c57 0 61 29 110 29s53-29 110-29" />
        <path d="M18 63c57 0 61 22 110 22s53-22 110-22" />
        <path d="M18 110c57 0 61-22 110-22s53 22 110 22" />
        <path d="M18 149c57 0 61-31 110-31s53 31 110 31" />
        <path d="M46 12c0 43 32 48 32 78s-32 37-32 78" />
        <path d="M91 12c0 43 18 48 18 78s-18 37-18 78" />
        <path d="M165 12c0 43-18 48-18 78s18 37 18 78" />
        <path d="M210 12c0 43-32 48-32 78s32 37 32 78" />
      </g>
      <path
        d="M104 54h48v12h12v48h-12v12h-48v-12H92V66h12Z"
        fill="var(--stamp-ink, currentColor)"
        opacity=".92"
      />
      <rect
        x="116"
        y="66"
        width="48"
        height="12"
        fill="var(--stamp-paper, currentColor)"
        opacity=".7"
      />
      <rect
        x="92"
        y="102"
        width="48"
        height="12"
        fill="var(--stamp-accent, currentColor)"
      />
      <rect
        x="30"
        y="44"
        width="24"
        height="24"
        fill="var(--stamp-accent, currentColor)"
      />
      <rect
        x="196"
        y="123"
        width="30"
        height="30"
        fill="var(--stamp-ink, currentColor)"
      />
      <rect
        x="190"
        y="34"
        width="14"
        height="14"
        fill="var(--stamp-label, currentColor)"
      />
      <rect
        x="57"
        y="132"
        width="16"
        height="16"
        fill="var(--stamp-paper, currentColor)"
      />
    </svg>
  );
}

export default function FieldNoteArtworkIcon({
  note,
  earned,
  size = 28,
  weight,
}: {
  note: FieldNoteDefinition;
  earned: boolean;
  size?: number;
  weight?: IconProps["weight"];
}) {
  if (!earned && note.hidden)
    return (
      <QuestionIcon aria-hidden size={size} weight={weight ?? "regular"} />
    );
  if (note.artwork === "vision") return <SpatialLensArtwork size={size} />;
  if (note.artwork === "retro-vision")
    return <DistortionFieldArtwork size={size} />;
  const Artwork = ARTWORK[note.artwork];
  return (
    <Artwork
      aria-hidden
      size={size}
      weight={weight ?? (earned ? "duotone" : "regular")}
    />
  );
}

export function FieldNoteAccentIcon({
  note,
  size = 28,
  weight = "thin",
}: {
  note: FieldNoteDefinition;
  size?: number;
  weight?: IconProps["weight"];
}) {
  if (note.artwork === "vision" || note.artwork === "retro-vision") return null;
  const Accent = ACCENT_ARTWORK[note.artwork];
  return <Accent aria-hidden size={size} weight={weight} />;
}

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
  NotebookIcon,
  PathIcon,
  QuestionIcon,
  SparkleIcon,
  SquaresFourIcon,
  StackIcon,
  StampIcon,
  WaveSineIcon,
} from "@phosphor-icons/react";

import { type FieldNoteArtwork, type FieldNoteDefinition } from "./catalog";

const ARTWORK: Record<FieldNoteArtwork, Icon> = {
  tour: CompassIcon,
  portal: ArrowsOutIcon,
  camera: CameraIcon,
  hand: HandIcon,
  room: FootprintsIcon,
  rearrange: SquaresFourIcon,
  barbell: BarbellIcon,
  globe: GlobeHemisphereWestIcon,
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
  "wrong-sport": FlagIcon,
  door: DoorOpenIcon,
  path: PathIcon,
  calendar: CalendarCheckIcon,
  dice: DiceSixIcon,
  stamp: StampIcon,
  journal: NotebookIcon,
};

const ACCENT_ARTWORK: Record<FieldNoteArtwork, Icon> = {
  tour: FlagIcon,
  portal: SparkleIcon,
  camera: ImageIcon,
  hand: FootprintsIcon,
  room: ArrowsOutIcon,
  rearrange: MagicWandIcon,
  barbell: CrownIcon,
  globe: CompassIcon,
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
  "wrong-sport": GolfIcon,
  door: CompassIcon,
  path: FootprintsIcon,
  calendar: CoffeeIcon,
  dice: StackIcon,
  stamp: HandGrabbingIcon,
  journal: CrownIcon,
};

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
  const Artwork = earned || !note.hidden ? ARTWORK[note.artwork] : QuestionIcon;
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
  const Accent = ACCENT_ARTWORK[note.artwork];
  return <Accent aria-hidden size={size} weight={weight} />;
}

export const FIELD_NOTE_RARITIES = [
  "Common",
  "Uncommon",
  "Rare",
  "Legendary",
] as const;

export type FieldNoteRarity = (typeof FIELD_NOTE_RARITIES)[number];

export type FieldNoteArtwork =
  | "tour"
  | "portal"
  | "camera"
  | "hand"
  | "room"
  | "rearrange"
  | "barbell"
  | "globe"
  | "chair"
  | "ripple"
  | "lamp"
  | "beacon"
  | "alarm"
  | "clock"
  | "tea"
  | "shaker"
  | "pixel"
  | "book"
  | "photo"
  | "chart"
  | "fireworks"
  | "crown"
  | "building"
  | "butterfly"
  | "golf"
  | "golf-journey"
  | "wrong-sport"
  | "door"
  | "path"
  | "calendar"
  | "dice"
  | "stamp"
  | "vision"
  | "retro-vision"
  | "journal"
  | "atlas"
  | "chapter"
  | "console"
  | "close-up";

export type FieldNoteDefinition = Readonly<{
  id: string;
  title: string;
  rarity: FieldNoteRarity;
  artwork: FieldNoteArtwork;
  hidden: boolean;
  hint: string | null;
  foundCopy: string;
}>;

/**
 * Stable discovery IDs are persistence data. Titles and clues can change, but
 * an ID must keep describing the same visitor action once it has shipped.
 */
export const FIELD_NOTES = [
  {
    id: "grand-tour",
    title: "Grand Tour",
    rarity: "Rare",
    artwork: "tour",
    hidden: false,
    hint: "There are seven shelves. See what each one holds.",
    foundCopy: "Visited all seven main shelves.",
  },
  {
    id: "first-portal",
    title: "First Portal",
    rarity: "Common",
    artwork: "portal",
    hidden: false,
    hint: "Some objects take you somewhere else.",
    foundCopy: "Took an in-world Portal somewhere new.",
  },
  {
    id: "photo-finish",
    title: "Photo Finish",
    rarity: "Common",
    artwork: "camera",
    hidden: false,
    hint: "Clear away everything but the view.",
    foundCopy: "Cleared the interface and took in the whole room.",
  },
  {
    id: "curious-hands",
    title: "Curious Hands",
    rarity: "Common",
    artwork: "hand",
    hidden: false,
    hint: "The props aren't glued down.",
    foundCopy: "Picked up and moved a prop.",
  },
  {
    id: "around-the-room",
    title: "Around the Room",
    rarity: "Legendary",
    artwork: "room",
    hidden: false,
    hint: "Leave every shelf a little different.",
    foundCopy: "Moved a prop on every shelf.",
  },
  {
    id: "rearranged",
    title: "Rearranged",
    rarity: "Uncommon",
    artwork: "rearrange",
    hidden: false,
    hint: "Chappy might notice if you move enough things.",
    foundCopy: "Moved ten different props.",
  },
  {
    id: "heavy-lifting",
    title: "Heavy Lifting",
    rarity: "Common",
    artwork: "barbell",
    hidden: false,
    hint: "That loaded barbell isn't just for show.",
    foundCopy: "Moved the loaded 60 kg barbell.",
  },
  {
    id: "global-perspective",
    title: "Global Perspective",
    rarity: "Common",
    artwork: "globe",
    hidden: false,
    hint: "With the About globe up close, turn it a full lap by hand.",
    foundCopy: "Turned the About globe a full lap by hand.",
  },
  {
    id: "a-capital-view",
    title: "A Capital View",
    rarity: "Uncommon",
    artwork: "chair",
    hidden: true,
    hint: null,
    foundCopy: "Sat on the About couch and saw beyond the shelves.",
  },
  {
    id: "ripple-effect",
    title: "Ripple Effect",
    rarity: "Common",
    artwork: "ripple",
    hidden: false,
    hint: "The Coordination globe can make waves.",
    foundCopy: "Sent a shockwave through the Coordination globe.",
  },
  {
    id: "task-light",
    title: "Task Light",
    rarity: "Common",
    artwork: "lamp",
    hidden: false,
    hint: "The desk lamps have switches.",
    foundCopy: "Turned off a desk lamp.",
  },
  {
    id: "beacon",
    title: "Beacon",
    rarity: "Common",
    artwork: "beacon",
    hidden: false,
    hint: "Try the tall lamp between Musings and Talks.",
    foundCopy: "Turned off the floor lamp by Musings and Talks.",
  },
  {
    id: "early-alarm",
    title: "Early Alarm",
    rarity: "Uncommon",
    artwork: "alarm",
    hidden: false,
    hint: "Chappy's day starts at an unreasonable hour.",
    foundCopy: "Set the alarm clock to 3:45.",
  },
  {
    id: "old-time",
    title: "Old Time",
    rarity: "Common",
    artwork: "clock",
    hidden: false,
    hint: "The grandfather clock keeps an unusual hour too.",
    foundCopy: "Set the grandfather clock ticking.",
  },
  {
    id: "tea-time",
    title: "Tea Time",
    rarity: "Common",
    artwork: "tea",
    hidden: false,
    hint: "The tea in Musings hasn't gone cold.",
    foundCopy: "Made the Musings tea steam again.",
  },
  {
    id: "shake-well",
    title: "Shake Well",
    rarity: "Uncommon",
    artwork: "shaker",
    hidden: false,
    hint: "All three shaker bottles have something to say.",
    foundCopy: "Got a response from all three shaker bottles.",
  },
  {
    id: "another-resolution",
    title: "Another Resolution",
    rarity: "Uncommon",
    artwork: "pixel",
    hidden: false,
    hint: "The Projects boards have two ways of seeing the room.",
    foundCopy: "Tried both pixel styles on the Projects boards.",
  },
  {
    id: "spine-cracked",
    title: "Spine Cracked",
    rarity: "Common",
    artwork: "book",
    hidden: false,
    hint: "A book can open without taking you off the shelf.",
    foundCopy: "Opened a book preview from the 3D bookshelf.",
  },
  {
    id: "family-album",
    title: "Family Album",
    rarity: "Rare",
    artwork: "photo",
    hidden: false,
    hint: "Five shelves have a photo worth picking up.",
    foundCopy: "Picked up photos across five shelves.",
  },
  {
    id: "behind-the-numbers",
    title: "Behind the Numbers",
    rarity: "Common",
    artwork: "chart",
    hidden: false,
    hint: "The training props hold more than plates.",
    foundCopy: "Opened a Weightlifting chart or lift history.",
  },
  {
    id: "fireworks-over-the-bay",
    title: "Fireworks Over the Bay",
    rarity: "Rare",
    artwork: "fireworks",
    hidden: true,
    hint: null,
    foundCopy: "Launched fireworks over the Golden Gate.",
  },
  {
    id: "crowned",
    title: "Crowned",
    rarity: "Rare",
    artwork: "crown",
    hidden: true,
    hint: null,
    foundCopy: "Lit the crown of Salesforce Tower.",
  },
  {
    id: "floor-33",
    title: "Floor 33",
    rarity: "Rare",
    artwork: "building",
    hidden: true,
    hint: null,
    foundCopy: "Found the light on Jasper's 33rd floor.",
  },
  {
    id: "butterfly-effect",
    title: "Butterfly Effect",
    rarity: "Uncommon",
    artwork: "butterfly",
    hidden: false,
    hint: "Hold a perch steady and wait for a butterfly to land.",
    foundCopy: "Had a butterfly land on something you were holding.",
  },
  {
    id: "hole-in-one",
    title: "Hole in One",
    rarity: "Legendary",
    artwork: "golf",
    hidden: false,
    hint: "The green rewards your first shot.",
    foundCopy: "Holed a golf ball with its first shot.",
  },
  {
    id: "the-long-game",
    title: "The Long Game",
    rarity: "Rare",
    artwork: "golf-journey",
    hidden: false,
    hint: "A golf ball on About belongs somewhere farther down the room.",
    foundCopy: "Carried an About golf ball to the hitting bay and struck it.",
  },
  {
    id: "wrong-sport",
    title: "Wrong Sport",
    rarity: "Uncommon",
    artwork: "wrong-sport",
    hidden: true,
    hint: null,
    foundCopy: "Swung at something that definitely wasn't a golf ball.",
  },
  {
    id: "open-house",
    title: "Open House",
    rarity: "Rare",
    artwork: "door",
    hidden: false,
    hint: "The doors go more places than you think.",
    foundCopy: "Followed eight different portals out of the room.",
  },
  {
    id: "long-haul",
    title: "Long Haul",
    rarity: "Uncommon",
    artwork: "path",
    hidden: false,
    hint: "Some props could use a proper walk.",
    foundCopy: "Carried one prop 26.2 units without letting go.",
  },
  {
    id: "the-regular",
    title: "The Regular",
    rarity: "Uncommon",
    artwork: "calendar",
    hidden: false,
    hint: "The room will still be here tomorrow.",
    foundCopy: "Came back on a different day.",
  },
  {
    id: "full-stack",
    title: "Full Stack",
    rarity: "Legendary",
    artwork: "dice",
    hidden: false,
    hint: "The dice know a taller formation than the pyramid.",
    foundCopy: "Restacked all six dice into a single tower.",
  },
  {
    id: "philatelist",
    title: "Philatelist",
    rarity: "Uncommon",
    artwork: "stamp",
    hidden: false,
    hint: "Even these stamps aren't glued down.",
    foundCopy: "Rearranged five stamps in this album.",
  },
  {
    id: "future-perfect",
    title: "Future Perfect",
    rarity: "Common",
    artwork: "vision",
    hidden: false,
    hint: "The headset on About is more than a keepsake.",
    foundCopy: "Put on Apple Vision Pro and entered the retrowave ride.",
  },
  {
    id: "reality-distortion-field",
    title: "Reality Distortion Field",
    rarity: "Rare",
    artwork: "retro-vision",
    hidden: true,
    hint: null,
    foundCopy:
      "Entered the Vision Pro ride with an 8-bit or 16-bit finish active.",
  },
  {
    id: "night-shift",
    title: "Night Shift",
    rarity: "Rare",
    artwork: "alarm",
    hidden: true,
    hint: null,
    foundCopy: "Entered the Vision Pro ride after setting the alarm to 3:45.",
  },
  {
    id: "redline",
    title: "Redline",
    rarity: "Rare",
    artwork: "shaker",
    hidden: true,
    hint: null,
    foundCopy: "Entered the Vision Pro ride after waking all three shakers.",
  },
  {
    id: "fore-sight",
    title: "Fore Sight",
    rarity: "Rare",
    artwork: "golf",
    hidden: true,
    hint: null,
    foundCopy:
      "Hit Apple Vision Pro with the golf club, then entered its fairway reality.",
  },
  {
    id: "reality-stack",
    title: "Reality Stack",
    rarity: "Legendary",
    artwork: "retro-vision",
    hidden: true,
    hint: null,
    foundCopy:
      "Combined 3:45, Redline, the fairway, and a pixel finish in one Vision Pro ride.",
  },
  {
    id: "whole-world",
    title: "The Whole World",
    rarity: "Common",
    artwork: "atlas",
    hidden: false,
    hint: "Bring the About globe up for a closer look.",
    foundCopy: "Brought the About globe up to the camera.",
  },
  {
    id: "local-chapter",
    title: "Local Chapter",
    rarity: "Uncommon",
    artwork: "chapter",
    hidden: false,
    hint: "Find a chapter of The AI Collective on the globe and open it.",
    foundCopy: "Opened a chapter of The AI Collective from the globe.",
  },
  {
    id: "under-the-hood",
    title: "Under the Hood",
    rarity: "Rare",
    artwork: "console",
    hidden: false,
    hint: "The room ships with its console. Find the key.",
    foundCopy: "Opened the scene console.",
  },
  {
    id: "close-encounter",
    title: "Close Encounter",
    rarity: "Uncommon",
    artwork: "close-up",
    hidden: false,
    hint: "Bring something up for a closer look, then hold still.",
    foundCopy:
      "Had a butterfly land on something you were looking at up close.",
  },
  {
    id: "full-journal",
    title: "Full Journal",
    rarity: "Legendary",
    artwork: "journal",
    hidden: false,
    hint: "Fill every other page of this journal.",
    foundCopy: "Collected every other Field Note.",
  },
] as const satisfies readonly FieldNoteDefinition[];

export type FieldNoteId = (typeof FIELD_NOTES)[number]["id"];

export const FIELD_NOTE_BY_ID = new Map(
  FIELD_NOTES.map((note) => [note.id, note] as const),
);

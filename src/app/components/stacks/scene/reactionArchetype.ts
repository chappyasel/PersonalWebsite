import { HOVER_MOTION_SCALE, TIP } from "./Lift";
import { TILT_MAX_SIZE } from "./interaction";
import { massClassFor } from "./interactionRegistry";
import type { DynamicColliderProfile } from "./physicsColliders";
import {
  SWAY_DAMPING,
  SWAY_LEAN,
  SWAY_STIFFNESS,
  SWAY_TWIST,
} from "./swayMotion";

/**
 * WHAT A PROP DOES WHEN YOU POINT AT IT — the rule, in one place.
 *
 * Until this file existed every prop in the world answered a pointer with the
 * same gesture: a 0.12-radian camera-facing nod about its supporting edge, on
 * one damping curve, whatever the object was. That was deliberate (see the
 * header of Lift.tsx) and it over-corrected. The 60 kg barbell nodded exactly
 * as far and as fast as the 6 g sticker; the basketball, the only prop in the
 * scene with `shape="sphere"`, tilted about a support edge a sphere does not
 * have; and the props that already own a characteristic behaviour — the tea
 * cup's steam, the shakers' shake, the alarm clock's face — ignored it in
 * favour of the shared nod.
 *
 * ADR 0020 replaces that with a Reaction Archetype per prop, DERIVED rather
 * than declared. Deriving is the part that matters: it is what keeps the set
 * from decaying back into the arbitrary collection the shared nod was built to
 * fix. The rule reaches every prop including the ones nobody thought about, a
 * new prop is right by default, and the by-name overrides stay a short
 * reviewable list rather than the mechanism. Same shape as DRAGGABLE_RULE in
 * interaction.ts, and for the same stated reason.
 */
export type ReactionArchetype =
  /** Planted foliage. Leans sideways about its base, and overshoots. */
  | "sway"
  /** Polished metal. The band sweeps and brightens; the prop does not move. */
  | "shimmer"
  /** Too big to be anything but furniture. Brightens in place. */
  | "glow"
  /** Paper-light. Lifts and flutters. */
  | "flutter"
  /** A rigid thing standing on a plank. Today's nod, and honest for these. */
  | "tip"
  /** Iron. Barely moves, and takes its time about it. */
  | "strain"
  /** A gesture authored for this one prop, because it belongs to the object
   * rather than to a class. The band supplies NO motion: the prop's own
   * component owns the whole response. See SIGNATURE_REACTIONS. */
  | "signature";

/**
 * Paper-light, in kilograms.
 *
 * Measured, not guessed. The authored `massKg` population below this line is
 * exactly three props and they are exactly the semantic class: the vineyard
 * vines sticker at 0.006 and the Liar's Dice dice at 0.025. The next prop up
 * is the harmonica at 0.18, so 0.05 sits in an empty band with a factor of
 * 2 of margin below and 3.6 above.
 */
export const FLUTTER_MAX_KG = 0.05;

/**
 * Where iron starts, in kilograms.
 *
 * Deliberately NOT a new number: `massClassFor` in interactionRegistry.ts
 * already cuts light/medium/heavy at 1 and 5, and MASS_HANDLING already tunes
 * carry feel against those same classes (followLambda 22/18/13/9). A second
 * mass taxonomy for hover would be two rules that drift apart. This is the
 * light+medium / heavy+massive line, reused.
 *
 * The population either side, once foliage is removed: below it sit the ~30
 * handheld props topping out at the trophy (1.8); above it sit the mac (7.5),
 * the dumbbells (10, 10, 12), the kettlebell (16) and the barbell (60).
 */
export const STRAIN_MIN_KG = 5;

export type ArchetypeInput = {
  /**
   * Authored on Grabbable. `"foliage-base"` is the scene already saying "this
   * is a plant": the profile exists because a leafy model's collider must be
   * its pot alone. All nine plants carry it, and
   * `plantColliders.presentation.test.ts` is what keeps that true — an
   * untagged plant does not merely collide oddly, it silently nods like a book.
   */
  colliderProfile?: DynamicColliderProfile;
  /**
   * The prop's own polished-metal treatment owns its response. Today this is
   * the four props that already call `useMetalShimmer` plus the project icons;
   * it is a flag rather than a material scan because those props are bespoke
   * components, not ModelProps whose materials could be sampled.
   */
  metal?: boolean;
  /**
   * Greatest measured WORLD dimension, from `hingeFor`. Undefined until the
   * GLB has streamed in, which is why the caller must re-ask rather than cache
   * an answer derived from a missing measurement.
   */
  size?: number;
  /** Authored mass in kilograms. */
  massKg?: number;
  /**
   * This prop owns a Signature Reaction, named. Set at the call site because
   * the call site is the only place that knows — a signature is a component
   * wrapped around the prop, not a property of the prop's geometry, and the
   * derivation has nothing to measure that would reveal one.
   *
   * It beats every derived rule below it, which is the "derived default,
   * explicit override" decision stated in ADR 0020. Overriding is the whole
   * point of an override; a signature that lost to the prop's weight would
   * never fire.
   */
  signature?: string;
};

/**
 * Resolve one prop's archetype.
 *
 * ORDER IS THE RULE and it is not alphabetical or arbitrary. Each test below
 * answers "is this prop's response already decided by something more specific
 * than its weight?", strongest claim first:
 *
 *  0. A SIGNATURE, before everything. It is authored for this exact prop and
 *     nothing derived can outrank a decision made about the object itself.
 *  1. FOLIAGE, before mass. This one is load-bearing and it is the correction
 *     the design review produced. Plants are heavy because of their POTS: the
 *     1–5 kg band is eight of the ten plants in the scene (succulent 1.2,
 *     musings 1.4, projects-small 1.4, cactus 1.6, talks-top 2.1, pothos 2.3,
 *     sansevieria 2.4, about-large 3.1) and the yucca clears 5 at 5.6. Sorting
 *     those by weight would make every plant in the world strain like a
 *     dumbbell. Leaves do not care what the pot weighs.
 *  2. METAL, before size. A polished mark is a surface response, and the
 *     project icons are large enough that the size test below would otherwise
 *     silence them.
 *  3. SIZE, before mass. Furniture is disqualified from moving at all, which
 *     is the existing TILT_MAX_SIZE rule rather than a new one.
 *  4. MASS, last, for everything that is just an object on a plank.
 *
 * Total by design: a prop with no measurement and no authored mass still gets
 * `"tip"`, which is what the whole world did before this file existed. There
 * is no "none" and no undefined return — a prop cannot fall through the rule
 * and end up inert, because inert props are half of what ADR 0020 is fixing.
 */
export function archetypeFor(input: ArchetypeInput): ReactionArchetype {
  // Only a signature that MOVES the prop stands the band down. A surface
  // signature keeps deriving, because a glint on a prop that never shifts is
  // not enough of an answer on its own — owner call, 2026-08-20.
  if (input.signature && signatureChannel(input.signature) === "motion")
    return "signature";
  if (input.colliderProfile === "foliage-base") return "sway";
  if (input.metal) return "shimmer";
  if (input.size !== undefined && input.size > TILT_MAX_SIZE) return "glow";
  const massKg = input.massKg;
  if (massKg === undefined) return "tip";
  if (massKg <= FLUTTER_MAX_KG) return "flutter";
  if (massKg > STRAIN_MIN_KG) return "strain";
  return "tip";
}

/** Archetypes that answer with a material or shader change and never move the
 * prop. The caller skips hinge measurement entirely for these: there is no
 * rotation to pin an edge against, and measuring costs a full mesh walk. */
export const STILL_ARCHETYPES: ReadonlySet<ReactionArchetype> = new Set([
  "shimmer",
  "glow",
  // Not because a signature never moves — most of them do — but because the
  // shared shell must not move it. Whatever motion there is belongs to the
  // prop's own component, which also measures nothing and needs no hinge.
  "signature",
]);

/**
 * The non-motion channel each archetype collapses to under
 * `prefers-reduced-motion`.
 *
 * Reduced motion means no MOTION, not no ANSWER. Collapsing to nothing would
 * reintroduce the inert-prop half of the complaint for every visitor who asks
 * for less movement, so a prop that cannot bend brightens instead.
 */
export function reducedMotionArchetype(
  archetype: ReactionArchetype,
): ReactionArchetype {
  // A signature answers for itself here too. Every one of these components
  // already reads `prefers-reduced-motion` — they have to, because they are
  // the props that were animating before ADR 0020 existed — and replacing a
  // steam plume or a glint with the generic brighten would be a downgrade
  // rather than an accommodation.
  return STILL_ARCHETYPES.has(archetype) ? archetype : "glow";
}

/**
 * HOW EACH BAND MOVES — the mass answer plus the spring, in one table.
 *
 * The complaint that opened ADR 0020 has a number behind it: `massKg` is
 * authored on every movable prop and runs from 0.006 to 60, a factor of ten
 * thousand, and every hover reaction discarded it. The 60 kg barbell tipped
 * exactly as far and exactly as fast as the 6 g sticker.
 *
 * Three things carry the weight, and they have to move TOGETHER or the effect
 * reads as a bug rather than as mass:
 *
 *   LEAN      how far it goes. Iron does not swing. Negative leans BACKWARD,
 *             away from the viewer, which is what a flat mark wants: it turns
 *             the face up toward you rather than pitching it out of the light.
 *   TWIST     a slight yaw riding on the same spring. Only foliage uses it;
 *             it is what makes a plant read as a living thing rather than a
 *             hinged board.
 *   STIFFNESS how it arrives. Every band rides a spring rather than an
 *   /DAMPING  exponential damp, because the plants' spring was the only one in
 *             the world and it read better than everything else. Entry
 *             differs per band because bounce is a MATERIAL property: paper
 *             overshoots hard, a book settles with one bounce, iron does not
 *             bounce at all. Return is critically damped for every band so it
 *             cannot cross behind the authored support plane. `MASS_HANDLING`
 *             already made this call for carrying, where followLambda runs 22
 *             down to 9 across the same classes; this is that gradient, for
 *             hover.
 *
 * Every lean is a base times `HOVER_MOTION_SCALE`, the same form TIP uses. The
 * scene has ONE legibility dial and a band written as a bare number silently
 * opts out of it — a bug that has already happened twice here. Spring
 * constants do NOT scale, because the dial's contract is that props move
 * further, not more abruptly.
 */
export type BandMotion = {
  /** Peak X rotation in radians. Negative leans backward. */
  lean: number;
  /** Peak Y rotation riding the same spring. */
  twist: number;
  stiffness: number;
  damping: number;
};

/**
 * Paper-light. A vinyl sticker and a die weigh nothing, so they answer big and
 * they answer loose: the largest lean in the scene on the springiest curve, a
 * damping ratio of 0.46 that overshoots about 20%. The only band that
 * out-moves `tip`, which is the point — the scene had no vocabulary at all for
 * "this is barely there".
 */
export const FLUTTER_MOTION: BandMotion = {
  lean: 0.12 * HOVER_MOTION_SCALE,
  twist: 0,
  stiffness: 340,
  damping: 17,
};

/** A rigid thing standing on a plank. The shared nod, now on a spring that
 * passes its target once by ~11% before settling. */
export const TIP_MOTION: BandMotion = {
  lean: TIP,
  twist: 0,
  stiffness: 300,
  damping: 20,
};

/**
 * Iron, split on the line `massClassFor` already draws at 20 kg.
 *
 * Not one number, because the band spans the mac at 7.5 and the barbell at 60
 * and collapsing those would repeat the original mistake in miniature. Note
 * the damping ratios: heavy is 0.90, which barely overshoots, and massive is
 * 1.05, which is over-damped and does not overshoot at all. Iron does not
 * bounce, and the barbell is the heaviest object in the room.
 */
export const STRAIN_HEAVY_MOTION: BandMotion = {
  lean: 0.036 * HOVER_MOTION_SCALE,
  twist: 0,
  stiffness: 150,
  damping: 22,
};
export const STRAIN_MASSIVE_MOTION: BandMotion = {
  lean: 0.021 * HOVER_MOTION_SCALE,
  twist: 0,
  stiffness: 90,
  damping: 20,
};

/**
 * Planted foliage. The one band with a twist, and the one that leans furthest
 * without being the lightest — a plant is taller than the handheld props TIP
 * was measured on, so the same angle carries its crown further.
 */
export const SWAY_MOTION: BandMotion = {
  lean: SWAY_LEAN,
  twist: SWAY_TWIST,
  stiffness: SWAY_STIFFNESS,
  damping: SWAY_DAMPING,
};

/**
 * A polished mark, and the only band that leans BACKWARD.
 *
 * Every other band tips its top toward you. A medal is a flat face with an
 * environment highlight sitting on it, and pitching that face forward rolls
 * the highlight off and puts the artwork into shadow — which is what
 * `Grabbable`'s `tiltOnHover` doc has warned about since long before any of
 * this. Leaning it AWAY does the opposite: the face turns up toward a camera
 * that sits above the shelf line, catching more light rather than less. It is
 * the gesture of tilting a coin to read it.
 *
 * Smaller than `tip` and stiffer, because a mark that swings reads as loose
 * rather than as machined.
 */
export const SHIMMER_MOTION: BandMotion = {
  lean: -0.05 * HOVER_MOTION_SCALE,
  twist: 0,
  stiffness: 380,
  damping: 26,
};

/** Furniture answers on a surface channel and never rotates. */
export const GLOW_MOTION: BandMotion = {
  lean: 0,
  twist: 0,
  stiffness: 300,
  damping: 20,
};

/** A signature prop's own component owns every channel; the shell supplies
 * nothing at all. The spring numbers are inert here and exist only so the
 * table has one shape. */
export const SIGNATURE_MOTION: BandMotion = {
  lean: 0,
  twist: 0,
  stiffness: 300,
  damping: 20,
};

/**
 * THE SIGNATURE REACTIONS — the short reviewable list the derivation exists
 * to keep short.
 *
 * ADR 0020's whole argument is that the ANSWER has to be a rule rather than a
 * list, because a list decays back into the arbitrary collection the shared
 * nod was built to fix. This is the deliberate exception: about ten props
 * whose gesture belongs to the object rather than to its class, listed once,
 * where the list can be read and argued with.
 *
 * Six of the ten are here because the prop ALREADY owned a characteristic
 * behaviour that the shared nod was talking over. That is what makes them the
 * cheap ones and it is also what makes them the honest ones — the machinery
 * predates ADR 0020 in every case, and in two of them (the trophy's glint, the
 * tea cup's steam) the owner had already tuned it.
 *
 * ALL SIX ALREADY HAD A NOD. That was not the expectation going in — the
 * shortlist was written as "props that do nothing on hover" — and the inverse
 * guard in `signatureReactions.presentation.test.ts` is what found it. Every
 * one is a composed registration: an egg or a character component sharing one
 * hoverKey with a Grabbable, so the prop was doing its own thing AND taking
 * the shared lean off the same pointer.
 *
 * SURFACE OR MOTION, and it decides whether the nod stays. The first cut took
 * the nod away from all six on the principle that a prop should answer once.
 * Owner review, 2026-08-20: "with the trophy i can't really tell there's
 * glint. I also want the nod", and "I can't tell the tea cup is doing
 * anything" — the two props whose signature never moves the prop at all.
 *
 * The principle was right and applied too widely. Two MOTIONS at once is
 * incoherent: a globe that turns and leans is two gestures. A surface change
 * plus a lean is not — it is exactly what the shimmer band already does to the
 * medals, sweeping a highlight while tilting the face up to catch it. So the
 * test is whether the signature moves the PROP:
 *
 *   motion  — spin, roll, slosh, shiver. The band stands down.
 *   surface — glint, steam. The prop keeps its band; the signature is the
 *             character on top, and without the band the prop had nothing at
 *             all to say in silhouette.
 *
 * Kept as data so `signatureReactions.presentation.test.ts` can check every
 * entry still names a prop that exists. A list of props that are no longer in
 * the scene is not a hypothetical failure in this repo — the measured census
 * in interaction.ts spent a release naming an eames chair and a ladder that
 * had both been removed.
 */
export type SignatureReaction = {
  /** The prop's hoverKey, or its stable prefix where the key is templated. */
  hoverKey: string;
  /** The gesture, in one word — the value passed as `signature`. */
  gesture: string;
  /**
   * Whether the gesture moves the PROP, and therefore whether the derived
   * band stands down.
   *
   * `"motion"` replaces the band: two movements at once read as two effects.
   * `"surface"` keeps it: a glint or a plume changes nothing about where the
   * prop is, so removing the lean leaves the silhouette completely still.
   */
  channel: "surface" | "motion";
  /** The component that owns it, so the list leads somewhere. */
  owner: string;
  /**
   * What this replaced.
   *
   * Load-bearing rather than descriptive. `"nod"` means a Grabbable was
   * answering with the shared lean and the call site MUST pass `signature` to
   * stand it down, or the prop answers twice. `"silence"` means the prop is
   * wrapped in an EggTrigger alone: `ancestorHandlesHover` already stands the
   * universal floor down for those, there is no Grabbable to override, and
   * the gesture is filling a hover that did nothing at all.
   */
  replaces: "silence" | "nod";
};

export const SIGNATURE_REACTIONS: readonly SignatureReaction[] = [
  {
    hoverKey: "grab:trophy",
    gesture: "glint",
    channel: "surface",
    owner: "Glint in units/UnitProjects.tsx",
    replaces: "nod",
  },
  {
    hoverKey: "egg:tea",
    gesture: "steam",
    channel: "surface",
    owner: "SteamCup in eggs.tsx",
    replaces: "nod",
  },
  {
    hoverKey: "grab:shaker:",
    gesture: "slosh",
    channel: "motion",
    owner: "ShakerProp in AuthoredProps.tsx",
    replaces: "nod",
  },
  {
    hoverKey: "grab:basketball",
    gesture: "roll",
    channel: "motion",
    owner: "RollProp in eggs.tsx",
    replaces: "nod",
  },
  {
    // The baseball and the tennis balls: the same RollProp, the same reason.
    hoverKey: "grab:ball:",
    gesture: "roll",
    channel: "motion",
    owner: "RollProp in eggs.tsx",
    replaces: "nod",
  },
  {
    hoverKey: "egg:globe",
    gesture: "spin",
    channel: "motion",
    owner: "SpinProp in eggs.tsx",
    replaces: "nod",
  },
  {
    hoverKey: "egg:clock:alarm",
    gesture: "shiver",
    channel: "motion",
    owner: "EggClock in eggs.tsx",
    // The clock's egg and its carrier deliberately share one hoverKey, so the
    // Grabbable half was nodding while the egg half did nothing on hover.
    replaces: "nod",
  },
];

/**
 * Which channel a named gesture answers on.
 *
 * By gesture rather than by hoverKey, so a call site declares one thing
 * (`signature="glint"`) and the consequence for the band is decided in the
 * list rather than at every site. An unlisted name is treated as motion: a
 * gesture nobody has classified is more likely to be a new animation than a
 * new shader, and the failure that way round is a quiet prop rather than two
 * gestures fighting.
 */
export function signatureChannel(gesture: string): "surface" | "motion" {
  return (
    SIGNATURE_REACTIONS.find((s) => s.gesture === gesture)?.channel ?? "motion"
  );
}

/** Resolve how one archetype moves. */
export function bandMotionFor(
  archetype: ReactionArchetype,
  massKg?: number,
): BandMotion {
  // Zero on every channel. A signature that also got the band's lean would
  // answer twice, which is precisely what ADR 0020 set out to remove: the tea
  // cup steamed AND nodded, the trophy glinted AND nodded, and the second half
  // of each was the shared tell the owner asked to be rid of.
  if (archetype === "signature") return SIGNATURE_MOTION;
  if (archetype === "sway") return SWAY_MOTION;
  if (archetype === "shimmer") return SHIMMER_MOTION;
  if (archetype === "glow") return GLOW_MOTION;
  if (archetype === "flutter") return FLUTTER_MOTION;
  if (archetype === "strain") {
    return massKg !== undefined && massClassFor(massKg) === "massive"
      ? STRAIN_MASSIVE_MOTION
      : STRAIN_HEAVY_MOTION;
  }
  return TIP_MOTION;
}

/**
 * THE CENSUS — every prop's resolved archetype, readable at runtime.
 *
 * The same tool, for the same reason, as the `[stacks] floor …` and
 * `[stacks] tip …` logs already in ModelProp and Lift: the size and mass
 * cutoffs above were chosen off a measured population, and the only way to
 * keep choosing them well is to be able to read that population back. It also
 * answers the one question a screenshot cannot, which is whether a prop that
 * looks wrong got the archetype you think it got or fell through to `tip`.
 *
 * Dev only. `recordArchetype` compiles to a no-op branch in production and the
 * map is never populated, so nothing is retained.
 *
 * Read it with `window.__stacksArchetypes()`. It deliberately does NOT hang off
 * `window.__stacks`: that object is declared and installed in StacksCanvas,
 * which is a busy shared file, and a census is not worth a merge conflict in
 * it. See the work log.
 */
export type ArchetypeCensusRow = {
  id: string;
  archetype: ReactionArchetype;
  /** Which shell resolved it. `floor` props carry no authored mass. */
  source: "grabbable" | "floor";
  massKg?: number;
  size?: number;
  /** The gesture, for a prop that owns one. Reading a census row as `signature`
   * with no name means a call site passed the flag and never said what for. */
  signature?: string;
};

const census = new Map<string, ArchetypeCensusRow>();

declare global {
  interface Window {
    __stacksArchetypes?: () => ArchetypeCensusRow[];
  }
}

export function recordArchetype(row: ArchetypeCensusRow): void {
  if (process.env.NODE_ENV === "production") return;
  census.set(row.id, row);
  if (typeof window !== "undefined" && !window.__stacksArchetypes) {
    window.__stacksArchetypes = archetypeCensus;
  }
}

/** Sorted by archetype then id, so a band's whole membership reads as a block
 * and a prop sitting in the wrong one is obvious at a glance. */
export function archetypeCensus(): ArchetypeCensusRow[] {
  return [...census.values()].sort(
    (a, b) =>
      a.archetype.localeCompare(b.archetype) || a.id.localeCompare(b.id),
  );
}

/** Test seam. The map is module state and would otherwise leak between cases. */
export function clearArchetypeCensus(): void {
  census.clear();
}

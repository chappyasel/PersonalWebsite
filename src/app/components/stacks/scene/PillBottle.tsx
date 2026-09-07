"use client";

// A supplement bottle for the Systems shelf: straight HDPE cylinder, paper
// label band, screw cap. Three lathe surfaces and no text — at ~5 real
// centimetres a plain cream band reads "label" and anything written on it
// would be a smear, the same call the MiO bottles and bag labels made at
// their sizes. Tones stay in the pill cases' black-and-white family plus the
// one amber every cabinet has.
//
// Three sizes, because a supplement shelf is never one SKU: a fifteen-bottle
// stash built from one cylinder reads as a vending machine, and the mixed
// diameters are also what lets that many bottles pack into one bay without
// intersecting.
import {
  PILL_BOTTLE_SIZES,
  type PillBottleCap,
  type PillBottleSize,
  type PillBottleTone,
} from "./systemsPillLayout";

/** A wrap label covers most of the barrel, so the LABEL is what decides
 * whether a bottle reads light or dark from across the room — not the body
 * under it. Fifteen bottles all wearing the same cream wrap came out as one
 * white mass whatever colour their plastic was, so the dark bottles wear a
 * dark label and the cluster keeps the pill cases' black-and-white split. */
const BODY: Record<
  PillBottleTone,
  { color: string; label: string; roughness: number }
> = {
  // Off-white HDPE, warmed like every other white on this shelf.
  white: { color: "#e9e4da", label: "#ece6d8", roughness: 0.5 },
  // Amber PET reads darker than it pours; glossier than the HDPE, and it
  // keeps the cream wrap so its shoulders and foot show as amber.
  amber: { color: "#7c4c20", label: "#e7dcc6", roughness: 0.28 },
  // Kraft-labelled white plastic: the third tone, half a stop under the
  // whites so two pale bottles standing together still separate. It replaced
  // a black bottle, which competed with the pill cases for this corner's
  // one dark note.
  sand: { color: "#cfc3ab", label: "#c2b294", roughness: 0.62 },
};

const CAP: Record<PillBottleCap, string> = {
  white: "#f1eee6",
  // A grey cap, not a black one — see the tone note above.
  slate: "#8c9098",
};

export default function PillBottle({
  tone,
  size = "large",
  cap = "white",
  yaw = 0,
}: {
  tone: PillBottleTone;
  size?: PillBottleSize;
  cap?: PillBottleCap;
  /** Turns only the label seam — the silhouette is round — but keeping the
   * prop's yaw authored like its neighbours keeps rows honest to retune. */
  yaw?: number;
}) {
  const body = BODY[tone];
  const { radius, bodyHeight, capHeight } = PILL_BOTTLE_SIZES[size];
  return (
    <group rotation={[0, yaw, 0]}>
      <mesh castShadow position={[0, bodyHeight / 2, 0]}>
        <cylinderGeometry args={[radius, radius, bodyHeight, 18]} />
        <meshStandardMaterial
          color={body.color}
          roughness={body.roughness}
          metalness={0}
        />
      </mesh>
      {/* A supplement label wraps nearly the whole barrel, leaving a shoulder
          and a foot of bare bottle. At the first pass' 40% the amber bottles
          read as white ones with two brown stripes — a band is a stripe, a
          wrap is a label. Open-ended so its rims never z-fight the body. */}
      <mesh position={[0, bodyHeight * 0.46, 0]}>
        <cylinderGeometry
          args={[
            radius + 0.0012,
            radius + 0.0012,
            bodyHeight * 0.66,
            18,
            1,
            true,
          ]}
        />
        <meshStandardMaterial
          color={body.label}
          roughness={0.86}
          metalness={0}
        />
      </mesh>
      {/* Nearly flush with the barrel, which is what an HDPE supplement cap
          is. Stepped in to 0.9 it became a neck, and a neck on a squat
          cylinder is a flask. */}
      <mesh castShadow position={[0, bodyHeight + capHeight / 2, 0]}>
        <cylinderGeometry
          args={[radius * 0.97, radius * 0.97, capHeight, 18]}
        />
        <meshStandardMaterial color={CAP[cap]} roughness={0.42} metalness={0} />
      </mesh>
    </group>
  );
}

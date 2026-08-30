"use client";

// The light-therapy panel on the Systems shelf: a Verilux HappyLight Touch
// Plus, standing on its detachable kickstand at the right end of the lower
// plank where a desk lamp used to be.
//
// Authored geometry rather than a GLB. The object is a rounded slab, an inset
// emitting face, a dark rear housing and three touch circles, all of which
// RoundedBox and four small meshes cover exactly — and authoring it keeps the
// light rig's constants in the same file as the surfaces they were measured
// off, which is the structural lesson LampGlow's v6 note in primitives.tsx
// records: a rig that lives away from its model drifts off the opening it is
// registered to.
//
// No wordmark. "HappyLight" is a brand logotype, and this repo draws the name
// of a thing but never a brand's own mark (scripts/stacks-labels/creatine.svg
// carries the same rule for the pouches).
import { PALETTES, type Palette } from "../theme";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { RoundedBox } from "./RoundedBox";
import { LampSwitch } from "./eggs";
import { MOTH_LIGHT_PROFILES, registerMeadowLamp } from "./meadowLights";
import { sceneUnitLightUserData } from "./sceneGpuPrewarm";
import { useUnitRealLights } from "./scenePerformance";

/** Named so a placement probe can read the panel's real bounds out of the
 * scene graph. It is not a Grabbable, so it has no `nod:` node of its own, and
 * "does it fit, does it sit ON the wood, does it clear the pill cases" are all
 * questions that had to be measured rather than derived. */
export const SUN_LAMP_NODE = "stacks-sun-lamp";

/* ---------------------------------------------------------------------- *
 * The object, from the spec sheet: 10.3 x 6.3 x 1.1 in, or 26.2 x 16.0 x
 * 2.8 cm. At the shelf family's ~2.00 world units per metre (the books' scale,
 * NOT the furniture's 0.96) that is 0.524 x 0.320 x 0.056.
 *
 * It is the tallest loose thing on this plank and it is meant to be: the real
 * panel is a foot high next to bottles that are four inches. It still clears
 * the lower shelf's 0.8075 of headroom by 0.28, and it comes in SHORTER than
 * the desk lamp it replaces — desk-lamp.glb is 0.4163 tall at scale 1.52, so
 * 0.633. The silhouette gets wider and lower, not bigger.
 *
 * Every face proportion below is measured off the product images rather than
 * chosen, as a fraction of the outside dimension, so the panel cannot drift
 * out of proportion if the size is retuned.
 * ---------------------------------------------------------------------- */
const PANEL_W = 0.32;
const PANEL_H = 0.524;
/** 0.042, not the 0.056 the spec sheet's 1.1 in works out to. "Seems a
 * little too thick/chunky" (owner, 2026-08-29), and depth is what reads as
 * thickness: the panel is seen nearly edge-on from the left of this shelf, so
 * its side is a bigger share of the silhouette than a front elevation
 * suggests. 0.75 of the real depth, with the corner radii cut with it and the
 * bezel margins narrowed below, is the whole of that fix. Width and height
 * stay exact — those are the proportions that make it a HappyLight. */
const PANEL_D = 0.042;

/** The rear housing carries the full outline and the front plate is inset
 * into it. That way round, not the other: the housing has to be the outer
 * silhouette or its edge never appears at all — a 4 mm inset is hidden by the
 * front plate's own bevel from every angle this shelf is seen from.
 *
 * It is white now ("back of it should be white too, not black", owner,
 * 2026-08-29). The real panel's rear is a dark grey band and it was drawn
 * that way; his call overrides the reference. It keeps half a stop of
 * separation from the front plate so the two still read as two pieces rather
 * than one moulding, which is all the edge was ever doing. */
const SHELL_W = PANEL_W;
const SHELL_H = PANEL_H;
const SHELL_D = PANEL_D * 0.24;
/** Bounded by the housing's own depth, not chosen for looks. `RoundedBox`
 * extrudes `dimension - 2 * radius`, so at the 0.008 this started as it was
 * building a box 0.00592 DEEP IN THE NEGATIVE: inside-out bevel geometry on
 * the one face that carries the panel's outline. The depth is 0.01008, so the
 * ceiling is 0.00504 and this leaves a little under it. */
const SHELL_R = 0.004;
const BEZEL_W = PANEL_W - 0.008;
const BEZEL_H = PANEL_H - 0.008;
const BEZEL_D = PANEL_D - SHELL_D;
const BEZEL_R = 0.013;
/** Front faces flush at +PANEL_D/2; the housing hangs off the back. */
const BEZEL_Z = PANEL_D / 2 - BEZEL_D / 2;
const SHELL_Z = -PANEL_D / 2 + SHELL_D / 2;

/** The emitting face. The spec sheet's front elevation gives 0.795 of the
 * panel's width and 0.784 of its height; these are wider, for the same
 * "chunky" note — a thin frame around a large lit face is most of what reads
 * as a thin panel, and the margin the spec gives is 0.032 of white, which at
 * this distance is a border you notice before you notice the light. The
 * centre still sits 0.033 of the height ABOVE the panel's, because the bottom
 * bezel carries the controls and is nearly twice the depth of the top one. */
const EMIT_W = PANEL_W * 0.855;
const EMIT_H = PANEL_H * 0.845;
const EMIT_Y = PANEL_H * 0.033;
const EMIT_R = 0.011;
/** Sunk into the bezel, front face 0.5 mm proud so it cannot z-fight. The
 * box is thicker than it looks: only the front 0.0005 of it is outside the
 * bezel, and the rest is buried, which is what makes the diffuser meet the
 * white frame with a soft edge instead of a printed outline. */
const EMIT_D = 0.03;
const EMIT_Z = PANEL_D / 2 + 0.0005 - EMIT_D / 2;

/** Three touch controls along the bottom bezel, at 0.913 of the way down the
 * panel and 0.227 of its width either side of centre. Rings rather than discs,
 * because that is what they are: outlined circles on white plastic. They are
 * about 5 px across on the shelf and they carry more of the object's identity
 * than their size suggests — with the emitter blown out they were the first
 * detail to disappear and the panel became a whiteboard. */
const CONTROL_Y = PANEL_H * (0.5 - 0.913);
const CONTROL_X = PANEL_W * 0.227;
const CONTROL_OUTER = 0.0165;
const CONTROL_INNER = 0.013;

/** Lean, from the three-quarter product shot: the kickstand holds the panel
 * a little off vertical, not at a monitor's rake. */
const LEAN = 0.24;

/** The lowest point of a rounded box after the lean, in the panel's own
 * frame. Leaning back drops the BACK bottom corner, and the rear housing —
 * shorter but set further back — reaches lower than the bezel does, so the
 * thing the panel actually stands on has to be computed rather than assumed.
 * Derived because a literal here floats the lamp the first time the lean or
 * the housing depth is retuned. */
function leanedFloor(
  centreY: number,
  centreZ: number,
  halfHeight: number,
  halfDepth: number,
  radius: number,
) {
  const cornerY = centreY - (halfHeight - radius);
  const cornerZ = centreZ - (halfDepth - radius);
  return cornerY * Math.cos(LEAN) + cornerZ * Math.sin(LEAN) - radius;
}
const STAND_Y = -Math.min(
  leanedFloor(0, BEZEL_Z, BEZEL_H / 2, BEZEL_D / 2, BEZEL_R),
  leanedFloor(0, SHELL_Z, SHELL_H / 2, SHELL_D / 2, SHELL_R),
);

/** White ABS, warmed to the off-white every other white on this shelf wears
 * (the pill bottles' HDPE is #e9e4da, the bag tint #e6dfd2). A true paper
 * white here would sit a stop over the pouches standing next to it. Plastic
 * keeps its albedo across themes, so these are constants rather than palette
 * entries — the same call the bumper plates' rubber makes. */
const BEZEL_COLOR = "#efebe3";
const SHELL_COLOR = "#ddd7cb";
const CONTROL_COLOR = "#8b97a6";
const STAND_COLOR = "#2c2f33";

/** Daylight white, and that is the point of the object: a 10,000 lux therapy
 * panel is 5000-6500 K where every other practical in this room is a warm
 * tungsten. Restrained, though — far enough off neutral to read as a
 * different KIND of light beside the About and Musings lamps, not far enough
 * to turn the corner of the shelf blue. */
const EMIT_COLOR = "#f4f9ff";
const EMIT_EMISSIVE = "#dceafa";
const LIGHT_COLOR = "#e9f1fa";

/**
 * How much light this panel spends, as a fraction of LampGlow's authored desk
 * lamp. "Make it a little less powerful than the regular lamps" (owner,
 * 2026-08-29).
 *
 * The two ratios are wildly different and that is the finding, not a mistake.
 * Equal intensities are NOT equal light: a spotlight's brightness at a surface
 * is intensity/d², and this fixture's fill lights sit an order of magnitude
 * closer to the plank and the pill cases than the desk lamp's did, because a
 * panel emits from its whole face while a shaded lamp emits from a mouth held
 * up on a stalk. Derived straight from LampGlow's numbers at a flat 0.6, this
 * rig measured BRIGHTER than the lamp it replaced.
 *
 * So the levels were set by measuring the render instead. Three passes over
 * the same crop at 4x device scale — the desk lamp standing here, the panel
 * standing here, and neither of them lit — reading the light each one ADDS
 * over that unlit floor, summed across the channels so a warm source and a
 * cool one are compared by energy rather than by hue:
 *
 *                       props left of it    plank in front of it
 *   day    desk lamp          +170                  +213
 *   day    panel              +131  (0.77)          +147  (0.69)
 *   night  desk lamp          +220                  +226
 *   night  panel              +181  (0.82)          +203  (0.90)
 *
 * Under the lamp it replaced on every sample in both themes, which is what
 * "a little less powerful" asks for. Note what does NOT show in that table:
 * bloom off a 0.09 world² emitting face is part of how bright this corner
 * reads and it answers to EMIT_INTENSITY, not to these. Turn that down first
 * if the corner ever looks hot.
 */
const BEAM = { day: 0.8, night: 0.66 };
const SPILL = { day: 0.105, night: 0.09 };
/** The fill at the panel's own foot gets its own, larger share — the wood a
 * bare panel stands on is where its light lands hardest. Capped at a 0.6
 * reach, so unlike the room kiss it cannot touch anything but that wood.
 *
 * It stays modest because there is nowhere to put it that lights the plank
 * and not the panel: the bezel is a near-vertical white plane facing forward,
 * so any fill in front of it is head-on, and the only alternatives are under
 * the shelf or behind the panel. At 0.3 it washed the lower half of the frame
 * and took the controls with it. The cone's own near edge does the rest. */
const FOOT = { day: 0.16, night: 0.14 };

/** The cone is not a beam — this fixture has no reflector. It stands in for
 * the panel's downward lobe, so it is fully feathered.
 *
 * 0.66, down from the 0.85 the first pass used. The pool has to have a SIZE
 * you can read against the panel that makes it, and at 0.85 it was a wash with
 * no edge anywhere on the plank. It cannot go much below this either: a
 * spotlight's near edge is its STEEP edge, so narrowing the cone walks the
 * lit patch away from the lamp, and at 0.55 there was a band of unlit wood
 * between the panel's foot and the pool that read as the lamp hovering.
 * Feathered at penumbra 1 this lays a soft ellipse roughly one and a half
 * panel widths across, starting at the foot. */
const WASH_ANGLE = 0.66;

/** The diffuser's own brightness, and the only number here that is not a
 * fraction of the desk lamp: the mouth disc it is compared against is 0.021
 * world² at the shipped scale and this face is 0.104, so a fifth of the
 * intensity is the like-for-like setting. Day clears the composer's 0.95
 * bloom threshold on its two coolest channels; night is trimmed because at
 * 1.3 the bloom ate the bezel, the dark rim and all three controls and the
 * panel came out as a plain glowing rectangle. */
const EMIT_INTENSITY = { day: 1.25, night: 1.15 };

export default function SunLamp({
  unitIndex,
  palette,
  yaw = 0,
}: {
  unitIndex: number;
  palette: Palette;
  /** Turn on the plank. The panel, the stand and the whole light rig hang off
   * one group so the cone can never come off the face that emits it — the
   * rule EggLamp's comment states for the desk lamp, and the reason this
   * component owns its rig instead of borrowing LampGlow's. */
  yaw?: number;
}) {
  const lit = useRef(1);
  const realLights = useUnitRealLights(unitIndex);
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const day = palette !== PALETTES.dark;
  useEffect(() => {
    if (spotRef.current && targetRef.current)
      spotRef.current.target = targetRef.current;
    if (!spotRef.current || !targetRef.current) return;
    const mouth = new THREE.Vector3();
    const aim = new THREE.Vector3();
    spotRef.current.getWorldPosition(mouth);
    targetRef.current.getWorldPosition(aim);
    aim.sub(mouth);
    // Same continuation LampGlow uses: follow the beam to the lawn at
    // y ≈ -1.1 so the grass warms where the panel actually points, capped
    // before a near-horizontal aim throws the pool at the horizon.
    const t = aim.y < -1e-3 ? Math.min((-1.1 - mouth.y) / aim.y, 5) : 2;
    // The lamp id stays a desk-lamp slot on purpose: it is the key the
    // Systems insect Perch and the meadow pool both look this fixture up by,
    // and the moth profile is unchanged, so the room's fixed instancing
    // budget (three desk practicals plus the floor lamp) does not move.
    return registerMeadowLamp(`desk-lamp-${unitIndex}`, {
      x: mouth.x + aim.x * t,
      y: -1.1,
      z: mouth.z + aim.z * t,
      radius: 1.15,
      strength: 0.45 * BEAM.day,
      litRef: lit,
      sourceX: mouth.x,
      sourceY: mouth.y,
      sourceZ: mouth.z,
      coneTargetX: mouth.x + aim.x * t,
      coneTargetY: -1.1,
      coneTargetZ: mouth.z + aim.z * t,
      mothCount: MOTH_LIGHT_PROFILES.desk.count,
      mothNearDistance: MOTH_LIGHT_PROFILES.desk.nearDistance,
      mothFarDistance: MOTH_LIGHT_PROFILES.desk.farDistance,
      mothMaxRadius: MOTH_LIGHT_PROFILES.desk.maxRadius,
    });
  }, [unitIndex]);
  return (
    <group name={SUN_LAMP_NODE} rotation={[0, yaw, 0]}>
      <LampSwitch
        unitIndex={unitIndex}
        hoverKey={`egg:lamp:${unitIndex}`}
        litRef={lit}
        rig={
          // Sibling of the click target, never a child — LampSwitch's rule.
          // Lights are invisible so they would not swallow the shelf behind
          // them the way a transparent glow quad does, but keeping the rig
          // where the wrapper expects it is what lets the switch's traverse
          // dim the panel and its lights in one pass.
          <group position={[0, STAND_Y, 0]} rotation={[-LEAN, 0, 0]}>
            {/* The pool, and its aim is now the panel's own facing direction
                rather than an offset off it. This target has x = 0 on purpose:
                in this frame that is straight out of the emitting face, so the
                ellipse the cone lays on the wood sits directly in FRONT of the
                panel with its long axis pointing away from it, and turning the
                lamp turns the light with it. The earlier aim carried a -0.8
                sideways component and the pool came out beside the lamp
                instead of in front of it, which is exactly what "make sure the
                emitted light is coming out at the right angle" was about
                (owner, 2026-08-29).
                The one liberty left is the drop. A panel leaning 14° BACK
                emits forward and slightly up, so a cone along the true normal
                lights nothing but air; this drops 50° below horizontal, which
                is the downward half of the face's hemisphere standing in for
                the whole of it. From a mouth 0.29 above the plank that lands
                the centre 0.25 out along the facing direction — unit
                (0.92, 0.02), on the wood, short of the front lip. */}
            <spotLight
              ref={spotRef}
              visible={realLights}
              userData={sceneUnitLightUserData(unitIndex)}
              position={[0, EMIT_Y, 0.09]}
              color={LIGHT_COLOR}
              intensity={day ? 5.6 * BEAM.day : 4.8 * BEAM.night}
              angle={WASH_ANGLE}
              penumbra={1}
              distance={1.7}
              decay={2}
            />
            <object3D ref={targetRef} position={[0, EMIT_Y - 1.2, 0.62]} />
            {/* Close spill on the plank the panel stands on. It sits BELOW the
                panel's bottom edge rather than in front of the face, and that
                placement is the whole reason the object is legible: a fill
                light anywhere in front of a 0.32 x 0.52 white panel shines
                straight down its own bezel at point-blank range, and 1/d²
                does the rest. Measured, a first pass with this light 0.06 off
                the face rendered the bezel at 251 of 255 — the panel came out
                as one blown white rectangle with no frame, no rim and no
                controls in it. From under the bottom edge the same light
                grazes the panel and pools on the wood. */}
            <pointLight
              visible={realLights}
              userData={sceneUnitLightUserData(unitIndex)}
              position={[-0.06, -0.3, 0.1]}
              color={LIGHT_COLOR}
              intensity={day ? 0.82 * FOOT.day : 0.66 * FOOT.night}
              distance={0.6}
              decay={2}
            />
            {/* The kiss on the neighbours — the far pill case and the print,
                which sit outside the cone's soft centre. A lit lamp standing
                beside unlit props is the one thing no real lamp does. Held to
                a 1.1 reach so it stops at the end of the plank rather than
                carrying on into the meadow. */}
            <pointLight
              visible={realLights}
              userData={sceneUnitLightUserData(unitIndex)}
              position={[-0.16, 0, 0.14]}
              color={LIGHT_COLOR}
              intensity={day ? 1.32 * SPILL.day : 1.06 * SPILL.night}
              distance={1.1}
              decay={2}
            />
          </group>
        }
      >
        <group position={[0, STAND_Y, 0]} rotation={[-LEAN, 0, 0]}>
          <RoundedBox
            args={[BEZEL_W, BEZEL_H, BEZEL_D]}
            radius={BEZEL_R}
            smoothness={4}
            position={[0, 0, BEZEL_Z]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color={BEZEL_COLOR}
              roughness={0.44}
              metalness={0}
            />
          </RoundedBox>
          <RoundedBox
            args={[SHELL_W, SHELL_H, SHELL_D]}
            radius={SHELL_R}
            smoothness={3}
            position={[0, 0, SHELL_Z]}
            castShadow
          >
            <meshStandardMaterial
              color={SHELL_COLOR}
              roughness={0.6}
              metalness={0}
            />
          </RoundedBox>
          {/* The diffuser: `toneMapped={false}` like the desk lamp's mouth
              disc, at the intensity EMIT_INTENSITY explains. Rendered, it
              reads 250 of 255 against a bezel at 235 — enough separation that
              the frame around it stays a frame. */}
          <RoundedBox
            args={[EMIT_W, EMIT_H, EMIT_D]}
            radius={EMIT_R}
            smoothness={4}
            position={[0, EMIT_Y, EMIT_Z]}
          >
            <meshStandardMaterial
              color={EMIT_COLOR}
              emissive={EMIT_EMISSIVE}
              emissiveIntensity={
                day ? EMIT_INTENSITY.day : EMIT_INTENSITY.night
              }
              roughness={0.5}
              toneMapped={false}
            />
          </RoundedBox>
          {[-CONTROL_X, 0, CONTROL_X].map((x) => (
            <mesh key={x} position={[x, CONTROL_Y, PANEL_D / 2 + 0.0004]}>
              <ringGeometry args={[CONTROL_INNER, CONTROL_OUTER, 20]} />
              <meshStandardMaterial
                color={CONTROL_COLOR}
                roughness={0.55}
                metalness={0}
              />
            </mesh>
          ))}
        </group>
        {/* The detachable stand, authored upright because its foot lies flat
            on the plank while the panel it holds does not. A raked leg, not a
            wedge parallel to the panel: the lean is only 14°, so the leg that
            props it has to come off the back at nearly 40° to reach the wood
            behind. Reaches z -0.09, which is where the panel's own top-back
            corner ends up. */}
        <RoundedBox
          args={[0.058, 0.009, 0.082]}
          radius={0.004}
          smoothness={2}
          position={[0, 0.0045, -0.058]}
          castShadow
        >
          <meshStandardMaterial
            color={STAND_COLOR}
            roughness={0.72}
            metalness={0}
          />
        </RoundedBox>
        <RoundedBox
          args={[0.048, 0.135, 0.008]}
          radius={0.0035}
          smoothness={2}
          position={[0, 0.06, -0.047]}
          rotation={[0.69, 0, 0]}
          castShadow
        >
          <meshStandardMaterial
            color={STAND_COLOR}
            roughness={0.72}
            metalness={0}
          />
        </RoundedBox>
      </LampSwitch>
    </group>
  );
}

# Mobile world interaction: make it intimate, tactile, and alive

Date: 2026-08-18
Scope: source-level UX investigation and recommendations only; no browser automation or app changes.

## Executive recommendation

Do **not** try to fit the desktop room into a portrait rectangle. Treat mobile as
a **guided, touch-responsive diorama**: one deliberately composed focal cluster
per unit, direct horizontal travel that follows the finger and snaps to a unit,
tap-to-focus interactions with immediate physical feedback, and a compact
content chip that expands into a readable full-height panel.

The target feeling is not “desktop, but smaller.” It is **closer and more
physical** than desktop: the finger wakes the world, the scene responds during
the gesture, and every unit has a small authored arrival beat.

## What is making the current mobile experience feel distant

1. **The phone shot is still materially wider than desktop in the important
   dimension.** The desktop camera is `z: 5.8, fov: 33`; the phone camera is
   `z: 7.6, fov: 32.5` ([worldLayout.ts](../../src/app/components/stacks/scene/worldLayout.ts#L17)). At the shelf plane, those settings show about 3.44 world units vertically on desktop and 4.43 on a phone. A prop is therefore only about **77.6% of its desktop apparent height**—roughly 22% smaller—even after the recent 20% tightening relative to the old phone lens. The source itself also records that the shelf feet land at 68.4% of a 390×844 screen and the remaining space becomes the sheet's peek region ([PlacardLayer.tsx](../../src/app/components/stacks/dom/PlacardLayer.tsx#L708)).

2. **Mobile removes the desktop's signature physical interaction.** The current
   grabbable contract says “Touch remains tap-only,” and latches every touch as
   non-draggable ([Grabbable.tsx](../../src/app/components/stacks/scene/Grabbable.tsx#L275)). That is a sensible conflict-avoidance decision, but it means mobile receives the scenery without the behavior that makes the scenery feel alive.

3. **The world consumes both major swipe axes for the same action.** Horizontal
   panning is native, while vertical touch swipes are remapped to lateral travel
   ([ScrollBridges.tsx](../../src/app/components/stacks/input/ScrollBridges.tsx#L219)). This makes travel easy, but it leaves no clean spatial grammar for “move through the room” versus “open/read content” versus “manipulate this thing.” Apple's motion guidance says feedback should follow the direction and expectation of the gesture; revealing in one direction and dismissing in an unrelated direction is disorienting ([Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)).

4. **The default sheet is solving the empty-floor symptom, not the composition.** It can occupy at least 160 px and up to 45% of the viewport, with peek, expanded, and dismissed detents ([PlacardLayer.tsx](../../src/app/components/stacks/dom/PlacardLayer.tsx#L740)). It is mechanically thoughtful, but the user's report suggests the world—not the sheet—needs to become the primary mobile composition.

## Recommended interaction model

### 1. Author a portrait shot for every unit

Give each unit mobile-specific framing data: focal point, camera distance,
look target, hero cluster, and allowed crop. At rest, show **one hero cluster and
two readable satellites**, not the complete shelf at equal priority. Reposition
or modestly enlarge important props on coarse-pointer portrait layouts; preserve
the same objects and world continuity, but change the staging.

Matching desktop's vertical apparent scale would reduce a 390×844 phone's
visible shelf width to roughly 1.6 world units, versus the shelf's 2.64-unit
width. That means “everything visible” and “everything legible” cannot both be
true. The right answer is an intentional crop and responsive composition, not
another small FOV adjustment. Apple explicitly warns that scaling an experience
onto mobile can make controls and content too small and recommends changing the
presentation when that happens ([Apple HIG: Menus](https://developer.apple.com/design/human-interface-guidelines/menus)).

Practical target: key props should land at least at desktop apparent size at the
resting stop. Secondary props can enter through the traverse, a small local pan,
or the content panel.

### 2. Give each axis one meaning

- **Horizontal drag in the exposed world:** travel through the room, 1:1 with
  the finger, then settle to the nearest unit with velocity-aware snapping.
- **Vertical drag:** belongs to readable content and the bottom panel; do not
  secretly translate it into sideways room travel on touch devices.
- **Tap a prop:** focus/select it and produce feedback immediately.
- **Tap the revealed action:** open the destination or perform the local action.
- **Press-and-hold:** optional “pick up / inspect” shortcut for playful props,
  never required for navigation.

CSS Scroll Snap can provide browser-native end positions after scrolling, and
supports an explicit axis and snap strictness ([MDN: CSS scroll snap](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_snap/Basic_concepts)). `touch-action` should declare what remains browser-owned; applying `none` broadly can disable browser zoom, while values such as `pan-y` and `pinch-zoom` preserve expected behavior ([MDN: `touch-action`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action)). Keep Android's left/right edge strips system-owned because they are used for Back gestures ([Android: gesture navigation compatibility](https://developer.android.com/develop/ui/views/touch-and-input/gestures/gesturenav)).

### 3. Replace hover with a real touch state, not hover emulation

On `pointerdown`, the prop should visibly depress, lean, glow, or cast a stronger
contact shadow **before the finger lifts**. On tap, it becomes selected and gets
a persistent, screen-readable outcome label such as “Open Book Notes” or “Toss
basketball.” This label contains the action; it is not a floating mystery
tooltip. Desktop hover remains behind `(hover: hover) and (pointer: fine)`;
coarse-pointer devices need persistent affordances and larger hit regions
([MDN: hover and pointer media features](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Media_queries#use_of_pointing_devices)).

For toys, a single tap should do something satisfying even when the visitor
does not learn hold-to-grab: nudge, spin, bounce, open, ring, or scatter. Hold
can then graduate into a lightweight authored carry. Apple recommends direct
touch for camera panning, tap-to-select for in-world objects, and visible press
states that remain perceivable under the finger ([Apple HIG: Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls)).

Every drag or swipe still needs a tap alternative. WCAG 2.2 requires a
single-pointer, non-drag path for dragging functionality, and path gestures
need a simple-pointer alternative ([W3C: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [W3C: Pointer Gestures](https://www.w3.org/WAI/WCAG21/Understanding/pointer-gestures.html)). The existing rail is a good start; add explicit previous/next actions and an accessible “About, 1 of 7” status.

### 4. Make the default content surface smaller and clearer

Start in **scene-first mode** with a 64–88 px contextual dock/chip, not a body-copy
peek. It should show the current section, `1 of 7`, a clear “Read” affordance,
and optionally previous/next controls. Tapping it opens one full-height,
single-column reading surface; Back, a visible close button, and swipe-down at
scroll-top all close it. The 3D scene remains a full-bleed stage behind it.

Bottom sheets are for secondary/supporting content, while primary mobile
navigation conventionally lives in a navigation bar or drawer
([Android: common layouts](https://developer.android.com/design/ui/mobile/guides/layout-and-content/common-layouts), [Android: Material components](https://developer.android.com/design/ui/mobile/guides/components/material-overview)). The seven-unit world behaves like a carousel, so WAI's pattern is useful: provide native previous/next buttons, optionally a direct picker, and an accessible position such as “3 of 7” ([WAI-ARIA carousel pattern](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/)).

The current mobile rail buttons are 44 px wide by 48 px tall. Increase the
interactive width to about 48 px or replace the seven independent icons with
the contextual dock plus an overview button. Apple recommends 44×44 pt and
Android 48×48 dp touch regions; WCAG's 24×24 CSS px criterion is only the AA
floor, not the usability target ([Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views), [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).

## Novelty that earns its motion

### P1 — “Touch wake”

Treat the finger as a small field of energy projected into the scene. Grass
bends locally, dust or petals lift, a nearby butterfly startles, a hanging
object sways, and a lamp's glow reacts. The response travels only a short
distance from the touch and decays quickly. This gives mobile something desktop
does not have while remaining causal and legible.

### P1 — authored unit arrivals

At each snap, play one quiet, section-specific beat once: the About lamp warms;
Books settles a cover forward; Training gives a ball one bounce; Systems wakes
a small mechanism; Projects assembles a tiny stack; Musings turns a page; Talks
brings one frame into focus. Drive the beat from the same continuous travel
progress as the camera, so it previews during the swipe and resolves at the
snap instead of playing as a detached animation.

### P2 — object “inspect” mode

A hold on a selected object temporarily gives the finger a small, bounded
camera orbit or prop turn (roughly a few degrees), then springs home on release.
This is a toy, not navigation; a visible tap action still provides the real
function. Pointer Events provide a single input model and pointer capture for
continuing a gesture after the contact leaves a target
([MDN: Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)).

### P2 — opt-in spatial sound

After an explicit “Sound on” action, give each unit a very short positional
texture and reserve stronger cues for selection/snap. Browsers generally block
audible playback and Web Audio outside user activation, and unexpected audio is
intrusive, so sound must remain optional and visibly controllable
([MDN: autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), [MDN: Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)).

### P3 — optional “tilt to look,” not automatic gyro control

An explicit toggle could add a tiny background-depth shift, but it should never
move between units or perform an action. WCAG requires motion-actuated functions
to have conventional controls and a way to disable motion response
([W3C: Motion Actuation](https://www.w3.org/WAI/WCAG22/Understanding/motion-actuation.html)). This is a later experiment, not a prerequisite for a great phone experience.

Do not count browser haptics as part of the iPhone promise. The Web Vibration
API has limited browser availability and silently does nothing where unsupported
([MDN: Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API)). On supported Android browsers, one short pulse at a unit snap or successful pickup can be a progressive enhancement; visual feedback remains authoritative.

## Priority order

| Priority | Change | Why first |
|---|---|---|
| P0 | Author seven portrait camera/composition profiles; make hero props at least desktop apparent size | Directly fixes “too zoomed out” |
| P0 | Stop mapping vertical touch swipes to lateral travel; add horizontal unit snapping | Establishes a comprehensible gesture grammar |
| P0 | Default to a compact contextual chip/dock; full-height sheet for reading | Gives the stage back to the world without sacrificing legibility |
| P1 | Add pressed/selected states, 48 px screen-space hit regions, tap outcomes, and previous/next controls | Makes interaction visible, reliable, and accessible |
| P1 | Add touch wake and one authored arrival beat per unit | Restores—and differentiates—the desktop sense of life |
| P1 | Add lightweight touch carry for selected toy props, with tap alternatives | Recovers the missing signature physical interaction without gesture ambiguity |
| P1 | Preserve the current adaptive quality system; lower render scale during travel and restore at rest if needed | Tactility disappears when feedback trails the finger |
| P2 | Add opt-in spatial audio and supported-browser haptic accents | Multisensory polish, never a dependency |
| P3 | Test opt-in bounded device tilt | Novel, but higher permission/accessibility cost |

## Non-negotiable quality bars

- **Readable without browser zoom; zoom still allowed.** Apple says primary
  content should fit without requiring zoom, while WCAG requires text to remain
  usable when enlarged to 200% ([Apple UI design tips](https://developer.apple.com/design/tips/), [WCAG Resize Text](https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html)). Keep important copy in HTML rather than 3D textures.
- **Safe-area aware.** Atmosphere can bleed edge-to-edge, but controls and the
  dock need `max(design-padding, env(safe-area-inset-*))`; WebKit documents the
  safe-area contract for `viewport-fit=cover` ([WebKit: iPhone safe areas](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)).
- **Immediate response.** A good INP is 200 ms or less at the 75th percentile,
  and complex interactions should still show initial feedback in the next paint
  ([web.dev: INP](https://web.dev/articles/inp)). Measure mobile separately.
- **Reduced motion is a designed mode.** Replace camera flights and depth
  parallax with short fades/state changes, and freeze nonessential ambient drift.
  W3C specifically identifies parallax as a possible vestibular trigger, and
  `prefers-reduced-motion` exposes the OS preference
  ([W3C: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)).
- **Performance is part of the feel.** Keep postprocessing off on touch,
  capability-gate effects, cap effective DPR, and prioritize interaction
  continuity over settled-frame sharpness. Three.js warns that full device DPR
  is often too expensive for heavy scenes, and its renderer exposes drawing
  buffer and pixel-ratio controls for this reason
  ([three.js responsive rendering](https://threejs.org/manual/en/responsive.html), [three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)).

## Validation plan

Prototype the first two units before touching all seven, using three variants:

1. current camera + current peek sheet (control);
2. portrait-authored close shot + compact dock;
3. variant 2 + touch wake + tap impulse/hold-to-inspect.

Test on a 320 px viewport, a 390×844-class phone, and a portrait tablet. Measure:
first successful section change, first discovered prop interaction, mistaken
sheet/world gestures, interaction latency/settled frame rate, ability to name
the current section, and whether visitors describe the scene as “close,”
“alive,” and “obvious.” The winning interaction should be chosen on task success
and observed delight, not screenshots alone.

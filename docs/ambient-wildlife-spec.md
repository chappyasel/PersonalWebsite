# Add living wildlife to the Tended Meadow

## Status — ground residents superseded

Owner visual review on 2026-08-17 retired the rabbit and ground bluebirds. The
unrigged models could not articulate their legs, so their whole-model motion
read as fake regardless of scale, fog, or trajectory. Ground-resident user
stories and decisions retained below are historical context, not active
requirements. The active wildlife from this spec is moths plus the smaller,
more distant bat; existing sky birds remain unchanged. Butterfly/moth landing
is the next feature and is being designed in
`docs/ambient-insect-landing-design.md`.

## Problem Statement

The Homepage scene's butterflies already make the world feel unusually alive,
but much of the Tended Meadow still reads as a beautiful static background.
The scene needs a little more life and surprise without becoming a game,
storybook, zoo, or attention trap. The new wildlife should reward lingering
and make travel through the room feel consequential while staying subordinate
to Chappy's shelves and placards.

## Solution

Add a small ecology of quiet, naturalistic wildlife. A brush rabbit lives in a
Habitat halfway up the first tall-grass hill between About and Books, and a
scattered western bluebird group lives farther across the same mid-meadow band
between Systems and Projects. The rabbit remains visible in both themes, stays
still while grounded, and moves between deterministic hill waypoints only in
committed hops. Each bluebird stays planted at its own scattered home and
cycles independently through pecking, scanning, grooming, and rest.

Theme-specific flying life rounds out the atmosphere. In dark mode, a few
moths fly within the downward cone of every registered practical light—with a
wider, denser swarm at the larger Talks floor lamp—and an occasional bat
crosses the global sky. Moths are dark silhouettes with a slower beat than the
butterflies, concentrated below rather than beside each shade. In light
mode, the existing butterflies and petals remain the primary airborne life.
Everything is non-interactive, silent, low-poly, and visually secondary to the
room.

## User Stories

1. As a visitor, I want the meadow to contain subtle animal life, so that the homepage feels inhabited rather than staged.
2. As a visitor who loves the butterflies, I want the new animals to keep moving and changing behavior, so that they feel similarly alive.
3. As a visitor arriving at a relevant unit, I want its resident already visible, so that I do not mistake an intentional animal for a missing asset.
4. As a visitor who lingers, I want residents to remain present while changing natural behavior, so that life comes from motion rather than disappearance.
5. As a visitor, I want the rabbit halfway up the first hill among tall grass, so that it reads as distant meadow life rather than a foreground prop.
6. As a visitor, I want the bluebirds always visible, grounded, widely scattered, and farther into the same hill band, so that they read as distant birds rather than a bouncing cluster.
7. As a visitor at About or Books, I want a brush rabbit to belong to the meadow between those units, so that its presence feels spatially grounded.
8. As a visitor at Systems or Projects, I want western bluebirds to belong to the meadow between those units, so that their presence feels spatially grounded.
9. As a visitor moving back through the Traverse, I want to find the same Habitats in the same places, so that the room remains a coherent world.
10. As a visitor who scrolls slowly, I want ground residents to continue their ordinary behavior, so that gentle observation is rewarded.
11. As a visitor, I want the rabbit to remain exactly still while grounded and translate only during a visible hop arc, so that it never resembles a model gliding over grass.
12. As a visitor, I want the rabbit to hop among distinct positions up and down the hill, so that it visibly belongs to the rolling terrain.
13. As a visitor, I want each bluebird to stay at its own home while pecking frequently, scanning, grooming, and resting, so that the flock reads as living birds rather than sliding or bouncing models.
14. As a visitor, I want the rabbit to remain visible at night, so that switching theme does not make it disappear.
15. As a visitor, I want the bluebirds to remain grounded and independently animated throughout their eligible theme, so that they do not move as a synchronized flock.
16. As a visitor, I want animal orientation and gait to agree with travel direction, so that motion feels physical rather than decorative.
17. As a visitor, I want animal bodies to stay in contact with the meadow, so that they do not visibly float or sink.
18. As a visitor, I want residents to remain inside their Habitats, so that they do not wander through shelves, placards, or unrelated units.
19. As a visitor, I want the animals to be recognizable at homepage scale, so that I can understand them without labels.
20. As a visitor, I want the animals rendered in simplified low-poly naturalism, so that they belong with the authored scene rather than looking like imported realism.
21. As a visitor, I do not want mascot faces, exaggerated proportions, or cute gestures, so that the wildlife stays on brand.
22. As a visitor, I do not want wildlife to be clickable, draggable, collectible, or scored, so that ambient life remains ambience rather than a minigame.
23. As a visitor, I want wildlife to ignore pointer hover and clicks, so that props and Doors retain the interaction language.
24. As a dark-mode visitor, I want a few dark moths to fly below each practical inside its real light-cone direction, with density and range proportional to lamp size and a slower flap than the butterflies, so that warm light feels connected to the meadow without turning moths into mini-lights.
25. As a visitor who turns a practical off, I want its moth activity to disappear with that light, so that the effect remains motivated.
26. As a dark-mode visitor, I want an occasional bat silhouette to cross the sky, so that the pre-dawn world contains distant life.
27. As a visitor, I want the bat crossing to remain rare and brief, so that it never competes with the skyline or unit content.
28. As a light-mode visitor, I want night-only moths and bats absent, so that the depicted morning remains coherent.
29. As a dark-mode visitor, I want the rabbit retained while daytime bluebirds remain absent, so that the owner's chosen resident persists without filling the night meadow with birds.
30. As a visitor switching themes, I want wildlife to fade between eligible states rather than pop, so that the world remains continuous.
31. As a visitor with reduced-motion enabled, I want the animated wildlife omitted, so that the homepage respects my motion preference.
32. As a visitor on a slower device, I want wildlife to add little frame cost, so that ambience does not degrade the primary experience.
33. As a visitor traveling quickly, I want wildlife rendering to avoid allocating transient objects every frame, so that the added reactions do not create stutter.
34. As a visitor, I want wildlife to remain silent, so that it does not expand the site's audio contract or surprise me with sound.
35. As a site owner, I want the wildlife behavior deterministic for a given elapsed time and scene input, so that it can be tested and tuned reliably.
36. As a site owner, I want an easy source-level feature gate with the meadow, so that wildlife never remains floating over a disabled field.
37. As a site owner, I want existing butterflies and petals unchanged, so that the proven alive feeling is preserved.
38. As a future maintainer, I want Habitat Resident behavior separated from Three.js rendering, so that cadence and reactions can be changed without canvas-level tests.
39. As a future maintainer, I want the behavior vocabulary reflected in domain docs, so that later work does not accidentally turn residents back into camera-following cameos.

## Implementation Decisions

- Build one pure Habitat Resident behavior model. It accepts elapsed scene
  time, theme eligibility, and an individual index; it produces externally
  meaningful activity, visibility, position, velocity, hop, and peck state.
- Keep the Three.js wildlife layer a thin adapter that evaluates the behavior
  model and applies transforms to reusable geometry.
- Define the rabbit Habitat in the world-space seam between About and Books
  and the bluebird Habitat in the world-space seam between Systems and Projects.
  Habitat coordinates do not move with the camera.
- Treat rabbit and bluebirds as Habitat Residents. Treat moths as fixture-anchored
  ambience and the bat as a global sky event; neither is allowed to dilute the
  world-anchoring meaning of Habitat Resident.
- Keep the rabbit continuously visible from scene reveal in both themes and
  bluebirds continuously visible in their daytime theme. There are no timed
  disappearance, camera-proximity, startle, or retreat states.
- Give the rabbit a discrete rest/hop state machine. A cycle holds one exact
  waypoint while grounded, then uses a brief takeoff, constant horizontal
  flight velocity, and constant downward gravity to reach the next waypoint.
  Velocity is zero at every settled ground sample.
- Give each bluebird a fixed Habitat home and an individual behavior clock.
  Bird position and velocity never change; repeated peck pulses plus scanning,
  grooming, and rest provide life without whole-model locomotion.
- Pointer input, raycasts, click handlers, hover affordances, labels,
  analytics, and store interactions are intentionally absent.
- Reuse geometries and materials, disable raycasting on all wildlife, and
  avoid frame-loop object allocation. Keep draw calls and polygon counts small
  enough for the existing meadow budget.
- Anchor moths to every registered practical and scale their density and flight
  volume with the light's authored size. Use each practical's live eased light
  value plus its source-to-target cone; place moths down that axis rather than
  at the shade mouth. Port the butterflies' two-sine position derivatives,
  velocity heading, turn banking, and flat wing-hinge orientation. Keep moth
  materials dark and unlit so flapping cannot pulse their brightness; keep
  their 6.1–6.54 Hz flap band below the butterflies' 8.2–10.1 Hz range.
- Derive moth brightness explicitly from live lamp intensity and cone position
  while retaining unlit materials, so illumination changes smoothly with
  position and never strobes when a wing rotates. Author the analytic radial
  path entirely within the open camera-side half of each cone, with clearance
  from shelves, props, and lamp poles; do not fold or clamp rendered samples.
- Use the owner-selected Rabbit and Western bluebird models from Poly Pizza,
  credited to Poly by Google under CC BY 3.0. Normalize them at runtime to the
  distant meadow's scale and terrain contact. Resize the bird's embedded
  texture for its tiny on-screen footprint, and feather grass height down in
  narrow Habitat sight corridors so the requested small models remain legible
  without moving them out of the distant hill.
- Crossfade bluebirds on theme changes. The rabbit persists in both themes;
  moths and bat remain dark-mode life.
- Apply half-strength atmospheric fog to ground residents, then interpolate
  back toward source color by 70% of that wildlife-only fog amount. At maximum
  scene fog this leaves 67.5% source color instead of the literal half-fog's
  50%. Use only interpolation in Three's active fog space—no luma math or HDR
  clamp—so distance softens the models without turning them into blue shapes or
  changing the desktop tone-mapping pipeline. Small scale and grass provide the
  remaining inconspicuousness.
- Mount wildlife inside the same feature and Suspense boundary as the Tended
  Meadow, so disabling the meadow also removes its wildlife.
- Use the established one-time reduced-motion media-query gate and render no
  wildlife when reduced motion is requested.
- Keep all wildlife silent and non-semantic. It adds no DOM, navigation,
  persisted state, API, database, or schema surface.

## Testing Decisions

- The highest and only new behavioral test seam is the pure Habitat Resident
  model. Good tests assert observable behavior over representative inputs and
  time ranges rather than private helper functions, React structure, exact
  vertex positions, or incidental sine phases.
- Test that each ground resident remains within its declared Habitat bounds
  across a broad sample of elapsed time.
- Test that both ground residents are immediately and continuously visible
  throughout a long eligible-theme sample.
- Test that the rabbit has exactly zero horizontal velocity while grounded,
  translates only during hop arcs, and visits terrain with meaningful height
  variation.
- Test that every bird remains at one fixed home with zero velocity while
  producing frequent independent peck bouts.
- Test theme eligibility and envelope values for day and night wildlife,
  including smooth boundary values rather than only booleans.
- Test that bluebirds remain grounded and scattered, and that moth samples stay
  below the source in a broad cone with flap rates slower than butterflies.
- Test deterministic repeatability for identical inputs.
- Follow the existing pure Vitest prior art used by meadow motion, daylight
  rendering, world layout, and the golf state/physics modules.
- Verify the renderer with TypeScript and ESLint. Do not add brittle snapshot
  tests for React Three Fiber markup or exact low-poly geometry internals.
- Construct the complete runtime geometry set in a smoke test. This guards the
  installed Three.js merge contract without snapshotting vertices or shapes.
- Browser-based visual acceptance is a separate owner review because repo
  policy prohibits automated browser inspection unless explicitly requested.

## Out of Scope

- A new minigame, achievements, scoring, collectibles, secrets, or progress.
- Clicking, petting, feeding, chasing, dragging, or otherwise directly
  interacting with wildlife.
- Sound effects or additions to the ambient audio system.
- Additional animal models or a generalized asset pipeline beyond the two
  owner-selected, attributed wildlife assets.
- Predation, reproduction, procedural ecology, weather response, flock AI, or
  skeletal animation.
- Wildlife in Flat mode or additional explanatory UI.
- Changes to the existing butterflies, petals, Doors, placards, golf game, or
  navigation.
- Browser automation or screenshot-based approval in this implementation pass.

## Further Notes

- The feature should feel like another layer of the butterflies' living
  quality, not four scheduled easter eggs.
- The phrase “Habitat Resident” is deliberately narrower than “wildlife.” It
  exists to preserve the important world-space decision for ground animals.
- The earlier exploration draft used camera-relative scheduled cameos. The
  later grill decisions, domain glossary, ADR, and this spec supersede that
  portion of the draft.
- All shortcuts, ambiguities, judgment calls, review findings, and deferred
  visual checks are tracked in `docs/ambient-wildlife-implementation-review.md`.

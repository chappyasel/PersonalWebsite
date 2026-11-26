# Room boot speed

Status: steps 1 (PR #161) and 2 (PR #164) shipped; the light shape fix is built. Plan written 2026-11-24; the first
measurements are against production at 97506fe7.

## Outcome

The 3D room replaces the 2D drawing in about 3 seconds on a fast laptop and
under 8 seconds at a 4x CPU slowdown, down from 7 to 24 seconds and 14 to 26
seconds. The room a visitor reaches is unchanged: every shelf, the meadow, and
every photo still arrive. They arrive after the reveal instead of before it.

## What the boot waits for today

Measured with `scripts/perf/boot-probe.mjs` on Portable (M5 Max, headless
Chrome, ANGLE Metal, 1440x900 at 2x, cold profile each run). The probe reads
the site's own boot report and never sends it.

| Run           | CPU | First 3D frame | Meadow ready | Last asset batch done | Revealed |
| ------------- | --- | -------------- | ------------ | --------------------- | -------- |
| production    | 1x  | 2.5 s          | 5.4 s        | 7.5 s                 | 8.1 s    |
| production    | 1x  |                |              |                       | 6.7 s    |
| production    | 4x  | 6.3 s          | 18.5 s       | 23.5 s                | 26.0 s   |
| production    | 4x  | 5.5 s          | 13.8 s       | 16.9 s                | 19.3 s   |
| production    | 4x  | 3.5 s          | 10.4 s       | 12.7 s                | 13.8 s   |
| `light-boot`  | 4x  | 5.5 s          | 14.3 s       | 17.1 s                | 18.5 s   |
| `no-meadow`   | 4x  | 5.8 s          | (off)        | 17.3 s                | 20.4 s   |
| `constrained` | 4x  | 8.0 s          | (off)        | 22.0 s                | 23.7 s   |

One early 1x run took 24.4 s to reach `data-world="ready"`, timed by polling
the page rather than by the boot report. The same build varies by a factor of
two between cold runs.

What the numbers say:

1. **The asset gate decides the reveal.** In every run the reveal follows the
   last `assets_complete` by 0.5 to 3.5 s. Turning the meadow off, or turning
   every scalable cost down (`constrained`), does not move it.
2. **Assets arrive in 8 to 10 waves.** The boot timeline shows
   `assets_complete` followed by `assets_reopened` 7 to 9 times. Each wave is a
   component that mounts after the previous wave resolves and then suspends on
   its own `useGLTF` or `useTexture`. The scene has 18 `useGLTF` and 34
   `useTexture` call sites against 4 and 11 preloads.
3. **The network is not the slow part.** A boot makes about 250 requests for
   6.1 MB (2.2 MB of JS in 97 files, 2.8 MB of images, 0.4 MB of GLB). At 4x
   the network goes quiet at 7.5 s while the last wave reports done at 12.7 s.
   The remaining 5 s is main-thread work: image decode, GLB parse, texture
   upload, and the shader prewarm that `ShaderPrewarm`
   (`StacksCanvas.tsx:1612`) reruns after each wave closes.
4. **Every shelf is in the gate.** `prewarmAllUnitVisuals` defaults on
   (`scene/scenePerformance.ts:104`), so `useUnitLod` mounts all seven shelves
   at boot and the prewarm makes every shelf visible for one synchronous draw.
   `light-boot` turns that off but still waits for every shelf's assets. Its
   18.5 s sits inside the 13.8 to 26.0 s spread of plain runs, so it shows no
   clear saving on its own.
5. **The meadow is second.** At 4x `meadow_ready` lands 8 to 12 s after the
   first frame, but it overlaps the asset waves, so removing it alone did not
   bring the reveal forward.

## Changes, in order

Each step is measured with the probe before and after: three cold runs at 1x
and three at 4x, on whichever Mac is under 1.5 per core.

### 1. Gate the reveal on the arrival shelf only

The boot gate counts every `LoadingManager` item. Give it a boot-critical set
instead: the arrival unit (About, or the URL's unit), its neighbours, the
camera rig, and the sky. Loads outside the set still run, but outside the
gate.

- Mount shelves through `useUnitLod` with `prewarmAll` off until reveal, then
  promote the rest one shelf per idle callback.
- Split `ShaderPrewarm` into a boot pass over resident shelves and a post-reveal
  pass per promoted shelf, using `renderer.compileAsync` where the browser has
  `KHR_parallel_shader_compile`.
- The asset gate counts only loads started under the boot-critical set.
  `worldBootMachine` already models the gate; this narrows what feeds it.

Expected: the reveal moves to the arrival shelf's own last wave. This is the
largest change and the riskiest, because Safari uploads a texture on first
draw and a shelf promoted late can hitch on first travel. Travel to a shelf
before it is promoted has to wait for that shelf, not show it half-built.

### 2. Collapse the waves into one

Start every boot-critical fetch on the first frame instead of when its
component mounts. A generated manifest (one entry per `useGLTF` and
`useTexture` path, per unit) feeds `useGLTF.preload` and `useTexture.preload`
from `StacksCanvas`. A test fails when a loader call site has no manifest
entry.

Expected: one network wave instead of 8 to 10. It does not remove decode cost.

### 3. Decode off the main thread

Load textures through `ImageBitmapLoader` (`createImageBitmap` decodes off the
main thread in Chrome and Safari) and set `flipY` on the material side. Leave
GLB parse as is: 0.4 MB of GLB is small.

Expected: a share of the 5 s of post-network main-thread work at 4x. The probe
does not split decode from upload, so treat the number as unknown until
measured.

### 4. Build the meadow near-field first

Only after 1 to 3 land, and only if `meadow_ready` is then the last gate.
Build the instance buffers for the visible strip of the meadow, reveal, then
fill the rest over idle frames.

## Step 1 results (2026-11-24, local production build)

Step 1 is built: `scene/unitContentResidency.tsx` mounts the arrival shelf and
its neighbours behind the boot screen, then the rest one at a time once the
room is live, nearest first. `?units=all` restores the old whole-room boot for
comparison; `?screenshot` and `?harness` always mount the whole room.

Cold runs of `boot-probe.mjs` against `next start`, alternating new and old:

| CPU | New reveal (ms)    | Old reveal (ms)     | Meadow ready, new / old |
| --- | ------------------ | ------------------- | ----------------------- |
| 4x  | 11374, 9491, 10982 | 14199, 14080, 15858 | about 6.8 s / 11.0 s    |
| 1x  | 4144, 3635         | 4670, 4539          | about 1.7 s / 2.6 s     |

The 4x reveal drops by about a third and the meadow arrives four seconds
sooner. Asset batches at 4x went from 14 to 6-12, because the gate still waits
for the near shelves' own waves; step 2 is the fix for those.

After the reveal, the remaining shelves finish mounting within about 15 s. On
arrival at the far shelf no programs compile and five textures upload; its
geometry uploads on first draw (about 100 buffers). The promotion compiles
about 250 programs against the old boot's 129, because the light padding
changes shape as late shelves add their lights. It runs on idle time after the
reveal; folding it back to one light shape is a follow-up.

After review (PR #161): each shelf now suspends inside its own Suspense
boundary, because r3f wraps the Canvas in one and a late shelf would have hidden
the whole room while its textures loaded. A 15 s screenshot series during
promotion stayed within 1.2% of the ready frame. Shelf modules that preloaded
at chunk evaluation (Systems bags and MiO, the Training flag, the Musings
paper, sign, essay and sticker) now register with `preloadWithUnit` and start
when their shelf mounts. Scene Diagnostics has a "Mount far shelves after the
reveal" switch. A rerun on the loaded worker: 4x reveal 12.0 and 10.9 s against
13.2 and 12.7 s; 1x 4.3 and 4.8 s against 5.3 and 5.8 s.

## Step 2 results (2026-11-25, local production build)

The chain was inside each shelf, not between shelves. A shelf's contents sit
in one Suspense boundary, and when its first model suspends React stops
rendering the rest of that boundary until the model resolves. On the About
shelf that made five links: the models, then the prop atlases, then the globe
map, then the five role icons, then the AI Collective mark. Each reopened the
boot gate.

`scene/unitAssetManifest.ts` now lists every model, texture, texture pair, and
SVG each shelf loads, and `unitContentResidency.tsx` preloads a shelf's list
through `preloadWithUnit` the moment the shelf mounts, with the same cache key
as each call site. `unitAssetManifest.test.ts` reads each shelf's source and
fails when a model path, a role or project icon, the SVG mark, or a known
loader component (ShelfSucculent, EggLamp, VisionProProp, TJMedallionProp) is
missing from its list. It already caught the desk lamp on Projects. Photos stay
with Scene's preview warmer. `?unit-preload=off` restores the chain for timing.

Three cold runs each at 4x CPU, alternating, against `next start`:

| Network               | Batches, new / old | Room appears (world_ready), new / old | Live, new / old                         |
| --------------------- | ------------------ | ------------------------------------- | --------------------------------------- |
| local, no latency     | 2 / 9              | 4.6, 4.7 s / 4.0, 5.4, 4.2 s          | 7.4, 7.2 s / 7.5, 7.2, 7.7 s            |
| 150 ms RTT, 10 Mbit/s | 2 / 3-4            | 6.7, 7.0, 7.1 s / 8.6, 8.1, 8.2 s     | 10.0, 10.3, 10.7 s / 11.3, 10.5, 10.8 s |

(One new local run was a 12.4 s outlier and is left out.) With no latency the
chain costs little, so the time barely moves. With phone-like latency each
link costs a round trip, and the room appears about 1.2 s sooner. "Live" is
when the camera finishes travelling from the drawing into the room; the room
is already on screen from world_ready, and that travel (about 2.5 s at 4x) is
now the largest piece of the wait. Before this change, props could still be
loading while the room travelled in.

`PROBE_RTT=150` on `boot-probe.mjs` adds the latency.

## One light shape from the first frame (2026-11-25)

Step 1 left the shader light shape growing after the reveal. The padding in
`scene/sceneLightShape.tsx` keeps visible point and spot lights at the
busiest neighbourhood's count, but it counted only mounted shelves, so it
started at 3 point and 3 spot and grew to 6 and 6 once the far shelves
mounted, and every lit material compiled again.

The padding now takes each shelf's count from `EXPECTED_UNIT_LIGHT_COUNTS`,
measured on production with every shelf mounted (the same in light and dark),
or from the scene when the scene has more. It recounts before each frame until
every expected light is in, or 30 s after the last shelf mounts, because a
shelf's lights mount after its own loads and an earlier recount drew a frame
with a third shape (9 and 8). One traversal costs about 0.07 ms.

Tracked by sampling `renderer.info.programs` every 500 ms for 35 s
(script kept in the session scratchpad, not the repo):

| Build      | CPU | Light shapes seen           | Programs at the end |
| ---------- | --- | --------------------------- | ------------------- |
| new, local | 1x  | 6/6 only                    | 122, 122, 122       |
| new, local | 4x  | 6/6 only                    | 131, 117, 116, 132  |
| production | 1x  | 3/3, then 6/6               | 255, 248            |
| production | 4x  | 3/3 or 4/5, then 6/6 or 7/7 | 255, 185+           |

The reveal itself was not re-timed: the boot compiles the same programs, each
with three more padding lights.

## Drawing-to-room handoff (2026-11-25)

The camera move is not the wait. `travel` never moves the camera; it ends on
the first painted frame. What went wrong at 4x was the shelf under it.

Production at 4x, headless Chrome: the About shelf's loads finished by about
4.2 s, but `shelf-structure:0` appeared at 9 to 21 s, always after the room
was live. The reveal opened on an empty meadow, `registerAboutShelf` kept
throwing `ShelfNotMountedError`, and the handoff fell back to the plain fade
after `illustrationMatchTimeoutMs`. At 1x the same match took about 0.1 s.

Two causes, one fix each, plus one cost cut:

1. **Suspense retries.** React shows a boundary whose promise resolved through
   a retry lane, rendered in 5 ms slices that never expire. Behind the r3f
   frame loop at 4x those slices were seconds apart. `RetrySuspense` remounts
   a boundary still behind its fallback once drei's loading manager settles,
   and up to three times a frame after mount for promises the manager never
   sees. A state update renders in one pass; with the loads cached nothing
   suspends. Used for each shelf's gate in `Scene.tsx` and the About props'
   inner boundaries, which the registration needs (globe, cactus, lamp,
   Vision Pro).
2. **Reveal on a committed shelf.** `unitContentResidency` records each shelf
   whose contents committed. `StacksCanvas` sends `firstFrame` only after every
   mounted shelf has, so the reveal never shows a meadow with its arrival
   shelf missing.
3. **Cover lift.** `liftBookCoverShadows` ran six `pow` calls per pixel during
   render: 94 ms per 384x576 cover. Table lookups give the same bytes in
   8.8 ms. A test compares it with the old per-pixel version on every grey and
   200,000 random pixels. `bookCoverTreatment.ts` is in the room artwork's
   dependency lock, so its sha and the source fingerprint were restamped and
   `pnpm generate:room-artwork` repackaged (fingerprint lines only).

Fix 2 alone made the shelf correct but late (live at 10.9 to 11.1 s at 4x).
With all three, three runs each, local production build:

| Build      | CPU | Shelf on screen | Handoff | Live         |
| ---------- | --- | --------------- | ------- | ------------ |
| production | 4x  | 9 to 21 s       | timeout | 7.3 to 8.1 s |
| branch     | 4x  | 4.1 to 4.6 s    | matched | 7.7 to 7.8 s |
| production | 1x  | 2.3 s           | matched | 4.5 s        |
| branch     | 1x  | 1.7 to 1.8 s    | matched | 4.0 to 4.1 s |

What still holds live at 4x is the drawing's own entrance animation
(`useIllustratedEntrance`): `entranceSettled` gates the illustration key, and
the match gate opened at about 7 s, 2.3 s after `firstFrame`. Shortening that
animation is a design choice for the Owner, not a load cost.

Before and after recordings are on the ParaDev page `room-camera`, built from
gitignored `.pages/room-camera/`.

## Not in scope

- Bundle size. 2.2 MB of JS in 97 files matters for parse time, but the probe
  shows the gate waiting on asset waves, not on the bundle. No size budget that
  can fail a build (see CLAUDE.md).
- Quality presets and Auto. `constrained` shows they do not move the reveal.
- The 2D drawing. It paints at about 0.8 s and already covers the wait.

## How to measure

```bash
node scripts/perf/boot-probe.mjs base "" 4                       # production
node scripts/perf/boot-probe.mjs base "" 4 http://localhost:3000 # local prod build
```

Read `report.report.boot.timeline` for the gate order and `res` for the
waterfall. Headless Chrome on Apple silicon at 4x is a stand-in for the M2 Air
report, not a reproduction: Safari and real thermal limits stay unmeasured.
Check the result on a real Safari visit with `?perf-report=1` before calling a
step done.

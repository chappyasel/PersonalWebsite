# Scene audio loading lifetime

## Failure and change

If the room unmounts while a sound is loading and a new room unlocks audio,
`loadBuffers` can resume against the new `AudioContext`. The old pipeline reads
`this.context` at each stage instead of keeping the context that started it.
Its completion handler also marks the new session complete and clears its
pending strikes. A late Vision Ride completion can clear the new soundtrack
promise, allowing another request.

Each unlock now creates an abort controller. Core sound and soundtrack requests
share that session's signal. Teardown aborts pending transport, stages check
cancellation before starting more work, and response/body checks prevent a
canceled request from starting decode. Decoding already in progress cannot be
canceled; its result and completion handlers cannot update another session.

Audio files, mix levels, first-strike priority, ambience ordering, playback,
visuals, and quality policy keep their existing behavior. This adds no rendering
path or diagnostic setting. Field Notes quality-bar test 1 rules out a new
entry: cancellation is maintenance, with no new visitor discovery.

## Reproduction

The unit tests use the real `SceneAudioRuntime` with controlled browser promises.
They hold a decode or response across teardown and a second unlock. Before the
fix, the tests exposed four failure classes:

- The old core sequence makes 24 total fetches where 13 are expected.
- The replacement session rejects its first strike while its sample is pending.
- A response delivered after teardown still starts decoding.
- An old soundtrack completion allows a third request across two sessions.

Response and body cancellation are separate test cases. The full audio check is:

```sh
pnpm exec vitest run \
  src/app/components/stacks/audio/sceneAudio.test.ts \
  src/app/components/stacks/audio/sceneAudioAssets.test.ts \
  src/app/components/stacks/visionRide/visionRideAudioAssets.test.ts
```

The [numeric evidence](artifacts/2026-09-15-scene-audio-lifetime.json) records the
fixture results, bundle hashes, and per-cycle room measurements.

## Native allocation result

Three baseline trials and three fixed trials produced identical counts within
each version, using native Chromium decoding at 48 kHz. All requested audio
responses returned HTTP 200.

| Per interrupted-session race              |           Before |      After |
| ----------------------------------------- | ---------------: | ---------: |
| Fetch calls                               |               24 |         13 |
| Native decodes                            |               24 |         13 |
| Cumulative PCM bytes                      |       70,050,968 | 35,121,484 |
| Allocation after releasing the old result | 34,929,484 bytes |    0 bytes |

The fix avoids 11 duplicate decodes and 34,929,484 PCM allocation bytes in this
controlled race, a 49.86% reduction in cumulative PCM allocation. Both host
preflights reported contention. These deterministic counts support the claim;
they do not establish elapsed-time or retained-memory savings. The fixture
calls `window.fetch`; its allocation claim rests on native decode count and
PCM dimensions, not coverage of every possible browser loading API.

The opposite-model Claude review found no blocking ownership or cancellation
issue. Two additional tests cover valid current-session completion and a retry
after a current soundtrack failure. The focused suite passes 30 tests.

## Browser allocation method

`scripts/stacks-asset-memory-benchmark.mjs --suite audio` bundles the real audio
runtime and serves the repository's actual Ogg files on an ephemeral localhost
port. It uses native Chromium Web Audio decoding. The fixture holds the first
completed decode, tears down its session, fully loads the replacement, then
releases the old result. It records request count, native decode count, and
cumulative decoded PCM bytes as `length * numberOfChannels * 4`.

This is a controlled runtime race, not a claim about how often ordinary visitors
hit it. PCM bytes count allocations, not retained memory. Double-GC JS heap
samples cannot measure all browser audio memory. The `--assert` option requires
13 fetches/decodes and no further allocation after releasing the old result.
`--bundle` accepts a saved baseline bundle so both versions use the same fixture.

```sh
pnpm exec esbuild src/app/components/stacks/audio/sceneAudio.ts \
  --bundle --format=iife --global-name=SceneAudioModule \
  --outfile=/tmp/scene-audio-before.js
node scripts/stacks-asset-memory-benchmark.mjs --suite audio \
  --bundle /tmp/scene-audio-before.js --out /tmp/audio-before.json
# Apply the fix, then run the same native decoder fixture.
node scripts/stacks-asset-memory-benchmark.mjs --suite audio \
  --assert --out /tmp/audio-after.json
```

## Whole-room lifetime method

The `scene` suite uses a production server, fresh browser contexts, a 1440 by 900
viewport with device scale factor 2, and explicit quality names. The resolved
Safety DPR is 1.389 at 2,500,000 physical pixels; Showcase stays at DPR 2 and
5,184,000 physical pixels. Basic uses Safety without meadow
or postprocessing. No-meadow uses Showcase without meadow. Full uses Showcase.
The `hud` query exposes controls without mounting the expensive frame probe.
The report's draw counts are not valid whole-frame draw counts under `hud` and
must not be used as such.

Each run unlocks audio and warms all seven units before measurement. Each cycle
repeats the same unit traversal and switches 3D to 2D and back with the real R
shortcut, waiting for both presentation states. It captures heap after two forced collections separated by 50 ms,
DOM/listener counts, connected canvases/images, image and audio decode counts,
and a separate sampled allocation profile. Audio unlock is asserted. Each run
asserts that effective DPR, physical pixel count, and the serialized
`quality.transitions` journal stayed constant. Heap
fits report bytes per cycle and R² over cycles 2 through N, excluding the first
switch cycle. This exercises retained-room
switches; it does not simulate the three-minute route residency expiry.

```sh
BASE=http://127.0.0.1:3123 node scripts/stacks-asset-memory-benchmark.mjs \
  --suite scene --repeats 2 --cycles 6 --out /tmp/scene-memory.json
```

All overnight browser runs and builds use the shared `benchmark_lock.py`.
The shared `tools/preflight.py` runs before and after each browser comparison.
Contended timing or heap comparisons remain provisional. No FPS improvement
is claimed by this change.

## Whole-room results

Both versions completed two repeats of six cycles per profile without page
errors. Every sample kept audio unlocked, with 12 audio decodes and 35,025,484
cumulative PCM bytes from the warm sound bank. No additional audio decode
occurred during the room loops. Connected canvas count stayed at one. After
cycle 2, DOM node counts stayed constant within every run. Listener counts
were constant apart from one baseline full run losing two and one fixed basic
run gaining two. The latter remained at that new count for the last two cycles.

The following double-GC heap slopes use cycles 2 through 6. Both versions'
preflights reported contention. These provisional measurements leave the room's
heap growth unresolved and do not show a retained-memory improvement from this
audio fix.

| Profile / repeat | Before bytes/cycle | Before R² | After bytes/cycle | After R² |
| ---------------- | -----------------: | --------: | ----------------: | -------: |
| basic / 1        |          379,542.4 |  0.980829 |         398,795.2 | 0.995116 |
| basic / 2        |          475,985.2 |  0.986694 |         458,640.0 | 0.995849 |
| no-meadow / 1    |        2,648,341.6 |  0.999819 |       2,523,048.0 | 0.996239 |
| no-meadow / 2    |        2,582,537.6 |  0.989304 |       2,640,308.8 | 0.999895 |
| full / 1         |        2,297,051.6 |  0.985131 |       2,970,298.4 | 0.991769 |
| full / 2         |        2,450,534.4 |  0.981648 |       2,735,850.4 | 0.983125 |

Image `decode()` invocations rise by 17 per switch cycle in both versions.
This is a call count, not proof of 17 native image decodes or retained images.
That finding belongs to the illustration lifetime lane. Sampled allocations
from no-meadow include postprocessing shader strings and materials; those
profiles were handed to the GPU lane. They are allocation samples, not retainer
paths or proof that those objects explain the whole heap slope.

## Review and scope

Claude's read-only review found no blocker in context ownership, cancellation,
or stale finalizers. Its test-coverage suggestion led to explicit checks for
current-session completion and soundtrack retry. A pre-existing rapid ride
restart fade issue remains outside this patch.

The shared browser test's CDP trace event type correction comes from the
frame-pacing lane in prerequisite commit `ba4781172e38c5988cc3697cfb280782a59e2407`.
It changes the TypeScript boundary only and is separate from the audio fix.

## Validation

- The five regression cases fail against original commit `88f46c1f` and pass
  after the fix. They cover four failure classes, with separate response and
  response-body cancellation cases.
- Focused audio checks pass all 30 tests across three files.
- Fresh `pnpm lint` and `pnpm typecheck` pass.
- Fresh `pnpm test` passes 4,752 tests in 562 files. The repository skips
  another 24 tests in three files.
- A clean production build generates all 605 pages. The standard prebuild
  uses existing local cached Dad content through the repository's ignored
  worktree symlink convention. No credentials or private content are committed.
- Both production boundary checks pass. The initial postbuild stopped because
  Apple's Git launcher began requiring Xcode license acceptance. Re-running
  `pnpm run postbuild` with the existing Command Line Tools Git on the process
  PATH completes both checks against the same clean build. No system setting
  changed.

Raw JSON, sampled allocation profiles, original runtime bundle, fixed source,
product diff, review receipt, and check logs are retained with a SHA-256 manifest
in the shared research directory under `artifacts/asset-memory-codex/`. The fixed
audio source SHA-256 is
`fe13b6db48b8d65af2195d18f12d09f7357c47062dc142e0b13dc7aeb159cac0`.

# Illustrated room promotion result

The development spike turns the approved illustration into the actual live shelf, then moves into the ordinary route camera. Talks desktop and Weightlifting phone pass the requested mounted-landmark registration gate. Browser slot is free; all builder sessions are closed.

Tested demo URLs, with automatic promotion after readiness:

- [Talks desktop](http://127.0.0.1:3322/talks?roomIllustration=1&perf-profile=no-composer&nomeadow=1&harness=1)
- [Weightlifting phone](http://127.0.0.1:3322/?roomIllustration=1&perf-profile=no-composer&nomeadow=1&harness=1#weightlifting)

Add `roomIllustrationHold=1` before the hash to hold the matched state, then choose Enter 3D. Scene Diagnostics has a default-off live toggle. Accessible controls provide 2D, Enter 3D, Replay handoff and Close prototype. Explore opens root's usable 2D page with the selected shelf and real content. Root owns that UI and final regular-browser delivery.

## Observed result

| Case | Viewport | Landmarks | Maximum residual, CSS px | Camera/projection change while SVG visible |
| --- | --- | ---: | ---: | ---: |
| Talks light desktop | 1440×900 | 8 | 1.0800e-12 | 0 |
| Weightlifting light phone | 390×844 | 8 | 2.5580e-13 | 0 |

Each case compares four plank-bounds corners and four photo-plane centers. Expected positions use saved capture transforms; actual positions use mounted rest transforms and the camera rebased into the displayed SVG rectangle. This is a geometric correspondence result, not pixelwise equality between stylized contours/materials and lit 3D. Source geometry and unit placement remain those of the approved capture. The intermediate viewport and further theme/unit matrices were omitted after root narrowed scope.

Both runs reach live with one canvas and zero page errors. Distinct actual scene renders precede the dissolve. The SVG fades for 160ms with a stationary camera; travel begins after a 180ms guard and lasts 400ms. Rendered-camera/opacity samples confirm no camera or projection movement while SVG opacity exceeds 0.01. Ordinary rail and placard chrome retain their layout measurements but stay hidden through travel, then return at live. Builder inspected the final matched/live PNGs; root independently inspected the initial Talks set.

The normal CameraRig continues calculating underneath the temporary rendered-camera override. Its camera snapshot is restored before the next rig tick. Selected live meshes use the existing rest-matrix adapter during stationary matching; original matrices/visibility return before the next scene update. Pointer/focus influence is withheld, with pointer arrival rearmed for release. No second renderer, screenshot substitute or additional render targets were introduced.

## Checks and limits

- TypeScript, targeted lint, script syntax and one meaningful off-axis/crop/letterbox projection test pass.
- Reading interaction latches 2D even with the room ready. Resize and navigation cancellation pass. No-GPU, reduced-motion, SaveData and off-path checks show zero mounted canvases, zero GLB requests and zero page errors. Some existing startup paths attempt capability probes on unattached canvases; those counts are recorded, not reported as zero.
- Context loss was dispatched while already in 2D. It does **not** verify an active handoff-to-2D transition. The handler and restoration path are source-reviewed only. Corrected evidence preserves the original assertion output separately.
- Successful runs used the existing `no-composer` diagnostic with meadow disabled in software Chromium. Earlier normal-effects attempts did not complete matching; normal effects were not successfully rechecked after the camera correction. Software rendering included startup frame delays above 14 seconds and low frame rates. This proves geometry and ordering, not production latency or animation smoothness.
- Initial readiness reused an inappropriate zero eye-to-aim offset check. The prototype also initially forced screen-center pointer zero, despite the ordinary camera's offset parallax center. The corrected gate measures convergence toward the authored aim at the unchanged 0.0005 tolerance, plus stable targets, X/Z, projection, assets and rest inventory. Vertical idle breath is declared separately. Capture readiness itself remains unchanged.
- The exported `illustrationContract(unit, theme, view)` in `src/app/components/room-illustration-prototype/contract.ts` supplies SVG/viewBox, raster, saved camera matrices, origin, mesh correspondences and source hash. Metadata supports both themes/size sources for these two units; only the two cases above were browser-verified. Its roughly 322KB JSON is diagnostic input, not a production payload proposal. A production contract should version the full unit transform and geometry identity explicitly.

Reduced-motion/SaveData boot policy, fail-open backstops and original About source remain unchanged. All 840 prior/approved public files retain their hashes. No production integration, build, database/Notion writes, commit, merge or deployment occurred. No Field Note was added because development controls do not satisfy quality-bar test 2.

## Evidence and handoff

All builder evidence is in `docs/reviews/illustrated-room-promotion-evidence/`:

- `talks-desktop.json` and `weightlifting-phone.json`: landmarks, residuals, camera/opacity samples and nominal browser checks.
- `{talks-desktop,weightlifting-phone}-{illustration,matched-live,live-room}.png`: final saved views. Initial Talks success and failed attempts remain separately named.
- `policy-checks.json`, `live-policy-checks.json`: policy observations and the corrected context-loss limit.
- `types-final.log`, `lint-final.log`, `projection-test.log`, `preservation.json`: targeted checks and preservation.
- `manifest.json`: exact source/evidence file inventory and hashes.

Root's consolidated report is `docs/reviews/2026-09-12-illustrated-room-prototype.md` in the main repository. Root can now show the tested diagnostic demo and decide whether to consolidate its usable 2D UI with this camera bridge. No further builder browser work is pending.

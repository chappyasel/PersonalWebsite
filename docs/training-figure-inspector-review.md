# Training figure inspector review log

Status: implemented; visual placement review remains
Started: 2026-08-22

## Inspectable image extension

Added to scope on 2026-08-22: place `Lift Table.pdf` in the Training scene as a quiet artifact. It is the first lifting chart Chappy put together.

The first implementation introduced a paper hover caption and a conventional framed modal. That treatment was rejected on review because neither presentation had a precedent in the 3D scene. It also split one direct action into an undisclosed caption-first touch sequence.

The replacement treats analysis figures and historical documents as inspectable images:

- Hover remains a physical response on the 3D object.
- Activation captures the object's live projected screen bounds, including its current tilt.
- The full-resolution 2D image animates from those bounds into the existing site-wide photo viewer.
- Pinch, wheel, double-click, pan, swipe navigation, Escape, and the reverse close transition come from `react-photo-view`, which the Book Notes interface already uses.
- Collection navigation, optional provenance, and outbound links sit in a restrained bottom gradient. There is no repeated title, floating caption, framed modal surface, or explicit zoom control.

The module interface remains one artifact ID at the physical call site. Catalog lookup, interaction registration, projected origin, history, reader controls, and outbound actions stay inside the scene-artifact module.

### Implemented artifact behavior

- The former figure-only catalog, state, and dialog are now the `sceneArtifacts` catalog, scene-artifact history state, and shared artifact reader.
- `Grabbable` accepts an `artifact` ID. It resolves a distinct `artifact` registry activation rather than disguising the object as a local Action.
- Artifact activations use a `zoom-in` cursor. `DoorLabel` ignores them and the rejected `ArtifactCaption` component has been removed.
- Every inspectable image opens on the first stationary tap. Lift Table no longer has an invisible caption-first state.
- Each catalog entry owns the interaction ID of its physical scene object. That lets activation capture the correct live 3D bounds before the scene freezes.
- Lift Table is a singleton collection, so it does not appear while paging through the three AnalyzeData figures. It is reached through its physical scene object.
- The viewer shows a rendered 1275×1650 preview and an `Open PDF` action. The committed PDF is byte-for-byte identical to `/Users/chappyasel/Desktop/Lift Table.pdf`.

### Artifact-specific shortcuts and ambiguities

- The 3D-to-2D handoff uses an invisible fixed DOM proxy at the projected object rectangle because the photo viewer expects a DOM origin element. It is presentation plumbing, not another visible interface.
- The projection uses live child transforms instead of the cached touch bounds so a tilted sheet does not snap back to its flat rest rectangle when the preview begins.
- Browser Back closes through the existing artifact history state. The close animation keeps the last image and projected origin mounted until the photo viewer finishes its reverse transition.
- The Lift Table page is authored at `[0.19, 0.018, 0.1]` on the top shelf, between the restored bench photo and the right-side equipment. Its exact overlap and legibility still require visual review.
- The PDF import uses a local absolute source path and Poppler. Generated public assets are committed, so neither dependency is needed by the site build.
- The Lift Table is intentionally excluded from the analysis-figure arrow sequence. Whether every artifact should be globally browsable remains an open product decision.
- The PDF has no reliable original creation date in its current metadata. The exported file date is 2026-08-22, so no date appears in the caption.

### Desktop interaction failure found after the first pass

The first implementation had two linked bugs:

- `Grabbable` had separate stationary-activation logic for native desktop pointer release and the centralized interaction registry. Artifact activation existed only in the registry branch, so a desktop click recorded a tap and then did nothing.
- The Lift Table call site explicitly disabled hover tilt. The shared registry also reported hover tilt only for draggable props, even though the runtime already supports an anchored prop tilting in place. That tied the visual reaction to movement permission without a physical or interaction reason.
- The three loose prints did request a 60-degree hinge, but their rotated corners overlap by a few millimetres. Generic stack-clearance measurement therefore classified each neighboring print as a solid resting on top and silently replaced the hinge with a short slide. Exact authored hover angles now identify an overlap composition and bypass that generic stack fallback. Derived reactions on books and other stacked solids still respect measured clearance.

The fix uses one `runStationaryActivation` callback for both desktop pointer release and registered touch/focus activation. Hover-reaction metadata now follows the authored `tiltOnHover` setting independently of `draggable`, and the anchored Lift Table uses the same 60-degree hinge-up target as the loose shelf photos.

Regression tests first reproduced the missing contracts: shared desktop activation, anchored hover metadata, the Lift Table's authored hinge angle, and exact-angle behavior when neighboring geometry overlaps. They pass after the fix. Interactive browser verification is still outstanding because the repository rules require an explicit request before browser inspection.

## Goal

Put real Weightlifting analysis figures inside the existing 3D training scene without removing any photographs. The figures need a readable enlarged view and clear routes to the analysis repository and the main Weightlifting site.

## Agreed direction

- Use one large trophy portrait beside a 3-by-2 grid.
- Keep the other three competition photographs in the top grid row and put the
  three analysis figures directly beneath them.
- Move the three photographs displaced from the bottom of the board onto the top shelf as loose prints, using the physical treatment already established in the About scene.
- Treat a figure card as an inspectable scene artifact. Activating it opens an enlarged figure view. Links live in that view instead of making one click perform two unrelated jobs.
- Use literal figure and control labels. Do not add taglines or promotional copy.

## Decisions and judgement calls

- The enlarged view uses the same DOM photo viewer already used by Book Notes. This preserves readable image detail and established pinch, wheel, pan, double-click, keyboard, and close behavior without rebuilding them inside WebGL.
- Each physical card has one scene action: inspect the figure. The dialog has two explicit outbound actions: open the analysis repository and open Weightlifting.
- The catalog contains aggregate strength, Big 3 progression, and DEXA
  body-composition history.
- The scene cards remain lightweight canvas textures. The enlarged view uses exported high-resolution images.
- Opening the inspector freezes scene input through the existing modal state. The inspector gets its own selected-artifact state so book behavior does not need to change.
- Figure cards activate on the first stationary touch because they are anchored controls, not movable props.
- The inspector uses browser history. Back closes it, Forward reopens it, and changing figures replaces the selected figure in the current history entry.
- The established viewer owns pinch, wheel zoom, double-click, panning, swipe navigation, and Escape. Explicit zoom buttons were removed after review because those gestures are enough.
- The viewer library's built-in arrows are desktop-only. Artifact previews hide them and render one shared previous/count/next control. All controls are 44px tall on mobile and 40px on desktop, matching the outbound actions while preserving touch targets. The end arrows disable rather than wrapping. On narrow screens the control gets its own centered row above full-width outbound links.
- The preview backdrop keeps a heavily blurred, dimmed version of the room visible with a warm center falloff instead of replacing the scene with flat black. The figure itself remains unframed.
- Close, previous/count/next, and outbound actions use one translucent glass treatment derived from the scene cards: a fine light border, low-opacity fill, inset highlight, and restrained shadow. The shared treatment keeps the controls related without introducing a new panel around the image.
- Preview chrome follows the photo viewer's actual overlay lifecycle. The bottom scrim fades, while close, navigation/count, outbound actions, and the optional provenance caption fade and move a few pixels into place. On close, chrome clears before the image reverses into the scene. The figure and backdrop keep the viewer's existing transitions rather than receiving a second animation.
- The entrance uses one synchronized 45ms control delay rather than a decorative stagger. Reduced-motion users get the final states without transforms or transition time.
- Every image morph now gives React Photo View an invisible `IMG` origin rather than a `DIV`. The library only preserves fitted origin height for image elements. A `DIV` made the animation combine the small projected card width with the full-screen image height, which stretched portrait and landscape images into a narrow, off-center rectangle during entrance. Each projected card rectangle is also reduced around its center to the source image ratio before the morph starts.
- The custom full-resolution renderer must retain React Photo View's `PhotoView__Photo` class. The first ratio correction fixed the moving phase but still omitted that class. When the morph ended, the site's responsive-image rule clamped the raw image width while the viewer retained its calculated height, causing the final aspect ratio and horizontal position to break. The custom image now restores the required class and applies `object-fit: contain` after the viewer's phase-specific inline styles.
- This is a functional interaction, not an optional rendering effect. It does not add a render pass or per-frame scene work, so no Scene Diagnostics toggle was added.

## Shortcuts and compromises

- The figure-data generator currently points at a local checkout of `WeightliftingApp-AnalyzeData`. That is acceptable for local regeneration but not a portable build input. Generated assets and data are committed so the website build does not depend on that checkout.
- The morph is a matched DOM handoff from the live projected rectangle. The WebGL mesh itself does not leave the scene; freezing it and transferring the full-resolution image avoids synchronizing one object across two renderers during the transition.
- Exact loose-photo poses must be reviewed visually after implementation. Repository instructions prohibit browser inspection unless it is explicitly requested, so this pass relies on the existing shelf coordinates and About-scene pattern.
- Aggregate strength and Big 3 use AnalyzeData's combined PR-history model and
  the site's export script renders focused 16:9 views. DEXA copies the analysis
  repository's composition-history export.
- Gesture behavior comes from the existing `react-photo-view` dependency rather than a new scene-specific recognizer.
- The backdrop blur is DOM compositing and exists only while the inspector is open. It does not allocate a WebGL render target or add scene frame work, so it does not need a Scene Diagnostics switch.

## Issues and ambiguities

- The analysis repository contains many possible figures, but this scene needs a small stable catalog. The initial three are based on the selected prototype, not a final decision about every figure that may eventually be available.
- The analysis link currently targets the repository root, as requested. A later version could link each figure to its exact notebook or output if those URLs are stable.
- The main Weightlifting destination follows the existing environment-aware site destination. Production goes to `https://weightlifting.chappyasel.com`; local development keeps the repository's normal development routing.
- The existing global `modalOpen` flag does not identify which modal owns it. The inspector will avoid conflicting with the book modal, but a modal-owner model would be cleaner if more scene dialogs are added.
- The copied AnalyzeData PNGs are snapshots. The website generator must be rerun after those source exports change.
- The three loose prints use authored coordinates and small height offsets. Their spacing is intentionally conservative until the scene can be reviewed visually.
- Image scale 1 now fits a shared safe viewing rectangle instead of the raw viewport. Each side gets 6% of viewport width, clamped to 24 to 72px. The top and bottom get 8% of viewport height, also clamped to 24 to 72px. The same fitted dimensions drive React Photo View and the physical scene handoff, so the crossfade does not change size. Images never upscale past their source dimensions, while pinch, wheel, and double-tap zoom remain unchanged. Viewport changes remount the affected photo item with the new fit.

## Verification record

- The safe-fit tests cover wide mobile, portrait mobile, tall desktop, and no-upscale behavior. The focused inspector contract, typecheck, and targeted ESLint pass.
- Full non-browser Vitest suite after the safe viewing rectangle change: 217 files and 1,869 tests passed. The running home page returned HTTP 200.

- `pnpm typecheck`: passed.
- ESLint on all touched TypeScript and TSX implementation files: passed with no warnings.
- Full non-browser Vitest suite after the preview material revision: 209 files and 1,827 tests passed.
- Unfiltered `pnpm vitest run` also collected ten Playwright specs. All 1,827 Vitest tests passed, but those ten suites failed during collection because Playwright's `test` API cannot run inside Vitest. The successful non-browser run explicitly excludes `tests/e2e/**`; no interactive browser run was authorized.
- Figure generator completed against the current WLD, Weight Log, and AnalyzeData checkout. Generated data runs through 2026-08-21.
- Generated image dimensions were checked: aggregate strength 2400×1350, Big 3
  2400×1350, and DEXA 2144×1603.
- The running development server returned HTTP 200 for the home page and all three figure assets.
- The development server also returned HTTP 200 for the Lift Table preview and PDF.
- The source and public PDF SHA-256 hashes match. The rendered public preview was inspected at full resolution; its table, color bands, and text are intact.
- No interactive browser automation was run, per repository instructions. The user-provided mobile screenshot was inspected and supplied the evidence for the stretched origin morph.
- The image-origin regression tests pass: projected landscape and portrait origins retain their source ratios and centers, and every artifact collection still captures a distinct live origin. Typecheck and targeted ESLint pass after the correction.
- Full non-browser Vitest suite after the image-origin correction: 216 files and 1,864 tests passed. The running home page returned HTTP 200.
- The post-morph sizing contract, typecheck, and targeted ESLint pass after restoring the viewer image class.

## Next steps for review

- Review the three loose-photo placements on the top shelf.
- Review whether the projected origin stays visually aligned with each tilted physical object during the handoff.
- Decide whether figure-specific source links are better than the repository root.
- Decide which additional AnalyzeData exports deserve catalog entries after
  these three are working.
- Consider replacing the shared `modalOpen` boolean with a modal owner if another scene inspector is added.

## Homework 3D artifact extension

The Homework app icon is the first model artifact. It preserves the same blurred room, glass chrome, history behavior, and animated entrance/exit as image artifacts, but replaces the photo surface with a directly manipulable 3D stage.

### Approved content

- Visible model-artifact title: `Homework`. Image figures still omit their visible titles.
- Founded a platform for organizing, tracking, and reminding users of upcoming homework assignments.
- Sold to Haystack AI in 2019 after negotiating terms for acquisition.
- Upon acquisition: 338k installs, 63k MAU, a 4.7-star rating, the #1 global homework app, and a top-60 Productivity app.
- The artifact has no outbound action because there is no current Homework destination. The action row is omitted rather than rendered disabled.

### Interaction and rendering decisions

- A stationary release on the existing grabbable Homework icon opens the artifact. Crossing the established scene drag threshold still carries or throws the shelf object and does not open it.
- One-pointer drag rotates the inspection camera around the model. Pinch and wheel zoom within fixed distance bounds. Double-click, double-tap, or `R` resets the authored three-quarter pose.
- Swipe navigation and pull-to-close do not apply to models because they conflict with rotation. Close remains the glass X, Escape, and browser Back.
- The shelf and inspector use the same `ProjectIconVisual` geometry and material component. The preview uses the 1024×1024 artwork and omits the scene hover shimmer, whose unit-scoped frame hook does not belong in the isolated renderer.
- The model renderer is dynamically loaded, mounted only for a selected model artifact, capped at 1.75 DPR, and uses a demand frameloop. Model activation blocks scene input immediately but keeps the main room rendering through pickup and crossfade. The room switches to a `never` frameloop only after the inspection model has fully replaced the source. Image and book modals still freeze immediately.
- A restrained asset-free environment map and two lights keep the existing metal and clearcoat materials legible. There is no floor, grid, automatic rotation, or persistent gesture prompt.
- The 3D stage gets the viewport above the caption. Mobile reserves more bottom space for the three supplied bullets and safe-area padding.
- Normal opening does not render the 1024 artwork before the model. The stage stays visually empty over the blurred room until the artwork-bearing 3D surface reports ready. The flat artwork appears only if the renderer is disabled or its context actually fails.
- Activation now moves the actual Homework `Grabbable` group. The hidden inspection renderer reports its projected bounds and the model's quaternion relative to its own camera. Each room frame converts that measurement into a ray, distance, position, and quaternion relative to the live room camera. The source keeps its physical scale and reaches the required apparent size by moving through world space.
- The inspection canvas and blurred backdrop now begin fading in when the source reaches 68% of its camera-relative trip. The source fades through the remaining movement, which hides the separate-renderer handoff instead of exposing it after the object stops. The room freezes only after the source has both reached the target and become transparent. Closing resumes the room, crossfades back to the physical source at the camera target, and then returns that source to the exact local position and quaternion captured at activation.
- The source fade uses a lower damping rate than the first pass, and the inspection canvas and backdrop now dissolve over 420ms and 440ms. Those durations overlap the final third of the pickup instead of finishing as a short stationary cut.
- The inspection renderer and Projects room now read their key, hemisphere, warm reflection, cool reflection, ground reflection, environment intensity, and base exposure from one lighting policy. The first inspection pass had independently authored blue and orange lights whose roles were reversed relative to the shelf.
- The inspection stage reports a new target after orbit interaction and viewport resizing. That lets a close transition start from the latest inspection pose rather than the original pose.
- The inspection stage now claims the grab cursor during `lifting`, `waiting-for-preview`, `crossfading-in`, and `inspecting`. Previously its pointer hit area remained disabled until inspection finished, which left a visible cursor gap after the shelf hover ended. Orbit, zoom, reset, focus, and pointer handling remain disabled until `inspecting`, so the continuous cursor does not let input alter the model during pickup.
- Hovering the model artifact preloads the inspection module and 1024 artwork when `3D artifact preview` is enabled. The prewarm path is skipped when the Scene Diagnostics switch disables the renderer.
- Scene Diagnostics now includes `3D artifact preview` in Render → Optional. Turning it off immediately uses the 2D fallback and leaves no inspection render target, texture sampling, or per-frame model work. The override resets on reload and does not alter the production quality policy.

### Shortcuts, risks, and open review items

- The shelf object and inspection object still live in separate WebGL renderers. The overlap is now explicit: the room source supplies the travel, and the second renderer supplies inspection. The transition never claims that one Three.js object was reparented across renderers.
- The room source waits for a valid inspection target before leaving the shelf. Hover prewarming should make that delay small on desktop, but a cold first touch can still produce a short pressed pause while the renderer and artwork load. Moving before a target exists would require an estimated pose and risks a visible course correction.
- During pickup the visual carrier moves while its physics body remains parked at the shelf. Modal input is already blocked, so no collision can act on the split state. The carrier and body reunite before the modal releases input.
- Fading is applied to the source's existing material instances and every original opacity, transparency, and depth-write value is restored after return. This depends on artifact visuals owning their material instances; a future artifact that shares material objects must clone them before using the generic handoff.
- The camera-distance solve uses the source's measured world-space box and the preview's projected box. This is an analytic fit rather than an iterative projection solve. Width, height, center, and camera-relative orientation should be close, but exact crossfade alignment still needs visual review.
- The pickup path is a direct interpolation with a small camera-up arc. It does not simulate a hand, avoid room geometry, or apply rigid-body collision while traveling.
- If the renderer is disabled or fails, the flat fallback reports its DOM bounds and the physical source still moves and crossfades into it. That path intentionally loses inspection-camera orientation because a flat fallback has none.
- Reduced-motion mode performs the same state handoff without timed travel or fades.
- The superseded implementation transformed the inspection canvas from a projected DOM rectangle. Entry state batching made it appear only on close, but fixing the paint timing did not solve the larger problem: the physical shelf object never moved. The screen-space transform and its two-frame workaround have been removed.
- Homework is currently a rounded metal billet with a flat artwork face. Whether its side and back provide enough visual value to justify 3D remains the primary product go/no-go question.
- The inspection renderer creates a second WebGL context while mounted, although the original context stops submitting frames. Context creation, touch latency, and memory behavior need mobile review.
- Orbit damping relies on demand invalidation from the controls. It must be checked for a clean stop after momentum settles and for correct pinch behavior on iOS.
- The source and preview now share the production room's base lighting policy, but they still use separate environment captures and renderers. The light-theme room also changes its key and hemisphere colors during the scroll-driven dawn, and Cinematic+ or live color-grade diagnostics can change the room without changing the inspection renderer. A smaller highlight or exposure discontinuity can therefore remain and needs visual review.
- The model viewer has a 360ms retained close state to match the existing artifact timing. Forward navigation during that interval cancels cleanup; direct transitions between mixed media kinds are not supported because no current collection needs them.
- The caption is normal HTML and carries all substantive information when 3D is unavailable. The canvas is labeled with literal gesture instructions for assistive technology.
- No interactive browser or screenshot review has been run, per repository instructions.

### Homework verification record

- `pnpm typecheck`: passed after the model-artifact extension.
- ESLint and Prettier on the touched implementation, test, stylesheet, and review files: passed.
- Full non-browser Vitest suite: 210 files and 1,833 tests passed.
- The replacement handoff reducer covers normal opening, slow preview readiness, reverse crossfade, return completion, and closing during pickup. The current focused run passes 4 files and 25 tests.
- Source contracts verify that the main room freezes only during inspection, the model viewer no longer contains screen-space transform variables, and `Grabbable` derives the physical target from the live camera before fading its materials.
- Full non-browser Vitest suite after the replacement: 212 files and 1,850 tests passed.
- After the handoff change, ESLint on the touched TypeScript files, Prettier, and `git diff --check` pass. The development server still returns HTTP 200.
- `pnpm typecheck` passes after the camera-relative handoff replacement. Earlier unrelated concurrent Golf, `Grabbable`, and basketball failures had cleared before this check.
- The running development server returned HTTP 200 for the home page and the 1024×1024 Homework fallback artwork.
- The first full-suite attempt overlapped an active rewrite of `TrainingFigureCards.tsx` and briefly observed its new test before the replacement source file landed. After that concurrent change completed, both the focused tests and full suite passed. No training-figure source was changed as part of the Homework work.
- Interactive 3D rotation, mobile pinch behavior, visual lighting, caption fit, and context-loss fallback still require explicit browser review.
- After the moving crossfade and shared-lighting change, the handoff and lighting tests pass: 2 files and 7 tests. The Homework-specific artifact contracts also pass.
- `pnpm typecheck` and targeted ESLint pass after the moving crossfade and shared-lighting change.
- `sceneArtifacts.ts` briefly disappeared from the live worktree while its consumers remained, then returned without intervention. The first typecheck observed the missing module; the repeat passed. This was treated as concurrent work and not reconstructed or overwritten.
- The first combined artifact run found a stale training-board assertion. `TrainingFigureCards.tsx` now derives height from the reviewed layout's `heightRatio`, while the test still demanded the old inline image-dimension calculation. The contract now verifies that every authored ratio equals its source image ratio. No training-board implementation file was changed as part of this lighting pass.
- Full non-browser Vitest suite after that contract correction: 214 files and 1,859 tests passed.
- The running development server returned HTTP 200 for the home page and Homework artwork after the change.
- The continuous-cursor contract passes, along with typecheck and targeted ESLint. It verifies that the stage receives the current handoff phase and keeps OrbitControls disabled until inspection is ready.

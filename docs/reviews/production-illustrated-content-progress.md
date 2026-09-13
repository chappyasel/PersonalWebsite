# Production illustrated content progress

Working only in `PersonalWebsite-illustrated-content`, branch `feat/illustrated-room-content`.

The existing PlacardLayer already owns resident desktop documents and the mobile panel. I will keep that component at the same tree position across illustrated/live/failure transitions. Only CanvasBoundary will mount conditionally. History moves into a DOM owner above that boundary, with a shared navigation function that updates useStacks directly in illustrated delivery and optionally invokes renderer commands in live delivery. The rail will use it instead of requiring travelTo.

Root interface needs: retain the agreed boot view/events; publish hydrated UI via `html[data-illustrated-ui="ready"]` after the illustrated component mounts, clearing it on cleanup. Root server shell can use that selector for an invisible transfer. Chrome remains mounted and measured, with visibility hidden during dissolve/travel. Root must suspend canvas input/CameraRig selection writes outside live and preserve activeUnit/panel state during renderer teardown.

Artwork interface request to root/B: export a DOM-safe selector from `illustration/artwork` taking internal UnitSlug, light/dark, desktop/phone and returning `{src, key, width, height}` or null for About. Width/height must describe the SVG coordinate box; include shelf/registration bounds if distinct. I will publish a readiness key only after image decode and a nonzero measured rectangle, invalidating it on unit/theme/viewport changes. Please relay exact export names and geometry expectations before integration.

No separate content Sheet or local unit/open state. No browser or 3D session.

Source-backed correction for B/root: production `data.ts` has Weightlifting/training at index 2 and Projects at index 4. B's current progress contract reverses those indices. Please derive lookup from this production order or stable slugs.

Confirmed root handoff contract: actual decoded img/SVG receives `data-room-artwork`, numeric `data-unit`, resolved `data-theme`, and `data-artwork-key`. Key encodes source revision, unit/theme, exact content rect and viewport/DPR. Readiness clears during selection/decode changes. No object-fit letterboxing. Root owns SceneHandoff and boot policy.

Shared server/client export now exists: `IllustrationStage` and `IllustrationStageProps` from `stacks/illustration/IllustrationStage.tsx`. Props: `unitIndex`, optional `theme` light/dark/system, optional `viewport` desktop/phone/responsive, optional `readingBooks` BootReadingBook[], `readingBookColors`. Root server wrapper should be fixed inset-0 with `className="room-illustration" data-illustration-visible=""`; stage imports its scoped CSS. Hydrated IllustratedRoom uses this exact component. No includeStageScript; About eye shift is zero and outer glyph placement transforms are retained. Server instances have no keyed active registration target.

Hydrated shell transfer marker is `html[data-illustrated-ui="ready"]`, set after a measured decoded drawing or explicit artwork failure fallback. It remains set through later source changes and clears when the room leaves. Root hides/removes its initial shell using this marker. Four exact registration attributes are placed only on the selected img/svg; B's unkeyed picture marker is harmless with root's four-attribute selector.

29 focused tests now pass across navigation, image readiness, existing chrome rules and a StacksHome component test. The latter keeps the same reader DOM/input/scroll through live → failed illustrated → travel and observes the intent event. No browser run.

Integration type issue for root/policy: the new WorldBootStatus values are not accepted by existing performance-diagnostic bootStatus typing. Read-only combined typecheck finds this at StacksCanvas.tsx:1057 and StacksHome's diagnostic createPerformanceDiagnosticEvent call. Please widen the diagnostic contract with the machine's status type in root's integration scope. Own tests/type cleanup continues; no unrelated diagnostic source edited here.

B's current catalog now matches production unit order. Shared layout and readiness code use the actual B API read-only during verification. Targeted typed lint passes with policy/artwork TypeScript overlays. Standalone base branch intentionally lacks those independently owned modules; integration must include both sibling commits. No borrowed source is staged here.

Intent capture uses pointer, keyboard and wheel input, plus explicit section navigation. It deliberately does not treat programmatic scroll restoration as new user intent. Chrome and all descendants become visibility-hidden and inert during dissolve/travel, without display:none or unmounting the resident panel owner.

Final verification: policy da76595 is locally cherry-picked as 4dbac23. All 70 focused/UI/policy tests pass across eight files. Typecheck passes with zero diagnostics using B artwork and root's analytics correction read-only; typed lint passes with zero issues. Focused delivery test explicitly preserves document.activeElement, reader scrollTop, input state and open-panel state through GPU failure. No blocker. RESULT contains shared-stage API, registration timing and remaining root browser checks. Committing only owned UI/navigation files and these docs next.

# Production illustrated content

Implemented on `feat/illustrated-room-content` in `PersonalWebsite-illustrated-content`. Policy commit `da76595` was cherry-picked as `4dbac23` with root authorization. The UI commit is separate so root can cherry-pick only the content change onto its integration branch.

StacksHome keeps one room shell and the existing PlacardLayer through illustrated delivery, live delivery and GPU failure. CanvasBoundary alone mounts conditionally and resets by boot epoch. Existing panel state, resident documents and scrollers remain in place. There is no second content Sheet, local unit selection or local open-panel state.

RoomNavigation owns canonical path/hash mirroring and Back handling above the canvas. Its shared navigation function updates useStacks when illustration owns delivery and invokes renderer commands only when live delivery owns travel. UnitRail and mobile panel swipes use that function. Illustrated keyboard navigation uses the same key mapping as the existing world bridge and leaves controls, readers, search, modifiers and open panels alone. About's hash-only section links route through the same owner before their existing scene handler runs. Ordinary document/external links retain their behavior.

Pointer, keyboard, wheel and explicit navigation signal `illustrationInteracted`. Programmatic scroll restoration does not count as intent. The boot machine alone decides whether late promotion is allowed. The existing shadcn Button calls `worldBoot.request3D()` for an explicit retry. Illustration markup is gated by the machine's illustratedMode flag, preserving the legacy/OG opt-out.

## Shared first-paint geometry

Root can import `IllustrationStage` and `IllustrationStageProps` from `src/app/components/stacks/illustration/IllustrationStage.tsx`.

```tsx
<div className="room-illustration" data-illustration-visible="">
  <IllustrationStage
    unitIndex={unitIndex}
    theme={theme}
    viewport="responsive"
    readingBooks={readingBooks}
    readingBookColors={readingBookColors}
  />
</div>
```

The wrapper needs a containing block covering the viewport, as in StacksHome's fixed shell. The shared component imports its scoped CSS. Theme accepts light/dark/system; viewport accepts desktop/phone/responsive. Reading books use BootReadingBook[] and the existing cover-edge colors. The hydrated UI renders this exact stage with the resolved theme and viewport. About reuses BootScreenArtwork without includeStageScript, with eye shift zero and all glyph placement transforms preserved. Scoped styling hides the approved ground exclusions and presents the completed drawing.

The generated picture uses B's actual getRoomArtwork/RoomArtworkImage API. Production index 2 is Weightlifting; index 4 is Projects. Unsupported Golf shows the unavailable-art message while retaining its existing content, rather than showing a Books illustration.

`html[data-illustrated-ui="ready"]` retires root's early server shell after the selected drawing is decoded and measured, or after an explicit image failure displays the content-preserving fallback. The marker persists through later theme/selection changes and clears when the active room leaves.

## Registration and content continuity

Only the selected decoded img or About SVG receives all four attributes: `data-room-artwork`, numeric `data-unit`, resolved `data-theme`, and `data-artwork-key`. B's picture marker has no registration key. Hidden client artwork loses its active marker, and server copies never receive a key.

The readiness key encodes source revision/fingerprint and URL, unit/theme, exact content rectangle, viewport dimensions and DPR. About's revision includes its selected cover inputs. Readiness clears during source changes; stale decode completions cannot publish. Resize and font completion remeasure without a per-frame loop. Images use intrinsic aspect ratios and constrained dimensions without object-fit letterboxing. Matching DOM markers are installed before publishing the key.

The illustration remains visible during dissolve and travel. Chrome and descendants are visibility-hidden and inert during those phases, retaining measurable layout and the same resident panel tree. Root owns the dissolve/travel opacity, SceneHandoff, live registration checks, CameraRig's background-write guard and all boot policy. This change does not claim live registration accuracy or solve Books data identity.

## Verification

- 70 tests passed across eight files: the focused UI/navigation/readiness/chrome suite plus the three policy/session/hook suites from the authorized policy commit.
- StacksHome's delivery test substitutes an instrumented reader at the existing PlacardLayer position. It verifies the same DOM node, input value, focused input, scrollTop and open-panel state survive live → failed illustrated. Travel retains that node while making chrome inert. This verifies composition ownership; actual PlacardLayer focus behavior in a browser remains root's check.
- Navigation tests cover no-canvas selection, stale renderer commands, canonical routes/queries/hash aliases, Back ownership for panel entries, and replacement-renderer adoption of the selected shelf.
- Image tests cover decode-before-readiness, stale completion after selection, geometry-key changes, hidden-marker removal, failure with an explicit retry control, and unsupported Golf.
- Targeted TypeScript passed with zero diagnostics. Targeted typed ESLint passed with zero issues. Both used Node 24.19.0, the local cherry-picked policy, and read-only module overlays for B's artwork directory and root's corrected analytics union. The dependency code was not copied or staged. The unintegrated base's two new-status diagnostic mismatches are resolved by root's existing analytics change.
- No browser, 3D session, build, capture, artifact generation, database write or dependency change. No push.

Root must integrate B's artwork commit and its analytics correction alongside this UI commit, then run normal combined type/lint and the regular-browser handoff checks. Root already owns RoomBootShell/HomePage/routes and rendering integration. No Field Notes ID was added: this delivery path exposes existing sections and fails quality-bar test 1 as a separate discovery.

# Mobile glass investigation

The native pill still looks more opaque than the sheet. No replacement native
material is accepted. The lighter text and stronger interaction feedback are
separate from the optional dark-shell experiment, which remains default-off.
Nothing in this investigation belongs to structural PR #79.

## Branch and source

The existing worktree is `worktrees/mobile-glass`, on
`style/mobile-glass-investigation-2026-09-15`, based on
`ba4781172e38c5988cc3697cfb280782a59e2407`.

Native presentation is local commit
`efb3acb8831dbf0cf226b2e6d57ea171a837ef79`. It changes pill text from 700 to 600,
adds held feedback through the existing Motion callbacks, and retains a white
focus outline with a dark surround. It preserves the historical material and
its luminance rationale. Normal release activates the existing route;
cancellation clears the held state. Swipe routing is unchanged.

The default-off experiment and this report remain a separate uncommitted diff
above that local commit. No material PR is open and there is no remote CI
receipt for either material state. Structural PR #79 is still draft at pushed
`ad532914ad6263be2b8a8bbaefaf0840f9b19b54`. Its quality-contracts, check, Vercel,
and Preview Comments checks were all successful when read at 07:51 UTC.

Fresh build `pmH0azuNgBBLp2IZCTOzG` contains the full material working tree:

- PlacardLayer SHA256 `133b56c60b559ebe1052072ff2bc1bbe69781df32fccbf58d209ff3a0e9bc9ee`.
- Prototype SHA256 `8ee358fc50e198af9e456e787ad250de78c26fb173ddd53fa5f09d41d1bb73f3`.
- Presentation spec SHA256 `83f2e66323d3be6aeeb0c88ebf7b954901b918cf6e6a7ee1ea437a282dd90f27`.
- Dependency lock SHA256 `0fd44b43ac3e6dccac95a1942e3f396fe62d9add3081f09a638dcafcda465bf1`.

These hashes still matched after the final capture. There were no application
changes after that build. Documentation and capture apparatus changed only.

## Auditor findings and focused gates

At 07:47 UTC the auditor closed B1 and B2 against the source hashes above.
B1 restores the exact historical light and dark luminance comments. B2 gates
stylesheet interpolation and puts the three prototype variables inside the
enabled selector. Global tooltip CSS and its tests now match the base source.
The stylesheet string still ships in its JavaScript module. Disabled pages
inject no experimental CSS or global variables; this is not a zero-byte claim.

The optional shell uses the existing tooltip material values around light
cards. Its native Diagnostics checkbox resets on reload. Its selectors exclude
dark mode, desktop, and paper mode. The disabled path adds no render target or
backdrop sampling. Expansion changes the existing scrim and brightness
compensation, which the capture records rather than normalizing away.

The final source passed:

- `pnpm test` for tooltip presentation and placard surfaces, 21 tests.
- `pnpm typecheck`, targeted ESLint, formatting, and diff checks.
- `pnpm build`, 605 pages, including search and weight-log privacy checks.
- Three headed-browser gates: native light press/focus/cancel, native dark
  press/focus/cancel, and prototype stylesheet absence/insertion/removal/reload.

The earlier baseline differential remains relevant. After injected touchCancel,
the next touchstart is prevented and no click arrives in both builds. The tests
check normal held-release activation separately from cancellation visual reset;
they do not imply that the next tap after cancellation works. Paper-mode held
color remains a nonblocking follow-up. Neither input issue was changed here.

## Composite method and retained failures

Chrome 152 ran headed at 393 by 852, device DPR 3, mobile touch, Safety quality.
These are host-browser simulations, not physical-device captures. Every build
and browser command ran through `benchmark_lock.py`, with preflight receipts
before and after. Every preflight was contended. No timing is accepted.

The capture records material and foreground ancestry, cumulative opacity,
backdrop/filter, borders, pseudo-layers, masks, and the sibling scene dim. It
brackets visible foreground with two background captures, restoring the original
inline visibility after each cell. Title and pill targets use 4.5:1. Close-icon
contrast uses the SVG bounds and 3:1, not the full touch target rectangle.

Four follow-up runs remain available without replacing failed evidence:

| Artifact directory       | Cells | Exit | Limitation                                                                                                                           |
| ------------------------ | ----: | ---: | ------------------------------------------------------------------------------------------------------------------------------------ |
| `composite`              |    34 |    1 | Award toasts covered some titles; browser close acknowledgment missed its deadline.                                                  |
| `composite-corrected`    |    18 |    0 | Toast wait and exposure checks fixed occlusion; prototype still had HUD and mouse-induced camera yaw. Native controls remain usable. |
| `prototype-touch`        |     0 |    1 | Scene chrome occluded the HUD dismiss button; its tap timed out.                                                                     |
| `prototype-keyboard-hud` |     6 |    1 | All cells completed with HUD hidden, yaw zero, and no page errors. Browser close acknowledgment missed the five-second deadline.     |

The last run used touch controls and keyboard activation of the existing HUD
dismiss button. No product code or style changed. No owned Playwright browser
or capture runner remained after wrapper completion. The final run is diagnostic
evidence, not a passing command or material acceptance. No further retry was
queued. Earlier exit-143 artifacts and toast-invalid images remain archived.

Weightlifting was the brightest observed expanded title-background stop. The
selection combines corrected native stops 0, 2, and 6 with unobscured first-pass
stops 1, 3, 4, and 5. First-pass stop 6 was excluded for award occlusion. The final
prototype samples that stop in both themes and About in light mode.

Native controls and the final prototype share unit, theme, viewport, quality,
and neutral yaw. Expanding the sheet changes camera depth and scene dim, and
live scene/card animation continues. This is a comparison of natural resting
states, not identical world pixels or a complete pixel-parity test.

## Observed material at Weightlifting

All material ancestry had cumulative opacity 1 at rest. No unexpected ancestor
fade explains the native mismatch. The composited layers themselves differ:

| Theme and state          | Fill                | Blur / saturation / brightness | Highlight opacity | Scene dim |
| ------------------------ | ------------------- | ------------------------------ | ----------------- | --------- |
| Native light expanded    | White .36           | 42px / .28 / 1.68571           | .5, .5            | Black .3  |
| Native light pill        | White .56           | 42px / .28 / 1.34              | 1, 1              | Off       |
| Native dark expanded     | Clear               | 32px / .45 / 1.04444           | 1, 1              | Black .1  |
| Native dark pill         | White .06           | 32px / .45 / 1.05              | 1, 1              | Off       |
| Prototype light expanded | RGB 24,32,36 at .38 | 24px / 1.5 / .885714           | 1, 1              | Black .3  |
| Prototype light pill     | RGB 24,32,36 at .38 | 24px / 1.5 / .62               | 1, 1              | Off       |

Computed borders are zero; the visible rim comes from the pseudo-layers. The
JSON retains their complete styles and shadows. Dark native/prototype material
styles and both pseudo-layer styles match exactly at the sampled stop. The
screenshots show consistent dark material, but moving calendar content prevents
an exact full-image parity claim.

The optional light shell shows white title, close icon, and pill text around
light cards. Its pill still looks denser than the expanded shell. Native opacity
remains unresolved, and the experiment has no visual acceptance.

## Contrast evidence and remaining acceptance gaps

Final corrected prototype rectangle minima:

| Context             | Expanded title | Close icon |     Pill |
| ------------------- | -------------: | ---------: | -------: |
| Light Weightlifting |        6.992:1 |   12.009:1 | 13.049:1 |
| Light About         |       10.393:1 |   11.492:1 | 15.948:1 |
| Dark Weightlifting  |        4.710:1 |   11.132:1 | 12.595:1 |

These applicable rectangles clear the requested thresholds. The final dark
expanded title matches the native control's 4.710:1 minimum. They do not prove
all-state accessibility. Body text remains outside method because ancestor
masks are unsupported. Earlier inline-span rectangles also included adjacent
ink and produced invalid 1:1 readings. The final block targets remove that
self-sampling error, but their masks still prevent certification.

The earlier native peek capture found light title minima of 4.433:1 at About
and 4.309:1 at Personal Systems. The auditor treats both as failures of the
required 4.5:1 bar. They remain open. An earlier handoff mislabeled Personal
Systems as Weightlifting; the underlying JSON was correct. Close-button scans
from that old run measured the whole button and must not be called icon failures.

The auditor accepted the corrected expanded title/icon/pill evidence and closed
B1/B2, but explicitly withheld material acceptance. The final HUD/yaw correction
is queued for that auditor's method review. Native pill opacity, peek-title
contrast, masked body text, and physical-device parity remain unresolved.

## Evidence and handoff

Persistent evidence is under the overnight research directory:
`artifacts/frame-pacing-codex/material-followup/`. It includes source/build
binding, exact separated diffs, all successful and failed commands, screenshots,
preflights, and the final handoff. The older top-level evidence and manifest
remain frozen. The shared board carries the auditor receipt and exact commands.

No material PR is open. Do not promote the native presentation commit as an
opacity fix or include the experiment in PR #79. No merge, main change, manual
deployment, or force push occurred. No Field Note is added because this is
presentation maintenance without a new visitor discovery.

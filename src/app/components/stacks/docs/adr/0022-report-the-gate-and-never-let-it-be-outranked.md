# 0022 — Report the gate, and never let presentation outrank it

Status: accepted
Date: 2026-08-23

## Context

ADR 0021 put every boot decision in one machine and made the reveal wait on
four facts about the world. Three gaps were left in the layer above it, and all
three are the same mistake: something that is not a fact about the world was
allowed to speak as if it were.

The boot screen's second line ran on a twenty-second CSS carousel. Ten notes,
one every two seconds from the five-second mark, in the same order the boot
actually happens, so it read as a status report while being a timer. The room
announced that it was growing the meadow at nine seconds whether or not a
single blade had been placed, and announced that it was opening at nineteen
whatever it was really stuck on. Past the first loop it said the same ten
things again.

The vignette's completed pass is one of the four reveal gates, and it had no
bound. The pass ends when the bookcase's 600ms glide settles, which is a CSS
transition awaited through `transition.finished`. If that never resolves, the
reveal never opens, and the only escape is the forty-second hang backstop
demoting a world that painted thirty-nine seconds ago. A cosmetic bug becomes
"the room never loads."

The reveal gate is sampled on `requestAnimationFrame`, which a background tab
freezes. The hang backstop is a `setTimeout`, which a background tab throttles
but still fires. Backgrounding a tab during a boot for forty seconds therefore
handed it back a flat page, and so did returning to a tab left open on a slow
connection.

## Decision

**The wait line comes from the first gate that has not been passed.** The
machine already holds the facts, in order: a loading manager has reported at
all, it has gone complete, a frame has painted, the meadow has filled. The
first one still open is the `waitStage`, and it decides which lines the boot
screen is allowed to show.

The primary label, "Loading the 3D room", is visible from the first paint and
exposed as a polite status to assistive technology. Gate-specific notes remain
visual supporting copy so their rotation does not produce repeated
announcements.

All ten authored lines survive, grouped under the gate each is true of. Within
a gate they take turns on a 2.4s interval, and they should: a compile that
takes eleven seconds really is warming the room, lighting the little lamp, and
turning on the lighthouse, so rotating those three is both livelier than one
frozen line and true the whole time. The distinction that matters is what the
timer is allowed to move. The old carousel advanced through the _stages_ on a
timer, which is how the room came to announce a meadow nobody was growing.
Taking turns inside one stage claims nothing the boot is not doing, and the
rotation resets whenever the gate changes, so a stage always opens on its first
line. There is no cycle variable and no `@keyframes` left: the turn is React
state and the strip is a cross-fade.

The stage is **latched** and never moves backwards. `meadowPending` and a
Suspense child queuing a late batch both legitimately reopen a gate that had
closed, and a wait message that reverses reads as a fault even when it is the
truth. The reveal gate is unaffected: it reads the live facts, and only the
displayed line is latched.

There is still **no percentage, and there will not be one.** A loading
manager's `loaded/total` cannot carry this: drei rebases it per batch, so it
runs 0→100→0→100; the denominator does not exist until the chunk has parsed;
and the two slowest stretches of a cold boot, shader compilation and the
meadow's instance buffers, publish no load events at all. A bar would sit
pinned at 100% through exactly the wait that makes a visitor reach for the tab
close. An ordinal that advances on real transitions is the honest version of
the same information.

**The vignette may lengthen a wait by a bounded amount and may never hold a
painted world.** `vignetteCeilingMs` is 1200, twice the honest cost of the
600ms glide. Past that, measured from the moment the room became ready, the
reveal stops asking the vignette. The world facts are still required: the
ceiling releases the vignette, never the room, so a meadow that goes pending
under the glide still blocks the reveal. Real progress is allowed to shorten
the animation (`awaitingVignette` already closed the pass early once the room
was ready) and is now allowed to overrule it, but the animation never lengthens
the wait by more than a fixed cosmetic budget.

**The hang backstop is disarmed the moment the room is first ready.** It asks
"will this world ever be ready", and once it has been the question is answered
for good. This is what keeps a cold boot that finally lands at thirty-nine
seconds from being thrown away at forty because the bookcase was mid-glide.

**Every clock the boot arbitrates on freezes while the document is hidden.** A
`visibility` event carries `document.hidden` into the machine; `hiddenSince`
suspends deadline evaluation, and the wake shifts both the armed deadline and
the vignette ceiling forward by however long the tab was away. A boot thirty
seconds from its backstop when the visitor switched tabs is still thirty
seconds from it when they come back, whether that was a minute later or an
hour. Shifting the ceiling as well is what makes a return to a ready room show
the glide rather than a bookcase that has already snapped into place.

Visibility is a fact about the tab rather than about any one world, so it is
not epoch-scoped, it survives a new generation the way the vignette's pass
does, and it crosses the terminal-state guard.

## Consequences

The boot screen is now a consumer of the machine rather than a parallel
timeline. `BootWaitNotes` subscribes on its own so a stage change re-renders
five words instead of walking two thousand nodes of SVG, and the server
snapshot is `starting`, which is what the server can honestly say.

The primary loading label is the boot screen's only live status. The decorative
bookcase, wordmark, and rotating gate notes remain hidden from assistive
technology, which communicates the wait without repeatedly interrupting the
readable document underneath it.

Two of the three fixes are only reachable through a real browser. The ceiling
and the visibility freeze are covered at the machine's interface with fake
clocks, but that `useWorldBoot` subscribes to `visibilitychange` at all, and
that a wedged CSS transition is what the ceiling actually catches, are covered
by review and manual checks, for the same reason ADR 0021 gives: there is no
DOM test environment here.

`vignetteCeilingMs` is tied to `ABOUT_BOOT_STAGE_GLIDE.durationSeconds` by a
comment and by nothing else. Slowing the glide past 1200ms without raising the
ceiling would start cutting the bookcase off in flight, which is the one thing
the vignette gate exists to prevent.

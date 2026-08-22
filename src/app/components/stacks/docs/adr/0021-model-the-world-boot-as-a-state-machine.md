# 0021 — Model the world boot as a state machine

Status: accepted
Date: 2026-08-21

## Context

Whether a visitor sees the flat document or the room, and when the swap
happens, was decided in six places at once:

- an inline pre-paint script in `page.tsx` (capability probe, warm record,
  handshake attribute, a 20-second fail-open timer),
- four effects and four pieces of React state in `StacksHome`,
- module globals in `loading.ts` (asset settle window, meadow flag, boot
  vignette flag, handshake writer, warm record),
- an eligibility rule in `webglProbe.ts`,
- a `MutationObserver` in `BootScreen`,
- progress reporters inside the lazy WebGL chunk.

Each held one piece of "what is the visitor looking at right now", and no piece
could be exercised without a browser. The pre-paint script and the React path
had to agree about six constants, and kept them in sync by hand. Two of them
(`20000`, `"pending"`) were only in the script; two more (`__stacksWorldBootTimer`,
`__stacksWorldBootToken`) were typed once in the script and again in a
`WindowWithStacksBoot` interface.

## Decision

One deterministic state machine owns the whole boot: capability, reduced
motion, Save-Data, warm cache, world mount, the four reveal gates, first
painted frame, hang timeout, runtime error, context loss, route exit, and
ready. It lives in `boot/worldBootMachine.ts` and is pure — time arrives as
`at` on every event, so the transition table is driven with fake clocks.

Everything that touches a browser is an adapter:

| Adapter | Job |
| --- | --- |
| `boot/worldBootPrepaint.ts` | Generates the inline script from the policy record |
| `boot/worldBootSession.ts` | One live instance, the browser probes, the document writes |
| `boot/useWorldBoot.ts` | React: signals in, view out, one timer, one frame loop |

`boot/worldBootPolicy.ts` holds every constant as one JSON-serializable record.
The pre-paint script is generated from it rather than typed, so no timeout,
storage key, attribute name, or window global can drift between the two paths.

The machine's interface is a state, an event union, a reducer, and a view. The
view names what a visitor can observe (which homepage is mounted, what the
handshake says, whether the world is revealed) and nothing about React.

## Consequences

Boot policy is now testable without a browser: `worldBootMachine.test.ts`
drives the full transition table with fake time, including every event in every
state.

The pre-paint script still writes its decision out by hand, because it cannot
import anything. `worldBootPrepaint.test.ts` closes that gap by compiling the
generator's own output and running it against a fake document over the whole
input matrix, asserting it lands on the same phase the machine does. A change
to the eligibility rule that touches only one of the two paths fails there.

Two clocks stay separate on purpose. Machine time is monotonic elapsed
milliseconds; the warm record's age is wall-clock, because the record has to
survive a reload. The machine never reads a clock itself.

The reveal gate is still sampled on a frame loop rather than driven by an
event, because one of its four conditions is a quiet window rather than a
signal. The loop only runs between the first painted frame and the reveal.

`src/styles/globals.css` still selects on the literal `data-world` and
`data-og-capture`. Those two names live in the policy record and the CSS
mirrors them; changing one means changing the other.

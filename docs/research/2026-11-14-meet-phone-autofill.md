# /meet phone field and browser autofill

2026-11-14. Research behind PR #156, which keeps /meet's Phone field closed
until a booker asks for it or autofill fills it.

## Owner's decisions

Asked on 2026-11-14 whether to ship the design, where Phone opens, whether a
filled field should say why it's asked, and whether to push a preview. The Owner
answered:

> 1. ship
> 2. under email
> 3. yes, not at the placeholder pls. can do a little (?) phsophor icon with
>    tooltip
> 4. go for it

## Result on the Owner's iPhone

The closed field shipped in PR #156 (54f1291f) and failed on the Owner's iPhone
the same day. Neither Chrome nor Safari filled the phone, Safari when the Owner
picked "AutoFill Contact". The report also showed the booking sheet's glass
drawn out of place, offset down and right of the sheet, after the change. The
glass wasn't reproduced here: headless WebKit draws no `backdrop-filter`, and
the worker's iOS Simulator couldn't render the page under a load of 545. The
only new thing inside the sheet was the always-mounted closed field, with
`filter: blur(3px)`, `opacity: 0`, and a `clip-path`.

Chrome for iOS has its own form script, and its `isVisibleNode` in
`components/autofill/ios/form_util/resources/fill_util.ts` checks only
`visibility: hidden` and `display: none`, so that check alone doesn't explain
the miss. The tests below ran desktop Chrome's engine through DevTools, which is
not what a booker's iPhone runs.

Offered a choice between showing Phone again and another hidden attempt, the
Owner picked "Keep it hidden, try again" (2026-11-14). So the closed field now
opens the first time the booker focuses Name or Email, before an iPhone's
AutoFill runs, and stays closed after the booker removes it. At rest the closed
field carries no filter, only while it moves, since a blur left inside the sheet
is the likeliest cause of the glass. Both still need the Owner's iPhone to
confirm.

On 2026-11-16 the Owner asked whether it could hide again after AutoFill. It now
closes about 400ms after the name and email both arrive whole, within 250ms of
each other, as a fill sets them, when no number came with them and the booker
hasn't opened or focused Phone. Typing adds a letter at a time and a paste
brings one field, so neither closes it. Don't hide a field autofill should fill
on the strength of a desktop test.

## The rule the design rests on

A booker must see any number the form sends. Phone is sent only from React
state, and a value in state opens the field (`MeetBooking.tsx`, the phone
input's `onChange`). Keep that true in any later change. Filling a field the
booker never sees is the known autofill data-harvesting pattern.

## What browsers fill

Chrome 157, tested on a matrix page and on the real form:

| How the phone field is hidden                               | Chrome     |
| ----------------------------------------------------------- | ---------- |
| `display:none`, `hidden`, closed `<details>`                | Not filled |
| `visibility:hidden`, `content-visibility:hidden`            | Not filled |
| `inert`, `disabled`, `readonly`                             | Not filled |
| Laid out in a parent of no height and no opacity (`Stowed`) | Filled     |
| The same with `tabindex="-1"` and `aria-hidden`             | Filled     |
| 1px screen-reader-only box, off-screen, `opacity:0`         | Filled     |
| Mounted or shown after the fill (0.3s and 6s later)         | Not filled |

Chrome fills any focusable field. The rule is in Chromium's
`components/autofill/core/browser/filling/form_filler.cc`: "Don't fill
unfocusable fields, with the exception of native `<select>` elements." Size,
opacity, and position don't count. A field mounted after the fill is skipped
because the refill of a changed form runs for one second
(`kLimitBeforeAutomaticRefill`) and only for field types the first fill saw.
That is why `Stowed` keeps the field mounted and `Collapse` would not work.

Chrome sends each filled field a trusted `input` and `change`, so React's
`onChange` fires. It also sends a keydown and keyup with no `key`, which threw
in `isUniversalSearchShortcut` until this PR.

Safari's AutoFill is closed source ("Autofill is a Safari feature", WebKit bug
227342). A third-party copy of Safari 27.2's `FormMetadata.js`
(github.com/NohamR/safari-internal-js) drops a control that is `display:none`,
not visible, or under 2px in either direction, or under 6px at opacity 0. The
input here keeps its full size inside a parent of no height, so it should fill.
A 1px screen-reader-only box would not.

## Not tested

- Safari on the Mac, live. Its contact menu would not open under remote clicks
  on the worker.
- Any browser on an iPhone.
- Chrome's suggestion dropdown. The fill ran Chrome's engine through DevTools.

If a browser skips the closed field, the booker sees the form without Phone and
"Add phone" still opens it.

## How to rerun the Chrome check

Start the fixture form with
`DAYBREAK_BOOKING_URL=fixture NEXT_PUBLIC_TURNSTILE_SITE_KEY= pnpm dev -p <port>`.
Launch Chrome with `--headless=new` and a debugging port, open `/meet`, pick a
time, then send DevTools `Autofill.trigger` with the `backendNodeId` of
`#meet-name` and an address whose fields are `NAME_FULL`, `EMAIL_ADDRESS`, and
`PHONE_HOME_WHOLE_NUMBER`. Read `#meet-phone`'s value and whether its `Stowed`
parent is still `aria-hidden`.

Two things mislead in that harness. A Radix tooltip closes on a pointer move
that follows the leave, so one jump of the mouse leaves it open. The first load
after a recompile can log a hydration mismatch in `WeekStrip` that a second load
does not repeat.

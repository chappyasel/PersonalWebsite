# 0025 — Give every room stop one URL

Status: accepted
Date: 2026-09-11

## Context

The room mirrored the active shelf into the address bar as `/#slug`, and
`/golf` was the one stop with a path of its own. A hash never reaches the
server, so every `/#projects` link anyone shared unfurled as the homepage
card with the homepage title. `/golf` unfurled as "Golf" for one reason: it
is a route with its own metadata.

`/golf` also carried a wart. Mirroring was switched off away from `/`, so a
visitor could scroll from the green to Talks and the bar still said `/golf`;
a refresh took them back to the green, and a section link from there pushed
`/golf#weightlifting`. Two URL behaviours for one page.

Universal Search compared pathnames to decide whether a result was the same
document, so from `/golf` a jump to a shelf reloaded the page.

## Decision

Each stop has exactly one URL, and the address bar and Universal Search
both hand out that one.

- A shelf with no page of its own owns a path: `/projects`, `/musings`,
  `/talks`. Each is a thin route that renders the homepage with its own
  title, description, and card metadata (`roomStopMetadata`).
- Books, Weightlifting, and Systems are real pages at those paths, so their
  stops keep the hash form: `/#books`, `/#weightlifting`, `/#systems`.
- About's stop is the homepage itself, `/`. `/about` exists so a link to it
  unfurls as About; it opens on the shelf and is left in the bar as typed,
  but the next travel writes `/`, and its canonical link points at `/`.
- The golf window is `/golf`, as before, and now mirrors like every other
  stop.
- Mirroring writes the canonical form for the stop arrived at, whatever
  room path the visitor came in on. Hash aliases (`/#projects`, `/#training`)
  and mixed forms (`/talks#books`) still resolve on load and are rewritten to
  the canonical URL at once. Search params ride along so `?debug=1` survives
  travel.
- The table of room paths lives in one dependency-free module,
  `src/lib/site/roomRoutes.ts`, and every "is this pathname the room?"
  check (history bridge, resident room, route-transition prototype, search
  navigation, boot pre-paint routing) asks it.
- No copy control. The address bar is the one URL at every stop, and the
  daylight pages' heading anchors exist because one URL there holds many
  sections. A control was built and removed the same day.

## Consequences

- Shared links unfurl as the shelf they point at. Per-shelf card images are
  a later step; until then a shelf inherits the homepage image with its own
  title and line.
- `history.replaceState` now changes the pathname during travel, not only
  the hash. Next's patched history keeps the router tree and fetches
  nothing; the book modal already relied on this.
- A return from a reading page to the room still lands on `/` plus the
  remembered shelf's hash, because that path is what the prototype's return
  navigation targets. The next travel canonicalizes it.
- The flat fallback at `/projects` (no WebGL) opens at the top of the
  document, as `/golf` always has.

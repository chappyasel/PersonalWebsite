# Agent instructions

## Browser automation

Do not use browser-control tools, Chrome, the in-app browser, Playwright browser
sessions, screenshots, or other interactive browser automation unless Chappy
explicitly asks for browser-based testing or inspection. This applies to UI and
layout changes too: make ordinary changes by inspecting the source and running
targeted unit, type, lint, or existing automated tests instead.

## Debug controls

When adding an optional visual effect or performance-sensitive rendering path,
add a live on/off control to the existing Scene Diagnostics panel. A query
parameter may remain as a reload-time rollback or benchmarking switch, but it
does not replace the panel control. Debug overrides reset on reload and must
not change the resolved production quality policy. Experimental effects remain
default-off until explicitly approved. Their off path must avoid render-target
allocation, texture sampling, and per-frame effect work.

## Field Notes

When adding or materially expanding a visitor-facing Action, Portal, Artifact,
Easter egg, route, or authored scene experience, evaluate it against the
[achievement quality bar](docs/research/2026-08-24-achievement-exploration-system.md#achievement-quality-bar).
If it passes every test, add the discovery in the same change, including
meaningful combinations with existing modes. Follow the
[catalog](docs/gamification/field-notes-catalog.md) and the implementation in
`src/app/components/stacks/fieldNotes/`. Award semantic success, never a raw
click, failed attempt, or analytics event. In the final handoff, name the added
ID or the quality-bar test that ruled it out.

## Book Notes skill

The repository-owned interface for Chappy's book library lives at `.agents/skills/book-notes/SKILL.md`.

When changing the book schema, Notion mapping, sync filters, freshness behavior, tag taxonomy, or query workflow, review the skill and its references and update them in the same change when their guidance is affected. The authoritative implementation lives in `src/lib/books/` and the `books` / `bookTags` definitions in `src/server/db/schema.ts`.

Notion remains the source of truth. Treat the Postgres mirror as read-only in agent workflows, and never commit or display values from `.env`.

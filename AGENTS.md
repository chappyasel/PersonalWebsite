# Agent instructions

## Repository and deployment scope

Implement requested website features in this existing Personal Website repository, using its Next.js app and existing components. Extend an existing prototype here when promoting it to a route. Do not create a separate repository, scaffold another application, or switch hosting/database providers unless Chappy explicitly requests that change.

Run and review work on localhost by default. When Chappy asks to ship or deploy, use the existing production workflow unless he specifies another environment. Pushing `main` deploys to Vercel Production; no separate environment confirmation is needed. Do not select a publishing skill merely because the task mentions a website.

Reuse the standard site password configuration for new private sections. Do not generate a separate password or add another sign-in provider unless requested.

## Browser automation

Do not use browser-control tools, Chrome, the in-app browser, Playwright browser
sessions, screenshots, or other interactive browser automation unless Chappy
explicitly asks for browser-based testing or inspection. This applies to UI and
layout changes too: make ordinary changes by inspecting the source and running
targeted unit, type, lint, or existing automated tests instead.

## UI components

Use the existing shadcn/ui components in `src/components/ui/` for standard
controls, popovers, cards, and expandable sections. Compose these components
instead of recreating their styling and interaction behavior with native elements.

Use Phosphor icons for all interface icons across the website. Import from
`@phosphor-icons/react`, or `@phosphor-icons/react/dist/ssr` for server-compatible
components. Never draw navigation, external-link, sorting, or direction icons
with ASCII/Unicode characters, HTML arrow entities, emoji substitutes, or
another icon library. Use `aria-hidden` for decorative icons and accessible
names for icon-only controls. Preserve arrow notation in authored content,
code examples, parsers, and logs. ESLint enforces icon imports and rejects
text arrows in JSX.

Use outlined Phosphor weights for navigation. Keep the desktop navigation's
side pill as its selection marker; do not add a background highlight or switch
its icons to filled weights. ESLint enforces this for `UnitRail.tsx`.

Filled icons are appropriate for earned rating stars, video play controls,
brand logos, and saved or selected control states. Preserve intentional icon
treatments elsewhere; do not apply a site-wide fill-to-outline replacement.

Keep the keyboard shortcut overlay limited to shortcut groups and rows. Do not
add footer text explaining alternate modifiers or legacy shortcuts. Show Command
for search and theme shortcuts, with Phosphor modifier icons. Keep Control
alternatives and the legacy Command-Option-L theme shortcut supported silently.

## Debug controls

Every boolean control in Scene Diagnostics uses the existing native checkbox
style, including controls embedded by other components.

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

# Agent instructions

## Browser automation

Do not use browser-control tools, Chrome, the in-app browser, Playwright browser
sessions, screenshots, or other interactive browser automation unless Chappy
explicitly asks for browser-based testing or inspection. This applies to UI and
layout changes too: make ordinary changes by inspecting the source and running
targeted unit, type, lint, or existing automated tests instead.

## Book Notes skill

The repository-owned interface for Chappy's book library lives at `.agents/skills/book-notes/SKILL.md`.

When changing the book schema, Notion mapping, sync filters, freshness behavior, tag taxonomy, or query workflow, review the skill and its references and update them in the same change when their guidance is affected. The authoritative implementation lives in `src/lib/books/` and the `books` / `bookTags` definitions in `src/server/db/schema.ts`.

Notion remains the source of truth. Treat the Postgres mirror as read-only in agent workflows, and never commit or display values from `.env`.

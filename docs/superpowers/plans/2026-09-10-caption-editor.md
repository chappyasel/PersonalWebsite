# Caption editor implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add grounded visitor captions and a development-only editor that saves directly to the canonical scene-object Markdown.

**Architecture:** Extend the existing Markdown parser with an explicit visitor flag and a pure targeted updater. A guarded Next.js route owns filesystem reads and atomic writes. A small client page edits visitor entries, while the existing image inspector lazily loads and renders the same generated captions.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Vitest, Tailwind, existing shadcn/ui components.

---

### Task 1: Add visitor selection and safe caption updates

**Files:**
- Modify: `src/lib/stacks/objectNotes.ts`
- Modify: `src/lib/stacks/objectNotes.test.ts`

- [ ] Add a failing parser test expecting `Audience: visitor` to produce `visitor: true`.
- [ ] Run `pnpm vitest run src/lib/stacks/objectNotes.test.ts` and confirm the new assertion fails.
- [ ] Add `visitor: boolean` to `ObjectNote`, parse `Audience`, and default it to false.
- [ ] Add failing tests for a pure `updateObjectNoteCaptions(markdown, edits)` function covering targeted replacement, removal of `NEEDS:`, preservation of untouched sections, blank bodies, duplicate IDs, and unknown IDs.
- [ ] Run the test file and confirm failures come from the missing function.
- [ ] Implement the smallest section-aware updater that preserves headings, links, and unrelated prose.
- [ ] Run the test file and confirm it passes.

### Task 2: Rewrite and select visitor captions

**Files:**
- Modify: `content/stacks/objects.md`
- Modify: `public/data/scene-objects.json` through `pnpm generate:scene-objects`

- [ ] Mark all 30 scene-photo sections with `Audience: visitor`.
- [ ] Replace every photo body with concise grounded copy from `docs/research/2026-09-10-caption-audit.md`, using accurate generic wording where a date, person, weight, or event remains unknown.
- [ ] Mark the 15 selected meaningful artifact sections from the audit as visitor-facing and rewrite implementation-heavy prose into one or two visitor sentences.
- [ ] Scan the edited copy for em dashes, contrasting-negation templates, inflated language, stale counts, private addresses, and unsupported identities.
- [ ] Run `pnpm generate:scene-objects`.
- [ ] Run `pnpm vitest run src/lib/stacks/objectNotes.test.ts` and confirm source/generated parity.

### Task 3: Add revisioned local persistence

**Files:**
- Create: `src/lib/stacks/captionEditorData.ts`
- Create: `src/lib/stacks/captionEditorData.test.ts`
- Create: `src/app/admin/captions/actions.ts`

- [ ] Write failing tests for visitor-only loading, revision checks, successful paired writes, rollback when generated JSON fails, and invalid edits.
- [ ] Run `pnpm exec vitest run src/lib/stacks/captionEditorData.test.ts` and confirm expected failures.
- [ ] Implement revisioned snapshots, optimistic concurrency, atomic sibling-file writes, rollback, and a development-only server action.
- [ ] Run the data test and confirm it passes.

### Task 4: Build the editor page

**Files:**
- Create: `src/app/admin/captions/page.tsx`
- Create: `src/app/admin/captions/CaptionEditor.tsx`
- Create: `src/app/admin/captions/CaptionEditor.test.tsx`

- [ ] Write failing component tests for visible counts, text editing, dirty-state tracking, filtering, successful save, failed-save preservation, and Save disablement when nothing changed.
- [ ] Run `pnpm vitest run src/app/admin/captions/CaptionEditor.test.tsx` and confirm expected failures.
- [ ] Build the client editor with existing Button, Card, Badge, and Input components, native textarea for multi-line copy, photo thumbnails, and non-photo fallback cards.
- [ ] Guard the server page with `notFound()` outside development.
- [ ] Run the component test and confirm it passes.

### Task 5: Restore visitor captions in image previews

**Files:**
- Modify: `src/app/components/stacks/modal/SceneArtifactInspector.tsx`
- Modify: `src/app/components/stacks/sceneArtifacts.test.ts`

- [ ] Change the presentation test to require `useObjectNote`, `data-artifact-preview-caption`, and no beige caption badge.
- [ ] Run `pnpm vitest run src/app/components/stacks/sceneArtifacts.test.ts` and confirm the new assertion fails.
- [ ] Load object notes only for image artifacts and render visitor captions beneath the title in the existing dark lower scrim.
- [ ] Keep navigation and action controls separate and preserve mobile ordering.
- [ ] Run the presentation test and confirm it passes.

### Task 6: Verify the complete change

**Files:**
- Inspect only all files changed above plus pre-existing unrelated worktree changes.

- [ ] Run all targeted tests from Tasks 1, 3, 4, and 5 together.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm verify`.
- [ ] Run `git diff --check`.
- [ ] Inspect `git status --short` and separate caption-editor files from unrelated pre-existing changes.
- [ ] Ask Codex for a read-only review of the final diff and address any concrete correctness or security findings.
- [ ] Do not commit unless Chappy explicitly requests it.

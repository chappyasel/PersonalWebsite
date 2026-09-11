# Caption editor design

## Goal

Ship better visitor-facing captions for every scene photo and a small set of meaningful objects, plus a local-only page where Chappy can review, edit, and save them quickly.

## Scope

- Rewrite all 30 photo captions in Chappy's direct first-person voice, using grounded context when available and durable generic copy when exact details remain unknown.
- Mark a curated set of meaningful non-photo objects as visitor-facing and rewrite those captions.
- Add `/admin/captions`, available only when `NODE_ENV=development`.
- Show thumbnail, section, title, status, and an editable caption textarea for every visitor-facing entry.
- Save changed captions to `content/stacks/objects.md` and regenerate `public/data/scene-objects.json` in the same request.
- Restore photo captions in the fullscreen image inspector using the existing dark lower scrim.

## Non-goals

- No production admin route, authentication system, database, or cloud persistence.
- No editing of IDs, links, visibility, or section order in the first version.
- No caption UI for every small prop. Plants, planks, repeated dice, and other set dressing remain uncaptured.
- No browser automation. Repository policy requires explicit browser-testing permission.

## Data model

Add `Audience: visitor` to selected Markdown sections. The parser exposes `visitor: true` in generated JSON. Missing `Audience` means internal. The editor only returns visitor entries.

A pure Markdown update function accepts `{id, body}` edits, validates IDs and non-empty text, replaces only those sections, sets `Status: written`, removes any `NEEDS:` line, and preserves the rest of the file byte-for-byte where possible.

## Routes and components

- `src/lib/stacks/objectNotes.ts` parses audience and updates section captions.
- `src/lib/stacks/captionEditorData.ts` loads revisioned editor data and performs recoverable local writes.
- `src/app/admin/captions/actions.ts` exposes the save operation as a development-only Next server action.
- `src/app/admin/captions/page.tsx` returns `notFound()` outside development, loads the current snapshot, and renders the editor.
- `src/app/admin/captions/CaptionEditor.tsx` owns local edits, dirty state, save status, filtering, and keyboard-safe text entry.
- `src/app/components/stacks/modal/SceneArtifactInspector.tsx` loads and renders image captions in the current lower scrim.

## UI

The editor is a simple editorial contact sheet. A narrow sticky header shows counts, a search field, dirty count, and Save. Each card uses the existing Card, Badge, Input, and Button components. Photos show their actual repository image. Non-photo objects use a compact text card without a fake thumbnail.

The public viewer shows title and one short caption in white over the dark lower scrim. It remains readable on mobile, does not cover the center of the image, and yields space to navigation/actions.

## Safety and errors

- The page returns 404 in production and the server action rejects direct production calls.
- Saves reject stale revisions, unknown IDs, blank captions, and duplicate edits.
- Writes use temporary sibling files and rename; a generated-JSON failure restores the prior Markdown.
- Generated JSON comes from parsing the exact updated Markdown string, avoiding a second divergent transformation.
- The editor keeps unsaved text on failed saves and shows the error inline.

## Tests

- Parser test for `Audience: visitor`.
- Pure update tests for targeted replacement, needs-owner promotion, preservation of untouched sections, unknown IDs, blank captions, and duplicate IDs.
- API tests for production 404, development GET, successful POST, and invalid payloads using injected file helpers where needed.
- Presentation tests for the editor's controls and the restored inspector caption.
- Run targeted Vitest files, typecheck, lint, and `pnpm verify`.

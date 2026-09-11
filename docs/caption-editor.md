# Editing scene captions

Open `/admin/captions` on the local development server. The page is unavailable
in production.

- Start with Enabled to review the captions selected for visitors.
- Use Hidden or All captions to find other object descriptions.
- Search by title, object ID, description, or section.
- Edit the description and use the switch to enable or hide its caption.
- Click Save captions, then reload the scene to see the result.

Hiding a caption preserves its description. Entries with `*` share one caption
across an object family. Visibility applies to existing photo previews and
object close-ups. Enabling an entry does not add a close-up to an object.

Some hidden descriptions are internal implementation notes. Review their wording
before enabling them. The `written` status means text exists, not that Chappy
has verified its facts.

Saving updates `content/stacks/objects.md` and regenerates
`public/data/scene-objects.json`. Visibility uses `Audience: visitor` for enabled
captions and `Audience: internal` for hidden captions. Commit and deploy the
content changes to update the live site.

If the source file changes elsewhere while the editor is open, saving stops
and keeps the current drafts. Copy any edits you want to keep before reloading.

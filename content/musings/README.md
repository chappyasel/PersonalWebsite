# Musings publishing

Notion is the editing source for the blog. Use the [Social Media Posts database](https://www.notion.so/df38504390e744caa79ba3d03b7a047a). `articles.json` is a generated snapshot; edit the Notion pages instead.

An article enters the next website snapshot when `Musing` is checked, `Status` is `Posted`, and `Date` is not in the future. Both properties matter. Draft, abandoned, archived, and unchecked pages stay out of the article routes, RSS, and search.

For a new essay, create a page in the database and write its body with native Notion blocks. Fill in:

| Property | Purpose |
| --- | --- |
| Title | Article title |
| Musing | Selects the page for the blog |
| Status | Keep a draft status while writing; use Posted when ready |
| Date | Original publication date |
| Updated | Optional Date property for an editorial revision; add it when needed and leave blank for imports or cleanup |
| Slug | Permanent URL suffix, such as `apple-way`; keep it stable when retitling |
| Summary | Description for search, previews, RSS, and the post list; optional |
| Author | Byline; defaults to Chappy Asel |
| Medium URL | Original Medium story, for migrated essays; optional for new work |

The whole page body becomes public content when selected. Keep drafting notes in a separate page. An unchecked Musing or a draft status excludes the page on the next successful refresh. Changing a slug changes its URL and requires a redirect from the old website URL.

The reader and structured metadata use `Date` for publication and the optional `Updated` property for revisions. Without `Updated`, both dates remain the original publication date. Notion's automatic edit timestamp is never a publication or revision date; imports, slug edits, and boilerplate removal must not make an old essay look newly revised.

Refresh the local snapshot with:

```sh
pnpm generate:blog-posts
```

This reads Notion using the site's existing `NOTION_API_KEY` from `.env`. It writes `articles.json`, local image files, `public/data/blog-posts.json`, and the universal search index. It never edits Notion. The app serves the saved snapshot, so Notion edits do not appear on the website until the snapshot is refreshed and deployed. Deployment requires an explicit request naming the environment.

Supported content includes paragraphs, headings, rich text, lists, quotes, images with captions, code blocks, dividers, toggles, callouts, and links. Standalone X post and YouTube URLs in bookmark, embed, or video blocks render inline on the website. Other providers remain outbound links, as do links within prose. Unsupported blocks fail the refresh before article snapshots are replaced. Missing dates, missing slugs, duplicate slugs, and failed image downloads also fail the refresh. Notion file URLs are temporary, so the generator stores image bytes locally and never puts signed URLs into public artifacts.

X posts use the [official widget renderer](https://docs.x.com/x-for-websites/embedded-posts/guides/embedded-post-javascript-factory-function). They load near the viewport, follow the site's theme, and keep a source link and retry control if loading fails. YouTube uses a [privacy-enhanced player](https://support.google.com/youtube/answer/171780?hl=en). Neither embed displays a separate link beneath the loaded content. Both providers load third-party content in the reader's browser.

Imported Medium link previews display one title link with a smaller description below it. The reader recognizes their title, line break, description, and domain pattern and omits the redundant domain label. The original Notion content stays intact, and ordinary links within prose retain their formatting.

`external.json` preserves the pinned essay from The AI Collective as an external link. Its body is not part of this Medium migration.

`/musings` is a server-rendered article index using the same generated post list as the showcase. Direct visits do not load the 3D room. The showcase shelf stays at `/#musings`; its portal opens the index in the same tab through the page transition controller. Migrated article links open their local reader pages. The Trust booklet retains its separate essay destination on The AI Collective. Article breadcrumbs and footers return to the index, and footer links connect newer and older essays. Home links on reading pages disable prefetch so browsing essays does not preload the showcase.

The index reuses the Systems page's daylight sky, skyline, ground texture, and footer, with cover images and relative publication dates on the post cards. It revalidates daily to keep those dates current. Articles put their title, publication date, and return links in the sky header, followed by a centered reading column on the textured ground. These pages reuse the existing daylight components without loading the WebGL room. Solo Chappy Asel bylines are omitted from the visible header; coauthors remain credited. List entries use the shared TiltCard hover expansion, lift, and tilt over the same glass styling as the showcase cards, with touch and reduced-motion behavior inherited from that component.

Consecutive image blocks display side by side. If only the last image has a caption, that caption spans the group. Every article image opens in a document-wide swipeable and zoomable gallery using `react-photo-view`, the engine used by Books and the home screen. The home screen and document galleries share `ImageViewerChrome`, including the glass close button and previous/count/next controls. Document images scale to fit the viewport, including enlarging smaller sources, over a tinted backdrop with a 24px blur. The existing Photo preview blur diagnostics control also applies to document galleries. Only source captions appear, centered above the navigation controls; the viewer does not turn image alt text into visible headings or invent numbered labels. The shared Notion renderer uses it too, with one gallery per Systems, Manual, or Routine document, including when opened in a sheet. Escape closes the image viewer before the underlying sheet, and focus returns to the image trigger.

The index header uses Systems' title-first format and shared wayfinding row, with the site back link, theme toggle, and RSS feed. The existing page transition controller animates navigation between the index and essays, including browser history. Same-article hash changes and the RSS response bypass page animations. Reduced-motion preferences and the existing Page transitions control still apply.

# September 2026 import

The source export contains ten published essays and six replies. The importer selects the essays, omits the Medium clap prompt at Chappy's request, preserves their dates to Notion's minute precision and retains their formatting, and uploads their 64 article images to Notion. Three empty embedded-post placeholders in the newest essay were recovered from Medium's RSS feed and stored as Notion bookmarks. The website renders them as X embeds. Link-card thumbnails are decorative and are not imported.

Existing Notion pages, including earlier drafts with matching titles, remain intact. Imported editions are separate pages with `Musing` checked. The private import plan and recovery journal live in the ignored `data/musings-import/` directory. No raw account export belongs in git.

To inspect another export without writing to Notion:

```sh
pnpm import:medium --export=/absolute/path/to/export
```

Adding `--apply` performs the import and requires a Notion connection with insert, update, and file-upload access. The website's read connection may not have those capabilities. The import records source URLs and page IDs, resumes interrupted imports, and checks `Musing` only after the body has been written and read back. It does not overwrite existing completed imports or unrelated pages.

The [Medium cutover checklist](MEDIUM-CUTOVER.md) lists each existing Medium story and its new canonical URL, plus the workflow for future posts.

The reader does not display Medium attribution. Original Medium URLs remain in the source metadata for migration tracking. Medium canonical links must change only after their exact website counterparts are public. This implementation does not change Medium or publish the website.

# Field Notes evaluation

No new Field Note is added. Awarding an article page load would fail quality-bar test 2: it would reward opening a page without a distinct meaningful action. Existing `first-portal` and `open-house` discoveries continue to cover successful scene Portal activations. Reading time, scroll depth, and analytics events do not award a discovery.

Image enlargement is a standard reading control, so it fails test 1's distinct discovery bar. It does not add a Field Note.

# Article URLs

These slugs were shortened before launch.

| Essay | Path |
| --- | --- |
| The Self-Improving AI Stack: Five Layers Deep | `/musings/ai-stack` |
| The Human Side of AI: 5 Lessons from America’s Top AI Hubs | `/musings/human-side-of-ai` |
| Top 10 Most Provoking Reads of 2024 | `/musings/reads-2024` |
| The End of Early Stage Venture | `/musings/early-stage-venture` |
| The Apple Way | `/musings/apple-way` |
| AGI Manifesto Part I: Promise | `/musings/agi-promise` |
| The GAI Collective: A Shared Curiosity | `/musings/shared-curiosity` |
| America’s AI Ultimatum: Forge Ahead or Fall Behind | `/musings/americas-ai-ultimatum` |
| Can ChatGPT Generate a Full iOS App? | `/musings/chatgpt-ios-app` |
| From Nerd to Bodybuilder: Embracing Paradoxical Passions | `/musings/nerd-to-bodybuilder` |

Validation completed with 32 targeted tests, TypeScript, targeted ESLint, and HTTP checks against all ten local article routes, RSS, sitemap, and a missing article. A separate read-back comparison verified Notion text, formatting, links, dates, and all 64 image blocks against the import plan. Browser testing was not performed.

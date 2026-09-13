# Move the canonical blog from Medium to the personal website

Researched September 12, 2026. This is a migration recommendation, not authorization to publish or change Medium posts.

## Recommendation

Publish complete articles at stable `/musings/[slug]` URLs in the existing Next.js app. Keep Medium copies available and point their canonical links at the matching website articles once those pages are public. Publish future work on the website first, then optionally cross-post to Medium.

Chappy selected Notion as the editing source. The implementation reads the Social Media Posts database and selects pages with `Musing` checked and `Status` set to `Posted`. The site owns the rendered pages and URLs. See [the publishing workflow](../../content/musings/README.md).

## What the repository already has

Before migration, the existing [`/musings` route](../../src/app/musings/page.tsx) opens the Musings shelf. [`public/data/blog-posts.json`](../../public/data/blog-posts.json) contains ten cached entries, nine Medium links and one pinned AI Collective essay. This is a display cache, not a verified inventory of the complete Medium archive.

`scripts/generate/blog-posts.ts` fetches Medium RSS through rss2json, strips HTML, and truncates descriptions at 1,000 characters. It does not preserve full article bodies or take ownership of image assets. `BlogPosts.tsx` opens the existing external links. The home scene and universal search also consume the JSON. The repository already includes `react-markdown`, `gray-matter`, and `remark-gfm`.

Replace that dependency on Medium with a shared content registry that supplies the reading pages, shelf, list, search, RSS feed, and sitemap. Preserve the AI Collective essay as an external entry unless separately asked to migrate it.

## Migration sequence

1. Request the Medium export and keep a private backup. Medium's current desktop path is Settings, Security and apps, Download your information, Export. It emails a download link for a ZIP containing HTML stories and personal data. Treat the archive as private and explicitly select published articles for migration, since an account archive can contain unpublished or unrelated material. Do not commit the raw archive. [Medium export documentation](https://help.medium.com/hc/en-us/articles/115004745787-Export-your-account-data)

2. Build an inventory with each original URL, article title, original publication date, final website slug, body, assets, and migration status. Confirm completeness against the actual export. Convert published article HTML into local content, preserve image captions, alt text, links, lists, and code blocks, and review embeds separately. The export documentation does not promise a self-contained image archive, so inspect it and download the image files needed to serve articles independently of Medium. Google's migration guidance includes moving assets and mapping old URLs to new ones. [Google site migration guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)

3. Implement normal reading pages at `/musings/[slug]` with complete server-rendered article text. Keep the 3D shelf as another way to discover them. Include a title, description, author, original publication date, self-referencing canonical URL, social preview image, `BlogPosting` structured data, RSS, and sitemap entries. Make existing site links and search results point to the local article. Preserve the original publication date; use an updated date when the content actually changes, and keep visible and structured dates consistent. [Google article structured data](https://developers.google.com/search/docs/appearance/structured-data/article), [Google publication dates](https://developers.google.com/search/docs/appearance/publication-dates)

4. Review representative articles locally before importing the rest. Check formatting, images, embeds, internal links, generated metadata, slug collisions, draft exclusion, and missing pages using source inspection and targeted automated checks. Browser inspection requires an explicit request under this repository's instructions. Deploy only after an explicit request naming the environment.

5. Once the website articles are live and crawlable, update each existing Medium story's canonical to its exact website counterpart. Medium documents this for existing posts: edit the story, open More settings, then Advanced Settings, select "This story was originally published elsewhere", save the URL, and publish the change. Only the author can set it. Verify the resulting canonical in the returned HTML. Add a short reader-facing link to the current website version and update profile links. Keep the full Medium copy available initially so old links and discussions remain useful. [Medium canonical documentation](https://help.medium.com/hc/en-us/articles/360033930293-Set-a-canonical-link)

6. Submit the website sitemap in Search Console and inspect representative URLs for indexing and Google's selected canonical. Expect recrawling to take time. A canonical link expresses a preference; Google can select a different URL. Avoid promising immediate ranking transfer. [Google canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization)

## Important limits

For articles hosted on `medium.com` or a Medium subdomain, do not assume control over HTTP redirects. The official documentation reviewed describes author-controlled canonical links and Medium's own internal redirects, but does not document an author setting for permanent redirects to an arbitrary external website. Treat canonical updates plus visible links as the available migration plan until the actual account shows otherwise. An existing custom domain that Chappy controls would need a separate redirect assessment. [Medium profile URL behavior](https://help.medium.com/hc/en-us/articles/115004746707-Your-profile-page-URL)

Google treats redirects and canonical annotations as strong signals, and sitemap inclusion as a weaker signal. Canonicals apply to duplicate or very similar pages. Do not replace a Medium article with a tiny teaser and assume that its canonical still consolidates the full website article. Plain duplicated content is not itself a Google spam violation. [Google canonical signals](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [Google canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization)

Moving articles does not automatically move the audience. Medium says new subscribers' email addresses are no longer shared with writers, although writers can still export existing email lists. Do not promise a complete subscriber export or auto-enroll Medium followers in a new mailing list. RSS is a simple first subscription option; email can follow the author's preferred workflow. [Medium email notifications and subscriber exports](https://help.medium.com/hc/en-us/articles/360059837393-Email-notifications)

For future cross-posting, Medium's import tool automatically adds the source URL as canonical and backdates the Medium post to the original publication date. Import from the public website URL, then check formatting and canonical output before publishing the Medium copy. A failed import can be handled manually. [Medium import documentation](https://help.medium.com/hc/en-us/articles/214550207-Importing-a-post-to-Medium)

## Remaining decisions

The supplied archive contains ten published essays and six replies. The implementation imports the essays into Notion as separate published editions, preserving existing drafts. All 64 article images have been copied into Notion. Three missing embedded-post URLs were recovered from the Medium RSS feed. Subscriber export eligibility and custom-domain setup remain outside this implementation. Deployment and Medium canonical changes remain pending an explicit deployment request.

# Book OG image delivery

## Implemented now

- Book OG images are no longer generated for every book during `next build`.
- An image is generated on its first request and cached without a time-based
  revalidation interval.
- The daily/manual Notion sync reports the exact active and retired book slugs
  affected by the sync.
- Only affected book pages, icons, and OG images are invalidated.
- Active changed OG images are immediately warmed on
  `books.chappyasel.com`; deleted and superseded slugs are invalidated but not
  warmed.
- The existing post-deploy all-book warmer remains the deployment safety net
  for image-template changes and newly deployed cache namespaces.

## Later, if the library or rendering cost grows substantially

Move OG rendering out of the request path entirely: generate a versioned PNG
when a book changes, store it in object storage, and write/reference the asset
URL as part of the sync. This would preserve fast builds and eliminate cold ISR
generation, at the cost of an asset lifecycle, cleanup policy, and explicit
handling for image-template version changes.

# Illustrated room content provider

Root has copied the helper. `src/app/components/room-illustration-prototype/PrototypeContent.server.tsx` exports `getPrototypeContent(allBooks?)`, `PrototypeContent` and `PrototypeBooks`.

```tsx
const { slots, cards } = await getPrototypeContent(allBooks);

return (
  <SitePageCardsProvider cards={cards}>
    <Comparison slots={slots} />
  </SitePageCardsProvider>
);
```

The example shows an awaited caller. Root now streams the returned promise as `content` to IllustratedRoom; ShelfContent resolves it with React `use` inside Sheet Suspense and supplies SitePageCardsProvider there. Import the helper from a server page and retain the development-only route guard. It returns existing React sections keyed by the internal `UnitSlug` names:

| Slot | Existing section |
| --- | --- |
| `about` | AboutMe, including its contact links |
| `books` | BookNotes with homepage covers and statistics |
| `training` | Weightlifting with activity and placard data |
| `systems` | PersonalSystems |
| `projects` | Projects with GitHub activity |
| `blog` | BlogPosts |
| `talks` | Talks |

Use `training` and `blog` as slot keys even though the drawing selectors say Weightlifting and Musings.

The optional book array avoids a duplicate book query, including when the supplied array is empty. Without it, the helper uses cached `getDefaultBooks` through `orEmpty`. It preserves HomePage's abandoned-book exclusion, existing array order, first 60 cover records and `buildHomepageBookPlacard` statistics/yearly data. Weightlifting activity, lifting placard and GitHub loaders run independently in parallel with the existing neutral fallbacks. Authored components supply their current content and links; no invented text, duplicate section queries or book schema/query changes were added. The helper does not execute any query during import.

## Dependencies and failure behavior

The helper imports `server-only` and has no direct Three, WebGL or scene-renderer import. `UnitSlug` is a type-only import. Existing client section components still use their normal DOM motion, image and tooltip code; this is not a bundle-size audit.

Root layout already supplies ThemeProvider, InlineBookPreviewProvider and the route sheet slot. BookCarousel provides its TooltipProvider. Return `cards` to SitePageCardsProvider for links rendered beneath the prototype. Its book data matches the section statistics; weightlifting is null, as on HomePage. A modal mounted by the outer layout provider does not inherit a provider mounted inside the page. If root needs these statistics inside a new prototype modal, that modal must remain beneath the supplied card provider.

The section slots retain existing navigation. BookNotes is a library link with cover carousel/tooltips; it does not promise a separate inline modal for each illustrated book. Root owns those illustrated-object actions. Systems and Talks retain their existing document/video links.

`orEmpty` catches rejected loaders but adds no deadline. A loader that never resolves can delay this helper. Keep the illustrated shell usable independently of streamed section content, and preserve root's error/fail-open handling. Do not tie the availability of static section links to WebGL readiness.

## Final bounded root source review

Rechecked `page.tsx` and `IllustratedRoom.tsx` after root's fixes. No further required provider or link correction found in this source pass.

- The toolbar and About's embedded ThemeToggle now share `next-themes`. The separate local theme state and coercing MutationObserver are gone.
- A separate effect decodes `currentArt`, covering the server-provided initial SVG as well as fetched SVGs. Decode failure sets the visible artwork failure message while navigation and Explore remain available. Disposed effects and aborted requests cannot publish stale results.
- Content section interception now requires a hash-only href before resolving a UnitSlug. It runs in capture phase, so About's scene travel handler does not take over these links. Ordinary document and external links retain their destinations.
- The server page starts `getPrototypeContent(allBooks)` without awaiting its secondary content queries before returning the illustrated shell. The Sheet resolves that promise inside Suspense. ShelfContent wraps the selected real section in SitePageCardsProvider, preserving the statistics context.

The initial homepage book selection and cover-color lookup still precede the shell, preserving real initial covers. Existing `orEmpty` handling catches loader rejection and supplies the same neutral values as HomePage; it adds no deadline. Secondary pending content no longer holds the initial drawing behind it.

The route remains development-only. This reviewed version is 2D-only, with no hidden renderer or promotion state machine. Builder owns the future promotion latch, which must prevent an automatic switch after navigation, Sheet reading, scrolling, keyboard activation or portal interaction begins. This review does not claim that future behavior is implemented or verified.

Root is running WebGL-blocked checks across all seven content views, including the embedded theme toggle. Those runtime results remain root-owned and were not yet available at this source-review closeout. No browser or 3D session was started by this reviewer.

## Checks

Targeted TypeScript passed for the helper and its imported dependencies using repository compiler settings, `next-env.d.ts`, `noEmit` and no incremental writes. Targeted ESLint passed with zero warnings. Both ran under Node 24.19.0. The later root review was source-only; no additional tests were run and no root or builder source was edited. No live queries, browser/3D sessions, builds, DB writes or production changes were used for verification.

Only the new helper and this task's progress/result documents were written. No production HomePage refactor or artwork change was made. Root owns the copied helper integration, client UI, promotion policy and final browser verification. This server helper adds no visitor-facing discovery by itself, so no Field Notes ID is added.

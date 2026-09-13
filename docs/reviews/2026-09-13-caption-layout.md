# Caption layout review

Object captions show their body without a title. Photo previews fit the image and measured caption together above a fixed bottom dock. The action button sits above pagination. Long captions scroll within the remaining space on phones, including landscape viewports.

Claude Code reviewed the implementation against the installed react-photo-view 1.2.7 sources. The review fixed the opening origin measurement before React re-renders, synchronized image sizing and caption movement with the viewer animation, and stopped the viewer from cancelling touch scrolling inside captions. Reduced motion disables caption and stage movement. The viewer adapter detects its resting state from the installed version's transition string, so a react-photo-view upgrade should review that integration.

The Superset setup fix locates the primary checkout regardless of its branch, copies missing development environment files, and preserves existing workspace files. Six regression tests and a fresh Superset workspace verified setup.

Validation on Node 24.19.0, integrated with main at 8dfe572c:

- Full code gate passed: type generation, TypeScript, ESLint, 4,287 unit tests, 39 artwork tests, search-index freshness, and meadow geometry checks. The unit suite skipped 21 existing tests.
- Geometry tests cover 320px phones, portrait and landscape viewports, long captions, and wrapped controls. DOM tests verify caption measurement, touch scrolling, and action order.
- Browser inspection was not requested and was not performed. Device animation appearance and iOS browser-toolbar changes remain visually unverified. Late-loading notes trigger an animated image resize; rotating the viewport retains the viewer's existing remount behavior.
- Field Notes quality-bar test 1 does not apply as a new discovery: this corrects the presentation of existing content.

# Universal Search

Universal Search gives visitors one keyboard-first way to find destinations, content, and site actions from any route without weakening existing access boundaries.

## Language

**Command palette**:
The site-wide interface opened with Command-K or Control-K. It presents search results and executable site actions.
_Avoid_: Search modal, launcher

**Search corpus**:
The destinations and content Universal Search may reveal. It includes curated public pages, homepage sections, books and book notes, public writing, weightlifting exercises, and site actions by default. Dad writing joins only after the visitor passes its signed access gate. Golf and all YouTube pages, data, URLs, and YouTube-backed talks are excluded. A route does not enter the Search corpus merely because it is public.
_Avoid_: Global index, everything

**Site action**:
A non-navigation operation exposed in the Command palette, such as changing the theme or font.
_Avoid_: Command

**Command registry**:
The canonical collection of destinations and Site actions available from every route. Entries exist independently of whether their owning page has mounted.
_Avoid_: Runtime registry, command store

**Search provider**:
A source that supplies dynamic Search corpus results when the Command palette needs them. Books, public writing, weightlifting exercises, and authorized Dad writing are Search providers rather than Command registry entries.
_Avoid_: Plugin, feature registration

**Content result**:
A result backed by searchable content rather than a fixed destination or Site action. It may match title and other identifying metadata or text within public book notes and writing, and it can show the matching excerpt.
_Avoid_: Document, dynamic command

**Recent result**:
A destination or Content result previously selected in the same browser. Recent results are local convenience history, not an account-level activity record.
_Avoid_: History, recommendation

**Result group**:
A stable category of results supplied together, such as destinations, books, public writing, protected content, or Site actions. Providers may append Result groups as they finish, but they do not reorder groups or move the visitor's current keyboard selection.
_Avoid_: Ranking bucket, result section

# Context Map

## Contexts

- [YouTube Information Diet](./src/lib/youtube/CONTEXT.md) — helps Chappy reflect on the character and composition of his YouTube viewing
- [Homepage 3D Scene](./src/app/components/stacks/CONTEXT.md) — the home page as a traversable room of shelf units presenting who Chappy is
- [Universal Search](./src/lib/universal-search/CONTEXT.md): lets visitors find destinations, content, and site actions from any route
- [Weightlifting](./src/app/weightlifting/CONTEXT.md) — Chappy's complete training log as a public, explorable record, following the iOS app's presentation idioms

## Relationships

- **YouTube Information Diet → Personal Website**: presents private, personal viewing analysis; it is not a public rating system
- **Universal Search → Personal Website**: indexes public content by default and admits protected content only after the visitor has passed that area's existing access gate
- **Weightlifting → WeightliftingApp**: the iOS app is the source of truth for data and presentation; the site mirrors, it does not reinterpret

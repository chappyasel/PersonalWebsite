# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` for repository-owned skill guidance. In particular, changes to the Book Notes schema, Notion mapping, sync behavior, tag taxonomy, or query workflow must be reviewed against `.agents/skills/book-notes/SKILL.md` in the same change.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

This repository uses a multi-context domain map. See `docs/agents/domain.md`.

## Commands

### Development

```bash
pnpm verify           # Code gate: types, lint, unit suite, meadow check
pnpm verify:artifacts # Artifact gate: committed generated files still fresh
pnpm dev              # Start development server (http://localhost:3000)
pnpm build            # Build the application for production
pnpm fix              # Run ESLint with auto-fix (includes Prettier formatting)
pnpm lint             # Run ESLint
pnpm typecheck        # next typegen, then tsc --noEmit
pnpm typegen          # Write next-env.d.ts and .next/types without a build
```

Two gates, because they fail for different reasons and want different fixes.

`pnpm verify` is the code gate and the one CI runs: `next typegen`, `tsc`,
`eslint --max-warnings 0`, the unit suite, and `pnpm check:meadow`. Everything
in it is deterministic and needs no credentials, so red means someone broke the
code.

`pnpm verify:artifacts` strictly checks whether committed generated files still
match the sources they were made from. Today that is the homepage OG capture,
and regenerating it needs a production build with database credentials. The
automatic Git hook and `.github/workflows/refresh-home-og.yml` report stale
captures as warnings because a shared renderer source can change for an
off-camera Unit without changing the About card. Keeping artifact freshness
out of `pnpm verify` is deliberate: a code gate that can never go green is a
code gate people learn to ignore.

`pnpm install` configures `.githooks/pre-commit` unless another
`core.hooksPath` is already in use. The hook checks the Git index, not the
working tree, so partial commits are safe. Its warning is narrowed to the fixed
About capture: other Unit-local sources and assets are excluded, while shared
rendering sources remain watched. When the About frame intentionally changes,
run `pnpm generate:home-og:local` and stage both outputs named by the warning. CI
repeats the freshness check if a local hook is bypassed.

Run `pnpm typegen` before `pnpm exec tsc --noEmit` or `pnpm lint` in a fresh
worktree. `next-env.d.ts` and `.next/types` are gitignored, and without them
the `public/images/...` imports in About and Projects fail to resolve.
TypeScript reports eight phantom TS2307s, and the type-aware lint rules turn
the same imports into `no-unsafe-assignment` errors. `pnpm verify` and
`pnpm typecheck` generate them first; `pnpm exec tsc` on its own does not.

### Database Management

```bash
./start-database.sh   # Start local PostgreSQL in Docker
pnpm db:generate      # Generate Drizzle migrations from schema changes
pnpm db:migrate:dev   # Run migrations on local database
pnpm db:migrate:prod  # Run migrations on production database
```

## Architecture

### Tech Stack

- **Next.js 16** with App Router and TypeScript, shadcn/ui
- **tRPC v11** for type-safe APIs with React Query
- **Drizzle ORM** with PostgreSQL
- **NextAuth.js** for authentication
- **Tailwind CSS** with custom warm color palette
- **Framer Motion** for animations
- **PostHog** for analytics
- **State**: React Query (via tRPC) for server state

### Project Structure

```
/src
├── app/              # Next.js App Router pages and components
│   ├── api/         # API routes (auth, trpc, custom endpoints)
│   └── components/  # Main UI components (About, Projects, BlogPosts, etc.)
├── server/          # Backend logic
│   ├── api/         # tRPC routers and configuration
│   ├── auth.ts      # NextAuth configuration
│   └── db/          # Database connection and Drizzle schema
└── lib/             # Shared utilities
```

### Key Patterns

- **Path Aliases**: Use `~/*` for src imports (e.g., `~/server/db`), `~~/*` for public assets (configured in tsconfig.json)
- **Type Safety**: End-to-end types from database through tRPC to frontend using SuperJSON transformer
- **Static Data**: Projects and blog posts stored in `/public/data/` JSON files.
  `github.json` is the committed snapshot of GitHub activity behind the Projects
  placard; `pnpm generate:github` refreshes it, and with `GITHUB_TOKEN` set the
  page fetches live data instead (`src/server/queries/github.ts`)
- **tRPC Setup**: Uses v11 RC with React Query integration, batch streaming, and development timing middleware
- **API Routes**: All new API endpoints MUST be created as tRPC routers in `/src/server/api/routers/`
  - Do NOT create new REST endpoints in `/src/app/api/` (except webhooks or third-party integrations)
  - Use `publicProcedure` for unauthenticated endpoints, `protectedProcedure` for authenticated
  - Use `.query()` for GET-like operations (cacheable), `.mutation()` for POST/PUT/DELETE
  - Register new routers in `/src/server/api/root.ts`

### Database Schema

Uses Drizzle ORM with PostgreSQL. Main tables:

- NextAuth tables (users, accounts, sessions, verification_tokens)
- Custom posts table for content management

Schema changes workflow:

1. Edit `src/server/db/schema.ts`
2. Run `pnpm db:generate` to create a migration
3. Run `pnpm db:migrate:dev` to apply it locally

### Styling

- Neutral color palette: background `rgb(245, 245, 245)`, text/title `rgb(115, 115, 115)`
- Tailwind utilities with `tailwindcss-motion` and `tailwindcss-intersect` plugins
- SF Pro Display font (via Geist package) for sans-serif, Georgia for serif
- Body text uses serif font (font-serif class)

## Development Philosophy

- Worry minimally about backwards compatibility since this is a web app for our internal team
- Remember to get IDE diagnostics if available to test for linter errors in your implementation
- You may run `pnpm dev` to reproduce bugs or verify changes. Prefer running it in the background and stopping the server when finished. Avoid `pnpm build` unless explicitly requested because it is slow.

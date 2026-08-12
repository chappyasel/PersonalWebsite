# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` for repository-owned skill guidance. In particular, changes to the Book Notes schema, Notion mapping, sync behavior, tag taxonomy, or query workflow must be reviewed against `.agents/skills/book-notes/SKILL.md` in the same change.

## Commands

### Development

```bash
yarn dev              # Start development server (http://localhost:3000)
yarn build            # Build the application for production
yarn fix              # Run ESLint with auto-fix (includes Prettier formatting)
yarn lint             # Run Next.js linter
```

### Database Management

```bash
./start-database.sh   # Start local PostgreSQL in Docker
yarn db:generate      # Generate Drizzle migrations from schema changes
yarn db:migrate:dev   # Run migrations on local database
yarn db:migrate:prod  # Run migrations on production database
```

## Architecture

### Tech Stack

- **Next.js 14** with App Router and TypeScript, shadcn/ui
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
- **Static Data**: Projects and blog posts stored in `/public/data/` JSON files
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
2. Run `yarn db:generate` to create migration
3. Run `yarn db:migrate:dev` to apply to local database

### Styling

- Neutral color palette: background `rgb(245, 245, 245)`, text/title `rgb(115, 115, 115)`
- Tailwind utilities with `tailwindcss-motion` and `tailwindcss-intersect` plugins
- SF Pro Display font (via Geist package) for sans-serif, Georgia for serif
- Body text uses serif font (font-serif class)

## Development Philosophy

- Worry minimally about backwards compatibility since this is a web app for our internal team
- Remember to get IDE diagnostics if available to test for linter errors in your implementation
- You may run `yarn dev` to reproduce bugs or verify changes. Prefer running it in the background and stopping the server when finished. Avoid `yarn build` unless explicitly requested (it's slow).

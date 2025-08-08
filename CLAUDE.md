# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

```bash
npm run dev          # Start Next.js development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Database Management

```bash
npm run db:generate  # Generate Drizzle migrations after schema changes
npm run db:migrate   # Apply pending migrations to database
npm run db:push      # Push schema changes directly (dev only)
npm run db:studio    # Open Drizzle Studio GUI at localhost:4983
```

### Content Generation

```bash
npm run generate:blog-posts  # Fetch latest blog posts from Medium RSS
```

## Architecture

### Tech Stack

- **Next.js 14** with App Router and TypeScript
- **tRPC v11** for type-safe APIs with React Query
- **Drizzle ORM** with PostgreSQL
- **NextAuth.js** for authentication
- **Tailwind CSS** with custom warm color palette
- **Framer Motion** for animations
- **PostHog** for analytics

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

- **Path Aliases**: Use `~/*` for src imports, `~~/*` for public assets
- **Database Prefix**: All tables use `personal-website_` prefix
- **Type Safety**: End-to-end types from database through tRPC to frontend
- **Static Data**: Projects and initial blog posts stored in `/public/data/`

### Environment Variables

Required for development:

- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - Authentication secret
- `NEXTAUTH_URL` - Base URL for auth callbacks
- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog project key
- `NEXT_PUBLIC_POSTHOG_HOST` - PostHog host URL

### Database Schema

Uses Drizzle ORM with PostgreSQL. Main tables:

- NextAuth tables (users, accounts, sessions, verification_tokens)
- Custom posts table for content management

Schema changes workflow:

1. Edit `src/server/db/schema.ts`
2. Run `npm run db:generate` to create migration
3. Run `npm run db:migrate` to apply to database

### Styling

- Custom warm color palette: background `rgb(250, 240, 230)`, text `rgb(120, 110, 100)`
- Tailwind utilities with motion and intersect plugins
- SF Pro Display (Geist font) as primary typeface

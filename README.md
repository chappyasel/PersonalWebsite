# chappyasel.com

My personal website — a portfolio, book library, strength tracker, blog, and more.

## What's on the Site

- **[About & Personal Manual](https://chappyasel.com/manual)** — who I am, how I work, and my operating manual for collaboration
- **[Book Notes](https://chappyasel.com/books)** — a searchable library of books I've read with ratings, notes, and reviews (synced from Notion)
- **[Weightlifting](https://chappyasel.com/weightlifting)** — strength progression analytics, personal records, and workout history (synced from my iOS app)
- **[Blog](https://chappyasel.com)** — links to Medium articles on AI, engineering, and building communities
- **[Projects](https://chappyasel.com)** — apps and tools I've built (Weightlifting App, Homework App, Liar's Dice calculator, etc.)

## Tech Stack

Next.js · TypeScript · tRPC · Drizzle ORM · PostgreSQL · Tailwind CSS · Vercel

## Local Development

### Prerequisites

- Node.js 22+
- Yarn
- Docker (for the local database)

### Setup

```bash
# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env
# Fill in the values in .env

# Start the local PostgreSQL database
./start-database.sh

# Run database migrations
yarn db:migrate:dev

# Start the dev server
yarn dev
```

The site will be available at [http://localhost:3000](http://localhost:3000).

## Deployment

Deployed on Vercel with automated cron jobs for syncing books and weightlifting data.

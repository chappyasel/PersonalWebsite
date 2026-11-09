# Store the weight log in Postgres tables

Until November 2026 the Weight Log spreadsheet was the source of truth. A daily Hermes job imported it, encrypted the result with a key derived from `NEXTAUTH_SECRET`, and uploaded the ciphertext to S3, and `docs/weight-log.md` forbade storing it as plaintext. Moving entry onto the site means the data takes edits one weigh-in at a time, so it now lives in ordinary Postgres tables. Encryption protected the snapshot against an S3 bucket whose public-access blocks were never enabled. The database is not public, already holds private YouTube history, and the chart is readable by anyone with the link.

## Considered options

- Encrypt each value column. Every edit, query, and test would go through the key, and the key lives in the same Vercel environment as the database credentials.
- Keep the encrypted S3 file and rewrite it on each edit. One edit becomes a download, decrypt, change, encrypt, and conditional upload, and two quick edits can overwrite each other.

## Consequences

- The S3 snapshot, `snapshot.enc`, `history-context.enc`, `pnpm restore:weight-log`, and the Hermes job `7bd64831c4b3` are removed at cutover.
- The public page still reads only on the server, sends `private, no-store`, and exposes no data API. Those rules from `docs/weight-log.md` stay.

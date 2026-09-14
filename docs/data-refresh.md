# Website data refresh

The daily public-data workflow opens or updates one PR, `automation/public-data-refresh`. It never merges or deploys. Merging the PR uses the existing Vercel production deployment from `main`.

The schedule runs every day, but the PR only appears when a source actually changed. Notion documents carry their own edit times, so an untouched Manual produces no diff and no PR. Data that moves on its own clock is refreshed live rather than committed: `public/data/github.json` used to sit in this job and opened a pull request every day for a fallback production never read.

It runs at 13:17 UTC, 6:17 AM Pacific during daylight time and 5:17 AM during standard time. It can also be run manually from GitHub Actions. The schedule starts once the workflow reaches `main`.

## Sources

| Data                                            | Source and refresh                                                                                                                                                                          | Publishing                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub activity and recent public repos         | Production fetches GitHub live behind a 24-hour cache, and `/` and `/projects` revalidate daily. Private contribution totals are included, but private repository details are filtered out. | No PR. `public/data/github.json` stays as the fallback for a failed request; refresh it with `pnpm generate:github` when it looks stale.   |
| Published Musings                               | Daily workflow reads Notion pages marked `Musing`, `Posted`, and dated no later than today.                                                                                                 | Data refresh PR, including article text and local images.                                                                                  |
| Manual, Routine, Systems                        | Daily workflow reads the existing three public Notion documents. Their source edit times remain the displayed update dates.                                                                 | Data refresh PR.                                                                                                                           |
| AI Collective globe chapters                    | Daily workflow reads the public chapters API.                                                                                                                                               | Data refresh PR.                                                                                                                           |
| Universal search                                | Rebuilt after the public source files refresh.                                                                                                                                              | Same PR as the content it indexes.                                                                                                         |
| Books and book notes                            | Existing Vercel cron reads Notion daily at 09:00 UTC.                                                                                                                                       | Existing database sync, cache invalidation and image warming. No PR needed.                                                                |
| Lifting history                                 | Existing Vercel cron reads the phone's S3 backup daily at 09:00 UTC.                                                                                                                        | Existing database sync and cache invalidation. Freshness still depends on the phone uploading its backup.                                  |
| YouTube watch history                           | Existing Hermes Takeout job runs Saturday, Sunday and Monday evenings.                                                                                                                      | Existing import and enrichment pipeline. Google can occasionally require sign-in or passkey approval.                                      |
| Weight Log and DEXA                             | Local workbook import and encrypted S3 snapshot.                                                                                                                                            | Still manual. File-change detection could prepare an encrypted update, but uploading remains a separate action under the current workflow. |
| Featured talks, project descriptions and quotes | Curated JSON in the repository.                                                                                                                                                             | Editorial changes through ordinary PRs. New talk selection and descriptions need an authored source before they can be synced.             |
| Dad content                                     | Build fetches the stored content when the local content directories are absent, then builds its search index.                                                                               | Follows a build or deployment; the new public workflow does not access this private archive.                                               |
| Room artwork and social images                  | Generated presentation assets.                                                                                                                                                              | Regenerate when their source design changes, outside the data refresh job.                                                                 |

## Credentials and operation

The GitHub repository needs two encrypted Actions secrets:

- `NOTION_API_KEY`: the existing integration with read access to the selected website content.
- `WEBSITE_REFRESH_TOKEN`: an owner-authenticated GitHub token that can create branches and PRs in this repository. A dedicated GitHub App or scoped token is preferable for long-term operation. The PR action uses this token so the resulting PR triggers the normal checks.

Production needs one more, in Vercel rather than Actions:

- `GITHUB_TOKEN`: a classic personal access token scoped to `read:user` and nothing else. It can read and cannot write, which is why the GitHub CLI's own token is the wrong thing to paste here: that one carries `repo`, `workflow` and `delete_repo`. When the token expires the placard falls back to the committed snapshot and logs the failure, so an expiry shows up as numbers that stopped moving rather than an empty card.

`read:user` costs one repository tile, measured on September 14, 2026 by building the placard twice from the same account with both tokens. Everything the card renders is identical: 8,471 all-time contributions, the same twelve year bars, 5,351 in the last year, 289 active days, a 56-day streak, the same calendar. The gap is in `commitContributionsByRepository`, which itemizes an organization repository only for a token holding `repo`, so `caikdev/plugins` and its two commits drop out and the tile list is 26 instead of 27. `restrictedContributionsCount` collapses the same way, from 4,603 to 1, but `buildGitHubPlacard` computes `privateShare` from it without rendering it, so nothing on the page moves. Widening the production token to `repo` would buy back the tile at the price of read and write over every private repository, from a runtime environment. The tile is not worth that.

Neither secret is written into generated files or passed on the command line. The workflow commits only the listed public data and image paths. It requires `NOTION_API_KEY` before running any generator, stops on the first failure, and submits a PR only after validation passes. One failed source therefore cannot publish a partial refresh. Successful runs update the existing PR rather than opening another.

The workflow reports failure through GitHub Actions. The operator should enable GitHub's failed-workflow notifications. There is no separate outbound email or chat integration.

Run the same refresh locally in a clean checkout with `NOTION_API_KEY` already loaded in the process environment:

```sh
node scripts/refresh-public-data.mjs
pnpm check:search-index
```

The app uses `GITHUB_TOKEN` for its cached live GitHub request. Without it, or when GitHub fails, it uses `public/data/github.json`. Production had no `GITHUB_TOKEN` at the September 14, 2026 audit, which is why the placard's only route to fresh numbers was a commit. The token was added to production on September 14, 2026 and the generator left the daily job. Production only: preview deployments still exercise the snapshot fallback. Review still matters for everything the owner writes. It was never buying anything on a contribution count that GitHub computes.

## Audit evidence, September 14, 2026

The latest stored book sync succeeded at 09:02 UTC on September 13; lifting succeeded at 18:16 UTC; YouTube succeeded at 05:00 UTC. The enabled Hermes Takeout job last ran successfully at 22:00 Pacific on September 13 and reported no pending error. These are observations from the existing sync metadata, not a guarantee that future runs will succeed.

The original GitHub fallback was from September 2. Missing credentials caused the app to serve it indefinitely even though live refresh code already existed. The local fallback was refreshed on September 14 and local live access was configured. This is why the public workflow includes a fresh fallback and fails visibly on missing credentials.

Scheduler and token behavior follow the [Vercel cron documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [GitHub workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), and [Create Pull Request documentation](https://github.com/peter-evans/create-pull-request).

# Website data refresh

The daily public-data workflow opens or updates one PR, `automation/public-data-refresh`. It never merges or deploys. Merging the PR uses the existing Vercel production deployment from `main`.

It runs at 13:17 UTC, 6:17 AM Pacific during daylight time and 5:17 AM during standard time. It can also be run manually from GitHub Actions. The schedule starts once the workflow reaches `main`.

## Sources

| Data                                            | Source and refresh                                                                                                                                                   | Publishing                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub activity and recent public repos         | Daily workflow fetches GitHub using the owner's authenticated account. Private contribution totals can be included, but private repository details are filtered out. | Data refresh PR. The app also supports daily live refresh when `GITHUB_TOKEN` is configured.                                               |
| Published Musings                               | Daily workflow reads Notion pages marked `Musing`, `Posted`, and dated no later than today.                                                                          | Data refresh PR, including article text and local images.                                                                                  |
| Manual, Routine, Systems                        | Daily workflow reads the existing three public Notion documents. Their source edit times remain the displayed update dates.                                          | Data refresh PR.                                                                                                                           |
| AI Collective globe chapters                    | Daily workflow reads the public chapters API.                                                                                                                        | Data refresh PR.                                                                                                                           |
| Universal search                                | Rebuilt after the public source files refresh.                                                                                                                       | Same PR as the content it indexes.                                                                                                         |
| Books and book notes                            | Existing Vercel cron reads Notion daily at 09:00 UTC.                                                                                                                | Existing database sync, cache invalidation and image warming. No PR needed.                                                                |
| Lifting history                                 | Existing Vercel cron reads the phone's S3 backup daily at 09:00 UTC.                                                                                                 | Existing database sync and cache invalidation. Freshness still depends on the phone uploading its backup.                                  |
| YouTube watch history                           | Existing Hermes Takeout job runs Saturday, Sunday and Monday evenings.                                                                                               | Existing import and enrichment pipeline. Google can occasionally require sign-in or passkey approval.                                      |
| Weight Log and DEXA                             | Local workbook import and encrypted S3 snapshot.                                                                                                                     | Still manual. File-change detection could prepare an encrypted update, but uploading remains a separate action under the current workflow. |
| Featured talks, project descriptions and quotes | Curated JSON in the repository.                                                                                                                                      | Editorial changes through ordinary PRs. New talk selection and descriptions need an authored source before they can be synced.             |
| Dad content                                     | Build fetches the stored content when the local content directories are absent, then builds its search index.                                                        | Follows a build or deployment; the new public workflow does not access this private archive.                                               |
| Room artwork and social images                  | Generated presentation assets.                                                                                                                                       | Regenerate when their source design changes, outside the data refresh job.                                                                 |

## Credentials and operation

The GitHub repository needs two encrypted Actions secrets:

- `NOTION_API_KEY`: the existing integration with read access to the selected website content.
- `WEBSITE_REFRESH_TOKEN`: an owner-authenticated GitHub token that can read the activity graph and create branches and PRs in this repository. A dedicated GitHub App or scoped token is preferable for long-term operation. The PR action uses this token so the resulting PR triggers the normal checks.

Neither secret is written into generated files or passed on the command line. The workflow commits only the listed public data and image paths. It requires both credentials before running any generator, stops on the first failure, and submits a PR only after validation passes. One failed source therefore cannot publish a partial refresh. Successful runs update the existing PR rather than opening another.

The workflow reports failure through GitHub Actions. The operator should enable GitHub's failed-workflow notifications. There is no separate outbound email or chat integration.

Run the same refresh locally in a clean checkout with `NOTION_API_KEY` and `GITHUB_TOKEN` already loaded in the process environment:

```sh
node scripts/refresh-public-data.mjs
pnpm check:search-index
```

The app uses `GITHUB_TOKEN` for its cached live GitHub request. Without it, or when GitHub fails, it uses `public/data/github.json`. Production had no `GITHUB_TOKEN` configured at the September 14, 2026 audit. Keeping that production behavior means GitHub updates remain reviewable in the daily PR. Local development now has the token in its ignored environment file.

## Audit evidence, September 14, 2026

The latest stored book sync succeeded at 09:02 UTC on September 13; lifting succeeded at 18:16 UTC; YouTube succeeded at 05:00 UTC. The enabled Hermes Takeout job last ran successfully at 22:00 Pacific on September 13 and reported no pending error. These are observations from the existing sync metadata, not a guarantee that future runs will succeed.

The original GitHub fallback was from September 2. Missing credentials caused the app to serve it indefinitely even though live refresh code already existed. The local fallback was refreshed on September 14 and local live access was configured. This is why the public workflow includes a fresh fallback and fails visibly on missing credentials.

Scheduler and token behavior follow the [Vercel cron documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [GitHub workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), and [Create Pull Request documentation](https://github.com/peter-evans/create-pull-request).

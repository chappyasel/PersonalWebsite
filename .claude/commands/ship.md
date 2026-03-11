---
description: Build, commit, and push to main
allowed-tools: Bash(git:*), Bash(yarn:*), Bash(npx:*), Read, Grep, Glob
---

# /ship - Build, Commit & Push

Build the project, commit all changes, and push to main.

## Step 1: Show Changes

```bash
git status --porcelain
git diff --stat
```

Summarize what will be shipped.

## Step 2: Build

```bash
yarn build
```

If the build fails, stop and show the errors. Do NOT proceed.

## Step 3: Lint & Fix

```bash
yarn fix
```

If linting produces additional changes, include them in the commit.

## Step 4: Commit

Stage all changed files and create a commit:
- Use conventional commit format (e.g., `feat:`, `fix:`, `chore:`)
- Write a concise message summarizing the changes
- End with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

## Step 5: Push

```bash
git push origin main
```

## Step 6: Final Output

```
✅ Shipped!
• Commit: [hash] - [message]
• Pushed to: main ✓
```

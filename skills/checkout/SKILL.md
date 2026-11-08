---
name: checkout
description: Create a checkout — a git worktree of a source clone, placed at ~/checkouts/{project slug}-{ticket id}-{summary-slug} — after fetching the source clone, with the ticket branch cut from the remote ref (such as origin/main) so it starts from the latest remote state whatever the source clone has checked out. Use only when the human explicitly asks for a checkout; never on your own initiative, and never for a worktree a project's way of working already covers, such as a side branch.
---

# Checkout

## Contents

- [What a checkout is](#what-a-checkout-is)
- [Inputs](#inputs)
- [Steps](#steps)
- [Rules](#rules)

## What a checkout is

A checkout is a git worktree of a source clone, kept under `~/checkouts/` in a folder named `{project slug}-{ticket id}-{summary-slug}`, for example `~/checkouts/myapp-73-one-branch-per-pr`. It holds one ticket branch, `{ticket id}/{summary-slug}`, named as the `commit-pr` skill says.

## Inputs

- **Source clone**: the repository the checkout is made from; by default the repository of the current working directory.
- **Ticket id** and **summary slug**: the ticket number and a short lowercase hyphenated summary. If either is not given and not evident from the work, ask.
- **Base ref**: a remote ref; by default the remote's default branch, such as `origin/main`.
- **Project slug**: the repository's name, from the `origin` URL, for example `myapp`.

## Steps

1. **Update the source clone.** Fetch everything, without touching its working tree or current branch:
   ```bash
   git -C <source clone> fetch --all --prune
   ```
2. **Resolve the base ref.** With no base ref given, take the remote's default branch:
   ```bash
   git -C <source clone> symbolic-ref --short refs/remotes/origin/HEAD   # e.g. origin/main
   ```
   If that fails, run `git -C <source clone> remote set-head origin --auto` and retry.
3. **Check for clashes.** Stop and report if `~/checkouts/<folder>` already exists or the branch `<ticket id>/<summary-slug>` already exists locally (`git -C <source clone> rev-parse --verify --quiet refs/heads/<branch>`).
4. **Create the worktree** from the remote ref, never from the source clone's local branch:
   ```bash
   git -C <source clone> worktree add --no-track \
     -b <ticket id>/<summary-slug> ~/checkouts/<project slug>-<ticket id>-<summary-slug> <base ref>
   ```
   `--no-track` keeps the new branch from tracking the base ref; its upstream is set at the first `git push -u origin <branch>`.
5. **Report** the checkout's absolute path, its branch, and the base ref with its commit (`git -C <checkout> log --oneline -1`).

## Rules

- **Only on explicit request.** Create a checkout only when the human explicitly asks for one. Other worktrees, such as a contributor's side branch, follow the project's way of working, not this skill.
- **Fetch first.** Never create a checkout without the fetch in step 1.
- **Base on the remote ref.** The branch starts from `origin/...`, so the checkout has the latest remote state whatever the source clone is working on.
- **Leave the source clone alone.** No checkout, pull, reset or stash in the source clone; only `fetch` and `worktree add`.
- **Project rules still apply.** Where a project says where a branch must be when its PR opens (for example a rule to open the PR from the main checkout), follow it; remove the checkout with `git worktree remove` when that rule or the merge calls for it.

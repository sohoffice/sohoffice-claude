---
name: commit-pr
description: Conventions for committing work and opening a pull request — every change to a file in the repository, code or documentation, goes through a PR linked to a GitHub ticket, with a description of Summary, What is changed and How is this tested sections, and the pr-review flow with Codex started as soon as the PR is open. Use whenever committing work, opening a PR, or asked to "create a PR".
---

# Commit and pull request

## Contents

- [Scope](#scope)
- [The ticket](#the-ticket)
- [Branch and commits](#branch-and-commits)
- [Opening the PR](#opening-the-pr)
- [PR description](#pr-description)
- [Review](#review)
- [Rules](#rules)

## Scope

Two rules apply:

1. **Every change to a file in the repository goes through a PR**: code, tests, configuration, documentation, and skills or CLAUDE.md files kept in the repository, whatever the size of the change.
2. **Every PR needs a ticket.**

Files outside any repository, such as `~/.claude/skills/` or `~/.claude/CLAUDE.md`, are edited in place, with no commit, PR or ticket.

## The ticket

Every PR is linked to a GitHub ticket (issue) in the PR's own repository. Before branching, know its number `<T>` and read it (`gh issue view <T>`), so the PR delivers what the ticket asks.

If the human named no ticket and none is evident from the work (the branch name, the ticket being planned or executed), ask the human for it. Do not open a PR without one, and do not create a ticket unless the human says to.

## Branch and commits

- Never commit to the default branch. Branch from an up-to-date default branch; name it `<T>/<summary-slug>`: the ticket number, a slash, then a short lowercase hyphenated summary of the change, for example `50/plan-acceptance-criteria`.
- Commit messages follow the repository's style: an imperative subject line of at most about 70 characters, a blank line, then a body saying what changed and why, citing work item IDs where the project uses them. End with the attribution lines the session's instructions give.
- Before the commit that opens the PR, run the project's tests and checks that the change touches (for example the work item ID check after editing `docs/`), and keep their results for [How is this tested](#pr-description).

## Opening the PR

```bash
git push -u origin <branch>
gh pr create --base <default branch> --title "<title>" --body-file <scratchpad>/pr-<T>-body.md
```

The title is a short imperative summary of the change. The body follows [PR description](#pr-description).

If the project keeps a per-ticket index that lists its PRs, such as `PLAN.md` in the ticket folder, commit the PR's link to it right after opening the PR, before review starts, as the project's way of working says.

## PR description

Exactly these three sections, in this order, followed by the ticket link and the attribution line:

```markdown
## Summary

<One or two sentences: what the PR achieves and why, from the ticket's point of view.>

## What is changed

- <One bullet per change: the file, component or work item ID, and what changed in it.>

## How is this tested

- [x] <Each test, check or manual verification run, with its result.>

Closes #<T>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- **Ticket link.** `Closes #<T>` only when merging the PR completes the ticket; otherwise `Refs #<T>`, so the ticket stays open. A documentation PR closes its ticket only if the ticket holds documentation work alone. A documentation PR on a ticket that also needs code, such as a planning PR (`ticket-planning` skill), uses `Refs`.
- **How is this tested** lists only what was actually run, ticked, with failures stated as failures. A change with nothing assertable, such as a document, names what verified it instead (the work item ID check, a review against the source documents). Never leave the section empty or claim a run that did not happen.

## Review

As soon as the PR is open, start the `pr-review` skill without asking: Codex reviews it and Claude fixes the findings autonomously. Once review and checks pass, pause for the human's explicit approval of the current commit before merging. Both reviewer and human approval are required. A PR is never merged outside that flow.

## Rules

- **Every repository change goes through a PR.** Nothing lands on the default branch directly, however small.
- **No ticket, no PR.** Every PR links its ticket in the description.
- **Three sections, always.** Summary, What is changed, How is this tested; none left out or empty.
- **Report tests faithfully.** Only what ran, with its real result.
- **Codex reviews every PR.** Merging follows the `pr-review` skill, never a shortcut around it.

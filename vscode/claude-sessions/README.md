# Claude Sessions

- [What it does](#what-it-does)
- [Declare a project's sessions](#declare-a-projects-sessions)
- [Install](#install)
- [Settings](#settings)
- [How it works](#how-it-works)
- [Develop](#develop)

## What it does

A side view listing the Claude Code sessions of the current workspace's project, with their status:

| Icon | Status |
|---|---|
| spinning ring, bright green | busy |
| yellow dot | needs input (also counted in the view's badge) |
| hollow circle | idle |
| slashed circle | not running: a session task in `.vscode/tasks.json` with no live session |

A prefix shared by all session names (cut at a word boundary, such as `myapp` in `myapp developer`) is dropped from each row and shown next to the view title; the tooltip keeps the full name.

When a session's latest reply ends with an executive summary (a heading `Executive summary` or `執行摘要`), its text is shown in full under the session in dimmed type, wrapped to the view's width and aligned with the session name, and the whole summary, actions included, shows in the tooltip. Nothing is shown once the owner has written again, or while the reply has no summary. The summary is read from the session transcript in `~/.claude/projects/`, an internal format that may change between Claude Code versions.

Click a session to jump to its terminal. Clicking a declared session that is not running starts it; a session task from `.vscode/tasks.json` that is not running offers to start its task.

Drag the view's icon from the Activity Bar to the Secondary Side Bar to dock it on the right.

## Declare a project's sessions

Put the project's agent sessions in `.claude/sessions.json` at the workspace folder root:

```json
{
  "project": "myapp",
  "sessions": [
    { "role": "orchestrator", "skills": ["orchestrator"], "remoteControl": true },
    { "role": "UI developer", "description": "owning the client apps", "skills": ["way-of-working", "task-execution"] }
  ]
}
```

| Field | Meaning |
|---|---|
| `project` | Session name prefix; defaults to the folder name |
| `sessions[].role` | Role; the session is named `<project> <role>` |
| `sessions[].skills` | Skills the session invokes, in order; the first defines the role. `"skill": "<name>"` is accepted for a single skill |
| `sessions[].description` | Optional words on the role, added to the system prompt after the project, such as `owning the back end` |
| `sessions[].remoteControl` | Start the session with Remote Control (`--remote-control <name>`), to drive it from claude.ai/code or the Claude app |

When the folder opens, and with **Claude Sessions: Stand Up All Sessions** (the play button on the view), each declared session that has no terminal in this window and no live process elsewhere starts in its own terminal, named after the session:

- It resumes the newest conversation in the folder whose latest title is the session name, so a window reload brings each role back where it was.
- With no such conversation, it starts a new one and sends the stand-up message.
- The system prompt is `You are the <role> of the <project> project[, <description>]. At session start, and whenever their content is no longer in your context (for example after a compaction), follow the project CLAUDE.md and invoke the <first skill> skill, which defines your role[, and the <next skill> skill]...` It is passed with `--append-system-prompt` both when starting and when resuming.
- The stand-up message, sent only when a new conversation starts (a resumed one carries on without it), is `Stand up: load your role's instructions as your system prompt says, confirm your role in one or two lines, then wait for instructions. Do not start any work yet.`

The terminals are transient: a window reload ends them, and the stand-up on open resumes their conversations. To start a role afresh, rename its old conversation with `/rename`.

## Install

```sh
cd vscode/claude-sessions
npm install
npm run compile
npm run package
code --install-extension claude-sessions-0.1.0.vsix
```

Then run **Developer: Reload Window**.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `claudeSessions.claudePath` | empty | Path to the `claude` CLI; empty tries `~/.local/bin/claude`, then `claude` on `PATH` |
| `claudeSessions.refreshSeconds` | `3` | Refresh interval |
| `claudeSessions.allProjects` | `false` | Show sessions of every project |
| `claudeSessions.standUpOnOpen` | `true` | Stand up the declared sessions when the folder opens |
| `claudeSessions.terminalLocation` | `editor` | Where session terminals open: `editor` or `panel` |

## How it works

- Sessions and status come from `claude agents --json`; a listed session whose process has ended is dropped.
- A project is a git repository, worktrees included (`git rev-parse --git-common-dir`), or else the folder. A session belongs to the workspace when its `cwd` is in the same project.
- Order follows the session terminals' tabs in the editor area, left to right; then `.claude/sessions.json`; then the tasks in `.vscode/tasks.json` that pass `--name` to `claude` or run a `claude-session.sh` wrapper; then the name. Moving a tab reorders the view at once.
- The view is a webview, so the summaries can wrap; a tree view cuts each row to one line.
- Summaries come from the tail of `~/.claude/projects/<cwd>/<sessionId>.jsonl`, re-read only when the file changes.
- Clicking finds the terminal named after the session (task terminals take the task label) and shows it. Sessions started outside this VS Code window have no terminal here.

## Develop

Open this folder in VS Code and press F5 to start an Extension Development Host; `npm run watch` recompiles on save.

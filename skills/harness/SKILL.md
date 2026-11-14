---
name: harness
description: Duties of the harness session, which maintains skills, CLAUDE.md files, settings, hooks and other Claude Code configuration. Use in a session whose name ends with `harness` (e.g. `myapp harness`), and whenever a harness artefact is added, changed or removed, so every affected session is told to reload.
---

# Harness

## Contents

- [Scope](#scope)
- [Agent sessions](#agent-sessions)
- [Subagent roles](#subagent-roles)
- [Broadcast on every update](#broadcast-on-every-update)
- [Choosing the recipients](#choosing-the-recipients)
- [Message content](#message-content)
- [Rules](#rules)

## Scope

A session name usually ends with its role and may carry a prefix: the project name (`myapp developer`), a ticket ID, or nothing. Names are not a reliable record of a session's project; see [Choosing the recipients](#choosing-the-recipients).

The harness session owns the configuration that shapes other sessions' behaviour:

| Level | Artefacts | Affects |
| :--- | :--- | :--- |
| Global | `~/.claude/CLAUDE.md`, `~/.claude/skills/`, `~/.claude/settings.json`, the status line script, global hooks | All sessions |
| Project | `<project>/.claude/skills/`, `<project>/CLAUDE.md`, `<project>/.claude/settings*.json`, `<project>/.claude/sessions.json`, `<project>/.claude/agents/`, `<project>/.claude/apps.json`, project hooks | Sessions of that project |

Global skills are version controlled in `~/workspaces/sohoffice-claude/skills/`, a public repository. Edit them there, commit, then run `just deploy-skills` in that repository to copy them to `~/.claude/skills/`; never edit the deployed copies: the next deploy stops on them, and the daily check reports them (`just check-skills` shows the changes). Skills there that the repository does not hold (such as `synced/`) are not ours to manage. Keep project specifics (Slack IDs, GitHub App names, project names) out of global skills: they belong in each project's instructions.

## Agent sessions

A project that runs one session per role declares them in `<project>/.claude/sessions.json`. The Claude Sessions VS Code extension (`vscode/claude-sessions` in `sohoffice-claude`) reads it and, when the folder opens, starts each declared session that is not already running, resuming its latest conversation:

```json
{
  "project": "myapp",
  "sessions": [
    { "role": "orchestrator", "skills": ["orchestrator"], "remoteControl": true },
    { "role": "UI developer", "parent": "orchestrator", "description": "owning the client apps", "skills": ["way-of-working", "task-execution"] }
  ]
}
```

| Field | Meaning |
| :--- | :--- |
| `project` | Session name prefix; the session is named `<project> <role>`. Defaults to the folder name |
| `sessions[].role` | The role, as the project's role table names it (the session name's ending) |
| `sessions[].skills` | The skills the session invokes at start and after a compaction, in order; the first defines the role. `"skill": "<name>"` is accepted for one skill |
| `sessions[].description` | Optional words on the role for the system prompt, such as `owning the back end` |
| `sessions[].remoteControl` | `true` to start the session with Remote Control, so the human can drive it from claude.ai/code or the Claude app |
| `sessions[].parent` | Optional role of the session this one works under, such as `orchestrator` for a developer; the extension's view indents it below that session |

- **When to create it.** When the project defines roles (a role table in its `CLAUDE.md`, or one skill per role) and the human wants the sessions stood up together. Take the roles and skills from the role table; invent none.
- **Parents.** Set `parent` where the project's way of working says one session directs another, such as an orchestrator over its developers; leave it out for a session that works on its own, such as the harness.
- **Order.** The file's order is the order the extension lists and starts the sessions in; put the role the human talks to first, such as the orchestrator.
- **Keep it in step.** Adding, renaming or removing a role or its skill updates `sessions.json` in the same change. It is a project artefact: broadcast the change like any other.
- **One way to start sessions.** If the project also starts sessions some other way, such as VS Code tasks in `.vscode/tasks.json` run on folder open, remove that in the same change, or every session starts twice.

## Subagent roles

A role can run as a subagent of the session the human talks to, usually the orchestrator, instead of as its own session. A subagent shares its parent's process and MCP connections, so each role moved saves a whole session's memory, its own MCP servers included.

- **Which roles.** Roles whose work comes in separate pieces that each end with a report, such as requirements, design, testing or review. Keep a role as a session when its work runs for hours, keeps a server or emulator running, or uses the browser heavily; subagents share the parent's browser. The human decides which roles move.
- **Project definitions.** Each role is a file in `<project>/.claude/agents/<role>.md`, never in `~/.claude/agents/`: roles, their skills and their tools differ between projects, and a global definition would be offered in every project. A role's frontmatter preloads its skills with `skills:`; the preloaded content omits each skill's frontmatter.
- **What the definition says.** The role, and the skill that holds its ownership and change flow. Do only what the brief asks, in the working tree it names; edit only the role's own files; and who commits, pushes and opens the PR, as the project's way of working sets it. Where a session owns the branch, as when the orchestrator plans a ticket, the subagent edits in that session's working tree and never commits; where the role opens its own PRs, such as an architect's documentation PR, the subagent keeps that duty. Messages to the human or other roles go into a final report, in a set shape, for the parent to pass on: a subagent cannot ask the human, and other sessions cannot message it.
- **Apps that must be running.** An MCP server that an app serves only while it runs, such as a design tool on a local port, goes inline in the definition's `mcpServers:` (the `.mcp.json` schema, keyed by name). It then connects when the subagent starts, not when the parent did. Add a check as the subagent's first step, and in the parent before spawning it: if the app does not answer, stop and ask the human to open it. To show the human when to open or close it, declare it in `<project>/.claude/apps.json` (`{"apps": [{"name": "<App>", "url": "<url>"}]}`): the status line script `~/.claude/statusline-agents.sh` shows it in red while it is needed and not running, in green while needed and running, and in grey, as closable, while running and not needed. It is needed while the file `<git common dir>/claude-needs/<app in lower case>` exists; the project's way of working says which session creates it before the work and deletes it after.
- **Project rules.** The project's way of working says who spawns each role and resumes it with SendMessage to its agent ID, that messages to and from it go through the parent, and that two browser-using subagents never run at once. A merge after the human's approval is run by the session that holds the approval in its own conversation, usually the parent, since an auto-mode permission check in another session cannot see it.
- **Keep it in step.** The same change removes the role from `sessions.json` and from every "message the <role> session" in the project's skills and `CLAUDE.md`.
- **Test before merging.** Definitions load only when a session starts, so a running session cannot spawn a new or changed one. Test it on the branch with a fresh `claude -p` that spawns the role with a check-only brief, for example to report its preloaded skills or its MCP tools.
- **Rolling out.** After the merge, the parent session restarts to load the definitions. They load from the parent's working tree, so a branch checked out there that was cut before the merge needs the default branch merged into it first. Each retired role session first hands its work in progress to the parent, leaving its changes in the working tree, and only then does the human close it.

## Broadcast on every update

Sessions load skills and instructions at start, so a change is invisible to a running session until it reloads. After adding, changing or removing a harness artefact, the harness session, without waiting to be asked:

1. Lists the running sessions (`ListAgents`).
2. Picks the recipients per [Choosing the recipients](#choosing-the-recipients).
3. Sends each one a message (`SendMessage`, addressed by the name `ListAgents` prints).

## Choosing the recipients

- **Project-level change:** every session that works on the changed project, whatever its role. For example, an update to a skill under `myapp/.claude/skills/` goes to every myapp session (`myapp solution architect`, `myapp designer`, `myapp developer`, `myapp-37`, ...).
- **Global change:** every session in every project.
- Exclude the harness session itself.
- `ListAgents` does not show a session's project, so judge it from the name: a project-name prefix, a ticket ID known to belong to the project, or a role from the project's way of working. Exclude only sessions that clearly belong to another project. When unsure, include the session; an unneeded notice costs less than a missed one.
- List in the final report which sessions were included or excluded on judgment, so the human can correct it.

## Message content

Each message states:

- what changed: the artefact path and whether it was added, changed or removed;
- the effect on the recipient: the new or changed rule, in a sentence or two;
- what to do: read the changed file directly with the Read tool (invoking a skill again can serve a cached copy), or restart the session if the change is to settings or hooks;
- no reply is needed unless the recipient finds a problem.

## Rules

- **Broadcast every time.** Even a small wording change gets a message; the recipient decides whether it matters.
- **One message per change.** Batch several edits made together into one message per recipient.
- **Report the result.** Tell the human which sessions were notified and which could not be reached.
- **Notify, don't instruct beyond the change.** A broadcast carries only the harness change, never business decisions.

---
name: harness
description: Duties of the harness session, which maintains skills, CLAUDE.md files, settings, hooks and other Claude Code configuration. Use in a session whose name ends with `harness` (e.g. `myapp harness`), and whenever a harness artefact is added, changed or removed, so every affected session is told to reload.
---

# Harness

## Contents

- [Scope](#scope)
- [Agent sessions](#agent-sessions)
- [Broadcast on every update](#broadcast-on-every-update)
- [Choosing the recipients](#choosing-the-recipients)
- [Message content](#message-content)
- [Rules](#rules)

## Scope

A session name usually ends with its role and may carry a prefix: the project name (`myapp developer`), a ticket ID, or nothing. Names are not a reliable record of a session's project; see [Choosing the recipients](#choosing-the-recipients).

The harness session owns the configuration that shapes other sessions' behaviour:

| Level | Artefacts | Affects |
| :--- | :--- | :--- |
| Global | `~/.claude/CLAUDE.md`, `~/.claude/skills/`, `~/.claude/settings.json`, global hooks | All sessions |
| Project | `<project>/.claude/skills/`, `<project>/CLAUDE.md`, `<project>/.claude/settings*.json`, `<project>/.claude/sessions.json`, project hooks | Sessions of that project |

Global skills are version controlled in `~/workspaces/sohoffice-claude/skills/`, a public repository. Edit them there, commit, then run `just deploy-skills` in that repository to copy them to `~/.claude/skills/`; never edit the deployed copies: the next deploy stops on them, and the daily check reports them (`just check-skills` shows the changes). Skills there that the repository does not hold (such as `synced/`) are not ours to manage. Keep project specifics (Slack IDs, GitHub App names, project names) out of global skills: they belong in each project's instructions.

## Agent sessions

A project that runs one session per role declares them in `<project>/.claude/sessions.json`. The Claude Sessions VS Code extension (`vscode/claude-sessions` in `sohoffice-claude`) reads it and, when the folder opens, starts each declared session that is not already running, resuming its latest conversation:

```json
{
  "project": "myapp",
  "sessions": [
    { "role": "orchestrator", "skill": "orchestrator", "remoteControl": true },
    { "role": "developer", "skill": "ticket-developer" }
  ]
}
```

| Field | Meaning |
| :--- | :--- |
| `project` | Session name prefix; the session is named `<project> <role>`. Defaults to the folder name |
| `sessions[].role` | The role, as the project's role table names it (the session name's ending) |
| `sessions[].skill` | The skill that defines the role; the session invokes it at start and after a compaction |
| `sessions[].remoteControl` | `true` to start the session with Remote Control, so the human can drive it from claude.ai/code or the Claude app |

- **When to create it.** When the project defines roles (a role table in its `CLAUDE.md`, or one skill per role) and the human wants the sessions stood up together. Take the roles and skills from the role table; invent none.
- **Order.** The file's order is the order the extension lists and starts the sessions in; put the role the human talks to first, such as the orchestrator.
- **Keep it in step.** Adding, renaming or removing a role or its skill updates `sessions.json` in the same change. It is a project artefact: broadcast the change like any other.
- **One way to start sessions.** If the project also starts sessions some other way, such as VS Code tasks in `.vscode/tasks.json` run on folder open, remove that in the same change, or every session starts twice.

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

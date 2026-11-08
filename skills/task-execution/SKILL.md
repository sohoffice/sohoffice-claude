---
name: task-execution
description: Conventions for executing a task plan as a runbook — task by task, honouring the TDD red and green stages, keeping task status current, closing verifier gaps autonomously, and capturing work in a per-phase worklog. Use whenever implementing from a task plan, running a phase, or resuming one.
---

# Task execution

The plan is the authority on what to build and in what order. Execute what it says, in the order it numbers, and
do not deviate — each task carries its own instructions, so follow them. Re-deriving the work from the source
documents mid-execution is how a plan and an implementation drift apart. Read a phase whole first, and never
start a task before everything the plan places ahead of it is complete.

## Task status

Tasks carry status; phases do not. Five values: ⬜ not started, 🔄 in progress, ✅ done, ⛔ blocked, ⏭️ skipped.
Update it **where the plan lives** the moment it changes — 🔄 when the task starts, ✅ when its work is
complete. Never mark ahead of the work, and never move a status backwards: invalidated work is a new task.

Where a project keeps each phase in its ticket rather than in a plan document, the ticket is the plan and a
task's status is its checkbox there: tick it when the work is complete. A checkbox has no 🔄, ⛔ or ⏭️, so
record a blocked or skipped task as a ticket comment naming the task and why.

Where the ticket sits on a project board, its Status reads In progress before the first task. Who sets it is the
project's way of working; where it names no one, set it yourself. Opening the PR and merging it move it on from there.

## The TDD stages are hard stops

- **Confirm RED before any implementation.** Write the cases, run them, and check each fails for the reason
  its test case intends rather than through a broken harness. Only then implement.
- **Never make a test pass by weakening it.** A case that cannot pass as written is a finding about the
  implementation or the case — it goes to the worklog, not into a narrowed assertion or a skip mark.
- **Leave a held-red layer red.** Where the plan holds an outer layer failing by design, a red suite is not
  breakage; making it green early means the cases were weakened.

## Verifier gates

The plan's final phase delegates two `VERIFY` tasks to a **sub agent** — test fidelity, and requirement
evidence. Do not answer their questions yourself; the executor is the wrong party to mark its own work.
Each returns a verdict and, on a non-pass, the deviations and the gap points.

**Close the gaps autonomously.** Trace each point back to the task that owns it, fix the cause where it lives
rather than patching the symptom at the gate, then re-run the gate. Do not stop to ask.

## When a task cannot be implemented — act on what else depends on it

- **Other tasks are blocked by it** — mark it ⛔, stop, and report what is blocked and why.
- **Other tasks can still proceed** — mark it ⏭️, carry on, and report it at the end of the run rather than
  interrupting.

Either way record the finding, naming the upstream document and work item where the fault is not the plan's own.

## Worklog

Each phase keeps a worklog, written as the phase runs, not reconstructed after. It goes in the ticket folder when the project defines one (for example `planning/{ticket id}-{summary-slug}/worklog.md`), otherwise at `docs/task-worklog/task-worklog-phase-N.md`. It records
the work actually performed per task and any divergence with its reason, every verifier verdict and gap point in
full, and the rework each drove. A worklog of passes only is a summary, not a record.

If the project keeps a per-ticket index of document changes, such as `PLAN.md` in the ticket folder, list every work item the build changes in it, as the project's way of working says.

---
name: task-planning
description: Conventions for authoring an implementation task plan — phases and tasks with TDD red/green stages and end-of-plan verifier gates — from the requirements, design and testing documents. Use whenever writing, reviewing, updating, or executing a task plan, implementation plan, or work breakdown.
---

# Task plan document

Derive the plan from three documents: **requirements** and **design** say what each phase delivers,
**testing** says what proves it. Read all three first — work traceable to none of them is invented
scope or a gap in the sources. The loop reads the plan, not this skill, so write its conventions down.

## Structure

Exactly two levels — **phases**, and **tasks** within a phase. No third level.

A **phase** (`## N. {heading}`) delivers one named deliverable and carries no status. Before its first
task it lists its **work items** — requirement, design decision and test case IDs, each with a one-line
summary — its **deliverable** in one sentence, and the **verification criteria** that make it done.

A **task** (`### N.x {status} {heading}`; gate tasks prefixed `RED - {layer}` or `GREEN - {layer}`) states:

- **Status** — ⬜ not started, 🔄 in progress, ✅ done, ⛔ blocked, ⏭️ skipped. The orchestrator
  updates it the moment it changes; nothing else moves it.
- **Objective** — what the task establishes, in one sentence.
- **Work** — explicit and ordered; name files, functions, assertions. "Implement the validator" is
  not work; "add `validate_budget` in `money.py` rejecting a total one cent over" is.
- **Work items** — the IDs this task implements or tests, or "none".

## Sequencing

Test-driven, **outside-in**: the outermost layer's cases go red before anything beneath them exists.
Every layer runs three stages in order — write its cases and confirm **RED** for the right reason,
implement, confirm **GREEN**. Red and green are never one task; an outer layer held red across phases
is the plan working. A layer whose cases cannot honestly be authored first, typically e2e against a
deployed system, is deferred and appended **inside-out** after the implementation phases, one phase per
layer, innermost outward. Where nothing is assertable — design review, analysis, a spike returning a
finding — write no stage and name what verifies the task instead.

## Final verification phase

The plan ends with two tasks, each delegated to a **sub agent** that returns a verdict and points to improve:

- **Test verifier** — do the tests implement the testing document's cases in full: every case
  present, faithful to its precondition, procedure and expected results?
- **Requirement verifier** — is every requirement implemented, with evidence matching its verification
  method — *design review* → design inspection, *test* → test case execution results, *analysis* →
  runtime execution result inspection?

Trace each point back to the task that owns it, restart there rather than patching in place, re-run.

---
name: testing-document
description: Conventions for authoring a test strategy and test case document from the requirements and design documents. Use whenever writing, reviewing, or updating a testing document, test plan, or test strategy.
---

# Testing document

## Inputs

- The testing document is derived from two inputs: the **requirements document**
  and the **design document**. Read both before writing.
- Requirements supply *what* must be verified — each EARS statement carries its
  trigger and its expected outcome, so it converts to a test case directly.
- Design supplies *where* it is verified — the component boundaries in the
  design determine which layer a test belongs to.
- A requirement whose verification method is *design review* rather than *test*
  produces no test case. Say so rather than inventing one.

## Test strategy

- Open with the strategy, before any test case: what makes this system hard to
  test, and what the layering does about it.
- Define the **layers**. Unit, integration, and end-to-end are the baseline, but
  the set varies by engineering topic — add a layer when the topic has a risk
  no baseline layer covers (protocol conformance, evaluation of
  non-deterministic output, performance, migration), and drop one when the
  topic has nothing for it to hold.
- Present the layers as a table: what the layer covers, whether it needs
  network or external services, whether it is deterministic, and when it runs.
- **Unit and integration must be fast and locally executable.** No network, no
  live external service, no credentials. State the command that runs them and
  the mechanism that excludes the slow layers from the default run.
- Every layer states its entry point — the concrete command a developer runs.

## Organization

- The document takes an **outside-in** approach: document the highest layer
  first and the unit layer last. End-to-end before integration, integration
  before unit.
- The rationale is that the outer layers describe system behaviour a reader
  already understands from the requirements, and each inner layer narrows to
  the components the design introduced.
- Within a layer, group test cases by the component or user story they exercise.
- List test cases as bullet points or sub-headings keyed by test case ID, never
  a numbered list — the ID is the identifier, and list numbering drifts out of
  step with it as cases are added or withdrawn.

## Test case

Each test case carries these attributes, in this order:

- **Objective** — what this test establishes, in one sentence. State the
  property under test, not the steps.
- **Precondition** — the state the system and its data must be in before the
  procedure starts. Write "none" if there is genuinely none.
- **Test procedures** — the steps to execute, as an ordered list. Each step is
  an action a person or a script performs. Keep observation out of the steps.
- **Expected results** — what must hold for the test to pass. Tie each expected
  result to the step that produces it. Make it observable: a value, a state, an
  error, a rendered artefact — never "works correctly".
- **Requirement Links** — the list of requirement work item IDs as bullet
  points. A test case with no requirement link is either testing something the
  requirements do not ask for, or a requirement is missing; resolve it rather
  than leaving the attribute empty. Where the project's conventions allow a case
  to link to a design decision instead, because no requirement states the
  behaviour, that link meets this rule but counts towards no requirement.

## Coverage

- Every requirement whose verification method includes *test* is linked from at
  least one test case. Close the loop explicitly — a traceability table from
  requirement ID to test case IDs at the end of the document is the simplest
  way.
- Do not write a test case for behaviour the design already makes impossible.
  If a design decision moves a property into deterministic code, test it at the
  unit layer rather than at end-to-end.
- Prefer the innermost layer that can observe the property. Push a case outward
  only when the inner layer cannot see what is under test.

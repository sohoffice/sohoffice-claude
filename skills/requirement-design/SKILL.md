---
name: requirement-design
description: Conventions for authoring requirements and design documents. Use whenever writing, reviewing, or updating a requirements document (user stories, EARS statements) or a design document (architecture, components, design decisions).
---

# Requirements and design documents

## Requirements

- A requirement focuses on **what** the system shall deliver, never how.
- Requirement document starts with system context analysis, which is the top level of C4 diagram. Followed by user stories, which are the top level of requirements.
- Requirements are organized by user story — each requirement is a sub-element under the user story it serves.
- The requirement itself is an **EARS** statement (Easy Approach to Requirements Syntax).
- A requirement may carry an optional description. It must carry a rationale explaining why it is needed. It must also carry a verification method to specify how it can be verified, verification method can be one or more of the following: design review, test and analysis.
- List requirements as bullet points, never a numbered list — the requirement ID is the identifier, and list numbering drifts out of step with it as requirements are added or withdrawn.

## Design

- The design document takes an **outside-in** approach: illustrate the architecture in a diagram first, then iterate through the components.
- Design decisions are added under the component they belong to. The sentence shall starts with "It is decided".
- A design decision focuses on **how** a requirement is accomplished.
- If a decision is obvious or has no real alternatives, do not write one. Design and design decisions shall provide guidance to the implementer, but not dictate the implementation. It should provide the structure and direction, but not the details. The implementer is free to choose the implementation details.
- Every design decision states its justification (why we decided this way) and the alternatives considered, listed as bullet points, each with the reason it was rejected.
- Design decision shall have a Requirement Links attributes. The content is the list of requirement work item id as bullet points
- Design document may have an Open issues section to list issues that require further discussion or decision. Each issue shall have an ID (using `{proj}-oi-{serial}` format), title, description, status and decision.

## Design review

- Design review is based on the requirement and design documents. The review first verifies the requirements are satisfied by the design, then checks the design decisions for correctness and completeness.
- The design satisfies a requirement not by adding the requirement ID to the design decision, but by implementing the requirement in the design. The design review checks that the requirement is implemented in the design.
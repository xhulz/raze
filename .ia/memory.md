# Memory

Memory is file-based, sparse, and human-auditable.

## Memory Files

- `memory/decisions.md`: durable architecture or workflow decisions
- `memory/invariants.md`: constraints that should not be broken
- `memory/open-questions.md`: unresolved topics that should be treated as unstable

## Write Rules

- Store only durable facts, constraints, or decisions.
- Do not store raw command output, temporary logs, or speculative ideas.
- Add an entry only when future implementation should behave differently because of it.
- Reference the affected subsystem or path in each entry.

## Read Rules

- Read invariants for any non-trivial code change.
- Read decisions for refactors and architecture work.
- Read open questions only when the task is exploratory or blocked by uncertainty.

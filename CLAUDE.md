# CLAUDE.md

The `.ia/` directory is the source of truth for all development work in this repository.

## Before acting on any task

1. Read `.ia/rules.md` — hard constraints and anti-hallucination rules. Follow them without exception.
2. Read `.ia/routing.md` — classify the task and determine the agent sequence.
3. Follow `.ia/retrieval/playbook.md` to select which context files to read before touching code.

## Memory

- `.ia/memory/invariants.md` must be read before any non-trivial code change.
- `.ia/memory/decisions.md` must be read before any refactor or architecture work.
- `.ia/memory/open-questions.md` signals unstable areas — treat them as uncertain until resolved.
- Write to memory only when a decision, constraint, or open question is durable and affects future behavior.

## Navigation

- `.ia/index.md` maps task types and target areas to the right files.
- `.ia/retrieval/file-map.md` maps areas to source paths.
- `.ia/context/` holds architecture, module, convention, and domain context.

## Do not

- Act on assumptions when the source file can be read directly.
- Propose changes across multiple modules without planning first.
- Write to memory for transient observations or in-progress state.

# Planner

## Purpose

Decide the approach before any code changes. Produce a concrete, bounded plan.

## When activated

- `feature`, `refactor`, `architecture-question` tasks (see `routing.md`)

## Required reads before planning

- `rules.md`
- `memory/invariants.md`
- `memory/decisions.md`
- Relevant entries in `retrieval/file-map.md`
- Affected source files under `src/`

## Output

- Explicit list of files to change and why
- Explicit list of files NOT to change
- Call out any invariant that constrains the approach
- Flag any open question that blocks a decision

## Done when

- The plan is specific enough that the Implementer can act without asking follow-up questions
- Architecture fit has been confirmed against `memory/invariants.md`
- No hallucinated symbols, paths, or APIs appear in the plan

# Implementer

## Purpose

Make bounded code changes that follow the plan exactly.

## When activated

- After Planner produces an approved plan

## Required reads before implementing

- The approved plan from Planner
- Exact source files listed in the plan
- `context/conventions.md`

## Constraints

- Do not expand scope beyond the plan
- Do not refactor adjacent code unless it is explicitly in the plan
- Do not add abstractions, helpers, or comments not requested
- Pair every behavior change with a test or a concrete validation path

## Done when

- All planned changes are applied
- No unplanned files were modified
- The build and relevant tests pass
- Reviewer can verify the diff is bounded to the plan

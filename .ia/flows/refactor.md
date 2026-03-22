# Refactor Flow

## Sequence

Planner -> Implementer -> Reviewer

## Step 1: Planner

- Read `memory/decisions.md` and `memory/invariants.md` before scoping
- Define explicit boundaries: what changes, what stays the same
- Confirm that CLI and MCP interfaces remain stable unless the refactor explicitly targets them
- Produce the plan in bounded steps — one logical change at a time

## Step 2: Implementer

- Apply one bounded step at a time
- Do not add new behavior during a refactor — behavior must be preserved

## Step 3: Reviewer

- Confirm observable behavior is unchanged
- Confirm no invariant from `memory/invariants.md` is violated
- Run the reviewer checklist from `agents/reviewer.md`

## Exit criteria

- All tests pass before and after
- No new behavior was introduced
- Scope stayed within the plan boundaries

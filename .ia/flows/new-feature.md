# New Feature Flow

## Sequence

Planner -> Implementer -> Reviewer

## Step 1: Planner

- Read `memory/invariants.md` and `memory/decisions.md`
- Read affected source files
- Produce a bounded plan: files to change, files not to change, affected invariants
- Get alignment before any code is written

## Step 2: Implementer

- Apply the plan exactly
- Do not expand scope
- Pair behavior change with test

## Step 3: Reviewer

- Run the reviewer checklist from `agents/reviewer.md`
- Flag any invariant violation or unbounded change

## Exit criteria

- Build passes
- Relevant tests pass or new tests cover the new behavior
- No invariant from `memory/invariants.md` is violated

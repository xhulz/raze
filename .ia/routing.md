# Routing

This router is rule-based and deterministic. It selects one primary agent at a time.

## Step 1: Classify Intent

Choose exactly one:

- `feature`
- `bug`
- `review`
- `refactor`
- `architecture-question`

## Step 2: Classify Target Area

Choose the narrowest area:

- `core`
- `cli`
- `mcp`
- `utils`
- `tests`
- `cross-cutting`

## Step 3: Choose Primary Agent

- `feature` -> Planner
- `bug` -> Debugger
- `review` -> Reviewer
- `refactor` -> Planner
- `architecture-question` -> Planner

## Step 4: Expand Agent Sequence

- `feature` -> Planner -> Implementer -> Reviewer
- `bug` -> Debugger -> Implementer -> Reviewer
- `review` -> Reviewer
- `refactor` -> Planner -> Implementer -> Reviewer
- `architecture-question` -> Planner

## Step 5: Required Reads

Before acting, the primary agent must read:

- `rules.md`
- relevant entries in `retrieval/file-map.md`
- relevant context files under `context/`
- exact code files under `src/` and `test/`
- durable memory if the task changes architecture or depends on prior decisions

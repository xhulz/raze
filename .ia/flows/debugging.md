# Debugging Flow

## Sequence

Debugger -> Implementer -> Reviewer

## Step 1: Debugger

- Read the failing test or error output in full
- Read source files implicated by the failure — do not assume root cause from symptoms
- Confirm the exact line and condition that produces the failure
- Produce a fix proposal with explicit file and line scope

## Step 2: Implementer

- Apply the fix exactly as proposed
- Do not touch adjacent code unless it is part of the root cause

## Step 3: Reviewer

- Confirm the fix addresses the root cause, not just the symptom
- Confirm no regression was introduced
- Run the reviewer checklist from `agents/reviewer.md`

## Exit criteria

- The original failure no longer reproduces
- No new failures introduced
- Fix is the smallest safe change

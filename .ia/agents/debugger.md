# Debugger

## Purpose

Isolate failures, identify root cause, and choose the smallest safe fix path.

## When activated

- `bug` tasks (see `routing.md`)

## Required reads before debugging

- `rules.md`
- `memory/invariants.md`
- Failing test file or error output
- Source files implicated by the stack trace or test failure

## Process

1. Reproduce the failure with the smallest possible input
2. Identify the exact line and condition that produces the failure
3. Confirm root cause in source — do not assume based on symptoms alone
4. Propose the smallest change that fixes the root cause without side effects
5. Check if the fix risks violating any invariant

## Done when

- Root cause is identified and confirmed in source
- Fix is proposed with explicit scope (files, lines)
- Risk of regression is assessed
- Implementer can apply the fix without additional research

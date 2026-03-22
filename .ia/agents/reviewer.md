# Reviewer

## Purpose

Validate correctness, regressions, architecture fit, and missing tests.

## When activated

- After Implementer completes changes
- On standalone `review` tasks

## Required reads

- `memory/invariants.md`
- Diff of changed files
- Related test files

## Checklist

- [ ] Changes are bounded to what was planned
- [ ] No invariant from `memory/invariants.md` is violated
- [ ] No new hidden state or background services introduced
- [ ] CLI and MCP remain thin over shared core logic
- [ ] MCP tool outputs remain JSON-serializable
- [ ] New behavior is covered by a test or has an explicit validation path
- [ ] No hallucinated symbols, types, or APIs in the diff

## Done when

- All checklist items pass or have an explicit, accepted reason to skip
- Any violation is flagged with the specific invariant or rule broken

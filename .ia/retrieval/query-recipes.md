# Query Recipes

Use these as starting points. Always confirm with Grep/Glob before assuming a symbol exists.

## New CLI command

- Read `src/interfaces/cli/` to understand existing command structure
- Read `src/core/` for the pipeline step the command will invoke
- Check `context/conventions.md` for CLI interface constraints

## New MCP tool

- Read `src/interfaces/mcp/` for existing tool registration patterns
- Read `src/core/` for the pipeline step the tool will call
- Confirm output is JSON-serializable before proposing return shape
- Check `memory/invariants.md` — MCP outputs must remain structured

## Core pipeline change

- Read all files under `src/core/` before touching any
- Read `memory/invariants.md` — pipeline stage order must be preserved
- Read `memory/decisions.md` for prior decisions on that stage
- Check `test/` for integration tests that cover the affected stage

## Test failure in fixture

- Read the failing test file in full
- Read the source file it exercises
- Do not assume root cause from the error message alone — trace to source

## Refactor shared types

- Grep for all usages of the type before moving or renaming it
- Confirm CLI and MCP surfaces are accounted for
- Do not change public MCP output shapes without checking `memory/invariants.md`

## Add new attack family / vulnerability pattern

- Read `context/vulnerabilities.md` and `context/patterns.md`
- Read `src/agents/` for existing attack agent patterns
- Read `src/core/` for how scaffold generation works
- Any new proof shape must be deterministic and template-driven

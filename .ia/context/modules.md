# Modules

## `src/core/`

The product pipeline. Stage order must be preserved.

- `types.ts` — shared type boundary; changes propagate everywhere
- `solidity.ts` — shared Solidity parsing (signatures, state vars, constructor args, identifier sanitization)
- `planner.ts` — contract discovery, analysis, dependency graph
- `orchestrator.ts` — attack plan validation, symbol resolution, cross-contract findings
- `attacker.ts` — dispatches heuristic agents per vulnerability family
- `assessment.ts` — decision engine mapping findings + execution to verdict
- `tester.ts` — deterministic proof scaffold generation (proof + regression tests)
- `runner.ts` — Forge execution wrapper
- `reporter.ts` — Markdown report generation
- `verifier.ts` — fix verification loop (proof fail + regression pass = fix verified)
- `presentation.ts` — formatting helpers for verdicts and summaries
- `hardening.ts` — remediation suggestions per finding type
- `pipeline.ts` — single-plan orchestration (heuristic fallback path)
- `attackSuite.ts` — multi-plan orchestration
- `developerFuzz.ts` — broad developer fuzz test generation

## `src/agents/`

One file per vulnerability family. Each agent encapsulates heuristic detection logic.

## `src/interfaces/cli/`

Thin CLI surface. Commands invoke core and format output. Register in `index.ts`, implement in a dedicated file.

## `src/interfaces/mcp/`

MCP surface over core pipeline. `schemas.ts` defines Zod schemas. `tools.ts` defines tool handlers. `server.ts` handles transport. All outputs must be JSON-serializable.

## `src/utils/`

Supporting utilities with no product logic. `detect.ts` and `exec.ts` are most frequently touched.

## `templates/raze/`

Scaffold files for `raze init`. No `.ia/` injection — context reaches the AI through MCP tool responses only.

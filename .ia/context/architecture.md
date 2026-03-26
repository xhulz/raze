# Architecture

Raze is an LLM-orchestrated smart contract attack engine built in TypeScript.

## Pipeline Stages

```
Planner → Orchestrator → Attacker → Tester → Runner → Reporter → Verifier
```

- **Planner** (`planner.ts`) — contract discovery, analysis, dependency graph
- **Orchestrator** (`orchestrator.ts`) — attack plan validation, symbol resolution, cross-contract analysis
- **Attacker** (`attacker.ts`) — dispatches heuristic agents per vulnerability family
- **Assessment** (`assessment.ts`) — decision engine: maps findings + execution results to a verdict
- **Tester** (`tester.ts`) — deterministic proof scaffold generation (proof + regression)
- **Runner** (`runner.ts`) — Forge execution wrapper
- **Reporter** (`reporter.ts`) — human-readable Markdown report generation
- **Verifier** (`verifier.ts`) — fix verification loop (proof should fail, regression should pass)
- **Presentation** (`presentation.ts`) — formatting helpers for verdicts and summaries
- **Hardening** (`hardening.ts`) — remediation suggestions per finding type

## Shared Infrastructure

- **Solidity** (`solidity.ts`) — shared Solidity parsing: function signatures, state variables, constructor args, identifier sanitization
- **Types** (`types.ts`) — all domain types and interfaces, shared across the entire codebase

## Responsibility Split

- The external AI is the primary Planner, Attacker, and Tester for attack intent.
- Raze remains deterministic where it matters: project inspection, symbol validation, proof scaffold materialization, Foundry execution, and reporting.
- Heuristics remain in the product as fallback guardrails and hints, not as the only reasoning layer.

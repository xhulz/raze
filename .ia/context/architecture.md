# Architecture

Raze is an LLM-orchestrated smart contract attack engine built in TypeScript.

## Product Architecture

- Planner
- Attacker
- Tester
- Runner
- Reporter

## Responsibility Split

- The external AI is the primary Planner, Attacker, and Tester for attack intent.
- Raze remains deterministic where it matters: project inspection, symbol validation, proof scaffold materialization, Foundry execution, and reporting.
- Heuristics remain in the product as fallback guardrails and hints, not as the only reasoning layer.

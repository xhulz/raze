# Invariants

- Core architecture remains Planner -> Attacker -> Tester -> Runner -> Reporter.
- CLI and MCP converge on shared core logic.
- MCP outputs remain structured and JSON-serializable.
- Test generation remains deterministic and template-driven.
- The external AI may propose attack intent, but Raze must validate symbols and supported proof shapes before materializing tests.
- Raze does not become an LLM provider and does not accept arbitrary Solidity authored by the external AI.

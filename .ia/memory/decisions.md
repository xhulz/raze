# Decisions

- 2026-03-20: `.ia/` is the internal development system for this repository.
- 2026-03-20: router and retrieval remain Markdown-first in v1; helper scripts such as `scripts/router.ts` and `scripts/retrieve.ts` are deferred until lookup/routing pain becomes recurrent.
- 2026-03-20: triggers for that evolution are repeated context-selection errors, significant module growth, or frequent repeated manual lookup flows.
- 2026-03-20: in MCP mode, the external AI is the primary reasoning layer for attack hypotheses and proof goals; Raze validates symbols, materializes deterministic proof scaffolds, executes Foundry, and writes reports.
- 2026-03-22: added flash-loan and price-manipulation as supported AttackType families; each follows the established agent pattern (agent file → attacker registry → planner signals → orchestrator inference → tester scaffold → hardening → attackSuite → MCP Zod enums).
- 2026-03-22: added multi-contract reasoning foundation — planner now builds ContractDependencyGraph (import edges + heuristic call surface); inspectProject returns dependencyGraph and crossContractFindings; cross-contract findings are surfaced in reports but do not feed the existing single-contract assessment engine (deferred to future phase).
- 2026-03-22: retrieval/file-map.md should be updated to include the two new agent files when the file-map is next revised.
- 2026-03-22: flash-loan scaffold template only handles the receiver role (contract with onFlashLoan/executeOperation). Contracts that act as lenders (expose flashLoan()) need a separate scaffold pattern. This is an open question, not yet implemented.
- 2026-03-22: access-control scaffold now uses vm.prank(address(0xDEAD)) before the privileged call; the test contract deploys the target (becoming owner) and then calls as a non-owner attacker. This makes the scaffold correctly fail (revert) after the authorization fix is applied, giving a true green/red signal. Without prank, the test contract was always the owner and scaffolds passed even after the fix.

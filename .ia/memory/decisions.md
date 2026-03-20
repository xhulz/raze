# Decisions

- 2026-03-20: `.ia/` is the internal development system for this repository.
- 2026-03-20: router and retrieval remain Markdown-first in v1; helper scripts such as `scripts/router.ts` and `scripts/retrieve.ts` are deferred until lookup/routing pain becomes recurrent.
- 2026-03-20: triggers for that evolution are repeated context-selection errors, significant module growth, or frequent repeated manual lookup flows.
- 2026-03-20: in MCP mode, the external AI is the primary reasoning layer for attack hypotheses and proof goals; Raze validates symbols, materializes deterministic proof scaffolds, executes Foundry, and writes reports.

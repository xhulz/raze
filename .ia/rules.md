# Rules

## Hard Constraints

- Never hallucinate functions, files, APIs, commands, or tool behavior.
- Prefer repository facts over assumptions.
- Read the exact source file before proposing or editing behavior.
- Keep outputs deterministic and implementation-ready.
- Use local files only. Do not rely on remote context stores.

## Architecture Constraints

- Preserve the Raze product architecture: Planner, Attacker, Tester, Runner, Reporter.
- Keep CLI and MCP as interfaces over the same core pipeline.
- Keep test generation template-driven and deterministic.
- Keep MCP tool outputs structured and JSON-serializable.
- Avoid introducing hidden state or background services for internal workflows.
- Keep the external AI as the primary reasoning layer for attack plans in MCP mode.
- Keep Raze deterministic for inspection, validation, scaffold generation, execution, and reporting.

## Anti-Hallucination Rules

- If a symbol is not found in the codebase, do not treat it as real.
- If a path is ambiguous, search first and choose the narrowest confirmed file set.
- If an architecture decision is already recorded in memory, follow it unless explicitly changing it.
- If a request spans multiple modules, plan first before editing.
- If the external AI proposes unsupported proof shapes or unconstrained Solidity, reject or normalize the request instead of accepting it verbatim.

## Change Discipline

- Small, bounded changes over broad rewrites.
- Pair behavior changes with tests or a concrete validation path.
- Do not update memory for transient observations.

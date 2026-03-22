# Modules

## `src/core/`

The product pipeline. Each file maps to one stage of the Planner -> Attacker -> Tester -> Runner -> Reporter architecture. Changes here require reading `memory/invariants.md` first. Stage order must be preserved.

Key: `types.ts` is the shared type boundary — changes here propagate everywhere.

## `src/agents/`

Attack-specific logic, one file per vulnerability family. Each agent encapsulates the reasoning and materialization logic for its vulnerability type. New vulnerability families get a new agent file here.

## `src/interfaces/cli/`

Thin CLI surface over the core pipeline. Commands must not contain business logic — they invoke core and format output. Adding a command: register in `index.ts`, implement in a dedicated file.

## `src/interfaces/mcp/`

Thin MCP surface over the core pipeline. `tools.ts` defines tool schemas and handlers. `server.ts` handles transport. All tool outputs must be JSON-serializable — checked in `memory/invariants.md`.

## `src/utils/`

Supporting utilities with no product logic. `detect.ts` and `exec.ts` are the most frequently touched. Changes here should be backward-compatible with both CLI and MCP.

## `templates/raze/`

Scaffold files copied into target Foundry projects during `raze init`. Contains a `.ia/` system for the target project's AI context. Changes here affect what gets scaffolded, not Raze's own behavior.
